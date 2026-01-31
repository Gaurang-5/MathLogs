
import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiRequest, API_URL } from '../utils/api';
import Layout from '../components/Layout';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Clock, Download, Mail, Phone, Edit2, Trash2, X, Save, Plus, Users, Settings, User, Book, Fingerprint, Search, MoreVertical, Pause, Play, Archive, Eye, FileText, Printer, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import toast from 'react-hot-toast';
import QRCode from 'react-qr-code';
import { cn } from '../utils/cn';

interface Student {
    id: string;
    humanId: string | null;
    name: string;
    parentName: string;
    parentWhatsapp: string;
    parentEmail: string | null;
    schoolName: string | null;
    status: string;
    feePayments: FeePayment[];
    fees: any[];
    marks?: any[];
}

interface FeeInstallment {
    id: string;
    name: string;
    amount: number;
    batchId: string;
    createdAt: string;
}

interface FeePayment {
    id: string;
    amountPaid: number;
    date: string;
    installmentId: string;
    studentId: string;
}

interface Batch {
    id: string;
    name: string;
    subject: string;
    timeSlot: string;
    feeAmount: number;
    className: string;
    whatsappGroupLink?: string;
    isRegistrationOpen: boolean;
    isRegistrationEnded?: boolean;
    students: Student[];
    feeInstallments: FeeInstallment[];
}

