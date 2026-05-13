
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiRequest, API_URL } from '../utils/api';
import Layout from '../components/Layout';
import Dropdown from '../components/Dropdown';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Clock, Download, Mail, Phone, Edit2, Trash2, X, Save, Plus, Users, Settings, User, Book, Fingerprint, Search, MoreVertical, Pause, Play, Archive, Eye, FileText, Printer, ArrowUp, ArrowDown, ArrowUpDown, Receipt } from 'lucide-react';
import toast from 'react-hot-toast';
import QRCode from 'react-qr-code';
import { cn } from '../utils/cn';
import { getInstallmentPaidMap, getStudentJoinDate, type LegacyFee } from '../utils/fees';

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
    fees: LegacyFee[];
    marks?: StudentMark[];
    createdAt?: string;
}

interface FeeInstallment {
    id: string;
    name: string;
    amount: number;
    batchId: string;
    studentId?: string | null;
    createdAt: string;
}

interface FeePayment {
    id: string;
    amountPaid: number;
    date: string;
    installmentId: string;
    studentId: string;
}

interface MarkTest {
    id: string;
    name: string;
    date: string;
    maxMarks: number;
    subject?: string;
}

interface StudentMark {
    id: string;
    score: number;
    test: MarkTest;
}

interface BatchTest {
    id: string;
    name: string;
    date: string;
    maxMarks: number;
    subject?: string;
}

interface Batch {
    id: string;
    name: string;
    subject: string;
    timeSlot: string;
    feeAmount: number;
    className: string;
    whatsappGroupLink?: string;
    autoSendWelcome?: boolean;
    isRegistrationOpen: boolean;
    isRegistrationEnded?: boolean;
    students: Student[];
    feeInstallments: FeeInstallment[];
    tests?: BatchTest[];
}

