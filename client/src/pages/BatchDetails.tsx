
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiRequest, API_URL } from '../utils/api';
import Layout from '../components/Layout';
import Dropdown from '../components/Dropdown';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, CalendarDays, Clock, Download, Mail, Phone, Edit2, Trash2, X, Save, Plus, Users, Settings, User, Book, Fingerprint, Search, MoreVertical, Pause, Play, Archive, Eye, FileText, Printer, ArrowUp, ArrowDown, ArrowUpDown, Receipt, Monitor, Copy, Share2, Sparkles, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import QRCode from 'react-qr-code';
import { cn } from '../utils/cn';
import { getInstallmentPaidMap, getStudentJoinDate, type LegacyFee } from '../utils/fees';
import StudentProfileDrawer from '../components/StudentProfileDrawer';
import { BatchRegistrationQrModal } from '../components/batch/BatchRegistrationQrModal';
import { StudentFeeStartDialog } from '../features/month-coverage/StudentFeeStartDialog';
import { confirmStudentFeeProfile, loadMonthCoverageSummary } from '../features/month-coverage/api';
import type { MonthCoverageProfile, MonthCoverageStudentSummary, MonthCoverageSummary } from '../features/month-coverage/types';
import { MonthCoveragePaymentDialog } from '../features/month-coverage/MonthCoveragePaymentDialog';
import { formatCoverageRange, monthStatusCopy } from '../features/month-coverage/monthCoverageViewModel';
import { BatchExportDialog, type BatchExportColumn } from '../features/batch-export/BatchExportDialog';

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
    additionalData?: any;
    feeAssignments?: { installmentId: string }[];
    monthCoverageProfile?: MonthCoverageProfile | null;
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
    startDate?: string | null;
    endDate?: string | null;
    coachingFeeMode?: 'CURRENT_DUE_BASED' | 'MONTH_COVERAGE';
}