export default function BatchDetails() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [batch, setBatch] = useState<Batch | null>(null);
    const [loading, setLoading] = useState(true);
    const [editingStudent, setEditingStudent] = useState<Student | null>(null);
    const [showAddStudent, setShowAddStudent] = useState(false);
    const [showRegMenu, setShowRegMenu] = useState(false);
    const [showCloseConfirm, setShowCloseConfirm] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleteCodeInput, setDeleteCodeInput] = useState('');
    const [viewMarksId, setViewMarksId] = useState<string | null>(null);

    const viewMarks = useMemo(() => {
        if (!viewMarksId || !batch) return null;
        return batch.students.find(s => s.id === viewMarksId) || null;
    }, [viewMarksId, batch]);

    const getStudentAverage = (student: any) => {
        if (!student.marks || student.marks.length === 0) return '-';
        let totalNormalized = 0;
        student.marks.forEach((m: any) => {
            const max = m.test.maxMarks || 0;
            const normalized = max > 0 ? (m.score / max) * 10 : 0;
            totalNormalized += normalized;
        });
        return (totalNormalized / student.marks.length).toFixed(1);
    };

    // Add Student Form State
    const [newName, setNewName] = useState('');
    const [newParentName, setNewParentName] = useState('');
    const [newWhatsapp, setNewWhatsapp] = useState('');
    const [newEmail, setNewEmail] = useState('');
    const [newSchoolName, setNewSchoolName] = useState('');

    // Edit Batch State
    const [showEditBatch, setShowEditBatch] = useState(false);
    const [editBatchData, setEditBatchData] = useState({
        name: '',
        subject: '',
        timeSlot: '', // Keeping as string for flexibility
        feeAmount: '',
        className: '',
        whatsappGroupLink: ''
    });

    // Fee Installment State
    const [showAddInstallment, setShowAddInstallment] = useState(false);
    const [newInstallment, setNewInstallment] = useState({ name: '', amount: '' });

    // Payment Modal State
    const [paymentModal, setPaymentModal] = useState<{ student: Student, installment: FeeInstallment, date: string } | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Search State
    const [searchQuery, setSearchQuery] = useState('');
    const [tableFontSize, setTableFontSize] = useState(1); // 0: Small, 1: Medium, 2: Large
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

    // View Payment Details State
    const [viewPayment, setViewPayment] = useState<{ student: Student, installment: FeeInstallment, payments: FeePayment[] } | null>(null);

    // ... existing search logic ...
    const filteredStudents = useMemo(() => {
        let students = batch?.students.filter(student =>
            student.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            student.schoolName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            student.humanId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            student.parentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            student.parentWhatsapp.includes(searchQuery)
        ) || [];

        if (sortConfig !== null) {
            students.sort((a, b) => {
                if (sortConfig.key === 'humanId') {
                    // Sort by ID string comparison (MTH26001 vs MTH26007 works naturally lexicographically)
                    const aId = a.humanId || '';
                    const bId = b.humanId || '';
                    if (aId < bId) {
                        return sortConfig.direction === 'asc' ? -1 : 1;
                    }
                    if (aId > bId) {
                        return sortConfig.direction === 'asc' ? 1 : -1;
                    }
                    return 0;
                }
                return 0;
            });
        }
        return students;
    }, [batch, searchQuery, sortConfig]);

    // Helper for dynamic classes
    const getTextSizeClass = (type: 'body' | 'header' | 'sub') => {
        const sizes = {
            header: ['text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl'],
            body: ['text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl'],
            sub: ['text-[10px]', 'text-xs', 'text-sm', 'text-base', 'text-lg']
        };
        return sizes[type][tableFontSize];
    };

    const getIconSizeClass = () => {
        return ['w-3 h-3', 'w-4 h-4', 'w-5 h-5', 'w-6 h-6', 'w-7 h-7'][tableFontSize];
    };

    const getCellPadding = () => {
        return ['p-2', 'p-3', 'p-4', 'p-5', 'p-6'][tableFontSize];
    };

    const getPaymentButtonSize = () => {
        return ['w-5 h-5', 'w-6 h-6', 'w-7 h-7', 'w-8 h-8', 'w-9 h-9'][tableFontSize];
    };

    const getPaymentInnerSize = () => {
        return ['w-2 h-2', 'w-2.5 h-2.5', 'w-3 h-3', 'w-3.5 h-3.5', 'w-4 h-4'][tableFontSize];
    };

    // ... existing handlers ...

    const openEditBatch = () => {
        if (batch) {
            setEditBatchData({
                name: batch.name,
                subject: batch.subject,
                timeSlot: batch.timeSlot,
                feeAmount: batch.feeAmount.toString(),
                className: batch.className || '',
                whatsappGroupLink: batch.whatsappGroupLink || ''
            });
            setShowEditBatch(true);
        }
    };

    const handleDeleteBatch = () => {
        setShowDeleteConfirm(true);
    };

    const handleUpdateBatch = async (e: React.FormEvent) => {
        e.preventDefault();
        const toastId = toast.loading('Updating batch...');
        try {
            // Convert fee to number
            const payload = { ...editBatchData, feeAmount: parseFloat(editBatchData.feeAmount) || 0 };
            await apiRequest(`/batches/${id}`, 'PUT', payload);

            // Update local state
            setBatch(prev => prev ? { ...prev, ...payload } : null);

            toast.success('Batch updated successfully', { id: toastId });
            setShowEditBatch(false);
        } catch (e) {
            console.error(e);
            toast.error('Failed to update batch', { id: toastId });
        }
    };

    const fetchDetails = async () => {
        try {
            const data = await apiRequest(`/batches/${id}?t=${Date.now()}`);
            setBatch(data);
        } catch (e) {
            toast.error('Failed to load batch details');
            navigate('/batches');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDetails();

        // Auto-refresh when tabs change to ensure fresh data
        const onFocus = () => fetchDetails();
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
    }, [id, navigate]);

    const handleDownloadPDF = async () => {
        const toastId = toast.loading('Generating PDF...');
        try {
            const token = localStorage.getItem('token');
            const API_BASE = import.meta.env.PROD ? '/api' : (import.meta.env.VITE_API_URL || 'http://localhost:3001/api');
            const res = await fetch(`${API_BASE}/batches/${id}/download`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) throw new Error('Download failed');

            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${batch?.name || 'batch'}-students.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            toast.success('Downloaded!', { id: toastId });
        } catch (e) {
            toast.error('Failed to download PDF', { id: toastId });
        }
    };

    const handleToggleRegistration = async () => {
        if (!batch) return;
        const newState = !batch.isRegistrationOpen;
        try {
            await apiRequest(`/batches/${id}/toggle-registration`, 'PUT', { isOpen: newState });
            setBatch({ ...batch, isRegistrationOpen: newState });
            toast.success(newState ? 'Registration Opened' : 'Registration Closed');
        } catch (e) {
            toast.error('Failed to update status');
        }
    };

    const [sendingState, setSendingState] = useState<{ total: number; current: number; status: string; isOpen: boolean; completed: boolean }>({ total: 0, current: 0, status: '', isOpen: false, completed: false });

    // WhatsApp Modal State
    const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
    const [whatsappLinkInput, setWhatsappLinkInput] = useState('');

    const openWhatsappModal = () => {
        if (batch) {
            setWhatsappLinkInput(batch.whatsappGroupLink || '');
            setShowWhatsAppModal(true);
        }
    };

    const handleUpdateWhatsappLink = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await apiRequest(`/batches/${id}`, 'PUT', { whatsappGroupLink: whatsappLinkInput });
            setBatch(res);
            toast.success('WhatsApp Link Updated');
            setShowWhatsAppModal(false);
        } catch (e) {
            toast.error('Failed to update link');
        }
    };

    const handleSendWhatsappInvite = async () => {
        if (!batch?.whatsappGroupLink) {
            toast.error('Please add a WhatsApp link in Settings first');
            return;
        }

        const recipients = batch.students.filter(s => s.status === 'APPROVED' && s.parentEmail);

        if (recipients.length === 0) {
            toast.error('No approved students with valid emails found.');
            return;
        }

        setSendingState({
            total: recipients.length,
            current: 0,
            status: 'Initializing...',
            isOpen: true,
            completed: false
        });

        let successCount = 0;

        for (let i = 0; i < recipients.length; i++) {
            const student = recipients[i];
            setSendingState(prev => ({
                ...prev,
                current: i,
                status: `Sending to ${student.name}...`
            }));

            try {
                await apiRequest(`/students/${student.id}/whatsapp-invite`, 'POST');
                successCount++;
            } catch (e) {
                console.error(`Failed to send to ${student.name}`);
            }

            // Small delay for UI smoothness
            await new Promise(r => setTimeout(r, 200));
        }

        setSendingState(prev => ({
            ...prev,
            current: recipients.length,
            status: `Done! Sent ${successCount} invites.`,
            completed: true
        }));
    };

    const handleAddStudent = async (e: React.FormEvent) => {
        e.preventDefault();
        const toastId = toast.loading('Adding student...');
        try {
            await apiRequest('/students/manual', 'POST', {
                batchId: id,
                name: newName,
                parentName: newParentName,
                parentWhatsapp: newWhatsapp,
                parentEmail: newEmail,
                schoolName: newSchoolName
            });
            toast.success('Student added successfully', { id: toastId });
            setShowAddStudent(false);
            setNewName(''); setNewParentName(''); setNewWhatsapp(''); setNewEmail(''); setNewSchoolName('');
            fetchDetails();
        } catch (e) {
            toast.error('Failed to add student', { id: toastId });
        }
    };

    const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);
    const [deleteInput, setDeleteInput] = useState('');

    const handleDelete = (student: Student) => {
        setStudentToDelete(student);
        setDeleteInput('');
    };

    const confirmDeleteStudent = async (e: React.FormEvent) => {
        e.preventDefault();
        if (deleteInput.toLowerCase() !== 'delete' || !studentToDelete) return;

        const toastId = toast.loading('Removing student...');
        try {
            await apiRequest(`/students/${studentToDelete.id}/reject`, 'POST');
            toast.success('Student removed', { id: toastId });
            setStudentToDelete(null);
            fetchDetails();
        } catch (e) {
            toast.error('Failed to remove student', { id: toastId });
        }
    };


    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingStudent) return;
        const toastId = toast.loading('Updating student...');
        try {
            await apiRequest(`/students/${editingStudent.id}`, 'PUT', editingStudent);
            toast.success('Student updated', { id: toastId });
            setEditingStudent(null);
            fetchDetails();
        } catch (e) {
            toast.error('Failed to update student', { id: toastId });
        }
    };

    const handleEndRegistration = () => {
        setShowCloseConfirm(true);
    };

    const confirmEndRegistration = async () => {
        const toastId = toast.loading('Closing registration...');
        try {
            await apiRequest(`/batches/${id}/end-registration`, 'PUT', {});
            setBatch(prev => prev ? { ...prev, isRegistrationEnded: true, isRegistrationOpen: false } : null);
            toast.success('Registration ended permanently', { id: toastId });
            setShowCloseConfirm(false);
        } catch (e) {
            toast.error('Failed to end registration', { id: toastId });
        }
    };

    const confirmDeleteBatch = async () => {
        const toastId = toast.loading('Deleting batch...');
        try {
            await apiRequest(`/batches/${id}`, 'DELETE');
            toast.success('Batch deleted successfully', { id: toastId });
            // Small delay for toast
            setTimeout(() => {
                window.location.href = '/batches';
            }, 1000);
        } catch (e: any) {
            toast.error(e.message || 'Failed to delete batch', { id: toastId });
        }
    };

    const handlePrintStickers = () => {
        const token = localStorage.getItem('token');
        const toastId = toast.loading('Generating stickers...');
        fetch(`${API_URL}/stickers/download?batchId=${id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })
            .then(res => {
                if (!res.ok) throw new Error("Download failed");
                return res.blob();
            })
            .then(blob => {
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${batch?.name || 'batch'}_stickers.pdf`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                toast.success('Stickers downloaded', { id: toastId });
            })
            .catch(() => toast.error("Failed to print barcodes", { id: toastId }));
    };

    const handleAddInstallment = async (e: React.FormEvent) => {
        e.preventDefault();
        const toastId = toast.loading('Creating installment...');
        try {
            await apiRequest(`/batches/${id}/installments`, 'POST', {
                name: newInstallment.name,
                amount: Number(newInstallment.amount) // Ensure amount is number
            });
            toast.success('Installment created', { id: toastId });
            setShowAddInstallment(false);
            setNewInstallment({ name: '', amount: '' });
            fetchDetails();
        } catch (e) {
            toast.error('Failed to create installment', { id: toastId });
        }
    };

    const handleMarkPaid = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!paymentModal || isSubmitting) return;

        setIsSubmitting(true);

        // Capture values to avoid closure issues or mutations
        const { student, installment, date } = paymentModal;

        // Optimistic Update
        const newPayment = {
            id: 'temp-' + Date.now(),
            amountPaid: Number(installment.amount), // Ensure number
            date: date,
            installmentId: installment.id,
            studentId: student.id
        };

        setBatch(prev => {
            if (!prev) return null;
            return {
                ...prev,
                students: prev.students.map(s => {
                    if (s.id === student.id) {
                        return {
                            ...s,
                            feePayments: [...(s.feePayments || []), newPayment]
                        };
                    }
                    return s;
                })
            };
        });

        const toastId = toast.loading('Recording payment...');
        try {
            await apiRequest('/fees/pay-installment', 'POST', {
                studentId: student.id,
                installmentId: installment.id,
                amount: Number(installment.amount), // Ensure amount is number
                date: date
            });
            toast.success('Payment recorded', { id: toastId });
            setPaymentModal(null);
            fetchDetails(); // Ensure real data is fetched
        } catch (e: any) {
            console.error("Payment Error:", e);
            const errorMessage = e.message || 'Failed to record payment';

            // If payment already exists, treat as success/info and keep the UI state
            if (errorMessage.includes('already exists') || errorMessage.includes('409')) {
                toast.success('Payment already recorded', { id: toastId, icon: 'info' });
                setPaymentModal(null);
                fetchDetails();
            } else {
                toast.error(errorMessage, { id: toastId });
                // Revert optimistic update by refreshing data
                fetchDetails();
            }
        } finally {
            setIsSubmitting(false);
        }
    };


    if (loading) {
        return (
            <Layout>
                <div className="flex items-center justify-center h-96 text-app-text-secondary animate-pulse">
                    Loading batch details...
                </div>
            </Layout>
        );
    }

    if (!batch) return null;

    return (
        <Layout title={batch.name}>
            <div className="mb-8">
                <button
                    onClick={() => navigate('/batches')}
                    className="flex items-center text-app-text-secondary hover:text-app-text mb-6 transition-colors font-medium"
                >
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back to Batches
                </button>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                    {/* Batch Info Card */}
                    <div className="xl:col-span-2 bg-app-surface-opaque border border-app-border p-4 md:p-8 rounded-3xl shadow-sm flex flex-col gap-6">
                        <div className="flex justify-between items-start gap-4">
                            <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-3 mb-2">
                                    <h2 className="text-2xl md:text-3xl font-bold text-app-text tracking-tight break-words">{batch.name}</h2>
                                    <span className="bg-accent/10 text-accent text-xs px-3 py-1 rounded-full border border-accent/20 font-semibold whitespace-nowrap">{batch.subject}</span>
                                    {batch.className && <span className="bg-blue-500/10 text-blue-500 text-xs px-3 py-1 rounded-full border border-blue-500/20 font-semibold whitespace-nowrap">{batch.className}</span>}
                                </div>
                                <div className="flex items-center text-app-text-secondary gap-4 md:gap-6 mt-2 text-sm font-medium flex-wrap">
                                    <span className="flex items-center whitespace-nowrap"><Clock className="w-4 h-4 mr-2 text-app-text-tertiary" /> {batch.timeSlot}</span>
                                    <span className="flex items-center whitespace-nowrap"><Users className="w-4 h-4 mr-2 text-app-text-tertiary" /> {batch.students.length} Students</span>
                                </div>
                            </div>
                            <div className="flex gap-2 shrink-0">
                                <button
                                    onClick={openEditBatch}
                                    className="p-2 text-app-text-tertiary hover:text-accent hover:bg-accent/10 rounded-xl transition-all border border-transparent hover:border-accent/10"
                                    title="Edit Batch Details"
                                >
                                    <Settings className="w-5 h-5" />
                                </button>
                                <button
                                    onClick={handleDeleteBatch}
                                    className="p-2 text-app-text-tertiary hover:text-danger hover:bg-danger/10 rounded-xl transition-all border border-transparent hover:border-danger/10"
                                    title="Delete Batch"
                                >
                                    <Trash2 className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-3 w-full mt-auto">
                            <button
                                onClick={handleDownloadPDF}
                                className="bg-app-bg hover:bg-app-border text-app-text px-6 py-3.5 rounded-xl font-bold flex items-center justify-center border border-app-border transition-all active:scale-95 flex-1"
                            >
                                <Download className="w-5 h-5 mr-2" /> Download List
                            </button>
                            <button
                                onClick={handlePrintStickers}
                                className="bg-app-bg hover:bg-app-border text-app-text px-6 py-3.5 rounded-xl font-bold flex items-center justify-center border border-app-border transition-all active:scale-95 flex-1"
                            >
                                <Printer className="w-5 h-5 mr-2" /> Print Barcodes
                            </button>
                            <button
                                onClick={() => setShowAddStudent(true)}
                                className="bg-app-surface hover:bg-app-surface-hover text-app-text px-6 py-3.5 rounded-xl font-bold flex items-center justify-center border border-app-border transition-all active:scale-95 flex-1"
                            >
                                <Plus className="w-5 h-5 mr-2" /> Add Student
                            </button>
                            <button
                                onClick={() => setShowAddInstallment(true)}
                                className="bg-app-surface hover:bg-app-surface-hover text-app-text px-6 py-3.5 rounded-xl font-bold flex items-center justify-center border border-app-border transition-all active:scale-95 flex-1"
                            >
                                <Plus className="w-5 h-5 mr-2" /> Add Fee Column
                            </button>
                        </div>
                    </div>

                    {/* Registration Control Card */}
                    {!batch.isRegistrationEnded && (
                        <div className="bg-app-surface-opaque border border-app-border p-4 md:p-6 rounded-3xl shadow-sm flex flex-col items-center text-center relative">

                            <div className="flex items-center justify-between w-full mb-6">
                                <div className="flex items-center gap-3">
                                    <span className="font-bold text-app-text-secondary text-xs uppercase tracking-wider">Registration</span>
                                    <div className={cn(
                                        "px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wide",
                                        batch.isRegistrationOpen
                                            ? 'bg-success/10 text-success border-success/20'
                                            : 'bg-warning/10 text-orange-500 border-warning/20'
                                    )}>
                                        {batch.isRegistrationOpen ? 'Live' : 'Paused'}
                                    </div>
                                </div>

                                <div className="relative">
                                    <button
                                        onClick={() => setShowRegMenu(!showRegMenu)}
                                        className="p-2 hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors text-app-text-secondary active:scale-95"
                                    >
                                        <MoreVertical className="w-5 h-5" />
                                    </button>

                                    <AnimatePresence>
                                        {showRegMenu && (
                                            <>
                                                <div
                                                    className="fixed inset-0 z-40 cursor-default"
                                                    onClick={(e) => { e.stopPropagation(); setShowRegMenu(false); }}
                                                />
                                                <motion.div
                                                    initial={{ opacity: 0, scale: 0.95, y: -5 }}
                                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                                    exit={{ opacity: 0, scale: 0.95, y: -5 }}
                                                    className="absolute right-0 top-10 min-w-[220px] !bg-white border border-neutral-200 rounded-xl shadow-2xl z-50 py-1.5 text-left text-sm font-medium"
                                                >
                                                    <div className="px-3 py-2 text-xs font-bold text-neutral-400 uppercase tracking-wider mb-1">Options</div>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleToggleRegistration(); setShowRegMenu(false); }}
                                                        className="w-full text-left px-4 py-2.5 hover:bg-neutral-50 dark:hover:bg-neutral-700/50 text-app-text flex items-center gap-3 transition-colors"
                                                    >
                                                        {batch.isRegistrationOpen ? <Pause className="w-4 h-4 text-app-text-tertiary" /> : <Play className="w-4 h-4 text-app-text-tertiary" />}
                                                        {batch.isRegistrationOpen ? 'Pause temporarily' : 'Resume registration'}
                                                    </button>
                                                    <div className="h-px bg-neutral-200 dark:bg-neutral-700 my-1 mx-4" />
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleEndRegistration(); setShowRegMenu(false); }}
                                                        className="w-full text-left px-4 py-2.5 hover:bg-neutral-50 dark:hover:bg-neutral-700/50 text-app-text flex items-center gap-3 transition-colors"
                                                    >
                                                        <Archive className="w-4 h-4 text-app-text-tertiary" />
                                                        Close permanently
                                                    </button>
                                                    <div className="h-px bg-neutral-200 dark:bg-neutral-700 my-1 mx-4" />
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(true); setShowRegMenu(false); }}
                                                        className="w-full text-left px-4 py-2.5 hover:bg-red-50 dark:hover:bg-red-900/10 text-danger flex items-center gap-3 transition-colors"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                        Delete Batch
                                                    </button>
                                                </motion.div>
                                            </>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </div>

                            <div className="bg-white p-4 rounded-2xl mb-6 shadow-inner flex flex-col items-center gap-4">
                                <QRCode value={`${window.location.origin}/register/${batch.id}`} size={140} />
                                <button
                                    onClick={async () => {
                                        try {
                                            const token = localStorage.getItem('token');
                                            const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}/batches/${batch.id}/qr-pdf`, {
                                                headers: { Authorization: `Bearer ${token}` }
                                            });
                                            if (!response.ok) throw new Error('Failed to download');
                                            const blob = await response.blob();
                                            const url = window.URL.createObjectURL(blob);
                                            const a = document.createElement('a');
                                            a.href = url;
                                            a.download = `QR-${batch.name.replace(/\s+/g, '-')}.pdf`;
                                            document.body.appendChild(a);
                                            a.click();
                                            window.URL.revokeObjectURL(url);
                                            document.body.removeChild(a);
                                        } catch (e) {
                                            toast.error('Failed to download QR PDF');
                                        }
                                    }}
                                    className="text-xs font-bold text-app-text-tertiary hover:text-app-text flex items-center gap-1.5 transition-colors bg-app-surface px-3 py-1.5 rounded-lg border border-app-border hover:border-app-text-secondary"
                                >
                                    <Download className="w-3 h-3" /> Download QR
                                </button>
                            </div>

                            <div className="w-full space-y-3">
                                <div>
                                    <p className="text-xs text-app-text-tertiary mb-2 px-2 uppercase font-bold tracking-wider">Actions</p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-center">
                                        <button
                                            onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/kiosk/register/${batch.id}`); toast.success('Kiosk Link Copied'); }}
                                            className="py-3.5 rounded-xl bg-app-surface hover:bg-app-surface-hover text-app-text border border-app-border text-xs font-bold transition-all w-full"
                                        >
                                            Copy Kiosk Link
                                        </button>
                                        <button
                                            onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/register/${batch.id}`); toast.success('Invite Link Copied'); }}
                                            className="py-3.5 rounded-xl bg-app-surface hover:bg-app-surface-hover text-app-text border border-app-border text-xs font-bold transition-all w-full"
                                        >
                                            Copy Invite Link
                                        </button>

                                        {/* WhatsApp Actions Row */}
                                        <button
                                            onClick={openWhatsappModal}
                                            className={cn(
                                                "py-3.5 rounded-xl border text-xs font-bold transition-all w-full flex items-center justify-center gap-2",
                                                batch.whatsappGroupLink
                                                    ? "bg-app-surface hover:bg-app-surface-hover text-app-text border-app-border"
                                                    : "bg-app-surface border-dashed border-app-text-tertiary text-app-text-secondary hover:text-app-text hover:border-app-text"
                                            )}
                                        >
                                            {batch.whatsappGroupLink ? 'Edit Group Link' : 'Add Group Link'}
                                        </button>

                                        <button
                                            onClick={handleSendWhatsappInvite}
                                            disabled={!batch.whatsappGroupLink}
                                            className="py-3.5 rounded-xl bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 text-xs font-bold transition-all w-full disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-app-surface disabled:text-app-text-tertiary disabled:border-app-border"
                                        >
                                            <div className="flex items-center justify-center gap-2">
                                                <Mail className="w-4 h-4" />
                                                Send Invites
                                            </div>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="bg-app-surface-opaque border border-app-border rounded-[24px] shadow-sm mt-8">
                {/* Search Header */}
                <div className="p-4 border-b border-app-border bg-app-surface/50 backdrop-blur-md sticky top-0 z-10 rounded-t-[24px]">
                    <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                        <div className="relative max-w-md w-full">
                            <Search className="absolute left-3 top-3 w-5 h-5 text-app-text-tertiary" />
                            <input
                                type="text"
                                placeholder="Search by name, school, ID, or phone..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-app-bg border border-app-border rounded-xl pl-10 pr-4 py-2.5 text-app-text outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent transition-all placeholder:text-app-text-tertiary"
                            />
                        </div>
                        <div className="flex items-center gap-2 bg-app-bg p-1 rounded-xl border border-app-border self-end md:self-auto">
                            <button
                                onClick={() => setTableFontSize(Math.max(0, tableFontSize - 1))}
                                disabled={tableFontSize === 0}
                                className="p-2 text-app-text-tertiary hover:text-app-text disabled:opacity-30 disabled:hover:text-app-text-tertiary transition-colors"
                                title="Decrease Font Size"
                            >
                                <span className="text-xs font-bold">A-</span>
                            </button>
                            <div className="w-px h-4 bg-app-border"></div>
                            <button
                                onClick={() => setTableFontSize(Math.min(4, tableFontSize + 1))}
                                disabled={tableFontSize === 4}
                                className="p-2 text-app-text-tertiary hover:text-app-text disabled:opacity-30 disabled:hover:text-app-text-tertiary transition-colors"
                                title="Increase Font Size"
                            >
                                <span className="text-lg font-bold">A+</span>
                            </button>
                        </div>
                    </div>
                </div>

                <div className="hidden md:block overflow-x-auto overflow-y-hidden rounded-b-[24px] w-full max-w-full">
                    <table className="w-full text-left border-collapse">
                        <thead className={cn("bg-app-surface/50 text-app-text-secondary uppercase font-bold tracking-wider backdrop-blur-md", getTextSizeClass('header'))}>
                            <tr>
                                <th
                                    className={cn("border-b border-app-border cursor-pointer select-none hover:bg-app-surface-hover transition-colors group", getCellPadding())}
                                    style={{ minWidth: '100px', whiteSpace: 'nowrap' }}
                                    onClick={() => {
                                        setSortConfig(current => {
                                            if (current?.key !== 'humanId') return { key: 'humanId', direction: 'asc' };
                                            if (current.direction === 'asc') return { key: 'humanId', direction: 'desc' };
                                            return null;
                                        });
                                    }}
                                >
                                    <div className="flex items-center gap-1.5">
                                        ID
                                        {sortConfig?.key === 'humanId' ? (
                                            sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-app-text" /> : <ArrowDown className="w-3 h-3 text-app-text" />
                                        ) : (
                                            <ArrowUpDown className="w-3 h-3 text-app-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity" />
                                        )}
                                    </div>
                                </th>
                                <th className={cn("border-b border-app-border", getCellPadding())} style={{ minWidth: '180px', whiteSpace: 'nowrap' }}>Student Name</th>
                                <th className={cn("border-b border-app-border", getCellPadding())} style={{ minWidth: '180px', whiteSpace: 'nowrap' }}>School</th>
                                <th className={cn("border-b border-app-border", getCellPadding())} style={{ minWidth: '180px', whiteSpace: 'nowrap' }}>Parent Name</th>
                                <th className={cn("border-b border-app-border", getCellPadding())} style={{ minWidth: '200px', whiteSpace: 'nowrap' }}>Contact</th>
                                <th className={cn("border-b border-app-border text-center", getCellPadding())} style={{ minWidth: '80px', whiteSpace: 'nowrap' }}>Tests</th>
                                <th className={cn("border-b border-app-border text-center", getCellPadding())} style={{ minWidth: '80px', whiteSpace: 'nowrap' }}>Avg (10)</th>
                                {batch.feeInstallments?.map(inst => (
                                    <th key={inst.id} className={cn("border-b border-app-border text-center", getCellPadding())} style={{ minWidth: '100px', whiteSpace: 'nowrap' }}>
                                        <div className="flex flex-col items-center">
                                            <span>{inst.name}</span>
                                            <span className={cn("text-app-text-tertiary", getTextSizeClass('sub'))}>₹{inst.amount}</span>
                                        </div>
                                    </th>
                                ))}
                                <th className={cn("border-b border-app-border text-center", getCellPadding())} style={{ minWidth: '120px', whiteSpace: 'nowrap' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-app-border text-app-text">
                            {filteredStudents.map((student) => {
                                // Dynamic Fee Logic (Virtual Allocation)
                                const genericPaid = student.fees?.filter((f: any) => f.status === 'PAID').reduce((sum: number, f: any) => sum + f.amount, 0) || 0;
                                let currentBuffer = genericPaid;
                                // Sort installments (immutable copy) -> older first
                                const sortedInsts = [...(batch.feeInstallments || [])].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
                                const instPaidMap: Record<string, number> = {};
                                sortedInsts.forEach(inst => {
                                    const directPayments = student.feePayments?.filter((p: any) => p.installmentId === inst.id) || [];
                                    let paid = directPayments.reduce((sum: number, p: any) => sum + p.amountPaid, 0);
                                    const remaining = inst.amount - paid;
                                    if (remaining > 0 && currentBuffer > 0) {
                                        const coverage = Math.min(remaining, currentBuffer);
                                        paid += coverage;
                                        currentBuffer -= coverage;
                                    }
                                    instPaidMap[inst.id] = paid;
                                });

                                return (
                                    <tr key={student.id} className="hover:bg-app-surface transition-colors group">
                                        <td className={cn("font-mono text-app-text-tertiary", getCellPadding(), getTextSizeClass('sub'))} style={{ whiteSpace: 'nowrap' }}>{student.humanId || '-'}</td>
                                        <td className={cn("font-semibold text-app-text", getCellPadding(), getTextSizeClass('body'))} style={{ whiteSpace: 'nowrap' }} title={student.name}>{student.name}</td>
                                        <td className={cn("text-app-text-secondary", getCellPadding(), getTextSizeClass('sub'))} style={{ whiteSpace: 'nowrap' }} title={student.schoolName || ''}>{student.schoolName || '-'}</td>
                                        <td className={cn("text-app-text-secondary", getCellPadding(), getTextSizeClass('sub'))} style={{ whiteSpace: 'nowrap' }} title={student.parentName}>{student.parentName}</td>
                                        <td className={getCellPadding()}>
                                            <div className={cn("flex flex-col gap-1.5", getTextSizeClass('sub'))} style={{ whiteSpace: 'nowrap' }}>
                                                <span className="flex items-center gap-1 text-app-text-secondary"><Phone className={cn("text-success", getIconSizeClass())} /> {student.parentWhatsapp}</span>
                                                {student.parentEmail && <span className="flex items-center gap-1 text-app-text-secondary"><Mail className={cn("text-accent", getIconSizeClass())} /> {student.parentEmail}</span>}
                                            </div>
                                        </td>
                                        <td className={cn("text-center", getCellPadding())}>
                                            <button onClick={() => setViewMarksId(student.id)} className="p-2 hover:bg-black/5 rounded-lg transition-colors inline-flex items-center justify-center text-app-text-secondary hover:text-app-text" title="View Marks">
                                                <Eye className={getIconSizeClass()} />
                                            </button>
                                        </td>
                                        <td className={cn("text-center font-bold text-app-text", getCellPadding())}>{getStudentAverage(student)}</td>
                                        {batch.feeInstallments?.map(inst => {
                                            const payments = student.feePayments?.filter(p => p.installmentId === inst.id) || [];
                                            // Use calculated amount from map, fallback to simple check if missing (shouldn't happen)
                                            const paidAmount = instPaidMap[inst.id] !== undefined ? instPaidMap[inst.id] : payments.reduce((sum, p) => sum + p.amountPaid, 0);
                                            const isFullyPaid = paidAmount >= inst.amount;
                                            const isPartiallyPaid = paidAmount > 0 && !isFullyPaid;

                                            return (
                                                <td key={inst.id} className={cn("text-center", getCellPadding())}>
                                                    <button
                                                        onClick={() => {
                                                            if (isFullyPaid) {
                                                                if (payments.length > 0) {
                                                                    setViewPayment({ student, installment: inst, payments });
                                                                } else {
                                                                    toast.success('Paid via Account Balance');
                                                                }
                                                            } else {
                                                                // Calculate remaining
                                                                const remaining = inst.amount - paidAmount;
                                                                setPaymentModal({
                                                                    student,
                                                                    installment: { ...inst, amount: remaining },
                                                                    date: new Date().toISOString().split('T')[0]
                                                                });
                                                            }
                                                        }}
                                                        className={cn(
                                                            "rounded-full flex items-center justify-center border-2 transition-all mx-auto relative group/btn",
                                                            getPaymentButtonSize(),
                                                            isFullyPaid
                                                                ? "border-app-text bg-transparent cursor-pointer hover:bg-black/5 dark:hover:bg-white/5"
                                                                : isPartiallyPaid
                                                                    ? "border-orange-400 text-orange-500 cursor-pointer bg-orange-50 hover:bg-orange-100"
                                                                    : "border-app-text-tertiary bg-transparent hover:border-app-text cursor-pointer text-app-text"
                                                        )}
                                                        title={
                                                            isFullyPaid
                                                                ? (payments.length > 0 ? `Paid on ${new Date(payments[0].date).toLocaleDateString()}` : 'Paid via Balance')
                                                                : isPartiallyPaid
                                                                    ? `Partial: ₹${paidAmount}/${inst.amount}`
                                                                    : "Mark as Paid"
                                                        }
                                                    >
                                                        {isFullyPaid && <div className={cn("bg-current rounded-full", getPaymentInnerSize())} />}
                                                        {isPartiallyPaid && (
                                                            <div className="absolute inset-0 flex items-center justify-center text-[8px] font-bold">
                                                                P
                                                            </div>
                                                        )}
                                                    </button>
                                                </td>
                                            );
                                        })}
                                        <td className={cn("text-center", getCellPadding())} >
                                            <div className="flex items-center justify-center gap-2">
                                                <button
                                                    onClick={() => setEditingStudent(student)}
                                                    className="p-2 hover:bg-accent/10 text-accent rounded-lg transition-colors"
                                                    title="Edit"
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(student)}
                                                    className="p-2 hover:bg-danger/10 text-danger rounded-lg transition-colors"
                                                    title="Delete"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {filteredStudents.length === 0 && (
                                <tr>
                                    <td colSpan={6 + (batch.feeInstallments?.length || 0)} className="p-20 text-center text-app-text-tertiary flex flex-col items-center justify-center">
                                        <Users className="w-12 h-12 mb-4 opacity-20" />
                                        <p>{searchQuery ? 'No students match your search.' : 'No students in this batch yet.'}</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Mobile Student List Card View */}
                <div className="md:hidden">
                    <div className="divide-y divide-app-border">
                        {filteredStudents.map((student) => {
                            // Dynamic Fee Logic (Virtual Allocation) - Mobile
                            const genericPaid = student.fees?.filter((f: any) => f.status === 'PAID').reduce((sum: number, f: any) => sum + f.amount, 0) || 0;
                            let currentBuffer = genericPaid;
                            const sortedInsts = [...(batch.feeInstallments || [])].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
                            const instPaidMap: Record<string, number> = {};
                            sortedInsts.forEach(inst => {
                                const directPayments = student.feePayments?.filter((p: any) => p.installmentId === inst.id) || [];
                                let paid = directPayments.reduce((sum: number, p: any) => sum + p.amountPaid, 0);
                                const remaining = inst.amount - paid;
                                if (remaining > 0 && currentBuffer > 0) {
                                    const coverage = Math.min(remaining, currentBuffer);
                                    paid += coverage;
                                    currentBuffer -= coverage;
                                }
                                instPaidMap[inst.id] = paid;
                            });

                            return (
                                <div key={student.id} className="p-4 flex flex-col gap-3 bg-app-surface-opaque hover:bg-app-surface transition-colors">
                                    <div className="flex flex-col gap-3">
                                        <div className="flex justify-between items-start">
                                            <div className="flex-1 min-w-0 pr-4">
                                                <h4 className={cn("font-bold text-app-text break-words leading-tight", getTextSizeClass('body'))}>{student.name}</h4>
                                                {student.humanId && (
                                                    <span className={cn("inline-block mt-1 font-mono bg-app-surface border border-app-border px-2 py-0.5 rounded-full text-app-text-tertiary", getTextSizeClass('sub'))}>
                                                        {student.humanId}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex gap-2 shrink-0">
                                                <button onClick={() => setViewMarksId(student.id)} className="p-2 bg-app-text/5 text-app-text rounded-lg active:scale-95 transition-transform"><Eye className={getIconSizeClass()} /></button>
                                                <a href={`tel:${student.parentWhatsapp}`} className="p-2 bg-success/10 text-success rounded-lg active:scale-95 transition-transform"><Phone className={getIconSizeClass()} /></a>
                                                <button onClick={() => setEditingStudent(student)} className="p-2 bg-accent/10 text-accent rounded-lg active:scale-95 transition-transform"><Edit2 className={getIconSizeClass()} /></button>
                                                <button onClick={() => handleDelete(student)} className="p-2 bg-danger/10 text-danger rounded-lg active:scale-95 transition-transform"><Trash2 className={getIconSizeClass()} /></button>
                                            </div>
                                        </div>

                                        <div className={cn("grid grid-cols-1 gap-1.5 text-app-text-secondary pl-0.5", getTextSizeClass('sub'))}>
                                            <div className="flex items-center gap-2">
                                                <div className="w-5 flex justify-center"><Book className="w-3.5 h-3.5 text-app-text-tertiary" /></div>
                                                <span className="truncate">{student.schoolName || <span className="text-app-text-tertiary italic">No School</span>}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="w-5 flex justify-center"><User className="w-3.5 h-3.5 text-app-text-tertiary" /></div>
                                                <span className="truncate">{student.parentName}</span>
                                            </div>
                                            <div className="flex items-center gap-2 text-accent font-bold mt-1">
                                                <div className="w-5 flex justify-center"><FileText className="w-3.5 h-3.5" /></div>
                                                <span>Avg: {getStudentAverage(student)} / 10</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Mobile Fees Scroll View */}
                                    {
                                        batch.feeInstallments && batch.feeInstallments.length > 0 && (
                                            <div className="mt-2 pt-3 border-t border-app-border/50">
                                                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-4 px-4">
                                                    {batch.feeInstallments.map(inst => {
                                                        const payments = student.feePayments?.filter(p => p.installmentId === inst.id) || [];
                                                        // Use calculated amount from map
                                                        const paidAmount = instPaidMap[inst.id] !== undefined ? instPaidMap[inst.id] : payments.reduce((sum, p) => sum + p.amountPaid, 0);
                                                        const isFullyPaid = paidAmount >= inst.amount;
                                                        const isPartiallyPaid = paidAmount > 0 && !isFullyPaid;

                                                        return (
                                                            <button
                                                                key={inst.id}
                                                                onClick={() => {
                                                                    if (isFullyPaid) {
                                                                        if (payments.length > 0) {
                                                                            setViewPayment({ student, installment: inst, payments });
                                                                        } else {
                                                                            toast.success('Paid via Account Balance');
                                                                        }
                                                                    } else {
                                                                        // Calculate remaining
                                                                        const remaining = inst.amount - paidAmount;
                                                                        setPaymentModal({
                                                                            student,
                                                                            installment: { ...inst, amount: remaining },
                                                                            date: new Date().toISOString().split('T')[0]
                                                                        });
                                                                    }
                                                                }}
                                                                className={cn(
                                                                    "flex items-center gap-2.5 px-4 py-2.5 rounded-xl border font-medium whitespace-nowrap transition-all",
                                                                    "bg-app-surface hover:bg-app-surface-hover border-app-border text-app-text",
                                                                    getTextSizeClass('body')
                                                                )}
                                                            >
                                                                {/* Circle Indicator matching Desktop */}
                                                                <div className={cn(
                                                                    "rounded-full flex items-center justify-center border transition-all relative",
                                                                    getIconSizeClass(),
                                                                    isFullyPaid
                                                                        ? "border-app-text"
                                                                        : isPartiallyPaid
                                                                            ? "border-orange-400 text-orange-500 bg-orange-50"
                                                                            : "border-app-text-tertiary text-app-text"
                                                                )}>
                                                                    {isFullyPaid && <div className={cn("bg-current rounded-full", getPaymentInnerSize())} />}
                                                                    {isPartiallyPaid && <div className="text-[6px] font-bold">P</div>}
                                                                </div>

                                                                <div className="flex flex-col items-start leading-none gap-0.5">
                                                                    <span>{inst.name}</span>
                                                                    {isPartiallyPaid && (
                                                                        <span className="text-[9px] text-orange-500 font-bold">Due: ₹{inst.amount - paidAmount}</span>
                                                                    )}
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )
                                    }
                                </div>
                            );
                        })}
                    </div>
                    {
                        filteredStudents.length === 0 && (
                            <div className="p-12 text-center text-app-text-tertiary flex flex-col items-center justify-center">
                                <Users className="w-10 h-10 mb-3 opacity-20" />
                                <p className="text-sm">{searchQuery ? 'No match found.' : 'No students yet.'}</p>
                            </div>
                        )
                    }
                </div>
            </div >

            {/* Edit Modal */}
            <AnimatePresence>
                {
                    editingStudent && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0 bg-black/40 backdrop-blur-md"
                                onClick={() => setEditingStudent(null)}
                            />
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                                className="!bg-white border border-app-border rounded-[24px] p-5 md:p-8 max-w-lg w-full shadow-2xl relative z-10 max-h-[90vh] overflow-y-auto scrollbar-hide"
                            >
                                <div className="flex justify-between items-center mb-8">
                                    <h3 className="text-xl font-bold text-app-text">Edit Student</h3>
                                    <button onClick={() => setEditingStudent(null)} className="text-app-text-tertiary hover:text-app-text p-1 rounded-full hover:bg-app-surface"><X className="w-5 h-5" /></button>
                                </div>

                                <form onSubmit={handleUpdate} className="grid grid-cols-1 gap-6">
                                    {/* Student Section */}
                                    <div className="space-y-4 p-4 border-2 border-black rounded-2xl bg-white">
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="p-1.5 bg-accent/10 rounded-lg text-accent"><User className="w-4 h-4" /></div>
                                            <h4 className="text-sm font-bold text-app-text tracking-tight">Student Details</h4>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-1.5 md:col-span-1">
                                                <label className="text-xs font-bold text-app-text-tertiary uppercase tracking-wider ml-1">Full Name</label>
                                                <div className="relative">
                                                    <User className="absolute left-3 top-3 w-4 h-4 text-app-text-tertiary" />
                                                    <input
                                                        value={editingStudent.name}
                                                        onChange={(e) => setEditingStudent(prev => prev ? { ...prev, name: e.target.value } : null)}
                                                        className="w-full bg-app-bg border border-app-border rounded-xl pl-10 pr-4 py-2.5 text-app-text focus:ring-2 focus:ring-accent/10 focus:border-accent outline-none transition-all placeholder:text-app-text-tertiary/50"
                                                        required
                                                        placeholder="e.g. Rahul Sharma"
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-1.5 md:col-span-1">
                                                <label className="text-xs font-bold text-app-text-tertiary uppercase tracking-wider ml-1">Human ID</label>
                                                <div className="relative">
                                                    <Fingerprint className="absolute left-3 top-3 w-4 h-4 text-app-text-tertiary" />
                                                    <input
                                                        value={editingStudent.humanId || ''}
                                                        disabled
                                                        className="w-full bg-neutral-100 dark:bg-neutral-800 border border-app-border rounded-xl pl-10 pr-4 py-2.5 text-app-text-tertiary cursor-not-allowed outline-none select-none pointer-events-none"
                                                        placeholder="Generated ID"
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-1.5 md:col-span-2">
                                                <label className="text-xs font-bold text-app-text-tertiary uppercase tracking-wider ml-1">School Name</label>
                                                <div className="relative">
                                                    <Book className="absolute left-3 top-3 w-4 h-4 text-app-text-tertiary" />
                                                    <input
                                                        value={editingStudent.schoolName || ''}
                                                        onChange={(e) => setEditingStudent(prev => prev ? { ...prev, schoolName: e.target.value } : null)}
                                                        className="w-full bg-app-bg border border-app-border rounded-xl pl-10 pr-4 py-2.5 text-app-text focus:ring-2 focus:ring-accent/10 focus:border-accent outline-none transition-all placeholder:text-app-text-tertiary/50"
                                                        placeholder="e.g. DPS, KV, etc."
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Guardian Section */}
                                    <div className="space-y-4 p-4 border-2 border-black rounded-2xl bg-white">
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="p-1.5 bg-success/10 rounded-lg text-success"><Users className="w-4 h-4" /></div>
                                            <h4 className="text-sm font-bold text-app-text tracking-tight">Parent & Contact</h4>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-1.5 md:col-span-2">
                                                <label className="text-xs font-bold text-app-text-tertiary uppercase tracking-wider ml-1">Parent Name</label>
                                                <div className="relative">
                                                    <User className="absolute left-3 top-3 w-4 h-4 text-app-text-tertiary" />
                                                    <input
                                                        value={editingStudent.parentName}
                                                        onChange={(e) => setEditingStudent(prev => prev ? { ...prev, parentName: e.target.value } : null)}
                                                        className="w-full bg-app-bg border border-app-border rounded-xl pl-10 pr-4 py-2.5 text-app-text focus:ring-2 focus:ring-accent/10 focus:border-accent outline-none transition-all placeholder:text-app-text-tertiary/50"
                                                        required
                                                        placeholder="Guardian's Name"
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-xs font-bold text-app-text-tertiary uppercase tracking-wider ml-1">WhatsApp</label>
                                                <div className="relative">
                                                    <Phone className="absolute left-3 top-3 w-4 h-4 text-app-text-tertiary" />
                                                    <input
                                                        value={editingStudent.parentWhatsapp}
                                                        onChange={(e) => setEditingStudent(prev => prev ? { ...prev, parentWhatsapp: e.target.value } : null)}
                                                        className="w-full bg-app-bg border border-app-border rounded-xl pl-10 pr-4 py-2.5 text-app-text focus:ring-2 focus:ring-accent/10 focus:border-accent outline-none transition-all placeholder:text-app-text-tertiary/50"
                                                        required
                                                        placeholder="10-digit Number"
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-xs font-bold text-app-text-tertiary uppercase tracking-wider ml-1">Email</label>
                                                <div className="relative">
                                                    <Mail className="absolute left-3 top-3 w-4 h-4 text-app-text-tertiary" />
                                                    <input
                                                        value={editingStudent.parentEmail || ''}
                                                        onChange={(e) => setEditingStudent(prev => prev ? { ...prev, parentEmail: e.target.value } : null)}
                                                        className="w-full bg-app-bg border border-app-border rounded-xl pl-10 pr-4 py-2.5 text-app-text focus:ring-2 focus:ring-accent/10 focus:border-accent outline-none transition-all placeholder:text-app-text-tertiary/50"
                                                        placeholder="Optional"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex justify-end pt-4 border-t border-app-border">
                                        <button
                                            type="submit"
                                            className="!bg-black hover:!bg-neutral-800 !text-white border-2 !border-black px-8 py-3 rounded-xl font-bold flex items-center shadow-lg shadow-gray-200 transition-all active:scale-[0.98]"
                                        >
                                            <Save className="w-4 h-4 mr-2" /> Save Changes
                                        </button>
                                    </div>
                                </form>
                            </motion.div>
                        </div>
                    )
                }
            </AnimatePresence >

            {/* View Marks Modal */}
            <AnimatePresence>
                {viewMarks && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/40 backdrop-blur-md"
                            onClick={() => setViewMarksId(null)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="!bg-white border border-app-border rounded-[24px] p-8 max-w-2xl w-full shadow-2xl relative z-10 max-h-[90vh] overflow-y-auto scrollbar-hide"
                        >
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <h3 className="text-xl font-bold text-app-text">{viewMarks.name}'s Performance</h3>
                                    <p className="text-sm text-app-text-secondary mt-1">Detailed breakdown of test scores</p>
                                </div>
                                <button onClick={() => setViewMarksId(null)} className="text-app-text-tertiary hover:text-app-text p-1 rounded-full hover:bg-app-surface"><X className="w-5 h-5" /></button>
                            </div>

                            <div className="border border-app-border rounded-xl overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left min-w-[600px]">
                                        <thead className="bg-app-surface border-b border-app-border">
                                            <tr className="whitespace-nowrap">
                                                <th className="px-6 py-4 text-xs font-bold text-app-text-tertiary uppercase tracking-wider">Test Name</th>
                                                <th className="px-6 py-4 text-xs font-bold text-app-text-tertiary uppercase tracking-wider">Date</th>
                                                <th className="px-6 py-4 text-xs font-bold text-app-text-tertiary uppercase tracking-wider text-center">Score</th>
                                                <th className="px-6 py-4 text-xs font-bold text-app-text-tertiary uppercase tracking-wider text-center">Max Marks</th>
                                                <th className="px-6 py-4 text-xs font-bold text-app-text-tertiary uppercase tracking-wider text-right">Normalized (10)</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-app-border">
                                            {viewMarks.marks && viewMarks.marks.map((mark: any) => {
                                                const max = mark.test.maxMarks || 0;
                                                const normalized = max > 0 ? (mark.score / max) * 10 : 0;
                                                return (
                                                    <tr key={mark.id} className="hover:bg-app-surface/50 transition-colors">
                                                        <td className="px-6 py-4 font-medium text-app-text">{mark.test.name}</td>
                                                        <td className="px-6 py-4 text-app-text-secondary text-sm">{new Date(mark.test.date).toLocaleDateString()}</td>
                                                        <td className="px-6 py-4 text-center text-app-text">{mark.score}</td>
                                                        <td className="px-6 py-4 text-center text-app-text-secondary">{max}</td>
                                                        <td className="px-6 py-4 text-right font-mono font-bold text-accent">{normalized.toFixed(1)}</td>
                                                    </tr>
                                                );
                                            })}
                                            {(!viewMarks.marks || viewMarks.marks.length === 0) && (
                                                <tr>
                                                    <td colSpan={5} className="px-6 py-12 text-center text-app-text-tertiary">
                                                        No test records found.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                        {viewMarks.marks && viewMarks.marks.length > 0 && (
                                            <tfoot className="bg-app-surface border-t border-app-border">
                                                <tr>
                                                    <td colSpan={4} className="px-6 py-4 text-sm font-bold text-app-text text-right">Average Normalized Score</td>
                                                    <td className="px-6 py-4 text-right font-mono font-bold text-xl text-app-text">
                                                        {getStudentAverage(viewMarks)}
                                                    </td>
                                                </tr>
                                            </tfoot>
                                        )}
                                    </table>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Add Student Modal */}
            <AnimatePresence>
                {
                    showAddStudent && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0 bg-black/40 backdrop-blur-md"
                                onClick={() => setShowAddStudent(false)}
                            />
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                                className="!bg-white border border-app-border rounded-[24px] p-5 md:p-8 max-w-lg w-full shadow-2xl relative z-10 max-h-[90vh] overflow-y-auto scrollbar-hide"
                            >
                                <div className="flex justify-between items-center mb-8">
                                    <h3 className="text-xl font-bold text-app-text">Add New Student</h3>
                                    <button onClick={() => setShowAddStudent(false)} className="text-app-text-tertiary hover:text-app-text p-1 rounded-full hover:bg-app-surface"><X className="w-5 h-5" /></button>
                                </div>

                                <form onSubmit={handleAddStudent} className="grid grid-cols-1 gap-6">
                                    {/* Student Section */}
                                    <div className="space-y-4 p-4 border-2 border-black rounded-2xl bg-white">
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="p-1.5 bg-accent/10 rounded-lg text-accent"><User className="w-4 h-4" /></div>
                                            <h4 className="text-sm font-bold text-app-text tracking-tight">Student Details</h4>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-1.5 md:col-span-2">
                                                <label className="text-xs font-bold text-app-text-tertiary uppercase tracking-wider ml-1">Full Name</label>
                                                <div className="relative">
                                                    <User className="absolute left-3 top-3 w-4 h-4 text-app-text-tertiary" />
                                                    <input
                                                        value={newName}
                                                        onChange={(e) => setNewName(e.target.value)}
                                                        className="w-full !bg-neutral-50 border border-app-border rounded-xl pl-10 pr-4 py-2.5 text-app-text  focus:ring-2 focus:ring-accent/10 focus:border-accent outline-none transition-all placeholder:text-app-text-tertiary/50"
                                                        required
                                                        placeholder="e.g. Rahul Sharma"
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-1.5 md:col-span-2">
                                                <label className="text-xs font-bold text-app-text-tertiary uppercase tracking-wider ml-1">School Name</label>
                                                <div className="relative">
                                                    <Book className="absolute left-3 top-3 w-4 h-4 text-app-text-tertiary" />
                                                    <input
                                                        value={newSchoolName}
                                                        onChange={(e) => setNewSchoolName(e.target.value)}
                                                        className="w-full !bg-neutral-50 border border-app-border rounded-xl pl-10 pr-4 py-2.5 text-app-text  focus:ring-2 focus:ring-accent/10 focus:border-accent outline-none transition-all placeholder:text-app-text-tertiary/50"
                                                        placeholder="e.g. DPS, KV, etc."
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Guardian Section */}
                                    <div className="space-y-4 p-4 border-2 border-black rounded-2xl bg-white">
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className="p-1.5 bg-success/10 rounded-lg text-success"><Users className="w-4 h-4" /></div>
                                            <h4 className="text-sm font-bold text-app-text tracking-tight">Parent & Contact</h4>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-1.5 md:col-span-2">
                                                <label className="text-xs font-bold text-app-text-tertiary uppercase tracking-wider ml-1">Parent Name</label>
                                                <div className="relative">
                                                    <User className="absolute left-3 top-3 w-4 h-4 text-app-text-tertiary" />
                                                    <input
                                                        value={newParentName}
                                                        onChange={(e) => setNewParentName(e.target.value)}
                                                        className="w-full !bg-neutral-50 border border-app-border rounded-xl pl-10 pr-4 py-2.5 text-app-text  focus:ring-2 focus:ring-accent/10 focus:border-accent outline-none transition-all placeholder:text-app-text-tertiary/50"
                                                        required
                                                        placeholder="Guardian's Name"
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-xs font-bold text-app-text-tertiary uppercase tracking-wider ml-1">WhatsApp</label>
                                                <div className="relative">
                                                    <Phone className="absolute left-3 top-3 w-4 h-4 text-app-text-tertiary" />
                                                    <input
                                                        value={newWhatsapp}
                                                        onChange={(e) => setNewWhatsapp(e.target.value)}
                                                        className="w-full !bg-neutral-50 border border-app-border rounded-xl pl-10 pr-4 py-2.5 text-app-text  focus:ring-2 focus:ring-accent/10 focus:border-accent outline-none transition-all placeholder:text-app-text-tertiary/50"
                                                        required
                                                        placeholder="10-digit Number"
                                                    />
                                                </div>
                                            </div>
                                            <div className="space-y-1.5">
                                                <label className="text-xs font-bold text-app-text-tertiary uppercase tracking-wider ml-1">Email</label>
                                                <div className="relative">
                                                    <Mail className="absolute left-3 top-3 w-4 h-4 text-app-text-tertiary" />
                                                    <input
                                                        value={newEmail}
                                                        onChange={(e) => setNewEmail(e.target.value)}
                                                        className="w-full !bg-neutral-50 border border-app-border rounded-xl pl-10 pr-4 py-2.5 text-app-text  focus:ring-2 focus:ring-accent/10 focus:border-accent outline-none transition-all placeholder:text-app-text-tertiary/50"
                                                        placeholder="Optional"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex justify-end pt-4">
                                        <button
                                            type="submit"
                                            className="!bg-black hover:!bg-neutral-800 !text-white border-2 !border-black  px-8 py-3 rounded-xl font-bold flex items-center shadow-lg transition-all active:scale-[0.98] w-full justify-center"
                                        >
                                            <Plus className="w-4 h-4 mr-2" /> Add Student
                                        </button>
                                    </div>
                                </form>
                            </motion.div>
                        </div>
                    )
                }
            </AnimatePresence >

            {/* Delete Student Confirmation Modal */}
            <AnimatePresence>
                {studentToDelete && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/40 backdrop-blur-md"
                            onClick={() => setStudentToDelete(null)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="!bg-white border border-app-border rounded-[24px] p-8 max-w-md w-full shadow-2xl relative z-10"
                        >
                            <div className="flex justify-between items-start mb-6">
                                <div>
                                    <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 flex items-center justify-center mb-4">
                                        <Trash2 className="w-6 h-6" />
                                    </div>
                                    <h3 className="text-xl font-bold text-app-text">Delete Student?</h3>
                                    <p className="text-app-text-secondary mt-1 text-sm">
                                        This will permanently remove <span className="font-bold text-app-text">{studentToDelete.name}</span> and all their data including fees and marks.
                                    </p>
                                </div>
                                <button onClick={() => setStudentToDelete(null)} className="text-app-text-tertiary hover:text-app-text p-1 rounded-full hover:bg-app-surface"><X className="w-5 h-5" /></button>
                            </div>

                            <form onSubmit={confirmDeleteStudent} className="space-y-4">
                                <div>
                                    <label className="text-xs font-bold text-app-text-tertiary uppercase tracking-wider mb-2 block">
                                        Type <span className="text-red-500">delete</span> to confirm
                                    </label>
                                    <input
                                        value={deleteInput}
                                        onChange={(e) => setDeleteInput(e.target.value)}
                                        className="w-full bg-app-bg border border-app-border rounded-xl px-4 py-3 text-app-text focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all placeholder:text-app-text-tertiary/50"
                                        placeholder="Type 'delete'"
                                        autoFocus
                                    />
                                </div>

                                <div className="flex gap-3 pt-2">
                                    <button
                                        type="button"
                                        onClick={() => setStudentToDelete(null)}
                                        className="flex-1 py-3 rounded-xl font-bold bg-app-surface border border-app-border text-app-text hover:bg-app-surface-hover transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={deleteInput.toLowerCase() !== 'delete'}
                                        className="flex-1 py-3 rounded-xl font-bold bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        Delete
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {
                    showEditBatch && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0 bg-black/40 backdrop-blur-md"
                                onClick={() => setShowEditBatch(false)}
                            />
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                                className="!bg-white border border-app-border rounded-[24px] p-5 md:p-8 max-w-lg w-full shadow-2xl relative z-10"
                            >
                                <div className="flex justify-between items-center mb-8">
                                    <h3 className="text-xl font-bold text-app-text">Edit Batch Details</h3>
                                    <button onClick={() => setShowEditBatch(false)} className="text-app-text-tertiary hover:text-app-text p-1 rounded-full hover:bg-app-surface"><X className="w-5 h-5" /></button>
                                </div>

                                <form onSubmit={handleUpdateBatch} className="space-y-5">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-app-text-secondary uppercase tracking-wider">Batch Name</label>
                                        <input
                                            value={editBatchData.name}
                                            onChange={(e) => setEditBatchData({ ...editBatchData, name: e.target.value })}
                                            className="w-full bg-app-bg border border-app-border rounded-xl px-4 py-3 text-app-text focus:ring-2 focus:ring-accent/10 focus:border-accent outline-none transition-all placeholder:text-app-text-tertiary/50"
                                            required
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-5">
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-app-text-secondary uppercase tracking-wider">Class/Grade</label>
                                            <input
                                                value={editBatchData.className}
                                                onChange={(e) => setEditBatchData({ ...editBatchData, className: e.target.value })}
                                                className="w-full bg-app-bg border border-app-border rounded-xl px-4 py-3 text-app-text focus:ring-2 focus:ring-accent/10 focus:border-accent outline-none transition-all placeholder:text-app-text-tertiary/50"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-app-text-secondary uppercase tracking-wider">Time Slot</label>
                                            <input
                                                value={editBatchData.timeSlot}
                                                onChange={(e) => setEditBatchData({ ...editBatchData, timeSlot: e.target.value })}
                                                className="w-full bg-app-bg border border-app-border rounded-xl px-4 py-3 text-app-text focus:ring-2 focus:ring-accent/10 focus:border-accent outline-none transition-all placeholder:text-app-text-tertiary/50"
                                                placeholder="e.g. 10:00 AM"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex justify-end pt-6">
                                        <button
                                            type="submit"
                                            className="bg-neutral-900 hover:bg-neutral-800 text-white border border-neutral-900 px-8 py-3 rounded-xl font-bold flex items-center shadow-lg shadow-black/5 transition-all active:scale-[0.98]"
                                        >
                                            <Save className="w-4 h-4 mr-2" /> Update Batch
                                        </button>
                                    </div>
                                </form>
                            </motion.div>
                        </div>
                    )
                }
            </AnimatePresence >

            {/* WhatsApp Link Modal */}
            <AnimatePresence>
                {
                    showWhatsAppModal && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0 bg-black/40 backdrop-blur-md"
                                onClick={() => setShowWhatsAppModal(false)}
                            />
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                                className="!bg-white border border-app-border rounded-[24px] p-5 md:p-8 max-w-md w-full shadow-2xl relative z-10"
                            >
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="text-xl font-bold text-app-text">WhatsApp Group Link</h3>
                                    <button onClick={() => setShowWhatsAppModal(false)} className="text-app-text-tertiary hover:text-app-text p-1 rounded-full hover:bg-app-surface"><X className="w-5 h-5" /></button>
                                </div>

                                <form onSubmit={handleUpdateWhatsappLink} className="space-y-5">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-app-text-secondary uppercase tracking-wider">Group Invite Link</label>
                                        <input
                                            value={whatsappLinkInput}
                                            onChange={(e) => setWhatsappLinkInput(e.target.value)}
                                            className="w-full bg-app-bg border border-app-border rounded-xl px-4 py-3 text-app-text focus:ring-2 focus:ring-accent/10 focus:border-accent outline-none transition-all placeholder:text-app-text-tertiary/50"
                                            placeholder="https://chat.whatsapp.com/..."
                                            autoFocus
                                        />
                                        <p className="text-xs text-app-text-tertiary">
                                            Paste the invite link from your WhatsApp Group settings.
                                        </p>
                                    </div>

                                    <div className="flex justify-end pt-4">
                                        <button
                                            type="submit"
                                            className="bg-green-600 hover:bg-green-700 text-white border border-green-600 px-8 py-3 rounded-xl font-bold flex items-center shadow-lg shadow-green-600/20 transition-all active:scale-[0.98]"
                                        >
                                            <Save className="w-4 h-4 mr-2" /> Save Link
                                        </button>
                                    </div>
                                </form>
                            </motion.div>
                        </div>
                    )
                }
            </AnimatePresence>

            {/* Add Installment Modal */}
            <AnimatePresence>
                {
                    showAddInstallment && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0 bg-black/40 backdrop-blur-md"
                                onClick={() => setShowAddInstallment(false)}
                            />
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                                className="!bg-white border border-app-border rounded-[24px] p-6 md:p-8 max-w-sm w-full shadow-2xl relative z-10"
                            >
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="text-xl font-bold text-app-text">Add Fee Installment</h3>
                                    <button onClick={() => setShowAddInstallment(false)} className="text-app-text-tertiary hover:text-app-text p-1 rounded-full hover:bg-app-surface"><X className="w-5 h-5" /></button>
                                </div>

                                <form onSubmit={handleAddInstallment} className="space-y-4">
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider ml-1">Installment Name</label>
                                        <input
                                            value={newInstallment.name}
                                            onChange={(e) => setNewInstallment({ ...newInstallment, name: e.target.value })}
                                            className="w-full !bg-neutral-50 border border-app-border rounded-xl px-4 py-2.5 text-app-text  focus:ring-2 focus:ring-accent/10 focus:border-accent outline-none transition-all placeholder:text-app-text-tertiary/50"
                                            placeholder="e.g. Jan-Mar 2024"
                                            required
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider ml-1">Amount (₹)</label>
                                        <input
                                            type="number"
                                            value={newInstallment.amount}
                                            onChange={(e) => setNewInstallment({ ...newInstallment, amount: e.target.value })}
                                            className="w-full !bg-neutral-50 border border-app-border rounded-xl px-4 py-2.5 text-app-text  focus:ring-2 focus:ring-accent/10 focus:border-accent outline-none transition-all placeholder:text-app-text-tertiary/50"
                                            required
                                        />
                                    </div>

                                    <div className="flex justify-end pt-4">
                                        <button
                                            type="submit"
                                            className="bg-neutral-900 hover:bg-black  text-white px-8 py-3 rounded-xl font-bold flex items-center shadow-lg transition-all active:scale-[0.98] w-full justify-center"
                                        >
                                            Create Installment
                                        </button>
                                    </div>
                                </form>
                            </motion.div>
                        </div>
                    )
                }
            </AnimatePresence >

            {/* Payment Confirmation Modal (Menu Style) */}
            <AnimatePresence>
                {paymentModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/40 backdrop-blur-md"
                            onClick={() => setPaymentModal(null)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="!bg-white border border-app-border rounded-[24px] p-0 max-w-sm w-full shadow-2xl relative z-10 overflow-hidden"
                        >
                            {/* Header */}
                            <div className="p-6 border-b border-app-border flex justify-between items-start bg-app-surface-opaque">
                                <div>
                                    <h3 className="text-lg font-bold text-app-text">{paymentModal.student.name}</h3>
                                    <div className="flex flex-col mt-1">
                                        <span className="text-xs text-app-text-secondary uppercase tracking-wider font-semibold">Payment For</span>
                                        <span className="text-app-text font-medium">{paymentModal.installment.name}</span>
                                    </div>
                                </div>
                                <div className="bg-app-surface border border-app-border px-3 py-1.5 rounded-lg">
                                    <span className="text-lg font-bold text-app-text">₹{paymentModal.installment.amount}</span>
                                </div>
                            </div>

                            <div className="p-6">
                                <form onSubmit={handleMarkPaid} className="space-y-6">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-app-text-tertiary uppercase tracking-wider">Amount (₹)</label>
                                            <input
                                                type="number"
                                                value={paymentModal.installment.amount}
                                                onChange={(e) => setPaymentModal({
                                                    ...paymentModal,
                                                    installment: { ...paymentModal.installment, amount: Number(e.target.value) }
                                                })}
                                                className="w-full bg-app-bg border border-app-border rounded-xl px-4 py-3 text-app-text focus:ring-2 focus:ring-accent/10 focus:border-accent outline-none transition-all font-medium"
                                                required
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-app-text-tertiary uppercase tracking-wider">Payment Date</label>
                                            <div className="relative">
                                                <Clock className="absolute left-3 top-3 w-4 h-4 text-app-text-tertiary" />
                                                <input
                                                    type="date"
                                                    value={paymentModal.date}
                                                    onChange={(e) => setPaymentModal({ ...paymentModal, date: e.target.value })}
                                                    className="w-full !bg-neutral-50 border border-app-border rounded-xl pl-10 pr-4 py-3 text-app-text focus:ring-2 focus:ring-accent/10 focus:border-accent outline-none transition-all font-medium"
                                                    required
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3 pt-2">
                                        <button
                                            type="button"
                                            onClick={() => setPaymentModal(null)}
                                            className="px-4 py-3 rounded-xl bg-app-bg hover:bg-app-border text-danger font-bold text-sm transition-colors border border-neutral-900  hover:border-danger/10"
                                        >
                                            Deny
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={isSubmitting}
                                            className={`px-4 py-3 rounded-xl font-bold text-sm shadow-lg transition-all active:scale-[0.98] ${isSubmitting
                                                ? 'bg-gray-400 cursor-not-allowed opacity-70'
                                                : 'bg-green-600 hover:bg-green-700 text-white shadow-green-600/20'
                                                }`}
                                        >
                                            {isSubmitting ? 'Processing...' : 'Confirm'}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* View Payment Details / Revoke Menu */}
            <AnimatePresence>
                {viewPayment && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/40 backdrop-blur-md"
                            onClick={() => setViewPayment(null)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            className="bg-white border border-neutral-200 rounded-[24px] p-6 max-w-xs w-full shadow-2xl relative z-10 flex flex-col items-center text-center font-sans"
                        >
                            <div className="w-14 h-14 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4 border border-green-200">
                                <span className="text-2xl">✓</span>
                            </div>

                            <h3 className="text-lg font-bold text-neutral-900 mb-1">{viewPayment.student.name}</h3>
                            <p className="text-neutral-500 text-xs uppercase tracking-wider font-semibold mb-6">{viewPayment.installment.name}</p>

                            <div className="bg-neutral-50 border border-neutral-100 rounded-2xl w-full text-sm mb-6 max-h-[300px] overflow-y-auto">
                                {viewPayment.payments.map((payment, idx) => (
                                    <div key={payment.id} className={cn("p-4 space-y-2", idx > 0 && "border-t border-neutral-200")}>
                                        <div className="flex justify-between items-center">
                                            <span className="text-neutral-500">Amount</span>
                                            <span className="font-bold text-neutral-900 text-base">₹{payment.amountPaid}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-neutral-500">Date</span>
                                            <span className="font-medium text-neutral-900">{new Date(payment.date).toLocaleDateString()}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-neutral-500">Fee Head</span>
                                            <span className="font-medium text-neutral-900">{viewPayment.installment.name}</span>
                                        </div>
                                        {payment.id.startsWith('temp-') && (
                                            <div className="text-xs text-blue-600 bg-blue-50 py-1 px-2 rounded-lg text-center mt-2 border border-blue-100">
                                                Syncing with server...
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {viewPayment.payments.length > 1 && (
                                    <div className="bg-neutral-100 p-4 border-t border-neutral-200 flex justify-between items-center">
                                        <span className="font-bold text-neutral-600">Total Paid</span>
                                        <span className="font-bold text-neutral-900 text-lg">
                                            ₹{viewPayment.payments.reduce((sum, p) => sum + p.amountPaid, 0)}
                                        </span>
                                    </div>
                                )}
                            </div>

                            <div className="w-full space-y-3">
                                <button
                                    onClick={() => setViewPayment(null)}
                                    className="w-full py-3 rounded-xl font-bold bg-neutral-900 text-white hover:bg-neutral-800 transition-all active:scale-[0.98]"
                                >
                                    Close
                                </button>
                                {/* Revoke button can be enabled when backend supports it */}
                                {/* <button
                                    onClick={handleRevokePayment}
                                    className="w-full py-2.5 rounded-xl font-medium text-red-500 hover:bg-red-50 transition-colors text-sm"
                                >
                                    Revoke Payment
                                </button> */}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Permanent Close Confirmation Modal */}
            <AnimatePresence>
                {showCloseConfirm && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                            onClick={() => setShowCloseConfirm(false)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="!bg-white border border-app-border rounded-[24px] p-6 max-w-sm w-full shadow-2xl relative z-10 text-center"
                        >
                            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-danger rounded-full flex items-center justify-center mx-auto mb-4">
                                <Trash2 className="w-8 h-8" />
                            </div>
                            <h3 className="text-xl font-bold text-app-text mb-2">Permanently Close?</h3>
                            <p className="text-app-text-secondary text-sm mb-6 leading-relaxed">
                                This will hide the QR code and registration links. Students will no longer be able to join using the invite link.
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowCloseConfirm(false)}
                                    className="flex-1 py-3 rounded-xl font-bold bg-app-surface border border-app-border text-app-text hover:bg-app-surface-hover transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmEndRegistration}
                                    className="flex-1 py-3 rounded-xl font-bold bg-red-50 hover:bg-red-100 text-red-600 border border-red-100 transition-all active:scale-[0.98]"
                                >
                                    Close Forever
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Delete Confirmation Modal */}
            <AnimatePresence>
                {showDeleteConfirm && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                            onClick={() => setShowDeleteConfirm(false)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="!bg-white border border-app-border rounded-[24px] p-6 max-w-sm w-full shadow-2xl relative z-10 text-center"
                        >
                            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-danger rounded-full flex items-center justify-center mx-auto mb-4">
                                <Trash2 className="w-8 h-8" />
                            </div>
                            <h3 className="text-xl font-bold text-app-text mb-2">Delete Batch?</h3>
                            <p className="text-app-text-secondary text-sm mb-6 leading-relaxed">
                                This action cannot be undone. All students and data in this batch will be lost.
                                <br /><br />
                                Enter code <b>6969</b> to confirm.
                            </p>

                            <input
                                value={deleteCodeInput}
                                onChange={(e) => setDeleteCodeInput(e.target.value)}
                                className="w-full bg-app-bg border border-app-border rounded-xl px-4 py-3 text-center text-app-text font-mono tracking-widest text-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none mb-6"
                                placeholder="0000"
                                autoFocus
                            />

                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowDeleteConfirm(false)}
                                    className="flex-1 py-3 rounded-xl font-bold bg-app-surface border border-app-border text-app-text hover:bg-app-surface-hover transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={confirmDeleteBatch}
                                    disabled={deleteCodeInput !== '6969'}
                                    className="flex-1 py-3 rounded-xl font-bold bg-[#ff3b30] text-white hover:opacity-90 transition-all shadow-lg shadow-red-500/20 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Delete
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
            {/* Sending Progress Modal */}
            <AnimatePresence>
                {sendingState.isOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/40 backdrop-blur-md"
                        // Prevent closing by clicking outside while sending
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="!bg-white border border-app-border rounded-[24px] p-6 max-w-sm w-full shadow-2xl relative z-10 text-center"
                        >
                            <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/20 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                {sendingState.completed ? (
                                    <span className="text-2xl">✓</span>
                                ) : (
                                    <Mail className="w-8 h-8 animate-pulse" />
                                )}
                            </div>

                            <h3 className="text-xl font-bold text-app-text mb-2">
                                {sendingState.completed ? 'Invites Sent!' : 'Sending Invites...'}
                            </h3>

                            <p className="text-app-text-secondary text-sm mb-6 h-5">
                                {sendingState.status}
                            </p>

                            {/* Progress Bar */}
                            <div className="w-full bg-app-surface border border-app-border rounded-full h-3 mb-6 overflow-hidden relative">
                                <motion.div
                                    className="h-full bg-blue-500"
                                    initial={{ width: 0 }}
                                    animate={{ width: `${(sendingState.current / sendingState.total) * 100}%` }}
                                    transition={{ type: 'spring', stiffness: 50 }}
                                />
                            </div>

                            {sendingState.completed ? (
                                <button
                                    onClick={() => setSendingState(prev => ({ ...prev, isOpen: false }))}
                                    className="w-full py-3 rounded-xl font-bold bg-app-text text-app-bg hover:opacity-90 transition-all active:scale-[0.98]"
                                >
                                    Done
                                </button>
                            ) : (
                                <p className="text-xs text-app-text-tertiary">Please do not close this window.</p>
                            )}
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </Layout >
    );
}