function getErrorMessage(error: unknown, fallback: string): string {
    return error instanceof Error && error.message.trim() ? error.message : fallback;
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

    const getStudentAverage = (student: Pick<Student, 'marks'>) => {
        if (!student.marks || student.marks.length === 0) return '-';
        let totalNormalized = 0;
        student.marks.forEach((mark) => {
            const max = mark.test.maxMarks || 0;
            const normalized = max > 0 ? (mark.score / max) * 10 : 0;
            totalNormalized += normalized;
        });
        return (totalNormalized / student.marks.length).toFixed(1);
    };

    const [newWhatsapp, setNewWhatsapp] = useState('');

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
    const [showManageInstallments, setShowManageInstallments] = useState(false);
    const [newInstallment, setNewInstallment] = useState({ name: '', amount: '' });
    const [editingInstallment, setEditingInstallment] = useState<FeeInstallment | null>(null);
    const [installmentToDelete, setInstallmentToDelete] = useState<FeeInstallment | null>(null);

    // Custom Invoice State
    const [showCustomInvoice, setShowCustomInvoice] = useState<Student | null>(null);
    const [customInvoice, setCustomInvoice] = useState({ name: '', amount: '', markAsPaid: false, existingInstallmentId: '' });

    // Payment Modal State
    const [paymentModal, setPaymentModal] = useState<{ student: Student, installment: FeeInstallment, date: string } | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Search State
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const [tableFontSize, setTableFontSize] = useState(1); // 0: Small, 1: Medium, 2: Large
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

    // View Payment Details State
    const [viewPayment, setViewPayment] = useState<{ student: Student, installment: FeeInstallment, payments: FeePayment[] } | null>(null);

    // ... existing search logic ...
    const filteredStudents = useMemo(() => {
        const students = (batch?.students || []).filter(student =>
            student.name.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
            student.schoolName?.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
            student.humanId?.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
            student.parentName.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
            student.parentWhatsapp.includes(debouncedSearchQuery)
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
    }, [batch, debouncedSearchQuery, sortConfig]);

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

    const fetchDetails = useCallback(async (silent = false) => {
        try {
            const data = await apiRequest<Batch>(`/batches/${id}?t=${Date.now()}`);
            setBatch(data);
        } catch {
            if (!silent) {
                toast.error('Failed to load batch details');
                navigate('/batches');
            }
        } finally {
            if (!silent) setLoading(false);
        }
    }, [id, navigate]);

    useEffect(() => {
        // Initial load
        fetchDetails();

        // Silent auto-refresh every 15 seconds for incoming live registrations
        const interval = setInterval(() => {
            fetchDetails(true);
        }, 15000);

        return () => clearInterval(interval);
    }, [fetchDetails]);

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
        } catch {
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
        } catch {
            toast.error('Failed to update status');
        }
    };

    const [sendingState, setSendingState] = useState<{ total: number; current: number; status: string; isOpen: boolean; completed: boolean }>({ total: 0, current: 0, status: '', isOpen: false, completed: false });

    // WhatsApp Modal State
    const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
    const [whatsappLinkInput, setWhatsappLinkInput] = useState('');
    const [autoSendWelcomeInput, setAutoSendWelcomeInput] = useState(false);

    const openWhatsappModal = () => {
        if (batch) {
            setWhatsappLinkInput(batch.whatsappGroupLink || '');
            setAutoSendWelcomeInput(batch.autoSendWelcome || false);
            setShowWhatsAppModal(true);
        }
    };

    const handleUpdateWhatsappLink = async (e: React.FormEvent) => {
        e.preventDefault();

        if (whatsappLinkInput && !whatsappLinkInput.includes('chat.whatsapp.com')) {
            toast.error('Invalid WhatsApp Group Link');
            return;
        }

        try {
            const res = await apiRequest<Partial<Batch>>(`/batches/${id}`, 'PUT', {
                whatsappGroupLink: whatsappLinkInput,
                autoSendWelcome: autoSendWelcomeInput
            });
            setBatch(prev => prev ? { ...prev, ...res } : null);
            toast.success('WhatsApp Settings Updated');
            setShowWhatsAppModal(false);
        } catch {
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
            } catch {
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
        const toastId = toast.loading('Sending invite...');
        try {
            await apiRequest(`/batches/${id}/invite`, 'POST', {
                whatsappNumber: newWhatsapp
            });
            toast.success('Invite link sent to WhatsApp!', { id: toastId });
            setShowAddStudent(false);
            setNewWhatsapp('');
        } catch {
            toast.error('Failed to send invite', { id: toastId });
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
            setTimeout(() => fetchDetails(), 300);
        } catch {
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
            setTimeout(() => fetchDetails(), 300);
        } catch {
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
        } catch {
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
        } catch (error: unknown) {
            toast.error(getErrorMessage(error, 'Failed to delete batch'), { id: toastId });
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
            .catch(() => toast.error("Failed to download stickers", { id: toastId }));
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
            setTimeout(() => fetchDetails(), 300);
        } catch {
            toast.error('Failed to create installment', { id: toastId });
        }
    };

    const handleCreateCustomInvoice = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!showCustomInvoice) return;
        const toastId = toast.loading('Creating custom invoice...');
        try {
            if (customInvoice.existingInstallmentId) {
                // Link an existing global invoice to this student
                const existingInst = batch?.feeInstallments?.find(i => i.id === customInvoice.existingInstallmentId);
                const paymentAmount = customInvoice.markAsPaid ? Number(existingInst?.amount || 0) : 0;
                
                await apiRequest(`/fees/pay-installment`, 'POST', {
                    studentId: showCustomInvoice.id,
                    installmentId: customInvoice.existingInstallmentId,
                    amount: paymentAmount,
                    date: new Date().toISOString().split('T')[0]
                });

                toast.success(
                    customInvoice.markAsPaid
                        ? 'Installment linked & marked paid'
                        : 'Installment successfully linked to student',
                    { id: toastId }
                );
            } else {
                // Create brand new student-specific invoice
                const installment = await apiRequest(`/batches/${id}/installments`, 'POST', {
                    name: customInvoice.name,
                    amount: Number(customInvoice.amount),
                    studentId: showCustomInvoice.id
                });

            // If "Mark as Paid" is checked, immediately log a payment
            if (customInvoice.markAsPaid && installment?.id) {
                await apiRequest(`/fees/pay-installment`, 'POST', {
                    studentId: showCustomInvoice.id,
                    installmentId: installment.id,
                    amount: Number(customInvoice.amount),
                    date: new Date().toISOString().split('T')[0]
                });
            }

            toast.success(
                customInvoice.markAsPaid
                    ? 'Custom invoice created & marked paid'
                    : 'Custom invoice created',
                { id: toastId }
            );
            }

            setShowCustomInvoice(null);
            setCustomInvoice({ name: '', amount: '', markAsPaid: false, existingInstallmentId: '' });
            setTimeout(() => fetchDetails(), 300);
        } catch (error: unknown) {
            toast.error(getErrorMessage(error, 'Failed to create custom invoice'), { id: toastId });
        }
    };

    const handleUpdateInstallment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingInstallment) return;
        const toastId = toast.loading('Updating fee column...');
        try {
            await apiRequest(`/installments/${editingInstallment.id}`, 'PUT', {
                name: editingInstallment.name,
                amount: Number(editingInstallment.amount)
            });
            toast.success('Fee column updated', { id: toastId });
            setEditingInstallment(null);
            fetchDetails();
        } catch (error: unknown) {
            toast.error(getErrorMessage(error, 'Failed to update fee column'), { id: toastId });
        }
    };

    const handleDeleteInstallment = async () => {
        if (!installmentToDelete) return;
        const toastId = toast.loading('Deleting fee column...');
        try {
            await apiRequest(`/installments/${installmentToDelete.id}`, 'DELETE');
            toast.success('Fee column deleted', { id: toastId });
            setInstallmentToDelete(null);
            fetchDetails();
        } catch (error: unknown) {
            toast.error(getErrorMessage(error, 'Failed to delete fee column. Maybe payments exist?'), { id: toastId });
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
            setTimeout(() => fetchDetails(), 300); // Small delay to ensure backend processed
        } catch (error: unknown) {
            console.error("Payment Error:", error);
            const errorMessage = getErrorMessage(error, 'Failed to record payment');

            // If payment already exists, treat as success/info and keep the UI state
            if (errorMessage.includes('already exists') || errorMessage.includes('409')) {
                toast.success('Payment already recorded', { id: toastId, icon: 'info' });
                setPaymentModal(null);
                setTimeout(() => fetchDetails(), 300);
            } else {
                toast.error(errorMessage, { id: toastId });
                // Revert optimistic update by refreshing data
                setTimeout(() => fetchDetails(), 300);
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
            <div className="mb-6 sm:mb-8">
                <button
                    onClick={() => navigate('/batches')}
                    className="flex items-center text-app-text-secondary hover:text-black mb-6 transition-colors font-bold text-sm uppercase tracking-widest"
                >
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back to Batches
                </button>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6">
                    {/* Batch Info Card */}
                    <div className="xl:col-span-2 bg-white/70 backdrop-blur-2xl border-[1.5px] border-black/5 p-5 md:p-8 rounded-2xl md:rounded-[32px] shadow-sm flex flex-col gap-6 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-accent-primary/5 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-700 -translate-y-1/2 translate-x-1/3" />
                        <div className="flex justify-between items-start gap-4 relative z-10">
                            <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2 mb-2">
                                    <h2 className="text-2xl md:text-4xl font-extrabold text-black tracking-tighter break-words">{batch.name}</h2>
                                    <span className="bg-black text-white text-xs px-3 py-1 rounded-full font-bold whitespace-nowrap">{batch.subject}</span>
                                    {batch.className && <span className="bg-neutral-100 text-black text-xs px-3 py-1 rounded-full font-bold whitespace-nowrap">{batch.className}</span>}
                                </div>
                                <div className="flex items-center text-app-text-secondary gap-4 md:gap-6 mt-3 text-sm font-bold flex-wrap">
                                    <span className="flex items-center whitespace-nowrap"><Clock className="w-4 h-4 mr-2 text-black" /> {batch.timeSlot}</span>
                                    <span className="flex items-center whitespace-nowrap"><Users className="w-4 h-4 mr-2 text-black" /> {batch.students.length} Students</span>
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
                                className="bg-neutral-50/80 hover:bg-neutral-100/80 text-black px-6 py-3.5 rounded-2xl font-bold flex items-center justify-center border-[1.5px] border-black/5 transition-all active:scale-95 flex-1"
                            >
                                <Download className="w-5 h-5 mr-2" /> Download List
                            </button>
                            <button
                                onClick={handlePrintStickers}
                                className="bg-neutral-50/80 hover:bg-neutral-100/80 text-black px-6 py-3.5 rounded-2xl font-bold flex items-center justify-center border-[1.5px] border-black/5 transition-all active:scale-95 flex-1"
                            >
                                <Printer className="w-5 h-5 mr-2" /> Print Stickers
                            </button>
                            <button
                                onClick={() => setShowAddStudent(true)}
                                className="bg-black hover:bg-black/90 text-white px-6 py-3.5 rounded-2xl font-bold flex items-center justify-center transition-all active:scale-95 flex-1 shadow-sm shadow-black/10"
                            >
                                <Plus className="w-5 h-5 mr-2" /> Add Student
                            </button>
                            <button
                                onClick={() => setShowManageInstallments(true)}
                                className="bg-neutral-50/80 hover:bg-neutral-100/80 text-black px-6 py-3.5 rounded-2xl font-bold flex items-center justify-center border-[1.5px] border-black/5 transition-all active:scale-95 flex-1"
                            >
                                <Settings className="w-5 h-5 mr-2" /> Fee Columns
                            </button>
                            <button
                                onClick={openWhatsappModal}
                                className={cn(
                                    "px-6 py-3.5 rounded-xl font-bold flex items-center justify-center border transition-all active:scale-95 flex-1",
                                    batch.whatsappGroupLink
                                        ? "bg-neutral-50/50 hover:bg-neutral-50/50-hover text-app-text border-black/5"
                                        : "bg-neutral-50/50 border-dashed border-app-text-tertiary text-app-text hover:border-app-text"
                                )}
                            >
                                <Phone className="w-5 h-5 mr-2" />
                                {batch.whatsappGroupLink ? 'Edit Group Link' : 'Add Group Link'}
                            </button>
                            <button
                                onClick={handleSendWhatsappInvite}
                                disabled={!batch.whatsappGroupLink}
                                className="bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 px-6 py-3.5 rounded-xl font-bold flex items-center justify-center transition-all active:scale-95 flex-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-neutral-50/50 disabled:text-app-text-tertiary disabled:border-black/5"
                            >
                                <Mail className="w-5 h-5 mr-2" /> Send Invites
                            </button>
                        </div>
                    </div>

                    {/* Registration Control Card */}
                    {!batch.isRegistrationEnded && (
                        <div className="bg-white/70 backdrop-blur-2xl border-[1.5px] border-black/5 p-5 md:p-6 rounded-2xl md:rounded-[32px] shadow-sm flex flex-col items-center text-center relative group overflow-hidden">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-accent-primary/5 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 -translate-y-1/2 translate-x-1/3" />
                            <div className="flex items-center justify-between w-full mb-6 relative z-10">
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

                            <div className="bg-white p-5 rounded-[24px] mb-6 shadow-sm border border-black/5 flex flex-col items-center gap-4">
                                <QRCode value={`${window.location.origin}/register/${batch.id}`} size={140} />
                                <button
                                    onClick={async () => {
                                        try {
                                            const token = localStorage.getItem('token');
                                            const response = await fetch(`${API_URL}/batches/${batch.id}/qr-pdf`, {
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
                                        } catch {
                                            toast.error('Failed to download QR PDF');
                                        }
                                    }}
                                    className="text-xs font-bold text-app-text-tertiary hover:text-black flex items-center gap-1.5 transition-colors bg-neutral-50 px-4 py-2 rounded-xl border border-black/5 hover:border-black/10"
                                >
                                    <Download className="w-3.5 h-3.5" /> Download QR
                                </button>
                            </div>

                            <div className="w-full space-y-3">
                                <div>
                                    <p className="text-[10px] text-app-text-tertiary mb-2 px-2 uppercase font-bold tracking-widest text-left">Quick Actions</p>
                                    <div className="grid grid-cols-1 gap-3 text-center">
                                        <button
                                            onClick={() => window.open(`/kiosk/register/${batch.id}`, '_blank')}
                                            className="py-3.5 rounded-2xl bg-neutral-50/80 hover:bg-neutral-100/80 text-black border-[1.5px] border-black/5 text-xs font-bold transition-all w-full"
                                        >
                                            Open Fullscreen Kiosk
                                        </button>
                                        <div className="flex gap-2 w-full">
                                            <button
                                                onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/register/${batch.id}`); toast.success('Invite Link Copied'); }}
                                                className="py-3.5 rounded-2xl bg-neutral-50/80 hover:bg-neutral-100/80 text-black border-[1.5px] border-black/5 text-xs font-bold transition-all flex-[2] text-center"
                                            >
                                                Copy Web Link
                                            </button>
                                            <button
                                                onClick={async () => {
                                                    try {
                                                        if (navigator.share) {
                                                            await navigator.share({
                                                                title: 'Batch Registration',
                                                                text: `Please use this link to register for ${batch.name}.`,
                                                                url: `${window.location.origin}/register/${batch.id}`
                                                            });
                                                        } else {
                                                            navigator.clipboard.writeText(`${window.location.origin}/register/${batch.id}`);
                                                            toast.success('Share api not supported. Link copied!');
                                                        }
                                                    } catch (err) {
                                                        console.error('Share failed', err);
                                                    }
                                                }}
                                                className="py-3.5 rounded-2xl bg-neutral-50/80 hover:bg-neutral-100/80 text-black border-[1.5px] border-black/5 text-xs font-bold transition-all flex-1 text-center"
                                            >
                                                Share
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="bg-white/70 backdrop-blur-2xl border-[1.5px] border-black/5 rounded-[32px] shadow-sm mt-8 overflow-hidden">
                {/* Search Header */}
                <div className="p-5 border-b-[1.5px] border-black/5 bg-white/40 backdrop-blur-md sticky top-0 z-10">
                    <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                        <div className="relative max-w-md w-full">
                            <Search className="absolute left-4 top-3.5 w-5 h-5 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search students..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-white border-2 border-transparent pl-12 pr-4 py-3 rounded-2xl text-app-text outline-none focus:border-black/10 shadow-sm transition-all placeholder:text-gray-400 font-semibold"
                            />
                        </div>
                        <div className="flex items-center gap-1 bg-neutral-100/80 p-1.5 rounded-2xl self-end md:self-auto border border-black/5">
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

                <div className="hidden md:block overflow-auto rounded-b-[24px] w-full max-w-full custom-scrollbar" style={{ maxHeight: 'calc(100vh - 220px)' }}>
                    <table className="w-full text-left border-collapse relative">
                        <thead className={cn("bg-neutral-50/90 text-app-text-secondary uppercase font-extrabold tracking-widest sticky top-0 z-20 shadow-sm outline outline-1 outline-black/5 backdrop-blur-md", getTextSizeClass('header'))}>
                            <tr>
                                <th
                                    className={cn("bg-transparent cursor-pointer select-none hover:bg-black/5 transition-colors group", getCellPadding())}
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
                                <th className={cn("bg-transparent", getCellPadding())} style={{ minWidth: '180px', whiteSpace: 'nowrap' }}>Student Name</th>
                                <th className={cn("bg-transparent", getCellPadding())} style={{ minWidth: '180px', whiteSpace: 'nowrap' }}>School</th>
                                <th className={cn("bg-transparent", getCellPadding())} style={{ minWidth: '180px', whiteSpace: 'nowrap' }}>Parent Name</th>
                                <th className={cn("bg-transparent", getCellPadding())} style={{ minWidth: '200px', whiteSpace: 'nowrap' }}>Contact</th>
                                <th className={cn("bg-transparent text-center", getCellPadding())} style={{ minWidth: '80px', whiteSpace: 'nowrap' }}>Tests</th>
                                <th className={cn("bg-transparent text-center", getCellPadding())} style={{ minWidth: '80px', whiteSpace: 'nowrap' }}>Avg (10)</th>
                                {batch.feeInstallments?.filter(inst => !inst.studentId).map(inst => (
                                    <th key={inst.id} className={cn("bg-transparent text-center", getCellPadding())} style={{ minWidth: '100px', whiteSpace: 'nowrap' }}>
                                        <div className="flex flex-col items-center">
                                            <span>{inst.name}</span>
                                            <span className={cn("text-app-text-tertiary", getTextSizeClass('sub'))}>₹{inst.amount}</span>
                                        </div>
                                    </th>
                                ))}
                                {/* Dynamic headers for custom (student-specific) invoices */}
                                {(() => {
                                    const allCustom = batch.feeInstallments?.filter(i => i.studentId) || [];
                                    const seen = new Set<string>();
                                    return allCustom.filter(i => { if (seen.has(i.id)) return false; seen.add(i.id); return true; }).map(inst => (
                                        <th key={inst.id} className={cn("bg-transparent text-center", getCellPadding())} style={{ minWidth: '100px', whiteSpace: 'nowrap' }}>
                                            <div className="flex flex-col items-center">
                                                <span>{inst.name}</span>
                                                <span className={cn("text-app-text-tertiary", getTextSizeClass('sub'))}>₹{inst.amount}</span>
                                            </div>
                                        </th>
                                    ));
                                })()}
                                <th className={cn("border-b border-black/5 text-center", getCellPadding())} style={{ minWidth: '120px', whiteSpace: 'nowrap' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-black/5 text-app-text">
                            {filteredStudents.map((student) => {
                                // Dynamic Fee Logic (Virtual Allocation)
                                const instPaidMap = getInstallmentPaidMap(student, batch.feeInstallments || []);

                                return (
                                    <tr key={student.id} className="hover:bg-neutral-50/70 transition-colors group">
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
                                        {batch.feeInstallments?.filter(inst => !inst.studentId).map(inst => {
                                            const payments = student.feePayments?.filter(p => p.installmentId === inst.id) || [];
                                            // Use calculated amount from map, fallback to simple check if missing (shouldn't happen)
                                            const paidAmount = instPaidMap[inst.id] !== undefined ? instPaidMap[inst.id] : payments.reduce((sum, p) => sum + p.amountPaid, 0);
                                            const isFullyPaid = paidAmount >= inst.amount;
                                            const isPartiallyPaid = paidAmount > 0 && !isFullyPaid;

                                            const studentJoinDate = getStudentJoinDate(student.createdAt);
                                            const instDate = new Date(inst.createdAt).setHours(0, 0, 0, 0);
                                            const isNotApplicable = instDate < studentJoinDate && payments.length === 0;

                                            if (isNotApplicable) {
                                                return (
                                                    <td key={inst.id} className={cn("text-center font-medium text-app-text-tertiary cursor-not-allowed", getCellPadding())} title="Not applicable. Student joined after this fee was generated.">
                                                        -
                                                    </td>
                                                );
                                            }

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
                                        {/* Custom student-specific invoices — rendered as regular fee circles */}
                                        {(() => {
                                            const allCustom = batch.feeInstallments?.filter(i => i.studentId) || [];
                                            const seen = new Set<string>();
                                            const uniqueCustom = allCustom.filter(i => { if (seen.has(i.id)) return false; seen.add(i.id); return true; });
                                            return uniqueCustom.map(inst => {
                                                // Only render circle if this invoice belongs to this student
                                                if (inst.studentId !== student.id) {
                                                    return <td key={inst.id} className={cn("text-center text-app-text-tertiary", getCellPadding())} title="Not applicable">-</td>;
                                                }
                                                const payments = student.feePayments?.filter(p => p.installmentId === inst.id) || [];
                                                const paidAmount = payments.reduce((sum, p) => sum + p.amountPaid, 0);
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
                                                                        : `${inst.name} — ₹${inst.amount}`
                                                            }
                                                        >
                                                            {isFullyPaid && <div className={cn("bg-current rounded-full", getPaymentInnerSize())} />}
                                                            {isPartiallyPaid && (
                                                                <div className="absolute inset-0 flex items-center justify-center text-[8px] font-bold">P</div>
                                                            )}
                                                        </button>
                                                    </td>
                                                );
                                            });
                                        })()}
                                        <td className={cn("text-center border-b border-black/5", getCellPadding())} >
                                            <div className="flex items-center justify-center gap-1.5">
                                                <button
                                                    onClick={() => { setShowCustomInvoice(student); setCustomInvoice({ name: '', amount: '', markAsPaid: false, existingInstallmentId: '' }); }}
                                                    className="p-2 bg-neutral-50 hover:bg-black text-black hover:text-white rounded-xl border border-black/5 transition-colors"
                                                    title="Custom Invoice"
                                                >
                                                    <Receipt className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => setEditingStudent(student)}
                                                    className="p-2 bg-neutral-50 hover:bg-black text-black hover:text-white rounded-xl border border-black/5 transition-colors"
                                                    title="Edit"
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(student)}
                                                    className="p-2 bg-neutral-50 hover:bg-red-50 text-red-600 rounded-xl border border-black/5 transition-colors"
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
                                    <td colSpan={6 + (batch.feeInstallments?.filter(i => !i.studentId).length || 0) + (batch.feeInstallments?.filter(i => i.studentId).length || 0)} className="p-20 text-center text-app-text-tertiary flex flex-col items-center justify-center">
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
                    <div className="divide-y divide-black/5">
                        {filteredStudents.map((student) => {
                            // Dynamic Fee Logic (Virtual Allocation) - Mobile
                            const instPaidMap = getInstallmentPaidMap(student, batch.feeInstallments || []);

                            return (
                                <div key={student.id} className="p-5 flex flex-col gap-3 bg-white hover:bg-neutral-50/50 transition-colors">
                                    <div className="flex flex-col gap-3">
                                        <div className="flex justify-between items-start">
                                            <div className="flex-1 min-w-0 pr-4">
                                                <h4 className={cn("font-extrabold text-black tracking-tighter break-words leading-tight", getTextSizeClass('body'))}>{student.name}</h4>
                                                {student.humanId && (
                                                    <span className={cn("inline-block mt-1.5 font-mono bg-neutral-100 px-2.5 py-0.5 rounded-full text-app-text-tertiary font-bold border border-black/5", getTextSizeClass('sub'))}>
                                                        {student.humanId}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex gap-1.5 shrink-0 flex-wrap justify-end max-w-[140px]">
                                                <button onClick={() => setViewMarksId(student.id)} className="p-2 bg-neutral-50 hover:bg-black hover:text-white text-black border border-black/5 rounded-xl active:scale-90 transition-all"><Eye className={getIconSizeClass()} /></button>
                                                <a href={`tel:${student.parentWhatsapp}`} className="p-2 bg-neutral-50 hover:bg-green-50 text-green-600 border border-black/5 rounded-xl active:scale-90 transition-all"><Phone className={getIconSizeClass()} /></a>
                                                <button onClick={() => { setShowCustomInvoice(student); setCustomInvoice({ name: '', amount: '', markAsPaid: false, existingInstallmentId: '' }); }} className="p-2 bg-neutral-50 hover:bg-black hover:text-white text-black border border-black/5 rounded-xl active:scale-90 transition-all" title="Custom Invoice"><Receipt className={getIconSizeClass()} /></button>
                                                <button onClick={() => setEditingStudent(student)} className="p-2 bg-neutral-50 hover:bg-black hover:text-white text-black border border-black/5 rounded-xl active:scale-90 transition-all"><Edit2 className={getIconSizeClass()} /></button>
                                                <button onClick={() => handleDelete(student)} className="p-2 bg-neutral-50 hover:bg-red-50 text-red-600 border border-black/5 rounded-xl active:scale-90 transition-all"><Trash2 className={getIconSizeClass()} /></button>
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
                                        batch.feeInstallments && batch.feeInstallments.filter(i => !i.studentId).length > 0 && (
                                            <div className="mt-2 pt-3 border-t border-black/5/50">
                                                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-4 px-4">
                                                    {batch.feeInstallments.filter((inst) => {
                                                        if (inst.studentId) return false; // Skip custom invoices
                                                        const studentJoinDate = getStudentJoinDate(student.createdAt);
                                                        const instDate = new Date(inst.createdAt).setHours(0, 0, 0, 0);
                                                        const hasPayment = student.feePayments?.some(p => p.installmentId === inst.id);
                                                        return instDate >= studentJoinDate || hasPayment;
                                                    }).map((inst) => {
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
                                                                    "bg-neutral-50/50 hover:bg-neutral-50/50-hover border-black/5 text-app-text",
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
                                    {/* Custom student-specific invoices — rendered as regular mobile fee pills */}
                                    {
                                        batch.feeInstallments && batch.feeInstallments.filter(i => i.studentId === student.id).length > 0 && (
                                            <div className={cn(batch.feeInstallments.filter(i => !i.studentId).length === 0 ? "mt-2 pt-3 border-t border-black/5/50" : "")}>
                                                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-4 px-4">
                                                    {batch.feeInstallments.filter(inst => inst.studentId === student.id).map((inst) => {
                                                        const payments = student.feePayments?.filter(p => p.installmentId === inst.id) || [];
                                                        const paidAmount = payments.reduce((sum, p) => sum + p.amountPaid, 0);
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
                                                                    "bg-neutral-50/50 hover:bg-neutral-50/50-hover border-black/5 text-app-text",
                                                                    getTextSizeClass('body')
                                                                )}
                                                            >
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
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pt-[calc(5.5rem+env(safe-area-inset-top))] pb-10 md:p-4">
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
                                className="!bg-white border-[1.5px] border-black/5 rounded-[32px] p-5 md:p-8 max-w-lg w-full shadow-2xl relative z-10 max-h-[90vh] overflow-y-auto scrollbar-hide"
                            >
                                <div className="flex justify-between items-center mb-8">
                                    <h3 className="text-xl font-bold text-app-text">Edit Student</h3>
                                    <button onClick={() => setEditingStudent(null)} className="text-app-text-tertiary hover:text-app-text p-1 rounded-full hover:bg-neutral-50/50"><X className="w-5 h-5" /></button>
                                </div>

                                <form onSubmit={handleUpdate} className="grid grid-cols-1 gap-6">
                                    {/* Student Section */}
                                    <div className="space-y-4">
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
                                                        className="w-full bg-white border-[1.5px] border-black/5 rounded-xl pl-10 pr-4 py-2.5 text-app-text focus:ring-2 focus:ring-accent/10 focus:border-accent outline-none transition-all placeholder:text-app-text-tertiary/50"
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
                                                        className="w-full bg-neutral-100 dark:bg-neutral-800 border-[1.5px] border-black/5 rounded-xl pl-10 pr-4 py-2.5 text-app-text-tertiary cursor-not-allowed outline-none select-none pointer-events-none"
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
                                                        className="w-full bg-white border-[1.5px] border-black/5 rounded-xl pl-10 pr-4 py-2.5 text-app-text focus:ring-2 focus:ring-accent/10 focus:border-accent outline-none transition-all placeholder:text-app-text-tertiary/50"
                                                        placeholder="e.g. DPS, KV, etc."
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Guardian Section */}
                                    <div className="space-y-4">
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
                                                        className="w-full bg-white border-[1.5px] border-black/5 rounded-xl pl-10 pr-4 py-2.5 text-app-text focus:ring-2 focus:ring-accent/10 focus:border-accent outline-none transition-all placeholder:text-app-text-tertiary/50"
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
                                                        className="w-full bg-white border-[1.5px] border-black/5 rounded-xl pl-10 pr-4 py-2.5 text-app-text focus:ring-2 focus:ring-accent/10 focus:border-accent outline-none transition-all placeholder:text-app-text-tertiary/50"
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
                                                        className="w-full bg-white border-[1.5px] border-black/5 rounded-xl pl-10 pr-4 py-2.5 text-app-text focus:ring-2 focus:ring-accent/10 focus:border-accent outline-none transition-all placeholder:text-app-text-tertiary/50"
                                                        placeholder="Optional"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex justify-end pt-4 border-t border-black/5">
                                        <button
                                            type="submit"
                                            className="!bg-black hover:!bg-neutral-800 !text-white border-2 !border-black px-8 py-3 rounded-xl font-bold flex items-center shadow-lg shadow-gray-200 transition-all active:scale-[0.98]"
                                        >
                                            <Save className="w-4 h-4 mr-2" /> Save Changes
                                        </button>
                                    </div>
                                    <div className="h-4 md:hidden"></div>
                                </form>
                            </motion.div>
                        </div>
                    )
                }
            </AnimatePresence >

            {/* View Marks Modal */}
            <AnimatePresence>
                {viewMarks && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pt-[calc(5.5rem+env(safe-area-inset-top))] pb-10 md:p-4">
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
                            className="!bg-white border-[1.5px] border-black/5 rounded-[32px] p-5 md:p-8 max-w-2xl w-full shadow-2xl relative z-10 max-h-[90vh] overflow-y-auto scrollbar-hide"
                        >
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <h3 className="text-xl md:text-2xl font-bold text-app-text tracking-tight">{viewMarks.name}'s Performance</h3>
                                    <p className="text-xs md:text-sm text-app-text-secondary mt-1">Detailed breakdown of test scores</p>
                                </div>
                                <button onClick={() => setViewMarksId(null)} className="text-app-text-tertiary hover:text-app-text p-1 rounded-full hover:bg-neutral-50/50"><X className="w-5 h-5" /></button>
                            </div>

                            {(() => {
                                // Build full performance list: scored + absent (for tests after join date)
                                const joinDate = new Date(viewMarks.createdAt || 0);
                                joinDate.setHours(0, 0, 0, 0);
                                const markedTestIds = new Set((viewMarks.marks || []).map(m => m.test.id));
                                const batchTests = batch?.tests || [];
                                
                                const absentTests = batchTests.filter(t => {
                                    if (markedTestIds.has(t.id)) return false;
                                    const td = new Date(t.date);
                                    td.setHours(0, 0, 0, 0);
                                    return td >= joinDate;
                                });

                                // Combine: scored rows + absent rows, sorted by date
                                type PerformanceRow = 
                                    | { type: 'scored'; mark: StudentMark }
                                    | { type: 'absent'; test: BatchTest };
                                
                                const rows: PerformanceRow[] = [
                                    ...(viewMarks.marks || []).map(m => ({ type: 'scored' as const, mark: m })),
                                    ...absentTests.map(t => ({ type: 'absent' as const, test: t }))
                                ].sort((a, b) => {
                                    const dateA = a.type === 'scored' ? a.mark.test.date : a.test.date;
                                    const dateB = b.type === 'scored' ? b.mark.test.date : b.test.date;
                                    return new Date(dateA).getTime() - new Date(dateB).getTime();
                                });

                                const scoredRows = rows.filter(r => r.type === 'scored') as { type: 'scored'; mark: StudentMark }[];

                                return (
                                    <div className="border-[1.5px] border-black/5 rounded-xl overflow-hidden bg-white md:bg-transparent">
                                        {/* Desktop View */}
                                        <div className="hidden md:block overflow-x-auto">
                                            <table className="w-full text-left min-w-[600px]">
                                                <thead className="bg-neutral-50/50 border-b border-black/5">
                                                    <tr className="whitespace-nowrap">
                                                        <th className="px-6 py-4 text-xs font-bold text-app-text-tertiary uppercase tracking-wider">Test Name</th>
                                                        <th className="px-6 py-4 text-xs font-bold text-app-text-tertiary uppercase tracking-wider">Date</th>
                                                        <th className="px-6 py-4 text-xs font-bold text-app-text-tertiary uppercase tracking-wider text-center">Score</th>
                                                        <th className="px-6 py-4 text-xs font-bold text-app-text-tertiary uppercase tracking-wider text-center">Max Marks</th>
                                                        <th className="px-6 py-4 text-xs font-bold text-app-text-tertiary uppercase tracking-wider text-right">Normalized (10)</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-app-border">
                                                    {rows.length === 0 && (
                                                        <tr><td colSpan={5} className="px-6 py-12 text-center text-app-text-tertiary">No test records found.</td></tr>
                                                    )}
                                                    {rows.map((row, i) => {
                                                        if (row.type === 'absent') {
                                                            const parsedDate = row.test.date ? new Date(row.test.date) : null;
                                                            const dateStr = parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate.toLocaleDateString() : '-';
                                                            return (
                                                                <tr key={`absent-${row.test.id}`} className="opacity-50 bg-red-50/30">
                                                                    <td className="px-6 py-4 font-medium text-app-text">{row.test.name}</td>
                                                                    <td className="px-6 py-4 text-app-text-secondary text-sm">{dateStr}</td>
                                                                    <td className="px-6 py-4 text-center" colSpan={2}>
                                                                        <span className="text-xs font-bold text-red-400 bg-red-50 px-2.5 py-1 rounded-full">Absent</span>
                                                                    </td>
                                                                    <td className="px-6 py-4 text-right font-mono font-bold text-red-300">—</td>
                                                                </tr>
                                                            );
                                                        }
                                                        const mark = row.mark;
                                                        const max = mark.test.maxMarks || 0;
                                                        const normalized = max > 0 ? (mark.score / max) * 10 : 0;
                                                        const parsedDate = mark.test.date ? new Date(mark.test.date) : null;
                                                        const dateStr = parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate.toLocaleDateString() : '-';
                                                        return (
                                                            <tr key={mark.id} className="hover:bg-neutral-50/50 transition-colors">
                                                                <td className="px-6 py-4 font-medium text-app-text">{mark.test.name}</td>
                                                                <td className="px-6 py-4 text-app-text-secondary text-sm">{dateStr}</td>
                                                                <td className="px-6 py-4 text-center text-app-text">{mark.score}</td>
                                                                <td className="px-6 py-4 text-center text-app-text-secondary">{max}</td>
                                                                <td className="px-6 py-4 text-right font-mono font-bold text-accent">{normalized.toFixed(1)}</td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                                {scoredRows.length > 0 && (
                                                    <tfoot className="bg-neutral-50/50 border-t border-black/5">
                                                        <tr>
                                                            <td colSpan={4} className="px-6 py-4 text-sm font-bold text-app-text text-right uppercase tracking-wider">Average Normalized Score</td>
                                                            <td className="px-6 py-4 text-right font-mono font-bold text-xl text-app-text">{getStudentAverage(viewMarks)}</td>
                                                        </tr>
                                                    </tfoot>
                                                )}
                                            </table>
                                        </div>

                                        {/* Mobile View */}
                                        <div className="md:hidden flex flex-col divide-y divide-black/5 bg-neutral-50/30">
                                            {rows.length === 0 && (
                                                <div className="p-8 text-center text-app-text-tertiary">No test records found.</div>
                                            )}
                                            {rows.map((row) => {
                                                if (row.type === 'absent') {
                                                    const parsedDate = row.test.date ? new Date(row.test.date) : null;
                                                    const dateStr = parsedDate && !isNaN(parsedDate.getTime())
                                                        ? parsedDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })
                                                        : '-';
                                                    return (
                                                        <div key={`absent-${row.test.id}`} className="p-4 flex justify-between items-center opacity-50 bg-red-50/30">
                                                            <div className="flex flex-col">
                                                                <span className="font-bold text-app-text text-[15px] leading-tight">{row.test.name}</span>
                                                                <span className="text-xs text-app-text-tertiary mt-1.5 flex items-center gap-1.5">
                                                                    <Clock className="w-3.5 h-3.5" />{dateStr}
                                                                </span>
                                                            </div>
                                                            <span className="text-xs font-bold text-red-400 bg-red-50 px-2.5 py-1 rounded-full flex-shrink-0">Absent</span>
                                                        </div>
                                                    );
                                                }
                                                const mark = row.mark;
                                                const max = mark.test.maxMarks || 0;
                                                const normalized = max > 0 ? (mark.score / max) * 10 : 0;
                                                const parsedDate = mark.test.date ? new Date(mark.test.date) : null;
                                                const dateStr = parsedDate && !isNaN(parsedDate.getTime())
                                                    ? parsedDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })
                                                    : '-';
                                                return (
                                                    <div key={mark.id} className="p-4 flex flex-col gap-3 hover:bg-white transition-colors">
                                                        <div className="flex justify-between items-start">
                                                            <div className="flex flex-col">
                                                                <span className="font-bold text-app-text text-[15px] leading-tight">{mark.test.name}</span>
                                                                <span className="text-xs text-app-text-tertiary mt-1.5 flex items-center gap-1.5">
                                                                    <Clock className="w-3.5 h-3.5" />{dateStr}
                                                                </span>
                                                            </div>
                                                            <div className="text-right flex flex-col items-end">
                                                                <span className="text-[10px] font-bold text-app-text-tertiary uppercase tracking-wider mb-1">Norm (10)</span>
                                                                <span className="font-mono font-bold text-xl text-accent leading-none">{normalized.toFixed(1)}</span>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-5 pt-3 border-t border-black/5 mt-1">
                                                            <div className="flex flex-col">
                                                                <span className="text-[10px] font-bold text-app-text-tertiary uppercase tracking-wider mb-0.5">Score</span>
                                                                <span className="font-bold text-app-text text-sm">{mark.score}</span>
                                                            </div>
                                                            <div className="w-px h-6 bg-black/5"></div>
                                                            <div className="flex flex-col">
                                                                <span className="text-[10px] font-bold text-app-text-tertiary uppercase tracking-wider mb-0.5">Max</span>
                                                                <span className="font-medium text-app-text-secondary text-sm">{max}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            {scoredRows.length > 0 && (
                                                <div className="p-4 bg-neutral-50/80 flex justify-between items-center border-t border-black/5">
                                                    <span className="text-xs font-bold text-app-text uppercase tracking-wider">Average Score</span>
                                                    <span className="font-mono font-bold text-2xl text-app-text">{getStudentAverage(viewMarks)}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })()}
                            <div className="h-4 md:hidden"></div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Add Student Modal */}
            <AnimatePresence>
                {
                    showAddStudent && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pt-[calc(5.5rem+env(safe-area-inset-top))] pb-10 md:p-4">
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
                                className="!bg-white border-[1.5px] border-black/5 rounded-[32px] p-5 md:p-8 max-w-lg w-full shadow-2xl relative z-10 max-h-[90vh] overflow-y-auto scrollbar-hide"
                            >
                                <div className="flex justify-between items-center mb-8">
                                    <div>
                                        <h3 className="text-xl font-bold text-app-text">Invite Student</h3>
                                        <p className="text-sm text-app-text-tertiary">Send a secure registration link via WhatsApp.</p>
                                    </div>
                                    <button onClick={() => setShowAddStudent(false)} className="text-app-text-tertiary hover:text-app-text p-1 rounded-full hover:bg-neutral-50/50"><X className="w-5 h-5" /></button>
                                </div>

                                <form onSubmit={handleAddStudent} className="grid grid-cols-1 gap-6">
                                    <div className="space-y-4 pt-2">
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-bold text-app-text-tertiary uppercase tracking-wider ml-1">Student's WhatsApp</label>
                                            <div className="relative">
                                                <Phone className="absolute left-3 top-3 w-4 h-4 text-app-text-tertiary" />
                                                <input
                                                    type="tel"
                                                    maxLength={10}
                                                    value={newWhatsapp}
                                                    onChange={(e) => {
                                                        const val = e.target.value.replace(/\D/g, '');
                                                        if (val.length <= 10) setNewWhatsapp(val);
                                                    }}
                                                    className="w-full !bg-neutral-50 border-[1.5px] border-black/5 rounded-xl pl-10 pr-4 py-2.5 text-app-text  focus:ring-2 focus:ring-accent/10 focus:border-accent outline-none transition-all placeholder:text-app-text-tertiary/50"
                                                    required
                                                    autoFocus
                                                    placeholder="10-digit Number"
                                                />
                                            </div>
                                            <p className="text-xs text-app-text-tertiary ml-1 mt-1">A unique 24-hour validity link will be sent.</p>
                                        </div>
                                    </div>

                                    <div className="flex justify-end pt-2">
                                        <button
                                            type="submit"
                                            className="!bg-black hover:!bg-neutral-800 !text-white border-2 !border-black  px-8 py-3 rounded-xl font-bold flex items-center shadow-lg transition-all active:scale-[0.98] w-full justify-center"
                                        >
                                            <Mail className="w-4 h-4 mr-2" /> Send Invite Link
                                        </button>
                                    </div>
                                    <div className="h-4 md:hidden"></div>
                                </form>
                            </motion.div>
                        </div>
                    )
                }
            </AnimatePresence >

            {/* Delete Student Confirmation Modal */}
            <AnimatePresence>
                {studentToDelete && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pt-[calc(5.5rem+env(safe-area-inset-top))] pb-10 md:p-4">
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
                            className="!bg-white border-[1.5px] border-black/5 rounded-[32px] p-8 max-w-md w-full shadow-2xl relative z-10"
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
                                <button onClick={() => setStudentToDelete(null)} className="text-app-text-tertiary hover:text-app-text p-1 rounded-full hover:bg-neutral-50/50"><X className="w-5 h-5" /></button>
                            </div>

                            <form onSubmit={confirmDeleteStudent} className="space-y-4">
                                <div>
                                    <label className="text-xs font-bold text-app-text-tertiary uppercase tracking-wider mb-2 block">
                                        Type <span className="text-red-500">delete</span> to confirm
                                    </label>
                                    <input
                                        value={deleteInput}
                                        onChange={(e) => setDeleteInput(e.target.value)}
                                        className="w-full bg-white border-[1.5px] border-black/5 rounded-xl px-4 py-3 text-app-text focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all placeholder:text-app-text-tertiary/50"
                                        placeholder="Type 'delete'"
                                        autoFocus
                                    />
                                </div>

                                <div className="flex gap-3 pt-2">
                                    <button
                                        type="button"
                                        onClick={() => setStudentToDelete(null)}
                                        className="flex-1 py-3 rounded-xl font-bold bg-neutral-50/50 border-[1.5px] border-black/5 text-app-text hover:bg-neutral-50/50-hover transition-colors"
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
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pt-[calc(5.5rem+env(safe-area-inset-top))] pb-10 md:p-4">
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
                                className="!bg-white border-[1.5px] border-black/5 rounded-[32px] p-5 md:p-8 max-w-lg w-full shadow-2xl relative z-10"
                            >
                                <div className="flex justify-between items-center mb-8">
                                    <h3 className="text-xl font-bold text-app-text">Edit Batch Details</h3>
                                    <button onClick={() => setShowEditBatch(false)} className="text-app-text-tertiary hover:text-app-text p-1 rounded-full hover:bg-neutral-50/50"><X className="w-5 h-5" /></button>
                                </div>

                                <form onSubmit={handleUpdateBatch} className="space-y-5">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-app-text-secondary uppercase tracking-wider">Batch Name</label>
                                        <input
                                            value={editBatchData.name}
                                            onChange={(e) => setEditBatchData({ ...editBatchData, name: e.target.value })}
                                            className="w-full bg-white border-[1.5px] border-black/5 rounded-xl px-4 py-3 text-app-text focus:ring-2 focus:ring-accent/10 focus:border-accent outline-none transition-all placeholder:text-app-text-tertiary/50"
                                            required
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-5">
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-app-text-secondary uppercase tracking-wider">Class/Grade</label>
                                            <input
                                                value={editBatchData.className}
                                                onChange={(e) => setEditBatchData({ ...editBatchData, className: e.target.value })}
                                                className="w-full bg-white border-[1.5px] border-black/5 rounded-xl px-4 py-3 text-app-text focus:ring-2 focus:ring-accent/10 focus:border-accent outline-none transition-all placeholder:text-app-text-tertiary/50"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-app-text-secondary uppercase tracking-wider">Time Slot</label>
                                            <input
                                                value={editBatchData.timeSlot}
                                                onChange={(e) => setEditBatchData({ ...editBatchData, timeSlot: e.target.value })}
                                                className="w-full bg-white border-[1.5px] border-black/5 rounded-xl px-4 py-3 text-app-text focus:ring-2 focus:ring-accent/10 focus:border-accent outline-none transition-all placeholder:text-app-text-tertiary/50"
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
                                    <div className="h-4 md:hidden"></div>
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
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pt-[calc(5.5rem+env(safe-area-inset-top))] pb-10 md:p-4">
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
                                className="!bg-white border-[1.5px] border-black/5 rounded-[32px] p-5 md:p-8 max-w-md w-full shadow-2xl relative z-10"
                            >
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="text-xl font-bold text-app-text">WhatsApp Group Link</h3>
                                    <button onClick={() => setShowWhatsAppModal(false)} className="text-app-text-tertiary hover:text-app-text p-1 rounded-full hover:bg-neutral-50/50"><X className="w-5 h-5" /></button>
                                </div>

                                <form onSubmit={handleUpdateWhatsappLink} className="space-y-5">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-app-text-secondary uppercase tracking-wider">Group Invite Link</label>
                                        <input
                                            value={whatsappLinkInput}
                                            onChange={(e) => setWhatsappLinkInput(e.target.value)}
                                            className="w-full bg-white border-[1.5px] border-black/5 rounded-xl px-4 py-3 text-app-text focus:ring-2 focus:ring-accent/10 focus:border-accent outline-none transition-all placeholder:text-app-text-tertiary/50"
                                            placeholder="https://chat.whatsapp.com/..."
                                            autoFocus
                                        />
                                        <p className="text-xs text-app-text-tertiary">
                                            Paste the invite link from your WhatsApp Group settings.
                                        </p>
                                    </div>

                                    <div className="flex items-center justify-between p-4 bg-neutral-50/50 rounded-xl border-[1.5px] border-black/5">
                                        <div className="space-y-0.5">
                                            <label className="text-sm font-bold text-app-text">Auto-Send Invites</label>
                                            <p className="text-xs text-app-text-tertiary w-11/12">Automatically send WhatsApp & Email invites to new students.</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setAutoSendWelcomeInput(!autoSendWelcomeInput)}
                                            className={cn(
                                                "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                                                autoSendWelcomeInput ? "bg-green-500" : "bg-gray-200"
                                            )}
                                        >
                                            <span
                                                className={cn(
                                                    "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out",
                                                    autoSendWelcomeInput ? "translate-x-5" : "translate-x-0"
                                                )}
                                            />
                                        </button>
                                    </div>

                                    <div className="flex justify-end pt-4">
                                        <button
                                            type="submit"
                                            className="bg-green-600 hover:bg-green-700 text-white border border-green-600 px-8 py-3 rounded-xl font-bold flex items-center shadow-lg shadow-green-600/20 transition-all active:scale-[0.98]"
                                        >
                                            <Save className="w-4 h-4 mr-2" /> Save Link
                                        </button>
                                    </div>
                                    <div className="h-4 md:hidden"></div>
                                </form>
                            </motion.div>
                        </div>
                    )
                }
            </AnimatePresence>

            {/* Manage Installments Modal */}
            <AnimatePresence>
                {showManageInstallments && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pt-[calc(5.5rem+env(safe-area-inset-top))] pb-10 md:p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/40 backdrop-blur-md"
                            onClick={() => setShowManageInstallments(false)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="!bg-white border-[1.5px] border-black/5 rounded-[32px] p-6 md:p-8 max-w-md w-full shadow-2xl relative z-10 flex flex-col max-h-[90vh]"
                        >
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xl font-bold text-app-text">Fee Columns</h3>
                                <button onClick={() => setShowManageInstallments(false)} className="text-app-text-tertiary hover:text-app-text p-1 rounded-full hover:bg-neutral-50/50"><X className="w-5 h-5" /></button>
                            </div>

                            <div className="overflow-y-auto pr-2 mb-6 flex-1 min-h-[150px]">
                                {batch?.feeInstallments && batch.feeInstallments.filter(i => !i.studentId).length > 0 ? (
                                    <div className="space-y-3">
                                        {[...batch.feeInstallments].filter(i => !i.studentId).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()).map(inst => (
                                            <div key={inst.id} className="flex justify-between items-center p-4 rounded-xl border-[1.5px] border-black/5 bg-neutral-50/50 group">
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-app-text">{inst.name}</span>
                                                    <span className="text-xs text-app-text-tertiary uppercase tracking-wider">Amount: ₹{inst.amount}</span>
                                                </div>
                                                <div className="flex items-center gap-1.5 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => { setShowManageInstallments(false); setEditingInstallment(inst); }} className="p-2 hover:bg-accent/10 text-accent rounded-lg transition-colors" title="Edit">
                                                        <Edit2 className="w-4 h-4" />
                                                    </button>
                                                    <button onClick={() => { setShowManageInstallments(false); setInstallmentToDelete(inst); }} className="p-2 hover:bg-danger/10 text-danger rounded-lg transition-colors" title="Delete">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-12 text-app-text-tertiary">
                                        <p>No fee columns created yet.</p>
                                    </div>
                                )}
                            </div>

                            <div className="flex justify-end pt-4 border-t border-black/5">
                                <button
                                    onClick={() => { setShowManageInstallments(false); setShowAddInstallment(true); }}
                                    className="bg-neutral-900 hover:bg-black text-white px-6 py-3 rounded-xl font-bold flex items-center shadow-lg transition-all active:scale-[0.98]"
                                >
                                    <Plus className="w-4 h-4 mr-2" /> Add New Column
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Add Installment Modal */}
            <AnimatePresence>
                {
                    showAddInstallment && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pt-[calc(5.5rem+env(safe-area-inset-top))] pb-10 md:p-4">
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
                                className="!bg-white border-[1.5px] border-black/5 rounded-[32px] p-6 md:p-8 max-w-sm w-full shadow-2xl relative z-10"
                            >
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="text-xl font-bold text-app-text">Add Fee Installment</h3>
                                    <button onClick={() => setShowAddInstallment(false)} className="text-app-text-tertiary hover:text-app-text p-1 rounded-full hover:bg-neutral-50/50"><X className="w-5 h-5" /></button>
                                </div>

                                <form onSubmit={handleAddInstallment} className="space-y-4">
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider ml-1">Installment Name</label>
                                        <input
                                            value={newInstallment.name}
                                            onChange={(e) => setNewInstallment({ ...newInstallment, name: e.target.value })}
                                            className="w-full !bg-neutral-50 border-[1.5px] border-black/5 rounded-xl px-4 py-2.5 text-app-text  focus:ring-2 focus:ring-accent/10 focus:border-accent outline-none transition-all placeholder:text-app-text-tertiary/50"
                                            placeholder="e.g. Jan-Mar 2024"
                                            required
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider ml-1">Amount (₹)</label>
                                        <input
                                            type="number"
                                            inputMode="numeric"
                                            value={newInstallment.amount}
                                            onChange={(e) => setNewInstallment({ ...newInstallment, amount: e.target.value })}
                                            className="w-full !bg-neutral-50 border-[1.5px] border-black/5 rounded-xl px-4 py-2.5 text-app-text  focus:ring-2 focus:ring-accent/10 focus:border-accent outline-none transition-all placeholder:text-app-text-tertiary/50"
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
                                    <div className="h-4 md:hidden"></div>
                                </form>
                            </motion.div>
                        </div>
                    )
                }
            </AnimatePresence >

            {/* Edit Installment Modal */}
            <AnimatePresence>
                {
                    editingInstallment && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pt-[calc(5.5rem+env(safe-area-inset-top))] pb-10 md:p-4">
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0 bg-black/40 backdrop-blur-md"
                                onClick={() => setEditingInstallment(null)}
                            />
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                                className="!bg-white border-[1.5px] border-black/5 rounded-[32px] p-6 md:p-8 max-w-sm w-full shadow-2xl relative z-10"
                            >
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="text-xl font-bold text-app-text">Edit Fee Column</h3>
                                    <button onClick={() => setEditingInstallment(null)} className="text-app-text-tertiary hover:text-app-text p-1 rounded-full hover:bg-neutral-50/50"><X className="w-5 h-5" /></button>
                                </div>

                                <form onSubmit={handleUpdateInstallment} className="space-y-4">
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider ml-1">Column Name</label>
                                        <input
                                            value={editingInstallment.name}
                                            onChange={(e) => setEditingInstallment({ ...editingInstallment, name: e.target.value })}
                                            className="w-full !bg-neutral-50 border-[1.5px] border-black/5 rounded-xl px-4 py-2.5 text-app-text focus:ring-2 focus:ring-accent/10 focus:border-accent outline-none transition-all placeholder:text-app-text-tertiary/50"
                                            required
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider ml-1">Amount (₹)</label>
                                        <input
                                            type="number"
                                            inputMode="numeric"
                                            value={editingInstallment.amount}
                                            onChange={(e) => setEditingInstallment({ ...editingInstallment, amount: Number(e.target.value) })}
                                            className="w-full !bg-neutral-50 border-[1.5px] border-black/5 rounded-xl px-4 py-2.5 text-app-text focus:ring-2 focus:ring-accent/10 focus:border-accent outline-none transition-all placeholder:text-app-text-tertiary/50"
                                            required
                                        />
                                    </div>

                                    <div className="flex justify-end pt-4">
                                        <button
                                            type="submit"
                                            className="bg-neutral-900 hover:bg-black text-white px-8 py-3 rounded-xl font-bold flex items-center shadow-lg transition-all active:scale-[0.98] w-full justify-center"
                                        >
                                            Save Changes
                                        </button>
                                    </div>
                                </form>
                            </motion.div>
                        </div>
                    )
                }
            </AnimatePresence >

            {/* Delete Installment Confirmation Modal */}
            <AnimatePresence>
                {installmentToDelete && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pt-[calc(5.5rem+env(safe-area-inset-top))] pb-10 md:p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/40 backdrop-blur-md"
                            onClick={() => setInstallmentToDelete(null)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="!bg-white border-[1.5px] border-black/5 rounded-[32px] p-8 max-w-md w-full shadow-2xl relative z-10"
                        >
                            <div className="flex justify-between items-start mb-6">
                                <div>
                                    <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 flex items-center justify-center mb-4">
                                        <Trash2 className="w-6 h-6" />
                                    </div>
                                    <h3 className="text-xl font-bold text-app-text">Delete Fee Column?</h3>
                                    <p className="text-app-text-secondary mt-1 text-sm">
                                        Are you sure you want to delete <span className="font-bold text-app-text">{installmentToDelete.name}</span>? This will permanently remove it.
                                    </p>
                                </div>
                                <button onClick={() => setInstallmentToDelete(null)} className="text-app-text-tertiary hover:text-app-text p-1 rounded-full hover:bg-neutral-50/50"><X className="w-5 h-5" /></button>
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setInstallmentToDelete(null)}
                                    className="flex-1 py-3 rounded-xl font-bold bg-neutral-50/50 border-[1.5px] border-black/5 text-app-text hover:bg-neutral-50/50-hover transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleDeleteInstallment}
                                    className="flex-1 py-3 rounded-xl font-bold bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/20 transition-all hover:bg-red-700 active:scale-[0.98]"
                                >
                                    Delete
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Payment Confirmation Modal (Menu Style) */}
            <AnimatePresence>
                {paymentModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pt-[calc(5.5rem+env(safe-area-inset-top))] pb-10 md:p-4">
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
                            className="!bg-white border-[1.5px] border-black/5 rounded-[32px] p-0 max-w-sm w-full shadow-2xl relative z-10 overflow-hidden"
                        >
                            {/* Header */}
                            <div className="p-6 border-b border-black/5 flex justify-between items-start bg-white/70 backdrop-blur-md">
                                <div>
                                    <h3 className="text-lg font-bold text-app-text">{paymentModal.student.name}</h3>
                                    <div className="flex flex-col mt-1">
                                        <span className="text-xs text-app-text-secondary uppercase tracking-wider font-semibold">Payment For</span>
                                        <span className="text-app-text font-medium">{paymentModal.installment.name}</span>
                                    </div>
                                </div>
                                <div className="bg-neutral-50/50 border-[1.5px] border-black/5 px-3 py-1.5 rounded-lg">
                                    <span className="text-lg font-bold text-app-text">₹{paymentModal.installment.amount}</span>
                                </div>
                            </div>

                            <div className="p-6">
                                <form onSubmit={handleMarkPaid} className="space-y-6">
                                    <div className="grid grid-cols-2 gap-4">
                                        {/* Amount input removed as per user request (redundant with header badge) */}
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-app-text-tertiary uppercase tracking-wider">Payment Date</label>
                                            <div className="relative">
                                                <Clock className="absolute left-3 top-3 w-4 h-4 text-app-text-tertiary" />
                                                <input
                                                    type="date"
                                                    value={paymentModal.date}
                                                    onChange={(e) => setPaymentModal({ ...paymentModal, date: e.target.value })}
                                                    className="w-full !bg-neutral-50 border-[1.5px] border-black/5 rounded-xl pl-10 pr-4 py-3 text-app-text focus:ring-2 focus:ring-accent/10 focus:border-accent outline-none transition-all font-medium"
                                                    required
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3 pt-2">
                                        <button
                                            type="button"
                                            onClick={() => setPaymentModal(null)}
                                            className="px-4 py-3 rounded-xl bg-white hover:bg-app-border text-danger font-bold text-sm transition-colors border border-neutral-900  hover:border-danger/10"
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
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pt-[calc(5.5rem+env(safe-area-inset-top))] pb-10 md:p-4">
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
                            className="bg-white border-[1.5px] border-black/5 rounded-[32px] p-6 max-w-xs w-full shadow-2xl relative z-10 flex flex-col items-center text-center font-sans"
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
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pt-[calc(5.5rem+env(safe-area-inset-top))] pb-10 md:p-4">
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
                            className="!bg-white border-[1.5px] border-black/5 rounded-[32px] p-6 max-w-sm w-full shadow-2xl relative z-10 text-center"
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
                                    className="flex-1 py-3 rounded-xl font-bold bg-neutral-50/50 border-[1.5px] border-black/5 text-app-text hover:bg-neutral-50/50-hover transition-colors"
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
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pt-[calc(5.5rem+env(safe-area-inset-top))] pb-10 md:p-4">
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
                            className="!bg-white border-[1.5px] border-black/5 rounded-[32px] p-6 max-w-sm w-full shadow-2xl relative z-10 text-center"
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
                                className="w-full bg-white border-[1.5px] border-black/5 rounded-xl px-4 py-3 text-center text-app-text font-mono tracking-widest text-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none mb-6"
                                placeholder="0000"
                                autoFocus
                            />

                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowDeleteConfirm(false)}
                                    className="flex-1 py-3 rounded-xl font-bold bg-neutral-50/50 border-[1.5px] border-black/5 text-app-text hover:bg-neutral-50/50-hover transition-colors"
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
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pt-[calc(5.5rem+env(safe-area-inset-top))] pb-10 md:p-4">
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
                            className="!bg-white border-[1.5px] border-black/5 rounded-[32px] p-6 max-w-sm w-full shadow-2xl relative z-10 text-center"
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
                            <div className="w-full bg-neutral-50/50 border-[1.5px] border-black/5 rounded-full h-3 mb-6 overflow-hidden relative">
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

            {/* Custom Invoice Modal */}
            <AnimatePresence>
                {showCustomInvoice && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pt-[calc(5.5rem+env(safe-area-inset-top))] pb-10 md:p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/40 backdrop-blur-md"
                            onClick={() => setShowCustomInvoice(null)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="!bg-white border-[1.5px] border-black/5 rounded-[32px] p-6 md:p-8 max-w-sm w-full shadow-2xl relative z-10"
                        >
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <h3 className="text-xl font-bold text-app-text">Custom Invoice</h3>
                                    <p className="text-sm text-app-text-tertiary mt-1">For <span className="font-bold text-app-text">{showCustomInvoice.name}</span></p>
                                </div>
                                <button onClick={() => setShowCustomInvoice(null)} className="text-app-text-tertiary hover:text-app-text p-1 rounded-full hover:bg-neutral-50/50"><X className="w-5 h-5" /></button>
                            </div>

                            <form onSubmit={handleCreateCustomInvoice} className="space-y-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Invoice Type</label>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setCustomInvoice({ ...customInvoice, existingInstallmentId: '' })}
                                            className={cn("flex-1 py-2 rounded-xl text-sm font-bold border transition-colors", !customInvoice.existingInstallmentId ? "bg-black text-white border-black" : "bg-neutral-50 text-app-text-tertiary border-black/5 hover:border-black/20")}
                                        >
                                            New
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const globalInsts = batch?.feeInstallments?.filter(i => !i.studentId);
                                                setCustomInvoice({ ...customInvoice, existingInstallmentId: globalInsts?.[0]?.id || 'error' });
                                            }}
                                            className={cn("flex-1 py-2 rounded-xl text-sm font-bold border transition-colors", customInvoice.existingInstallmentId ? "bg-black text-white border-black" : "bg-neutral-50 text-app-text-tertiary border-black/5 hover:border-black/20")}
                                        >
                                            Existing
                                        </button>
                                    </div>
                                </div>

                                {customInvoice.existingInstallmentId ? (
                                    <div className="pt-2">
                                        <Dropdown
                                            label="Select Global Fee"
                                            value={customInvoice.existingInstallmentId}
                                            onChange={(val) => setCustomInvoice({ ...customInvoice, existingInstallmentId: val })}
                                            options={[
                                                ...(batch?.feeInstallments?.filter(i => !i.studentId).map(inst => ({
                                                    value: inst.id,
                                                    label: `${inst.name} — ₹${inst.amount}`
                                                })) || []),
                                                ...(batch?.feeInstallments?.filter(i => !i.studentId).length === 0 ? [
                                                    { value: 'error', label: 'No global fees available' }
                                                ] : [])
                                            ]}
                                        />
                                    </div>
                                ) : (
                                    <>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Invoice Name</label>
                                            <input
                                                value={customInvoice.name}
                                                onChange={(e) => setCustomInvoice({ ...customInvoice, name: e.target.value })}
                                                className="w-full !bg-neutral-50 border-[1.5px] border-black/5 rounded-xl px-4 py-2.5 text-app-text focus:ring-2 focus:ring-accent/10 focus:border-accent outline-none transition-all placeholder:text-app-text-tertiary/50"
                                                placeholder="e.g. April-May Fee, Registration"
                                                required
                                                autoFocus
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider ml-1">Amount (₹)</label>
                                            <input
                                                type="number"
                                                inputMode="numeric"
                                                value={customInvoice.amount}
                                                onChange={(e) => setCustomInvoice({ ...customInvoice, amount: e.target.value })}
                                                className="w-full !bg-neutral-50 border-[1.5px] border-black/5 rounded-xl px-4 py-2.5 text-app-text focus:ring-2 focus:ring-accent/10 focus:border-accent outline-none transition-all placeholder:text-app-text-tertiary/50"
                                                placeholder="0"
                                                required
                                                min="1"
                                            />
                                        </div>
                                    </>
                                )}

                                {/* Mark as Paid Toggle */}
                                <div className="flex items-center justify-between p-4 bg-neutral-50 rounded-xl border-[1.5px] border-black/5">
                                    <div>
                                        <p className="text-sm font-bold text-app-text">Mark as Paid</p>
                                        <p className="text-xs text-app-text-tertiary mt-0.5">Instantly log payment for this invoice</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setCustomInvoice({ ...customInvoice, markAsPaid: !customInvoice.markAsPaid })}
                                        className={cn(
                                            "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                                            customInvoice.markAsPaid ? "bg-green-500" : "bg-gray-200"
                                        )}
                                    >
                                        <span
                                            className={cn(
                                                "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out",
                                                customInvoice.markAsPaid ? "translate-x-5" : "translate-x-0"
                                            )}
                                        />
                                    </button>
                                </div>

                                <div className="flex justify-end pt-4">
                                    <button
                                        type="submit"
                                        className="bg-neutral-900 hover:bg-black text-white px-8 py-3 rounded-xl font-bold flex items-center shadow-lg transition-all active:scale-[0.98] w-full justify-center gap-2"
                                    >
                                        <Receipt className="w-4 h-4" />
                                        {customInvoice.markAsPaid ? 'Create & Mark Paid' : 'Create Invoice'}
                                    </button>
                                </div>
                                <div className="h-4 md:hidden"></div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </Layout >
    );
}