function dateMonth(value: string): string {
    const date = new Date(value);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function getErrorMessage(error: unknown, fallback: string): string {
    return error instanceof Error && error.message.trim() ? error.message : fallback;
}

export default function BatchDetails() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [batch, setBatch] = useState<Batch | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
    const [editingStudent, setEditingStudent] = useState<Student | null>(null);
    const [showAddStudent, setShowAddStudent] = useState(false);
    const [showRegMenu, setShowRegMenu] = useState(false);
    const [showRegModal, setShowRegModal] = useState(false);
    const [showCloseConfirm, setShowCloseConfirm] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showAssignConfirm, setShowAssignConfirm] = useState<{ studentId: string, installmentId: string } | null>(null);
    const [feeStartStudent, setFeeStartStudent] = useState<Student | null>(null);
    const [monthCoverageSummary, setMonthCoverageSummary] = useState<MonthCoverageSummary | null>(null);
    const [monthPaymentStudent, setMonthPaymentStudent] = useState<MonthCoverageStudentSummary | null>(null);
    const [deleteCodeInput, setDeleteCodeInput] = useState('');
    const [viewMarksId, setViewMarksId] = useState<string | null>(null);
    const [showExportDialog, setShowExportDialog] = useState(false);

    const viewMarks = useMemo(() => {
        if (!viewMarksId || !batch) return null;
        return batch.students.find(s => s.id === viewMarksId) || null;
    }, [viewMarksId, batch]);

    const formFields = useMemo(() => {
        const config = (batch as any)?.institute?.config;
        if (config?.registrationForm?.fields && Array.isArray(config.registrationForm.fields)) {
            return config.registrationForm.fields;
        }
        return [
            { id: 'studentName', label: 'Student Name', type: 'text', required: true, system: true },
            { id: 'parentName', label: 'Parent / Guardian Name', type: 'text', required: true, system: true },
            { id: 'parentWhatsapp', label: 'WhatsApp Number', type: 'tel', required: true, system: true },
            { id: 'schoolName', label: 'School Name', type: 'text', required: false, system: true },
            { id: 'parentEmail', label: 'Parent Email (Optional)', type: 'email', required: false, system: true }
        ];
    }, [batch]);

    const exportColumns = useMemo<BatchExportColumn[]>(() => {
        if (!batch) return [];
        const details: BatchExportColumn[] = [
            { id: 'humanId', label: 'Student ID', group: 'Student details' },
            ...formFields.map((field: any) => ({
                id: field.system ? field.id : `custom:${field.id}`,
                label: field.label,
                group: 'Student details' as const,
            })),
        ];
        const performance: BatchExportColumn[] = [{ id: 'averageMarks', label: 'Average Marks', group: 'Performance' }];
        const fees: BatchExportColumn[] = batch.coachingFeeMode === 'MONTH_COVERAGE'
            ? [
                { id: 'feeStartMonth', label: 'Fee Start Month', group: 'Fees' },
                { id: 'feeEndMonth', label: 'Fee End Month', group: 'Fees' },
                { id: 'receivedMonths', label: 'Months Received', group: 'Fees' },
                { id: 'pendingMonths', label: 'Months Pending', group: 'Fees' },
                { id: 'overdueMonths', label: 'Months Overdue', group: 'Fees' },
            ]
            : [
                ...batch.feeInstallments.filter(installment => !installment.studentId).map(installment => ({ id: `installment:${installment.id}`, label: installment.name, group: 'Fees' as const })),
                { id: 'totalDue', label: 'Total Due', group: 'Fees' },
            ];
        return [...details, ...performance, ...fees];
    }, [batch, formFields]);

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
        whatsappGroupLink: '',
        startDate: '',
        endDate: '',
    });

    // Fee Installment State — unified multi-step modal
    const [showFeeModal, setShowFeeModal] = useState(false);
    const [feeView, setFeeView] = useState<'list' | 'add' | 'edit' | 'delete-confirm'>('list');
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

    const invoiceTemplates = useMemo(() => {
        const seen = new Set<string>();
        return (batch?.feeInstallments || []).filter(inst => {
            const key = `${inst.name}::${inst.amount}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }, [batch?.feeInstallments]);

    const customInvoiceColumns = useMemo(() => {
        const seen = new Set<string>();
        return (batch?.feeInstallments || []).filter(inst => {
            if (!inst.studentId) return false;
            const key = `${inst.name}::${inst.amount}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }, [batch?.feeInstallments]);

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

    const openFeeModal = () => { setFeeView('list'); setShowFeeModal(true); };
    const closeFeeModal = () => { setShowFeeModal(false); setTimeout(() => setFeeView('list'), 300); };

    const openEditBatch = () => {
        if (batch) {
            setEditBatchData({
                name: batch.name,
                subject: batch.subject,
                timeSlot: batch.timeSlot,
                feeAmount: batch.feeAmount.toString(),
                className: batch.className || '',
                whatsappGroupLink: batch.whatsappGroupLink || '',
                startDate: batch.startDate?.slice(0, 10) || '',
                endDate: batch.endDate?.slice(0, 10) || '',
            });
            setShowEditBatch(true);
        }
    };

    const handleDeleteBatch = () => {
        setShowDeleteConfirm(true);
    };

    const handleUpdateBatch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (batch?.coachingFeeMode === 'MONTH_COVERAGE' && editBatchData.endDate < editBatchData.startDate) {
            toast.error('Batch end date must be on or after its start date');
            return;
        }
        const toastId = toast.loading('Updating batch...');
        try {
            // Convert fee to number
            const payload = {
                name: editBatchData.name,
                subject: editBatchData.subject,
                timeSlot: editBatchData.timeSlot,
                className: editBatchData.className,
                whatsappGroupLink: editBatchData.whatsappGroupLink,
                feeAmount: parseFloat(editBatchData.feeAmount) || 0,
                ...(batch?.coachingFeeMode === 'MONTH_COVERAGE' ? {
                    startDate: `${editBatchData.startDate}T00:00:00.000Z`,
                    endDate: `${editBatchData.endDate}T23:59:59.999Z`,
                } : {}),
            };
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
            if (data.coachingFeeMode === 'MONTH_COVERAGE') {
                try {
                    setMonthCoverageSummary(await loadMonthCoverageSummary({ batchId: data.id }));
                } catch {
                    setMonthCoverageSummary(null);
                    if (!silent) toast.error('Batch loaded, but fee progress is temporarily unavailable.');
                }
            } else {
                setMonthCoverageSummary(null);
            }
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

    const handleDownloadPDF = async (columns: string[]) => {
        const toastId = toast.loading('Generating PDF...');
        try {
            const token = localStorage.getItem('token');
            const query = new URLSearchParams({ columns: columns.join(',') });
            const res = await fetch(`${API_URL}/batches/${id}/download?${query.toString()}`, {
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
            setShowExportDialog(false);
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
            toast.error('Please set a WhatsApp group link first.');
            return;
        }

        const toastId = toast.loading('Sending invites to all batch students...');
        try {
            const res = await apiRequest<{ success: boolean; emailCount: number; whatsappCount: number; message: string }>(
                `/batches/${id}/whatsapp-invite`,
                'POST'
            );
            toast.success(res.message || 'Invites sent successfully!', { id: toastId });
        } catch (error: unknown) {
            toast.error(getErrorMessage(error, 'Failed to send invites'), { id: toastId });
        }
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

    const setStudentFeeStart = async (feeStartMonth: string) => {
        if (!feeStartStudent) return;
        const result = await confirmStudentFeeProfile(feeStartStudent.id, feeStartMonth);
        setBatch(previous => previous ? {
            ...previous,
            students: previous.students.map(student => student.id === feeStartStudent.id
                ? { ...student, monthCoverageProfile: result.profile }
                : student),
        } : null);
        setFeeStartStudent(null);
        toast.success('Fee start month saved');
    };

    const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);
    const [deleteInput, setDeleteInput] = useState('');
    const [leaveReason, setLeaveReason] = useState('');

    const handleDelete = (student: Student) => {
        setStudentToDelete(student);
        setDeleteInput('');
        setLeaveReason('');
    };

    const confirmDeleteStudent = async (e: React.FormEvent) => {
        e.preventDefault();
        if (deleteInput.toLowerCase() !== 'delete' || !studentToDelete) return;

        const toastId = toast.loading('Removing student...');
        try {
            const res = await apiRequest(`/students/${studentToDelete.id}/archive`, 'DELETE', { leaveReason });
            if (res.action === 'archived') {
                toast.success('Student has been archived', { id: toastId });
            } else {
                toast.success('Student permanently deleted', { id: toastId });
            }
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
            await apiRequest(`/students/${editingStudent.id}`, 'PUT', {
                name: editingStudent.name,
                parentName: editingStudent.parentName,
                parentWhatsapp: editingStudent.parentWhatsapp,
                parentEmail: editingStudent.parentEmail || '',
                schoolName: editingStudent.schoolName || '',
                humanId: editingStudent.humanId || undefined,
                additionalData: editingStudent.additionalData
            });
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
                try {
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${batch?.name || 'batch'}_stickers.pdf`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                } finally {
                    window.URL.revokeObjectURL(url);
                }
                toast.success('Stickers downloaded', { id: toastId });
            })
            .catch(() => toast.error("Failed to download stickers", { id: toastId }));
    };

    const handleAddInstallment = async (e: React.FormEvent) => {
        e.preventDefault();
        const toastId = toast.loading('Creating fee column...');
        try {
            await apiRequest(`/batches/${id}/installments`, 'POST', {
                name: newInstallment.name,
                amount: Number(newInstallment.amount)
            });
            toast.success('Fee column created', { id: toastId });
            setNewInstallment({ name: '', amount: '' });
            setFeeView('list');
            setTimeout(() => fetchDetails(), 300);
        } catch {
            toast.error('Failed to create fee column', { id: toastId });
        }
    };

    const handleCreateCustomInvoice = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!showCustomInvoice) return;
        if (customInvoice.existingInstallmentId === 'error') {
            toast.error('No invoice template selected');
            return;
        }
        const toastId = toast.loading('Creating custom invoice...');
        try {
            if (customInvoice.existingInstallmentId) {
                await apiRequest(`/fees/assign`, 'POST', {
                    studentId: showCustomInvoice.id,
                    installmentId: customInvoice.existingInstallmentId,
                    markAsPaid: customInvoice.markAsPaid
                });

                toast.success(
                    customInvoice.markAsPaid
                        ? 'Installment linked and marked as paid'
                        : 'Installment successfully linked to student',
                    { id: toastId }
                );
            } else {
                await apiRequest(`/fees/custom-invoices`, 'POST', {
                    name: customInvoice.name,
                    amount: Number(customInvoice.amount),
                    studentId: showCustomInvoice.id,
                    markAsPaid: customInvoice.markAsPaid
                });

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

    const handleAssignInstallment = async (studentId: string, installmentId: string) => {
        const toastId = toast.loading('Assigning fee column...');
        try {
            await apiRequest(`/fees/assign`, 'POST', {
                studentId,
                installmentId
            });
            toast.success('Fee assigned successfully', { id: toastId });
            setShowAssignConfirm(null);
            setTimeout(() => fetchDetails(), 300);
        } catch (error: unknown) {
            toast.error(getErrorMessage(error, 'Failed to assign fee'), { id: toastId });
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
            <Layout hideMobileNav>
                <div className="flex flex-col items-center justify-center h-96 gap-4">
                    <div className="flex gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-neutral-300 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-2.5 h-2.5 rounded-full bg-neutral-300 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-2.5 h-2.5 rounded-full bg-neutral-300 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <p className="text-xs font-bold text-app-text-tertiary uppercase tracking-widest">Loading Batch</p>
                </div>
            </Layout>
        );
    }

    if (!batch) return null;

    const monthStudentById = new Map((monthCoverageSummary?.students ?? []).map(student => [student.studentId, student]));

    return (
        <Layout hideMobileNav>
            <div className="mb-6 sm:mb-8">
                {/* ── Back navigation ── */}
                <button
                    onClick={() => navigate('/batches')}
                    className="inline-flex items-center gap-2 text-app-text-tertiary hover:text-black mb-8 transition-colors text-xs font-bold uppercase tracking-widest group"
                >
                    <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" /> Back to Batches
                </button>

                {/* ══════════════════════════════════════════════
                    HEADER BLOCK — editorial typographic approach
                ══════════════════════════════════════════════ */}
                <div>

                    {/* Title section — compact */}
                    <div className="bg-white border border-black/[0.06] rounded-2xl px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_4px_16px_rgba(0,0,0,0.04)] mb-4">
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex-1 min-w-0">
                                {/* Batch name headline */}
                                <h1 className="text-xl md:text-2xl font-black text-black tracking-tight leading-tight break-words mb-2">
                                    {batch.name}
                                </h1>

                                {/* Single meta line: MATH · CLASS 10 · 4–6pm · 53 Students */}
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                    <span className="text-[11px] font-black uppercase tracking-[0.1em] text-app-text-tertiary">{batch.subject}</span>
                                    {batch.className && (
                                        <>
                                            <span className="text-app-text-tertiary/40 text-[11px]">·</span>
                                            <span className="text-[11px] font-black uppercase tracking-[0.1em] text-app-text-tertiary">{batch.className}</span>
                                        </>
                                    )}
                                    {batch.timeSlot && (
                                        <>
                                            <span className="text-app-text-tertiary/40 text-[11px]">·</span>
                                            <span className="flex items-center gap-1 text-[11px] font-semibold text-app-text-tertiary">
                                                <Clock className="w-3 h-3" />{batch.timeSlot}
                                            </span>
                                        </>
                                    )}
                                    <span className="text-app-text-tertiary/40 text-[11px]">·</span>
                                    <span className="flex items-center gap-1 text-[11px] font-semibold text-app-text-tertiary">
                                        <Users className="w-3 h-3" />
                                        <span className="font-black text-black">{batch.students.length}</span> Students
                                    </span>
                                </div>
                            </div>

                            {/* Edit / Delete controls */}
                            <div className="flex gap-1.5 shrink-0">
                                <button onClick={openEditBatch} className="p-2 text-app-text-tertiary hover:text-black hover:bg-neutral-100 rounded-xl transition-all border border-black/[0.06]" title="Edit Batch Details">
                                    <Settings className="w-4 h-4" />
                                </button>
                                <button onClick={handleDeleteBatch} className="p-2 text-app-text-tertiary hover:text-danger hover:bg-red-50 rounded-xl transition-all border border-black/[0.06]" title="Delete Batch">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>


                    {/* ── Action strip ── */}
                    {/* Desktop: flex-wrap pill row | Mobile: horizontal scroll icon tabs */}
                    <div className="bg-white border border-black/[0.06] rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.06),0_4px_16px_rgba(0,0,0,0.04)] overflow-hidden">
                        {/* Mobile: icon tab strip — scrollable, no wrapping */}
                        <div className="flex md:hidden overflow-x-auto scrollbar-hide">
                            {/* Primary CTA — fills to left */}
                            <button
                                onClick={() => setShowAddStudent(true)}
                                className="flex-shrink-0 flex flex-col items-center justify-center gap-1 px-5 py-3.5 bg-black text-white active:bg-neutral-800 transition-colors"
                            >
                                <Plus className="w-5 h-5" />
                                <span className="text-[10px] font-black uppercase tracking-wide whitespace-nowrap">Add Student</span>
                            </button>

                            <div className="w-px bg-black/[0.06] self-stretch shrink-0" />

                            <button
                                onClick={() => setShowExportDialog(true)}
                                className="flex-shrink-0 flex flex-col items-center justify-center gap-1 px-5 py-3.5 text-app-text-secondary hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
                            >
                                <Download className="w-5 h-5" />
                                <span className="text-[10px] font-bold uppercase tracking-wide whitespace-nowrap">Download</span>
                            </button>

                            <div className="w-px bg-black/[0.06] self-stretch shrink-0" />

                            <button
                                onClick={handlePrintStickers}
                                className="flex-shrink-0 flex flex-col items-center justify-center gap-1 px-5 py-3.5 text-app-text-secondary hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
                            >
                                <Printer className="w-5 h-5" />
                                <span className="text-[10px] font-bold uppercase tracking-wide whitespace-nowrap">Stickers</span>
                            </button>

                            <div className="w-px bg-black/[0.06] self-stretch shrink-0" />

                            {batch.coachingFeeMode !== 'MONTH_COVERAGE' && <>
                                <button
                                    onClick={openFeeModal}
                                    className="flex-shrink-0 flex flex-col items-center justify-center gap-1 px-5 py-3.5 text-app-text-secondary hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
                                >
                                    <Settings className="w-5 h-5" />
                                    <span className="text-[10px] font-bold uppercase tracking-wide whitespace-nowrap">Fee Cols</span>
                                </button>
                                <div className="w-px bg-black/[0.06] self-stretch shrink-0" />
                            </>}


                            <button
                                onClick={openWhatsappModal}
                                className="flex-shrink-0 flex flex-col items-center justify-center gap-1 px-5 py-3.5 text-app-text-secondary hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
                            >
                                <Phone className="w-5 h-5" />
                                <span className="text-[10px] font-bold uppercase tracking-wide whitespace-nowrap">
                                    {batch.whatsappGroupLink ? 'WA Link' : 'Add WA'}
                                </span>
                            </button>

                            <div className="w-px bg-black/[0.06] self-stretch shrink-0" />

                            <button
                                onClick={handleSendWhatsappInvite}
                                disabled={!batch.whatsappGroupLink}
                                className="flex-shrink-0 flex flex-col items-center justify-center gap-1 px-5 py-3.5 text-emerald-600 hover:bg-emerald-50 active:bg-emerald-100 transition-colors disabled:opacity-40 disabled:pointer-events-none"
                            >
                                <Mail className="w-5 h-5" />
                                <span className="text-[10px] font-bold uppercase tracking-wide whitespace-nowrap">Invites</span>
                            </button>

                            {!batch.isRegistrationEnded && (
                                <>
                                    <div className="w-px bg-black/[0.06] self-stretch shrink-0" />
                                    <button
                                        onClick={() => setShowRegModal(true)}
                                        className="flex-shrink-0 flex flex-col items-center justify-center gap-1 px-5 py-3.5 text-app-text-secondary hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
                                    >
                                        <Share2 className="w-5 h-5" />
                                        <span className="text-[10px] font-bold uppercase tracking-wide whitespace-nowrap">Reg. QR</span>
                                    </button>
                                </>
                            )}
                        </div>

                        {/* Desktop: wrapped pill row */}
                        <div className="hidden md:flex flex-wrap gap-2 p-3">
                            <button
                                onClick={() => setShowAddStudent(true)}
                                className="flex items-center gap-2 bg-black hover:bg-neutral-800 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-all active:scale-[0.97] shadow-sm shadow-black/20"
                            >
                                <Plus className="w-4 h-4" /> Add Student
                            </button>
                            <div className="w-px bg-black/[0.06] self-stretch mx-1" />
                            <button onClick={() => setShowExportDialog(true)} className="flex items-center gap-2 bg-neutral-50 hover:bg-neutral-100 text-black text-sm font-semibold px-4 py-2.5 rounded-xl border border-black/[0.06] transition-all active:scale-[0.97]">
                                <Download className="w-4 h-4 text-app-text-tertiary" /> Download
                            </button>
                            <button onClick={handlePrintStickers} className="flex items-center gap-2 bg-neutral-50 hover:bg-neutral-100 text-black text-sm font-semibold px-4 py-2.5 rounded-xl border border-black/[0.06] transition-all active:scale-[0.97]">
                                <Printer className="w-4 h-4 text-app-text-tertiary" /> Stickers
                            </button>
                            {batch.coachingFeeMode !== 'MONTH_COVERAGE' && <button onClick={openFeeModal} className="flex items-center gap-2 bg-neutral-50 hover:bg-neutral-100 text-black text-sm font-semibold px-4 py-2.5 rounded-xl border border-black/[0.06] transition-all active:scale-[0.97]">
                                <Settings className="w-4 h-4 text-app-text-tertiary" /> Fee Cols
                            </button>}
                            <div className="w-px bg-black/[0.06] self-stretch mx-1" />
                            <button
                                onClick={openWhatsappModal}
                                className={cn(
                                    "flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl border transition-all active:scale-[0.97]",
                                    batch.whatsappGroupLink ? "bg-neutral-50 hover:bg-neutral-100 text-black border-black/[0.06]" : "bg-neutral-50 border-dashed border-neutral-300 text-app-text-secondary hover:border-black/30"
                                )}
                            >
                                <Phone className="w-4 h-4 text-app-text-tertiary" />
                                {batch.whatsappGroupLink ? 'WA Link' : 'Add WA Link'}
                            </button>
                            <button
                                onClick={handleSendWhatsappInvite}
                                disabled={!batch.whatsappGroupLink}
                                className="flex items-center gap-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-sm font-semibold px-4 py-2.5 rounded-xl border border-emerald-200 transition-all active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <Mail className="w-4 h-4" /> Send Invites
                            </button>
                            {!batch.isRegistrationEnded && (
                                <button
                                    onClick={() => setShowRegModal(true)}
                                    className="flex items-center gap-2 bg-neutral-50 hover:bg-neutral-100 text-black text-sm font-semibold px-4 py-2.5 rounded-xl border border-black/[0.06] transition-all active:scale-[0.97]"
                                >
                                    <Share2 className="w-4 h-4 text-app-text-tertiary" /> Registration QR
                                </button>
                            )}
                        </div>
                    </div>

                </div>
            </div>

            <div className="bg-white border border-black/[0.06] rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.06),0_4px_16px_rgba(0,0,0,0.04)] mt-6 overflow-hidden">
                {/* Search Header — sticky, mobile-first */}
                <div className="px-4 py-3 md:px-5 md:py-4 border-b border-black/[0.06] bg-white sticky top-0 z-10">
                    <div className="flex items-center gap-3">
                        {/* Search input — takes most space */}
                        <div className="relative flex-1">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-app-text-tertiary pointer-events-none" />
                            <input
                                type="text"
                                placeholder="Search students..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-neutral-50 border border-black/[0.06] pl-10 pr-4 py-2.5 rounded-xl text-sm text-app-text outline-none focus:border-black/20 focus:bg-white transition-all placeholder:text-app-text-tertiary font-medium"
                            />
                        </div>
                        {/* Font size toggle — hidden on mobile, visible md+ */}
                        <div className="hidden md:flex items-center gap-1 bg-neutral-50 border border-black/[0.06] p-1 rounded-xl">
                            <button
                                onClick={() => setTableFontSize(Math.max(0, tableFontSize - 1))}
                                disabled={tableFontSize === 0}
                                className="w-8 h-8 flex items-center justify-center text-app-text-tertiary hover:text-black hover:bg-white rounded-lg disabled:opacity-30 transition-all"
                                title="Decrease Font Size"
                            >
                                <span className="text-xs font-bold">A-</span>
                            </button>
                            <div className="w-px h-4 bg-black/[0.06]"></div>
                            <button
                                onClick={() => setTableFontSize(Math.min(4, tableFontSize + 1))}
                                disabled={tableFontSize === 4}
                                className="w-8 h-8 flex items-center justify-center text-app-text-tertiary hover:text-black hover:bg-white rounded-lg disabled:opacity-30 transition-all"
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
                                {formFields.map((field: any) => {
                                    const isStudentName = field.id === 'studentName';
                                    return (
                                        <th key={field.id} className={cn("bg-transparent", getCellPadding(), isStudentName ? "sticky left-0 z-30 bg-neutral-50 shadow-md border-r border-black/5" : "")} style={{ width: field.id === 'studentName' ? 'auto' : '1%', minWidth: field.id === 'parentEmail' ? '200px' : '180px', whiteSpace: 'nowrap' }}>
                                            {field.label}
                                        </th>
                                    );
                                })}
                                <th className={cn("bg-transparent text-center", getCellPadding())} style={{ minWidth: '80px', whiteSpace: 'nowrap' }}>Tests</th>
                                <th className={cn("bg-transparent text-center", getCellPadding())} style={{ minWidth: '80px', whiteSpace: 'nowrap' }}>Avg (10)</th>
                                {batch.coachingFeeMode === 'MONTH_COVERAGE' && <th className={cn("bg-transparent text-left", getCellPadding())} style={{ minWidth: '250px' }}>Fee Progress</th>}
                                {batch.feeInstallments?.filter(inst => !inst.studentId).map(inst => (
                                    <th key={inst.id} className={cn("bg-transparent text-center", getCellPadding())} style={{ minWidth: '100px', whiteSpace: 'nowrap' }}>
                                        <div className="flex flex-col items-center">
                                            <span>{inst.name}</span>
                                            <span className={cn("text-app-text-tertiary", getTextSizeClass('sub'))}>₹{inst.amount}</span>
                                        </div>
                                    </th>
                                ))}
                                {/* Dynamic headers for custom (student-specific) invoices */}
                                {customInvoiceColumns.map(inst => (
                                    <th key={`${inst.name}-${inst.amount}`} className={cn("bg-transparent text-center", getCellPadding())} style={{ minWidth: '100px', whiteSpace: 'nowrap' }}>
                                        <div className="flex flex-col items-center">
                                            <span>{inst.name}</span>
                                            <span className={cn("text-app-text-tertiary", getTextSizeClass('sub'))}>₹{inst.amount}</span>
                                        </div>
                                    </th>
                                ))}
                                <th className={cn("border-b border-black/5 text-center", getCellPadding())} style={{ minWidth: '120px', whiteSpace: 'nowrap' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-black/5 text-app-text">
                            {filteredStudents.map((student) => {
                                // Dynamic Fee Logic (Virtual Allocation)
                                const instPaidMap = getInstallmentPaidMap(student, batch.feeInstallments || []);

                                return (
                                    <tr key={student.id} className="hover:bg-neutral-50/70 transition-colors group">
                                        <td className={cn("font-mono font-semibold text-app-text-tertiary", getCellPadding(), getTextSizeClass('sub'))} style={{ whiteSpace: 'nowrap' }}>
                                            {student.humanId || '-'}
                                        </td>
                                        {formFields.map((field: any, index: number) => {
                                            let content: React.ReactNode = '-';
                                            let rawText = '';
                                            const isStudentNameField = index === 0;
                                            
                                            if (field.system || isStudentNameField) {
                                                if (isStudentNameField) { 
                                                    content = (
                                                        <div className="text-left font-semibold text-app-text group-hover:text-black transition-colors">
                                                            <span>{student.name}</span>
                                                            {batch.coachingFeeMode === 'MONTH_COVERAGE' && student.monthCoverageProfile?.status === 'PENDING_SETUP' && (
                                                                <button
                                                                    type="button"
                                                                    onClick={event => { event.stopPropagation(); setFeeStartStudent(student); }}
                                                                    className="ml-2 rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-800 hover:bg-amber-200"
                                                                >
                                                                    Set fee start
                                                                </button>
                                                            )}
                                                        </div>
                                                    );
                                                    rawText = student.name; 
                                                }
                                                else if (field.id === 'schoolName') { content = student.schoolName || '-'; rawText = student.schoolName || ''; }
                                                else if (field.id === 'parentName') { content = student.parentName || '-'; rawText = student.parentName || ''; }
                                                else if (field.id === 'parentWhatsapp') {
                                                    content = <span className="flex items-center gap-1 text-app-text-secondary"><Phone className={cn("text-success", getIconSizeClass())} /> {student.parentWhatsapp}</span>;
                                                    rawText = student.parentWhatsapp;
                                                }
                                                else if (field.id === 'parentEmail') {
                                                    content = student.parentEmail ? <span className="flex items-center gap-1 text-app-text-secondary"><Mail className={cn("text-accent", getIconSizeClass())} /> {student.parentEmail}</span> : '-';
                                                    rawText = student.parentEmail || '';
                                                }
                                            } else {
                                                const val = student.additionalData?.[field.id];
                                                content = val ? String(val) : '-';
                                                rawText = val ? String(val) : '';
                                            }

                                            const isStudentName = isStudentNameField;

                                            return (
                                                <td key={field.id} onClick={(e) => { if (isStudentName) { e.stopPropagation(); setSelectedStudentId(student.id); } }} className={cn(
                                                    isStudentName ? "font-semibold text-app-text sticky left-0 z-10 bg-white group-hover:bg-neutral-50 shadow-md border-r border-black/5 cursor-pointer" : "text-app-text-secondary truncate", 
                                                    getCellPadding(), 
                                                    isStudentName ? getTextSizeClass('body') : getTextSizeClass('sub')
                                                )} style={{ whiteSpace: 'nowrap', maxWidth: isStudentName ? 'none' : '200px' }} title={rawText}>
                                                    {content}
                                                </td>
                                            );
                                        })}
                                        <td className={cn("text-center", getCellPadding())}>
                                            <button onClick={() => setViewMarksId(student.id)} className="p-2 hover:bg-black/5 rounded-lg transition-colors inline-flex items-center justify-center text-app-text-secondary hover:text-app-text" title="View Marks">
                                                <Eye className={getIconSizeClass()} />
                                            </button>
                                        </td>
                                        <td className={cn("text-center font-bold text-app-text", getCellPadding())}>{getStudentAverage(student)}</td>
                                        {batch.coachingFeeMode === 'MONTH_COVERAGE' && (() => {
                                            const fee = monthStudentById.get(student.id);
                                            return <td className={cn("text-left", getCellPadding())}>
                                                {!fee ? <span className="text-xs font-bold text-app-text-tertiary">Progress unavailable</span> : fee.setupRequired ? (
                                                    <button onClick={() => setFeeStartStudent(student)} className="rounded-xl bg-amber-100 px-3 py-2 text-xs font-black text-amber-800">Set fee start</button>
                                                ) : (
                                                    <div className="min-w-[220px]">
                                                        <div className="flex items-center justify-between gap-3"><span className="text-xs font-black">{fee.receivedMonths} / {fee.applicableMonths} months received</span>{fee.pendingMonths > 0 && <button onClick={() => setMonthPaymentStudent(fee)} className="rounded-lg bg-black px-2.5 py-1.5 text-[10px] font-black text-white">Record</button>}</div>
                                                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${fee.progressPercent}%` }} /></div>
                                                        <p className={`mt-1.5 text-[10px] font-bold ${fee.overdueMonths ? 'text-red-600' : 'text-app-text-tertiary'}`}>{monthStatusCopy(fee.nextPendingMonth, fee.overdueMonths ? 'OVERDUE' : 'PENDING')}</p>
                                                    </div>
                                                )}
                                            </td>;
                                        })()}
                                        {batch.feeInstallments?.filter(inst => !inst.studentId).map(inst => {
                                            const payments = student.feePayments?.filter(p => p.installmentId === inst.id) || [];
                                            // Use calculated amount from map, fallback to simple check if missing (shouldn't happen)
                                            const paidAmount = instPaidMap[inst.id] !== undefined ? instPaidMap[inst.id] : payments.reduce((sum, p) => sum + p.amountPaid, 0);
                                            const isFullyPaid = paidAmount >= inst.amount;
                                            const isPartiallyPaid = paidAmount > 0 && !isFullyPaid;

                                            const studentJoinDate = getStudentJoinDate(student.createdAt);
                                            const instDate = new Date(inst.createdAt).setHours(0, 0, 0, 0);
                                            const isAssigned = student.feeAssignments?.some(a => a.installmentId === inst.id);
                                            const isNotApplicable = instDate < studentJoinDate && payments.length === 0 && !isAssigned;

                                            if (isNotApplicable) {
                                                return (
                                                    <td key={inst.id} className={cn("text-center", getCellPadding())}>
                                                        <button 
                                                            onClick={() => {
                                                                setShowAssignConfirm({ studentId: student.id, installmentId: inst.id });
                                                            }}
                                                            className={cn("rounded-full flex items-center justify-center transition-all mx-auto text-app-text-tertiary border border-dashed border-app-text-tertiary/50 hover:border-black hover:text-black hover:bg-black/5 hover:scale-105", getPaymentButtonSize())}
                                                            title="Assign this past fee to student"
                                                        >
                                                            <Plus className={getPaymentInnerSize()} />
                                                        </button>
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
                                        {customInvoiceColumns.map(template => {
                                            const inst = batch.feeInstallments?.find(invoice =>
                                                invoice.studentId === student.id &&
                                                invoice.name === template.name &&
                                                invoice.amount === template.amount
                                            );

                                            if (!inst) {
                                                return <td key={`${student.id}-${template.name}-${template.amount}`} className={cn("text-center text-app-text-tertiary", getCellPadding())} title="Not applicable">-</td>;
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
                                        })}
                                        <td className={cn("text-center border-b border-black/5", getCellPadding())} >
                                            <div className="flex items-center justify-center gap-1.5">
                                                {batch.coachingFeeMode !== 'MONTH_COVERAGE' && (
                                                    <button
                                                        onClick={() => { setShowCustomInvoice(student); setCustomInvoice({ name: '', amount: '', markAsPaid: false, existingInstallmentId: '' }); }}
                                                        className="p-2 bg-neutral-50 hover:bg-black text-black hover:text-white rounded-xl border border-black/5 transition-colors"
                                                        title="Custom Invoice"
                                                    >
                                                        <Receipt className="w-4 h-4" />
                                                    </button>
                                                )}
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
                                    <td colSpan={4 + formFields.length + (batch.feeInstallments?.filter(i => !i.studentId).length || 0) + customInvoiceColumns.length} className="p-20 text-center text-app-text-tertiary flex flex-col items-center justify-center">
                                        <Users className="w-12 h-12 mb-4 opacity-20" />
                                        <p>{searchQuery ? 'No students match your search.' : 'No students in this batch yet.'}</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Mobile Student List — premium card layout */}
                <div className="md:hidden">
                    <div className="divide-y divide-black/[0.05]">
                        {filteredStudents.map((student) => {
                            const instPaidMap = getInstallmentPaidMap(student, batch.feeInstallments || []);
                            const avg = getStudentAverage(student);

                            return (
                                <div key={student.id} className="bg-white transition-colors">
                                    {/* Card body */}
                                    <div className="px-4 pt-4 pb-3">
                                        {/* Row 1: Name (Clickable for profile) + Avg score */}
                                        <div className="flex items-start justify-between gap-3 mb-2">
                                            <div className="flex-1 min-w-0">
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedStudentId(student.id);
                                                    }}
                                                    className="group/name flex items-center gap-1.5 text-left transition-opacity active:opacity-70 max-w-full focus:outline-none"
                                                    title="View student profile"
                                                >
                                                    <h4 className="font-black text-[17px] text-black tracking-tight leading-snug break-words group-hover/name:underline decoration-neutral-400 underline-offset-2">
                                                        {student.name}
                                                    </h4>
                                                    <ChevronRight className="w-4 h-4 text-app-text-tertiary group-hover/name:text-black shrink-0 transition-transform group-hover/name:translate-x-0.5" />
                                                </button>
                                                {batch.coachingFeeMode === 'MONTH_COVERAGE' && student.monthCoverageProfile?.status === 'PENDING_SETUP' && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setFeeStartStudent(student)}
                                                        className="mt-2 rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-amber-800"
                                                    >
                                                        Set fee start
                                                    </button>
                                                )}
                                                {student.humanId && (
                                                    <span className="inline-flex items-center gap-1 mt-1 font-mono text-[11px] bg-neutral-100 border border-black/[0.06] px-2 py-0.5 rounded-md text-app-text-secondary font-bold">
                                                        {student.humanId}
                                                    </span>
                                                )}
                                            </div>
                                            {/* Avg score badge */}
                                            <div className="shrink-0 flex flex-col items-end">
                                                <span className="text-[10px] font-black uppercase tracking-wider text-app-text-tertiary">Avg</span>
                                                <span className="font-mono font-black text-xl text-black leading-none">{avg}</span>
                                                <span className="text-[9px] text-app-text-tertiary font-bold">/10</span>
                                            </div>
                                        </div>

                                        {/* Row 2: School & Parent meta */}
                                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-app-text-secondary mb-3">
                                            {formFields.map((field: any) => {
                                                if (field.id === 'studentName' || field.id === 'parentWhatsapp' || field.id === 'parentEmail') return null;
                                                let val = '';
                                                if (field.id === 'schoolName') val = student.schoolName || '';
                                                else if (field.id === 'parentName') val = student.parentName || '';
                                                else if (field.system) return null; // Fallback
                                                else val = student.additionalData?.[field.id] ? String(student.additionalData[field.id]) : '';
                                                
                                                if (!val) return null;

                                                return (
                                                    <span key={field.id} className="flex items-center gap-1.5" title={field.label}>
                                                        {field.id === 'schoolName' ? <Book className="w-3.5 h-3.5 text-app-text-tertiary shrink-0" /> : <User className="w-3.5 h-3.5 text-app-text-tertiary shrink-0" />}
                                                        <span className="truncate max-w-[130px] text-xs font-medium text-app-text-secondary">
                                                            <span className="text-[10px] text-app-text-tertiary uppercase mr-1 hidden">{field.label}:</span>
                                                            {val}
                                                        </span>
                                                    </span>
                                                );
                                            })}
                                        </div>

                                        {batch.coachingFeeMode === 'MONTH_COVERAGE' && (() => {
                                            const fee = monthStudentById.get(student.id);
                                            if (!fee || fee.setupRequired) return null;
                                            return <div className="mb-3 rounded-xl bg-neutral-50 p-3">
                                                <div className="flex items-center justify-between gap-3"><span className="text-xs font-black">{fee.receivedMonths} / {fee.applicableMonths} months received</span>{fee.pendingMonths > 0 && <button onClick={() => setMonthPaymentStudent(fee)} className="rounded-lg bg-black px-3 py-2 text-[10px] font-black text-white">Record payment</button>}</div>
                                                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-200"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${fee.progressPercent}%` }} /></div>
                                                <p className={`mt-1.5 text-[10px] font-bold ${fee.overdueMonths ? 'text-red-600' : 'text-app-text-tertiary'}`}>{monthStatusCopy(fee.nextPendingMonth, fee.overdueMonths ? 'OVERDUE' : 'PENDING')}</p>
                                            </div>;
                                        })()}

                                        {/* Fee pills — horizontal scroll */}
                                        {batch.coachingFeeMode !== 'MONTH_COVERAGE' && batch.feeInstallments && batch.feeInstallments.filter(i => !i.studentId).length > 0 && (
                                            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-4 px-4 mb-1">
                                                {batch.feeInstallments.filter((inst) => {
                                                    if (inst.studentId) return false;
                                                    const studentJoinDate = getStudentJoinDate(student.createdAt);
                                                    const instDate = new Date(inst.createdAt).setHours(0, 0, 0, 0);
                                                    const hasPayment = student.feePayments?.some(p => p.installmentId === inst.id);
                                                    const isAssigned = student.feeAssignments?.some(a => a.installmentId === inst.id);
                                                    return instDate >= studentJoinDate || hasPayment || isAssigned;
                                                }).map((inst) => {
                                                    const payments = student.feePayments?.filter(p => p.installmentId === inst.id) || [];
                                                    const paidAmount = instPaidMap[inst.id] !== undefined ? instPaidMap[inst.id] : payments.reduce((sum, p) => sum + p.amountPaid, 0);
                                                    const isFullyPaid = paidAmount >= inst.amount;
                                                    const isPartiallyPaid = paidAmount > 0 && !isFullyPaid;

                                                    return (
                                                        <button
                                                            key={inst.id}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
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
                                                                "flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-bold whitespace-nowrap transition-all active:scale-95",
                                                                isFullyPaid
                                                                    ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                                                                    : isPartiallyPaid
                                                                        ? "bg-amber-50 border-amber-200 text-amber-700"
                                                                        : "bg-neutral-50 border-black/[0.06] text-app-text-secondary"
                                                            )}
                                                        >
                                                            <div className={cn(
                                                                "w-4 h-4 rounded-full flex items-center justify-center border-[1.5px] shrink-0",
                                                                isFullyPaid
                                                                    ? "border-emerald-600 bg-emerald-600"
                                                                    : isPartiallyPaid
                                                                        ? "border-amber-500"
                                                                        : "border-neutral-300"
                                                            )}>
                                                                {isFullyPaid && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                                                                {isPartiallyPaid && <div className="text-[6px] font-black text-amber-600">P</div>}
                                                            </div>
                                                            <div className="flex flex-col items-start leading-none">
                                                                <span>{inst.name}</span>
                                                                {isPartiallyPaid && (
                                                                    <span className="text-[9px] text-amber-600 font-bold mt-0.5">₹{inst.amount - paidAmount} due</span>
                                                                )}
                                                                {!isFullyPaid && !isPartiallyPaid && (
                                                                    <span className="text-[9px] text-app-text-tertiary font-bold mt-0.5">₹{inst.amount}</span>
                                                                )}
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                                {/* Custom student-specific invoices */}
                                                {batch.feeInstallments.filter(inst => inst.studentId === student.id).map((inst) => {
                                                    const payments = student.feePayments?.filter(p => p.installmentId === inst.id) || [];
                                                    const paidAmount = payments.reduce((sum, p) => sum + p.amountPaid, 0);
                                                    const isFullyPaid = paidAmount >= inst.amount;
                                                    const isPartiallyPaid = paidAmount > 0 && !isFullyPaid;
                                                    return (
                                                        <button
                                                            key={inst.id}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                if (isFullyPaid) {
                                                                    if (payments.length > 0) setViewPayment({ student, installment: inst, payments });
                                                                    else toast.success('Paid via Account Balance');
                                                                } else {
                                                                    const remaining = inst.amount - paidAmount;
                                                                    setPaymentModal({ student, installment: { ...inst, amount: remaining }, date: new Date().toISOString().split('T')[0] });
                                                                }
                                                            }}
                                                            className={cn(
                                                                "flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-bold whitespace-nowrap transition-all active:scale-95",
                                                                isFullyPaid ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                                                                    : isPartiallyPaid ? "bg-amber-50 border-amber-200 text-amber-700"
                                                                        : "bg-neutral-50 border-black/[0.06] text-app-text-secondary"
                                                            )}
                                                        >
                                                            <div className={cn(
                                                                "w-4 h-4 rounded-full flex items-center justify-center border-[1.5px] shrink-0",
                                                                isFullyPaid ? "border-emerald-600 bg-emerald-600" : isPartiallyPaid ? "border-amber-500" : "border-neutral-300"
                                                            )}>
                                                                {isFullyPaid && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                                                                {isPartiallyPaid && <div className="text-[6px] font-black text-amber-600">P</div>}
                                                            </div>
                                                            <span>{inst.name}</span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>

                                    {/* Bottom action row — native-app style, 48px touch targets */}
                                    <div className="flex border-t border-black/[0.05]">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setViewMarksId(student.id); }}
                                            className="flex-1 flex flex-col items-center justify-center py-3 gap-1 text-app-text-secondary hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
                                        >
                                            <Eye className="w-4 h-4" />
                                            <span className="text-[9px] font-bold uppercase tracking-wide">Marks</span>
                                        </button>
                                        <div className="w-px bg-black/[0.05] self-stretch" />
                                        <a
                                            href={`tel:${student.parentWhatsapp}`}
                                            onClick={(e) => e.stopPropagation()}
                                            className="flex-1 flex flex-col items-center justify-center py-3 gap-1 text-emerald-600 hover:bg-emerald-50 active:bg-emerald-100 transition-colors"
                                        >
                                            <Phone className="w-4 h-4" />
                                            <span className="text-[9px] font-bold uppercase tracking-wide">Call</span>
                                        </a>
                                        <div className="w-px bg-black/[0.05] self-stretch" />
                                        {batch.coachingFeeMode !== 'MONTH_COVERAGE' && <>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setShowCustomInvoice(student); setCustomInvoice({ name: '', amount: '', markAsPaid: false, existingInstallmentId: '' }); }}
                                                className="flex-1 flex flex-col items-center justify-center py-3 gap-1 text-app-text-secondary hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
                                            >
                                                <Receipt className="w-4 h-4" />
                                                <span className="text-[9px] font-bold uppercase tracking-wide">Invoice</span>
                                            </button>
                                            <div className="w-px bg-black/[0.05] self-stretch" />
                                        </>}
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setEditingStudent(student); }}
                                            className="flex-1 flex flex-col items-center justify-center py-3 gap-1 text-app-text-secondary hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
                                        >
                                            <Edit2 className="w-4 h-4" />
                                            <span className="text-[9px] font-bold uppercase tracking-wide">Edit</span>
                                        </button>
                                        <div className="w-px bg-black/[0.05] self-stretch" />
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDelete(student); }}
                                            className="flex-1 flex flex-col items-center justify-center py-3 gap-1 text-red-400 hover:bg-red-50 active:bg-red-100 transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                            <span className="text-[9px] font-bold uppercase tracking-wide">Delete</span>
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {filteredStudents.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-20 px-8 text-center">
                            <div className="w-16 h-16 rounded-2xl bg-neutral-50 border border-black/[0.06] flex items-center justify-center mb-4">
                                <Users className="w-7 h-7 text-app-text-tertiary" />
                            </div>
                            <p className="font-bold text-app-text text-base mb-1">
                                {searchQuery ? 'No results found' : 'No students yet'}
                            </p>
                            <p className="text-sm text-app-text-tertiary">
                                {searchQuery ? `Nothing matched "${searchQuery}"` : 'Add your first student to get started.'}
                            </p>
                        </div>
                    )}
                </div>
            </div>

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

                                    {/* Additional Data Section */}
                                    {editingStudent.additionalData && Object.keys(editingStudent.additionalData).length > 0 && (
                                        <div className="space-y-4">
                                            <div className="flex items-center gap-2 mb-2">
                                                <div className="p-1.5 bg-blue-500/10 rounded-lg text-blue-500"><Book className="w-4 h-4" /></div>
                                                <h4 className="text-sm font-bold text-app-text tracking-tight">Additional Information</h4>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {Object.entries(editingStudent.additionalData).map(([key, value]) => {
                                                    const formattedLabel = key.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                                                    return (
                                                        <div key={key} className="space-y-1.5 md:col-span-2">
                                                            <label className="text-xs font-bold text-app-text-tertiary uppercase tracking-wider ml-1">{formattedLabel}</label>
                                                            <div className="relative">
                                                                <input
                                                                    value={String(value || '')}
                                                                    onChange={(e) => {
                                                                        const newVal = e.target.value;
                                                                        setEditingStudent(prev => prev ? {
                                                                            ...prev,
                                                                            additionalData: {
                                                                                ...prev.additionalData,
                                                                                [key]: newVal
                                                                            }
                                                                        } : null);
                                                                    }}
                                                                    className="w-full bg-white border-[1.5px] border-black/5 rounded-xl px-4 py-2.5 text-app-text focus:ring-2 focus:ring-accent/10 focus:border-accent outline-none transition-all placeholder:text-app-text-tertiary/50"
                                                                />
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

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
                            className="!bg-white border-[1.5px] border-black/5 rounded-[32px] p-5 md:p-8 max-w-4xl w-full shadow-2xl relative z-10 max-h-[90vh] overflow-y-auto scrollbar-hide"
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
                                    <h3 className="text-xl font-bold text-app-text">Remove Student?</h3>
                                    <p className="text-app-text-secondary mt-1 text-sm">
                                        If the student has fee or attendance records, they will be <span className="font-bold text-app-text">Archived</span>. Otherwise, they will be permanently deleted.
                                    </p>
                                </div>
                                <button type="button" onClick={() => setStudentToDelete(null)} className="text-app-text-tertiary hover:text-app-text p-1 rounded-full hover:bg-neutral-50/50"><X className="w-5 h-5" /></button>
                            </div>

                            <form onSubmit={confirmDeleteStudent} className="space-y-4">
                                <div>
                                    <label className="text-xs font-bold text-app-text-tertiary uppercase tracking-wider mb-2 block">
                                        Reason for leaving (Optional)
                                    </label>
                                    <input
                                        value={leaveReason}
                                        onChange={(e) => setLeaveReason(e.target.value)}
                                        className="w-full bg-white border-[1.5px] border-black/5 rounded-xl px-4 py-3 text-app-text focus:ring-2 focus:ring-black/20 outline-none transition-all mb-4 placeholder:text-app-text-tertiary/50"
                                        placeholder="e.g. Graduated, Transferred, Dropped out"
                                    />
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

                                    {batch.coachingFeeMode === 'MONTH_COVERAGE' && (
                                        <div className="grid grid-cols-2 gap-5">
                                            <label className="space-y-2">
                                                <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-app-text-secondary"><CalendarDays className="h-4 w-4" /> Start date</span>
                                                <input
                                                    type="date"
                                                    required
                                                    value={editBatchData.startDate}
                                                    onChange={event => setEditBatchData({ ...editBatchData, startDate: event.target.value })}
                                                    className="w-full rounded-xl border-[1.5px] border-black/5 bg-white px-3 py-3 text-app-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/10"
                                                />
                                            </label>
                                            <label className="space-y-2">
                                                <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-app-text-secondary"><CalendarDays className="h-4 w-4" /> End date</span>
                                                <input
                                                    type="date"
                                                    min={editBatchData.startDate || undefined}
                                                    required
                                                    value={editBatchData.endDate}
                                                    onChange={event => setEditBatchData({ ...editBatchData, endDate: event.target.value })}
                                                    className="w-full rounded-xl border-[1.5px] border-black/5 bg-white px-3 py-3 text-app-text outline-none focus:border-accent focus:ring-2 focus:ring-accent/10"
                                                />
                                            </label>
                                        </div>
                                    )}

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
                                            Saving updates the link for future student auto-invites. To send this link to current students in the batch, use the "Send Link to All Students" button below.
                                        </p>
                                    </div>

                                    <div className="flex items-center justify-between p-4 bg-neutral-50/50 rounded-xl border-[1.5px] border-black/5">
                                        <div className="space-y-0.5">
                                            <label className="text-sm font-bold text-app-text">Auto-Send Invites</label>
                                            <p className="text-xs text-app-text-tertiary w-11/12">Automatically send WhatsApp & Email invites when new students join.</p>
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

                                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-black/5">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setShowWhatsAppModal(false);
                                                handleSendWhatsappInvite();
                                            }}
                                            disabled={!batch?.whatsappGroupLink}
                                            className="w-full sm:w-auto bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-4 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center transition-all active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none"
                                        >
                                            <Mail className="w-4 h-4 mr-2" /> Send Link to All Students
                                        </button>
                                        <button
                                            type="submit"
                                            className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white border border-green-600 px-6 py-2.5 rounded-xl font-bold text-sm flex items-center justify-center shadow-lg shadow-green-600/20 transition-all active:scale-[0.98]"
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

            {feeStartStudent && batch.startDate && batch.endDate && (
                <StudentFeeStartDialog
                    student={{
                        id: feeStartStudent.id,
                        name: feeStartStudent.name,
                        joinedAt: feeStartStudent.createdAt ?? batch.startDate,
                    }}
                    batch={{ startDate: batch.startDate, endDate: batch.endDate }}
                    defaultMonth={(() => {
                        const start = dateMonth(batch.startDate!);
                        const end = dateMonth(batch.endDate!);
                        const joined = dateMonth(feeStartStudent.createdAt ?? batch.startDate!);
                        return joined < start ? start : joined > end ? end : joined;
                    })()}
                    onClose={() => setFeeStartStudent(null)}
                    onConfirm={setStudentFeeStart}
                />
            )}

            {monthPaymentStudent && (
                <MonthCoveragePaymentDialog
                    student={monthPaymentStudent}
                    onClose={() => setMonthPaymentStudent(null)}
                    onSaved={() => {
                        setMonthPaymentStudent(null);
                        void fetchDetails(true);
                    }}
                />
            )}

            {/* ═══════════════════════════════════════════
                UNIFIED FEE COLUMNS MODAL
                List → Add | Edit | Delete-Confirm
                All views live in one sheet — no modal-hopping.
            ═══════════════════════════════════════════ */}
            <AnimatePresence>
                {showFeeModal && (
                    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
                        {/* Backdrop — only closes from list view */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/50 backdrop-blur-md"
                            onClick={feeView === 'list' ? closeFeeModal : undefined}
                        />

                        {/* Sheet */}
                        <motion.div
                            initial={{ opacity: 0, y: 40, scale: 0.97 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 40, scale: 0.97 }}
                            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                            className="!bg-white border border-black/[0.06] rounded-t-[2rem] sm:rounded-[2rem] w-full sm:max-w-md shadow-2xl relative z-10 flex flex-col overflow-hidden"
                            style={{ maxHeight: 'min(90vh, 620px)' }}
                        >
                            <AnimatePresence mode="wait">

                                {/* ── LIST VIEW ── */}
                                {feeView === 'list' && (
                                    <motion.div key="fee-list" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.16 }} className="flex flex-col flex-1 overflow-hidden">
                                        {/* Header */}
                                        <div className="flex items-center justify-between px-6 py-5 border-b border-black/[0.06] shrink-0">
                                            <div>
                                                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-app-text-tertiary mb-0.5">Manage</p>
                                                <h3 className="text-xl font-black text-black tracking-tight">Fee Columns</h3>
                                            </div>
                                            <button onClick={closeFeeModal} className="p-2 hover:bg-neutral-100 rounded-xl transition-colors text-app-text-tertiary hover:text-black">
                                                <X className="w-5 h-5" />
                                            </button>
                                        </div>

                                        {/* Column list */}
                                        <div className="overflow-y-auto flex-1 p-4 sm:p-5">
                                            {batch?.feeInstallments && batch.feeInstallments.filter(i => !i.studentId).length > 0 ? (
                                                <div className="space-y-2">
                                                    {[...batch.feeInstallments]
                                                        .filter(i => !i.studentId)
                                                        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
                                                        .map((inst, idx) => (
                                                            <motion.div key={inst.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.04 }} className="flex items-center justify-between p-4 rounded-2xl border border-black/[0.06] bg-neutral-50/60 hover:bg-neutral-50 transition-colors group">
                                                                <div className="flex flex-col min-w-0">
                                                                    <span className="font-bold text-black text-sm truncate">{inst.name}</span>
                                                                    <span className="text-xs text-app-text-tertiary mt-0.5">₹{inst.amount.toLocaleString('en-IN')}</span>
                                                                </div>
                                                                <div className="flex items-center gap-1 ml-3 shrink-0">
                                                                    <button onClick={() => { setEditingInstallment(inst); setFeeView('edit'); }} className="p-2 hover:bg-blue-50 text-app-text-tertiary hover:text-blue-600 rounded-xl transition-colors" title="Edit">
                                                                        <Edit2 className="w-4 h-4" />
                                                                    </button>
                                                                    <button onClick={() => { setInstallmentToDelete(inst); setFeeView('delete-confirm'); }} className="p-2 hover:bg-red-50 text-app-text-tertiary hover:text-red-500 rounded-xl transition-colors" title="Delete">
                                                                        <Trash2 className="w-4 h-4" />
                                                                    </button>
                                                                </div>
                                                            </motion.div>
                                                        ))}
                                                </div>
                                            ) : (
                                                <div className="flex flex-col items-center justify-center py-14 text-center">
                                                    <div className="w-14 h-14 rounded-2xl bg-neutral-100 flex items-center justify-center mb-4">
                                                        <Settings className="w-6 h-6 text-app-text-tertiary" />
                                                    </div>
                                                    <p className="font-bold text-black">No fee columns yet</p>
                                                    <p className="text-sm text-app-text-tertiary mt-1">Add columns like "April–June" or "Q1 Fees"</p>
                                                </div>
                                            )}
                                        </div>

                                        {/* Footer CTA */}
                                        <div className="px-5 py-4 border-t border-black/[0.06] shrink-0">
                                            <button onClick={() => { setNewInstallment({ name: '', amount: '' }); setFeeView('add'); }} className="w-full bg-black hover:bg-neutral-800 text-white py-3.5 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98]">
                                                <Plus className="w-4 h-4" /> Add Fee Column
                                            </button>
                                        </div>
                                    </motion.div>
                                )}

                                {/* ── ADD VIEW ── */}
                                {feeView === 'add' && (
                                    <motion.div key="fee-add" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.16 }} className="flex flex-col flex-1 overflow-hidden">
                                        <div className="flex items-center gap-3 px-6 py-5 border-b border-black/[0.06] shrink-0">
                                            <button onClick={() => setFeeView('list')} className="p-2 hover:bg-neutral-100 rounded-xl transition-colors text-app-text-tertiary hover:text-black -ml-1">
                                                <ArrowLeft className="w-5 h-5" />
                                            </button>
                                            <div>
                                                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-app-text-tertiary mb-0.5">New</p>
                                                <h3 className="text-xl font-black text-black tracking-tight">Add Fee Column</h3>
                                            </div>
                                        </div>
                                        <form onSubmit={handleAddInstallment} className="flex flex-col flex-1 overflow-hidden">
                                            <div className="flex-1 overflow-y-auto p-6 space-y-5">
                                                <div className="space-y-2">
                                                    <label className="text-xs font-black text-app-text-tertiary uppercase tracking-[0.1em]">Column Name</label>
                                                    <input value={newInstallment.name} onChange={(e) => setNewInstallment({ ...newInstallment, name: e.target.value })} className="w-full bg-neutral-50 border border-black/[0.08] rounded-2xl px-4 py-3.5 text-black font-semibold focus:ring-2 focus:ring-black/10 focus:border-black/30 outline-none transition-all placeholder:text-app-text-tertiary/50 placeholder:font-normal" placeholder="e.g. April – June 2025" autoFocus required />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-xs font-black text-app-text-tertiary uppercase tracking-[0.1em]">Amount (₹)</label>
                                                    <div className="relative">
                                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-app-text-tertiary font-bold text-sm">₹</span>
                                                        <input type="number" inputMode="numeric" value={newInstallment.amount} onChange={(e) => setNewInstallment({ ...newInstallment, amount: e.target.value })} className="w-full bg-neutral-50 border border-black/[0.08] rounded-2xl pl-8 pr-4 py-3.5 text-black font-semibold focus:ring-2 focus:ring-black/10 focus:border-black/30 outline-none transition-all placeholder:text-app-text-tertiary/50 placeholder:font-normal" placeholder="2000" required />
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="px-5 py-4 border-t border-black/[0.06] shrink-0 flex gap-3">
                                                <button type="button" onClick={() => setFeeView('list')} className="flex-1 py-3.5 rounded-2xl font-bold border border-black/[0.08] text-app-text-secondary hover:bg-neutral-50 transition-all">Cancel</button>
                                                <button type="submit" className="flex-1 bg-black hover:bg-neutral-800 text-white py-3.5 rounded-2xl font-bold transition-all active:scale-[0.98]">Create Column</button>
                                            </div>
                                        </form>
                                    </motion.div>
                                )}

                                {/* ── EDIT VIEW ── */}
                                {feeView === 'edit' && editingInstallment && (
                                    <motion.div key="fee-edit" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.16 }} className="flex flex-col flex-1 overflow-hidden">
                                        <div className="flex items-center gap-3 px-6 py-5 border-b border-black/[0.06] shrink-0">
                                            <button onClick={() => { setEditingInstallment(null); setFeeView('list'); }} className="p-2 hover:bg-neutral-100 rounded-xl transition-colors text-app-text-tertiary hover:text-black -ml-1">
                                                <ArrowLeft className="w-5 h-5" />
                                            </button>
                                            <div className="min-w-0">
                                                <p className="text-[10px] font-black uppercase tracking-[0.14em] text-app-text-tertiary mb-0.5">Editing</p>
                                                <h3 className="text-xl font-black text-black tracking-tight truncate">{editingInstallment.name}</h3>
                                            </div>
                                        </div>
                                        <form onSubmit={async (e) => { await handleUpdateInstallment(e); setFeeView('list'); }} className="flex flex-col flex-1 overflow-hidden">
                                            <div className="flex-1 overflow-y-auto p-6 space-y-5">
                                                <div className="space-y-2">
                                                    <label className="text-xs font-black text-app-text-tertiary uppercase tracking-[0.1em]">Column Name</label>
                                                    <input value={editingInstallment.name} onChange={(e) => setEditingInstallment({ ...editingInstallment, name: e.target.value })} className="w-full bg-neutral-50 border border-black/[0.08] rounded-2xl px-4 py-3.5 text-black font-semibold focus:ring-2 focus:ring-black/10 focus:border-black/30 outline-none transition-all" autoFocus required />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-xs font-black text-app-text-tertiary uppercase tracking-[0.1em]">Amount (₹)</label>
                                                    <div className="relative">
                                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-app-text-tertiary font-bold text-sm">₹</span>
                                                        <input type="number" inputMode="numeric" value={editingInstallment.amount} onChange={(e) => setEditingInstallment({ ...editingInstallment, amount: Number(e.target.value) })} className="w-full bg-neutral-50 border border-black/[0.08] rounded-2xl pl-8 pr-4 py-3.5 text-black font-semibold focus:ring-2 focus:ring-black/10 focus:border-black/30 outline-none transition-all" required />
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="px-5 py-4 border-t border-black/[0.06] shrink-0 flex gap-3">
                                                <button type="button" onClick={() => { setEditingInstallment(null); setFeeView('list'); }} className="flex-1 py-3.5 rounded-2xl font-bold border border-black/[0.08] text-app-text-secondary hover:bg-neutral-50 transition-all">Cancel</button>
                                                <button type="submit" className="flex-1 bg-black hover:bg-neutral-800 text-white py-3.5 rounded-2xl font-bold transition-all active:scale-[0.98]">Save Changes</button>
                                            </div>
                                        </form>
                                    </motion.div>
                                )}

                                {/* ── DELETE CONFIRM VIEW ── */}
                                {feeView === 'delete-confirm' && installmentToDelete && (
                                    <motion.div key="fee-delete" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.15 }} className="flex flex-col p-6 sm:p-8">
                                        <div className="w-14 h-14 rounded-2xl bg-red-50 border border-red-100 text-red-500 flex items-center justify-center mb-5">
                                            <Trash2 className="w-6 h-6" />
                                        </div>
                                        <h3 className="text-xl font-black text-black mb-2">Delete Fee Column?</h3>
                                        <p className="text-sm text-app-text-secondary leading-relaxed mb-8">
                                            Permanently delete <span className="font-bold text-black">"{installmentToDelete.name}"</span>. Any payments linked to this column will also be removed.
                                        </p>
                                        <div className="flex gap-3">
                                            <button onClick={() => { setInstallmentToDelete(null); setFeeView('list'); }} className="flex-1 py-3.5 rounded-2xl font-bold border border-black/[0.08] text-app-text-secondary hover:bg-neutral-50 transition-all">Go Back</button>
                                            <button onClick={async () => { await handleDeleteInstallment(); setFeeView('list'); }} className="flex-1 py-3.5 rounded-2xl font-bold bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-500/20 transition-all active:scale-[0.98]">Delete</button>
                                        </div>
                                    </motion.div>
                                )}

                            </AnimatePresence>
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

            {/* Assign Confirmation Modal */}
            <AnimatePresence>
                {showAssignConfirm && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pt-[calc(5.5rem+env(safe-area-inset-top))] pb-10 md:p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                            onClick={() => setShowAssignConfirm(null)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="!bg-white border-[1.5px] border-black/5 rounded-[32px] p-6 max-w-sm w-full shadow-2xl relative z-10 text-center"
                        >
                            <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Plus className="w-8 h-8" />
                            </div>
                            <h3 className="text-xl font-bold text-app-text mb-2">Assign Past Fee?</h3>
                            <p className="text-sm text-app-text-secondary mb-6 leading-relaxed">
                                Are you sure you want to assign this past fee to the student?
                            </p>
                            <div className="flex flex-col gap-2">
                                <button
                                    onClick={() => handleAssignInstallment(showAssignConfirm.studentId, showAssignConfirm.installmentId)}
                                    className="w-full bg-black hover:bg-neutral-800 text-white font-semibold py-3.5 rounded-xl transition-all active:scale-[0.98]"
                                >
                                    Yes, Assign Fee
                                </button>
                                <button
                                    onClick={() => setShowAssignConfirm(null)}
                                    className="w-full bg-neutral-100 hover:bg-neutral-200 text-app-text font-semibold py-3.5 rounded-xl transition-all active:scale-[0.98]"
                                >
                                    Cancel
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
                                            disabled={invoiceTemplates.length === 0}
                                            onClick={() => {
                                                setCustomInvoice({ ...customInvoice, existingInstallmentId: invoiceTemplates[0]?.id || 'error' });
                                            }}
                                            className={cn(
                                                "flex-1 py-2 rounded-xl text-sm font-bold border transition-colors",
                                                customInvoice.existingInstallmentId ? "bg-black text-white border-black" : "bg-neutral-50 text-app-text-tertiary border-black/5 hover:border-black/20",
                                                invoiceTemplates.length === 0 && "opacity-50 cursor-not-allowed hover:border-black/5"
                                            )}
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
                                                ...invoiceTemplates.map(inst => ({
                                                    value: inst.id,
                                                    label: `${inst.name} — ₹${inst.amount}`
                                                })),
                                                ...(invoiceTemplates.length === 0 ? [
                                                    { value: 'error', label: 'No invoice templates available' }
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
                                        {customInvoice.existingInstallmentId
                                            ? (customInvoice.markAsPaid ? 'Link & Mark Paid' : 'Link Invoice')
                                            : (customInvoice.markAsPaid ? 'Create & Mark Paid' : 'Create Invoice')}
                                    </button>
                                </div>
                                <div className="h-4 md:hidden"></div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* ═══════════════════════════════════════════
                REGISTRATION QR MODAL
            ═══════════════════════════════════════════ */}
            <BatchRegistrationQrModal
                isOpen={showRegModal}
                batch={batch}
                onClose={() => setShowRegModal(false)}
                onToggleRegistration={handleToggleRegistration}
                onEndRegistration={handleEndRegistration}
            />

            {showExportDialog && (
                <BatchExportDialog
                    columns={exportColumns}
                    onClose={() => setShowExportDialog(false)}
                    onDownload={handleDownloadPDF}
                />
            )}

            <StudentProfileDrawer
                studentId={selectedStudentId}
                onClose={() => setSelectedStudentId(null)}
            />
        </Layout >
    );
}
