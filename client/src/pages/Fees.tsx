/* eslint-disable */
import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, API_URL } from '../utils/api';
import Layout from '../components/Layout';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Loader, X, TrendingUp, TrendingDown, IndianRupee, Mail, History, CheckCircle, Download, ArrowUpRight, FileText, ArrowUpDown, ChevronDown, Check, Receipt, MessageSquare, Send, ChevronRight, AlertCircle, Phone, Calendar, User, Square, CheckSquare } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '../utils/cn';
import UpiVerificationList from '../components/UpiVerificationList';

interface FeeBreakdown {
    name: string;
    due: number;
}

interface FeeSummary {
    id: string;
    humanId: string | null;
    name: string;
    batchName: string;
    totalFee: number;
    totalPaid: number;
    balance: number;
    lastPaymentDate: string | null;
    parentEmail?: string;
    breakdown?: FeeBreakdown[]; // New field
    oldestDue?: string | null;
}

interface Transaction {
    id: string;
    studentName: string;
    batchName: string;
    amount: number;
    date: string;
    type: string;
}

interface CustomInvoice {
    id: string;
    name: string;
    amount: number;
    createdAt: string;
    studentId: string;
    studentName: string;
    studentHumanId: string | null;
    batchId: string | null;
    batchName: string;
    totalPaid: number;
    isPaid: boolean;
    lastPaymentDate: string | null;
}

const Fees: React.FC = () => {
    const queryClient = useQueryClient();
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');

    useEffect(() => {
        const t = setTimeout(() => setDebouncedSearchTerm(searchTerm), 300);
        return () => clearTimeout(t);
    }, [searchTerm]);

    const [selectedBatch, setSelectedBatch] = useState('All');
    const [viewMode, setViewMode] = useState<'defaulters' | 'recent' | 'upi' | 'custom'>('defaulters');

    const [selectedStudent, setSelectedStudent] = useState<FeeSummary | null>(null);
    const [paymentAmount, setPaymentAmount] = useState('');
    const [processing, setProcessing] = useState(false);
    const [reportMonth, setReportMonth] = useState(new Date().getMonth() + 1);
    const [reportYear, setReportYear] = useState(new Date().getFullYear());
    const [reportBatch, setReportBatch] = useState('All');
    const [reportSort, setReportSort] = useState('amount');
    const [listSort, setListSort] = useState<'amount' | 'date'>('amount');
    const [showSortMenu, setShowSortMenu] = useState(false);
    const [showReportsModal, setShowReportsModal] = useState(false);
    const [showBatchMenu, setShowBatchMenu] = useState(false);

    // New Redesign States
    const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
    const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null);
    const [bulkSending, setBulkSending] = useState(false);
    const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);

    // Reset selection and expansion on view/filter changes
    useEffect(() => {
        setSelectedStudentIds([]);
        setExpandedStudentId(null);
    }, [viewMode, selectedBatch, debouncedSearchTerm]);

    // Report Dropdown States
    const [showReportBatchMenu, setShowReportBatchMenu] = useState(false);
    const [showReportSortMenu, setShowReportSortMenu] = useState(false);
    const [showMonthMenu, setShowMonthMenu] = useState(false);
    const [showYearMenu, setShowYearMenu] = useState(false);

    const { data: students = [], isLoading: feesLoading } = useQuery({
        queryKey: ['fees'],
        queryFn: () => api.get<FeeSummary[]>('/fees')
    });

    const { data: transactions = [], isLoading: transactionsLoading } = useQuery({
        queryKey: ['transactions'],
        queryFn: () => api.get<Transaction[]>('/fees/recent')
    });

    const { data: customInvoices = [], isLoading: customInvoicesLoading } = useQuery({
        queryKey: ['customInvoices'],
        queryFn: () => api.get<CustomInvoice[]>('/fees/custom-invoices')
    });

    const loading = feesLoading || transactionsLoading || customInvoicesLoading;

    const handlePayment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedStudent || !paymentAmount) return;

        setProcessing(true);
        const toastId = toast.loading('Processing payment...');

        try {
            await api.post('/fees/pay', {
                studentId: selectedStudent.id,
                amount: paymentAmount
            });
            await queryClient.invalidateQueries({ queryKey: ['fees'] });
            await queryClient.invalidateQueries({ queryKey: ['transactions'] });
            toast.success(`Payment of ₹${paymentAmount} recorded!`, { id: toastId });
            setSelectedStudent(null);
            setPaymentAmount('');
        } catch {
            toast.error('Payment failed. Please try again.', { id: toastId });
        } finally {
            setProcessing(false);
        }
    };

    const handleSendReminder = async (student: FeeSummary) => {
        const toastId = toast.loading(`Sending reminder to ${student.name}...`);
        try {
            await api.post('/fees/remind', {
                studentId: student.id,
                amountDue: student.balance
            });
            toast.success('Email reminder sent!', { id: toastId });
        } catch {
            toast.error('Failed to send reminder. Check email setup.', { id: toastId });
        }
    };

    const handleSendBulkReminders = async () => {
        if (selectedStudentIds.length === 0) return;
        setBulkSending(true);
        const toastId = toast.loading(`Sending reminders to ${selectedStudentIds.length} students...`);
        let successCount = 0;
        let failCount = 0;

        for (const id of selectedStudentIds) {
            const student = students.find(s => s.id === id);
            if (!student) continue;
            try {
                await api.post('/fees/remind', {
                    studentId: student.id,
                    amountDue: student.balance
                });
                successCount++;
            } catch {
                failCount++;
            }
        }

        setBulkSending(false);
        setSelectedStudentIds([]);

        if (failCount === 0) {
            toast.success(`Successfully sent all ${successCount} reminders!`, { id: toastId });
        } else if (successCount === 0) {
            toast.error(`Failed to send reminders. Check email setup.`, { id: toastId });
        } else {
            toast.success(`Sent ${successCount} reminders. ${failCount} failed.`, { id: toastId });
        }
    };

    const batches = Array.from(new Set(students.map(s => s.batchName))).filter(b => b !== 'N/A').sort();

    // PERF: Memoize filtering to prevent lag when typing in search
    const filteredStudents = React.useMemo(() => {
        return students.filter(s => {
            const matchesSearch = s.name.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
                (s.humanId && s.humanId.toLowerCase().includes(debouncedSearchTerm.toLowerCase()));
            const matchesBatch = selectedBatch === 'All' || s.batchName === selectedBatch;
            const matchesView = viewMode === 'defaulters' ? s.balance > 0 : true; // all defaults to showing all if somehow not recent
            return matchesSearch && matchesBatch && matchesView;
        }).sort((a, b) => {
            if (listSort === 'date') {
                const dateA = a.oldestDue ? new Date(a.oldestDue).getTime() : Number.MAX_VALUE;
                const dateB = b.oldestDue ? new Date(b.oldestDue).getTime() : Number.MAX_VALUE;
                return dateA - dateB; // Ascending (Oldest First)
            }
            return b.balance - a.balance; // Descending Amount
        });
    }, [students, debouncedSearchTerm, selectedBatch, viewMode, listSort]);

    const filteredTransactions = React.useMemo(() => {
        return transactions.filter(tx => {
            const matchesSearch = tx.studentName.toLowerCase().includes(debouncedSearchTerm.toLowerCase());
            const matchesBatch = selectedBatch === 'All' || tx.batchName === selectedBatch;
            return matchesSearch && matchesBatch;
        });
    }, [transactions, debouncedSearchTerm, selectedBatch]);

    // Corrected Logic: Only count positive balances as "Due".
    // "Balance" = Total Fee - Total Paid. If negative, it means surplus. We shouldn't subtract surplus from total pending dues of others.
    const stats = {
        totalDue: students.reduce((sum, s) => sum + Math.max(0, s.balance), 0),
        totalCollected: students.reduce((sum, s) => sum + s.totalPaid, 0),
        collectionRate: 0
    };

    // Calculate collection rate based on (Collected / (Collected + Due)) because Total Fee might vary if we have ad-hoc fees.
    // Actually, (Collected / Total Expected) is standard.
    // Total Expected = Collected + Outstanding Dues.
    const totalExpected = stats.totalCollected + stats.totalDue;
    stats.collectionRate = totalExpected > 0
        ? Math.min(100, Math.round((stats.totalCollected / totalExpected) * 100))
        : 0;

    return (
        <Layout title="Fee Management">
            {/* Design Improvements:
                1. Cleaner Stats cards with no border and shadow.
                2. Unified List layout.
                3. Better typography and whitespace.
            *            {/* Compact Stats Header */}
            <div className="mb-8 bg-white rounded-[24px] p-5 md:p-6 relative overflow-hidden border border-black/5 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_4px_16px_rgba(0,0,0,0.04)]">
                <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, black 1px, transparent 0)', backgroundSize: '16px 16px' }}></div>
                
                <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div className="flex items-center gap-8 md:gap-12">
                        <div className="space-y-1">
                            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                Total Collected
                            </div>
                            <div className="text-2xl md:text-3xl font-black tracking-tight font-mono text-gray-900">
                                ₹{stats.totalCollected.toLocaleString()}
                            </div>
                        </div>
                        
                        <div className="space-y-1">
                            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                                Outstanding Dues
                            </div>
                            <div className="text-xl md:text-2xl font-black text-rose-500 tracking-tight font-mono">
                                ₹{stats.totalDue.toLocaleString()}
                            </div>
                        </div>
                    </div>

                    <div className="w-full md:w-72 space-y-1.5">
                        <div className="flex justify-end">
                            <span className="text-xl font-black text-emerald-600 font-mono leading-none">{stats.collectionRate}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <motion.div 
                                initial={{ width: 0 }}
                                animate={{ width: `${stats.collectionRate}%` }}
                                transition={{ duration: 1.2, ease: "easeOut" }}
                                className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full"
                            ></motion.div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="space-y-6">
                {/* Main List Section */}
                <div className="space-y-6">

                    {/* Toolbar */}
                    <div className="bg-white p-4 md:p-6 border-[1.5px] border-black/5 rounded-[28px] shadow-sm flex flex-col gap-4">
                        {/* iOS Segmented Control */}
                        <div className="overflow-x-auto custom-scrollbar pb-1 -mx-2 px-2 md:mx-0 md:px-0">
                            <div className="flex bg-neutral-100/80 border border-black/5 p-1 rounded-[20px] w-[640px] md:w-full min-w-full relative">
                                {/* Smooth Sliding Pill Background */}
                                <div 
                                    className="absolute top-1 bottom-1 left-1 rounded-[16px] bg-white shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
                                    style={{
                                        width: 'calc(25% - 2px)',
                                        transform: `translateX(${
                                            viewMode === 'defaulters' ? '0%' :
                                            viewMode === 'recent' ? '100%' :
                                            viewMode === 'upi' ? '200%' :
                                            '300%'
                                        })`
                                    }}
                                />

                                <button
                                    onClick={() => setViewMode('defaulters')}
                                    className={cn("flex-1 min-w-0 px-2 md:px-5 py-2.5 rounded-[16px] text-center text-[13px] font-bold transition-all whitespace-nowrap relative z-10", viewMode === 'defaulters' ? "text-gray-900" : "text-gray-500 hover:text-gray-700")}
                                >
                                    Pending Dues
                                </button>
                                <button
                                    onClick={() => setViewMode('recent')}
                                    className={cn("flex-1 min-w-0 px-2 md:px-5 py-2.5 rounded-[16px] text-center text-[13px] font-bold transition-all whitespace-nowrap relative z-10", viewMode === 'recent' ? "text-gray-900" : "text-gray-500 hover:text-gray-700")}
                                >
                                    Recent Payments
                                </button>
                                <button
                                    onClick={() => setViewMode('upi')}
                                    className={cn("flex-1 min-w-0 px-2 md:px-5 py-2.5 rounded-[16px] text-center text-[13px] font-bold transition-all whitespace-nowrap relative z-10", viewMode === 'upi' ? "text-gray-900" : "text-gray-500 hover:text-gray-700")}
                                >
                                    UPI Approvals
                                </button>
                                <button
                                    onClick={() => setViewMode('custom')}
                                    className={cn("flex-1 min-w-0 px-2 md:px-5 py-2.5 rounded-[16px] text-center text-[13px] font-bold transition-all whitespace-nowrap flex items-center justify-center gap-1.5 relative z-10", viewMode === 'custom' ? "text-gray-900" : "text-gray-500 hover:text-gray-700")}
                                >
                                    Custom Invoices
                                    {customInvoices.length > 0 && (
                                        <span className={cn("px-1.5 py-0.5 rounded-full text-[10px] font-bold relative z-20", viewMode === 'custom' ? "bg-amber-100 text-amber-700" : "bg-gray-200 text-gray-500")}>
                                            {customInvoices.length}
                                        </span>
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Search & Filter */}
                        <div className="flex flex-col md:flex-row gap-3">
                            <div className="relative flex-1">
                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Search student..."
                                    className="w-full bg-gray-50 border-[1.5px] border-transparent focus:bg-white focus:border-black/10 rounded-2xl pl-10 pr-4 py-3 text-[14px] outline-none transition-all placeholder:text-gray-400"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <div className="flex gap-2 w-full md:w-auto flex-wrap">
                                <div className="relative flex-1 md:flex-none">
                                    <button
                                        onClick={() => setShowBatchMenu(!showBatchMenu)}
                                        className="w-full md:w-48 bg-gray-50 hover:bg-white border-[1.5px] border-transparent hover:border-black/10 focus:border-black/20 rounded-2xl px-4 py-3 text-[13px] font-bold text-gray-600 outline-none transition-all flex items-center justify-between gap-2"
                                    >
                                        <span className="truncate">{selectedBatch === 'All' ? 'All Batches' : selectedBatch}</span>
                                        <ChevronDown className={cn("w-4 h-4 text-gray-400 transition-transform", showBatchMenu && "rotate-180")} />
                                    </button>

                                    {showBatchMenu && (
                                        <>
                                            <div className="fixed inset-0 z-10" onClick={() => setShowBatchMenu(false)}></div>
                                            <div className="absolute left-0 top-full mt-2 w-full md:w-56 bg-white rounded-2xl shadow-xl border border-black/5 p-1.5 z-20 max-h-64 overflow-y-auto custom-scrollbar">
                                                <button
                                                    onClick={() => { setSelectedBatch('All'); setShowBatchMenu(false); }}
                                                    className={cn("w-full text-left px-3 py-2 rounded-xl text-sm font-bold flex justify-between items-center transition-colors", selectedBatch === 'All' ? "bg-blue-50 text-blue-600" : "text-gray-700 hover:bg-gray-50")}
                                                >
                                                    All Batches
                                                    {selectedBatch === 'All' && <Check className="w-4 h-4" />}
                                                </button>
                                                {batches.map(b => (
                                                    <button
                                                        key={b}
                                                        onClick={() => { setSelectedBatch(b); setShowBatchMenu(false); }}
                                                        className={cn("w-full text-left px-3 py-2 rounded-xl text-sm font-bold flex justify-between items-center transition-colors", selectedBatch === b ? "bg-blue-50 text-blue-600" : "text-gray-700 hover:bg-gray-50")}
                                                    >
                                                        <span className="truncate">{b}</span>
                                                        {selectedBatch === b && <Check className="w-4 h-4" />}
                                                    </button>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>

                                <div className="relative">
                                    <button
                                        onClick={() => setShowSortMenu(!showSortMenu)}
                                        className={cn("p-3 rounded-2xl transition-all border-[1.5px]", showSortMenu ? "bg-gray-900 text-white border-gray-900" : "bg-gray-50 hover:bg-white text-gray-500 hover:text-gray-900 border-transparent hover:border-gray-200")}
                                        title="Sort List"
                                    >
                                        <ArrowUpDown className="w-4 h-4" />
                                    </button>
                                    {showSortMenu && (
                                        <>
                                            <div className="fixed inset-0 z-10" onClick={() => setShowSortMenu(false)}></div>
                                            <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-2xl shadow-xl border border-black/5 p-1.5 z-20">
                                                <div className="px-3 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Sort List By</div>
                                                <button
                                                    onClick={() => { setListSort('amount'); setShowSortMenu(false); }}
                                                    className={cn("w-full text-left px-3 py-2 rounded-xl text-sm font-bold flex justify-between items-center", listSort === 'amount' ? "bg-blue-50 text-blue-600" : "text-gray-700 hover:bg-gray-50")}
                                                >
                                                    Highest Amount
                                                    {listSort === 'amount' && <CheckCircle className="w-4 h-4" />}
                                                </button>
                                                <button
                                                    onClick={() => { setListSort('date'); setShowSortMenu(false); }}
                                                    className={cn("w-full text-left px-3 py-2 rounded-xl text-sm font-bold flex justify-between items-center", listSort === 'date' ? "bg-blue-50 text-blue-600" : "text-gray-700 hover:bg-gray-50")}
                                                >
                                                    Oldest Pending
                                                    {listSort === 'date' && <CheckCircle className="w-4 h-4" />}
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>

                                <button
                                    onClick={() => setShowReportsModal(true)}
                                    className="bg-gray-900 text-white px-5 py-3 rounded-2xl text-[13px] font-bold shadow-lg shadow-gray-200 hover:bg-black transition-all flex items-center gap-2 active:scale-95 whitespace-nowrap"
                                >
                                    <FileText className="w-4 h-4" /> Reports
                                </button>
                            </div>
                        </div>
                    </div>

                    {viewMode === 'recent' ? (
                        <div className="bg-white rounded-[28px] shadow-sm border border-black/5 p-6 md:p-8 min-h-[500px]">
                            <div className="flex items-center justify-between mb-8">
                                <h3 className="font-extrabold text-neutral-800 flex items-center gap-2.5 text-lg">
                                    <History className="w-5 h-5 text-neutral-500" /> Recent Transactions
                                </h3>
                                <span className="text-xs font-bold text-neutral-400 bg-neutral-50 px-3 py-1 rounded-full border border-neutral-100/50">
                                    {filteredTransactions.length} Completed
                                </span>
                            </div>
                            {filteredTransactions.length === 0 ? (
                                <div className="text-center text-neutral-400 text-sm py-20 flex flex-col items-center justify-center">
                                    <History className="w-12 h-12 text-neutral-200 mb-3" />
                                    <p className="font-semibold">No recent transactions found</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {filteredTransactions.map(tx => {
                                        const initials = tx.studentName
                                            ? tx.studentName.split(/\s+/).filter(Boolean).map(n => n[0]).join('').substring(0, 2).toUpperCase()
                                            : '??';
                                        return (
                                            <div 
                                                key={tx.id} 
                                                onClick={() => setSelectedTransaction(tx)}
                                                className="group flex items-center justify-between p-4 rounded-2xl bg-neutral-50/50 hover:bg-white hover:shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] transition-all duration-300 border border-transparent hover:border-black/[0.04] cursor-pointer"
                                            >
                                                <div className="flex items-center gap-4 flex-1 min-w-0">
                                                    {/* Initials Badge */}
                                                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-400 text-white flex items-center justify-center font-bold text-sm shadow-sm shrink-0">
                                                        {initials}
                                                    </div>

                                                    {/* Content Details */}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-sm font-bold text-neutral-800 group-hover:text-emerald-600 transition-colors duration-200 truncate">
                                                            {tx.studentName}
                                                        </div>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <div className="text-[11px] text-neutral-400 font-bold tracking-wider truncate">
                                                                {tx.batchName}
                                                            </div>
                                                            <span className="w-1 h-1 rounded-full bg-neutral-200 shrink-0"></span>
                                                            <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest shrink-0 whitespace-nowrap">
                                                                {tx.type.replace('Installment: ', '')}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Amount & Date */}
                                                <div className="text-right flex flex-col items-end shrink-0 pl-4">
                                                    <div className="text-base font-black text-emerald-600 font-mono">
                                                        +₹{tx.amount.toLocaleString()}
                                                    </div>
                                                    <div className="text-[11px] text-neutral-400 font-bold mt-1">
                                                        {new Date(tx.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    ) : viewMode === 'defaulters' ? (
                    <div className="bg-white rounded-[28px] shadow-sm overflow-hidden min-h-[500px] border border-black/5">
                        {loading ? (
                            <div className="flex flex-col items-center justify-center h-96 text-gray-400">
                                <Loader className="w-8 h-8 animate-spin mb-4 text-blue-500" />
                                <p className="font-medium text-sm">Loading records...</p>
                            </div>
                        ) : (
                            <div className="flex flex-col">
                                {/* Defaulters List Header with Select All checkbox */}
                                <div className="px-5 py-4 bg-neutral-50/80 border-b border-neutral-100 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <button 
                                            onClick={() => {
                                                if (selectedStudentIds.length === filteredStudents.length) {
                                                    setSelectedStudentIds([]);
                                                } else {
                                                    setSelectedStudentIds(filteredStudents.map(s => s.id));
                                                }
                                            }}
                                            className="text-neutral-500 hover:text-neutral-800 transition-colors"
                                        >
                                            {selectedStudentIds.length === filteredStudents.length && filteredStudents.length > 0 ? (
                                                <CheckSquare className="w-5 h-5 text-neutral-900" />
                                            ) : (
                                                <Square className="w-5 h-5 text-neutral-400" />
                                            )}
                                        </button>
                                        <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">
                                            {filteredStudents.length} {filteredStudents.length === 1 ? 'Defaulter' : 'Defaulters'}
                                        </span>
                                    </div>
                                    <span className="text-[11px] text-neutral-400 font-bold">
                                        Total Pending: ₹{filteredStudents.reduce((sum, s) => sum + s.balance, 0).toLocaleString()}
                                    </span>
                                </div>

                                <div className="divide-y divide-black/[0.03]">
                                    {filteredStudents.length === 0 ? (
                                        <div className="p-16 text-center">
                                            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                                <CheckCircle className="w-8 h-8 text-gray-300" />
                                            </div>
                                            <p className="text-gray-500 font-medium">No pending dues found.</p>
                                        </div>
                                    ) : (
                                        filteredStudents.map(student => (
                                            <div key={student.id} className="flex flex-col">
                                                {/* Main List Row */}
                                                <div 
                                                    onClick={() => setExpandedStudentId(expandedStudentId === student.id ? null : student.id)}
                                                    className={cn(
                                                        "p-4 sm:p-5 hover:bg-neutral-50/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4 group cursor-pointer",
                                                        selectedStudentIds.includes(student.id) && "bg-neutral-50/70"
                                                    )}
                                                >
                                                    <div className="flex items-center gap-4">
                                                        {/* Checkbox and letter avatar group */}
                                                        <div 
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setSelectedStudentIds(prev => 
                                                                    prev.includes(student.id) 
                                                                        ? prev.filter(id => id !== student.id) 
                                                                        : [...prev, student.id]
                                                                );
                                                            }}
                                                            className="relative shrink-0 w-9 h-9"
                                                        >
                                                            {selectedStudentIds.includes(student.id) ? (
                                                                <div className="w-9 h-9 rounded-xl bg-neutral-900 text-white flex items-center justify-center border border-neutral-800 shadow-sm transition-all scale-100">
                                                                    <Check className="w-4 h-4" />
                                                                </div>
                                                            ) : (
                                                                <>
                                                                    <div className="w-9 h-9 rounded-xl bg-neutral-100 text-neutral-600 flex items-center justify-center font-bold text-sm shrink-0 shadow-inner group-hover:opacity-0 absolute inset-0 transition-opacity">
                                                                        {student.name.charAt(0)}
                                                                    </div>
                                                                    <div className="w-9 h-9 rounded-xl border-2 border-neutral-300 hover:border-neutral-800 flex items-center justify-center transition-opacity opacity-0 group-hover:opacity-100 absolute inset-0 bg-white">
                                                                        <div className="w-1.5 h-1.5 rounded-sm bg-transparent"></div>
                                                                    </div>
                                                                </>
                                                            )}
                                                        </div>

                                                        {/* Student Name, ID, Batch and Dues Breakdown tags */}
                                                        <div>
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <span className="font-bold text-neutral-900 text-[15px]">{student.name}</span>
                                                                <ChevronRight className={cn("w-3.5 h-3.5 text-neutral-400 transition-transform hidden sm:inline-block", expandedStudentId === student.id && "rotate-90")} />
                                                            </div>
                                                            <div className="text-[12px] text-neutral-500 mt-0.5 font-medium flex items-center gap-1.5 flex-wrap">
                                                                <span>{student.humanId}</span>
                                                                <span className="w-1 h-1 bg-neutral-300 rounded-full"></span>
                                                                <span>{student.batchName}</span>
                                                                {student.lastPaymentDate && (
                                                                    <>
                                                                        <span className="w-1 h-1 bg-neutral-300 rounded-full"></span>
                                                                        <span className="text-neutral-400 font-normal">Paid: {new Date(student.lastPaymentDate).toLocaleDateString()}</span>
                                                                    </>
                                                                )}
                                                            </div>

                                                            {/* Color-coded breakdowns of what is due */}
                                                            {student.breakdown && student.breakdown.length > 0 && (
                                                                <div className="mt-2 flex flex-wrap gap-1.5">
                                                                    {student.breakdown.map((item, idx) => (
                                                                        <span key={idx} className="px-2 py-0.5 bg-rose-50 text-rose-600 text-[10px] rounded-md font-bold border border-rose-100/50">
                                                                            {item.name}: ₹{item.due.toLocaleString()}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center justify-between sm:justify-end gap-6 w-full sm:w-auto pl-13 sm:pl-0">
                                                        <div className="text-left sm:text-right">
                                                            {student.balance > 0 ? (
                                                                <div className="flex flex-col sm:items-end">
                                                                    <span className="font-mono font-black text-rose-500 text-lg tracking-tight">₹{student.balance.toLocaleString()}</span>
                                                                    <span className="text-[11px] text-rose-400 font-bold">{student.breakdown?.length || 0} Dues Pending</span>
                                                                </div>
                                                            ) : (
                                                                <span className="font-mono font-black text-green-500 text-lg tracking-tight">₹0</span>
                                                            )}
                                                        </div>

                                                        {/* Quick action buttons / Chevron indicator */}
                                                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                                            {student.balance > 0 ? (
                                                                <>
                                                                    <button
                                                                        onClick={() => handleSendReminder(student)}
                                                                        className="p-2.5 text-neutral-400 hover:text-neutral-900 bg-neutral-50 hover:bg-neutral-100 rounded-xl transition-all border border-neutral-200/50"
                                                                        title="Send Reminder"
                                                                    >
                                                                        <Mail className="w-4 h-4" />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => {
                                                                            setSelectedStudent(student);
                                                                            setPaymentAmount(student.balance.toString());
                                                                        }}
                                                                        className="px-4 py-2 bg-neutral-900 hover:bg-black text-white text-[13px] font-bold rounded-xl shadow-md transition-all active:scale-95 whitespace-nowrap"
                                                                    >
                                                                        Collect
                                                                    </button>
                                                                </>
                                                            ) : (
                                                                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 border border-green-100 text-green-600 rounded-xl text-xs font-bold">
                                                                    <CheckCircle className="w-3.5 h-3.5" /> Paid
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Expanded Ledger Detail Panel */}
                                                <AnimatePresence>
                                                    {expandedStudentId === student.id && (
                                                        <motion.div
                                                            initial={{ height: 0, opacity: 0 }}
                                                            animate={{ height: "auto", opacity: 1 }}
                                                            exit={{ height: 0, opacity: 0 }}
                                                            transition={{ duration: 0.25, ease: "easeInOut" }}
                                                            className="overflow-hidden bg-neutral-50/50 border-t border-neutral-100"
                                                        >
                                                            <div className="p-4 sm:p-5 grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                                                                {/* Detailed Ledger List */}
                                                                <div className="space-y-3">
                                                                    <h4 className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-1.5">
                                                                        <FileText className="w-3.5 h-3.5" /> Pending Ledger Details
                                                                    </h4>
                                                                    <div className="bg-white border border-neutral-200/60 rounded-2xl overflow-hidden shadow-sm">
                                                                        <div className="divide-y divide-neutral-100 text-xs">
                                                                            {student.breakdown && student.breakdown.length > 0 ? (
                                                                                student.breakdown.map((item, idx) => (
                                                                                    <div key={idx} className="flex justify-between items-center px-4 py-3 hover:bg-neutral-50/30 transition-colors">
                                                                                        <span className="font-medium text-neutral-600">{item.name}</span>
                                                                                        <span className="font-mono font-bold text-rose-500">₹{item.due.toLocaleString()}</span>
                                                                                    </div>
                                                                                ))
                                                                            ) : (
                                                                                <div className="px-4 py-3 text-neutral-400 text-center">No details available</div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* Contact & Actions Panel */}
                                                                <div className="space-y-3">
                                                                    <h4 className="text-[11px] font-bold text-neutral-400 uppercase tracking-widest flex items-center gap-1.5">
                                                                        <User className="w-3.5 h-3.5" /> Parent Information & Actions
                                                                    </h4>
                                                                    <div className="bg-white border border-neutral-200/60 rounded-2xl p-4 shadow-sm space-y-3">
                                                                        {student.parentEmail ? (
                                                                            <div className="flex items-center gap-2 text-xs text-neutral-600 bg-neutral-50 p-2.5 rounded-xl border border-neutral-100">
                                                                                <Mail className="w-4 h-4 text-neutral-400" />
                                                                                <span className="truncate font-medium">{student.parentEmail}</span>
                                                                            </div>
                                                                        ) : (
                                                                            <div className="text-xs text-neutral-400 italic bg-neutral-50 p-2.5 rounded-xl border border-neutral-100 text-center">
                                                                                No contact details registered
                                                                            </div>
                                                                        )}

                                                                        <div className="flex flex-wrap gap-2 pt-2 border-t border-neutral-100">
                                                                            <button
                                                                                onClick={() => handleSendReminder(student)}
                                                                                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-bold rounded-xl transition-all border border-neutral-200"
                                                                            >
                                                                                <Mail className="w-3.5 h-3.5" />
                                                                                Send Alert
                                                                            </button>
                                                                            <button
                                                                                onClick={() => {
                                                                                    setSelectedStudent(student);
                                                                                    setPaymentAmount(student.balance.toString());
                                                                                }}
                                                                                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-neutral-900 hover:bg-black text-white text-xs font-bold rounded-xl transition-all shadow-md active:scale-95"
                                                                            >
                                                                                <IndianRupee className="w-3.5 h-3.5" />
                                                                                Record
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                    ) : viewMode === 'upi' ? (
                        <div className="bg-white rounded-[24px] shadow-sm min-h-[500px] border border-black/5">
                            <UpiVerificationList />
                        </div>
                    ) : viewMode === 'custom' ? (
                        <div className="bg-white rounded-[24px] shadow-sm overflow-hidden min-h-[500px] border border-black/5 p-6 md:p-8">
                            <div className="flex items-center justify-between mb-8">
                                <h3 className="font-bold text-gray-800 flex items-center gap-2 text-lg">
                                    <Receipt className="w-5 h-5 text-amber-500" /> Custom Invoices
                                </h3>
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-2 text-xs font-bold">
                                        <span className="flex items-center gap-1 text-green-600"><CheckCircle className="w-3 h-3" /> {customInvoices.filter(i => i.isPaid).length} Paid</span>
                                        <span className="text-gray-300">|</span>
                                        <span className="text-red-500">{customInvoices.filter(i => !i.isPaid).length} Pending</span>
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-3">
                                {customInvoices.length === 0 ? (
                                    <div className="text-center text-gray-400 text-sm py-16 flex flex-col items-center gap-3">
                                        <Receipt className="w-10 h-10 opacity-20" />
                                        <p>No custom invoices yet.</p>
                                        <p className="text-xs text-gray-300">Create one from any student's action menu in their batch.</p>
                                    </div>
                                ) : (
                                    customInvoices.map(inv => (
                                        <div key={inv.id} className="group flex items-start justify-between p-5 rounded-2xl hover:bg-gray-50 transition-colors border border-black/5/80 hover:border-gray-200">
                                            <div className="flex gap-4">
                                                <div className={cn(
                                                    "w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg shrink-0",
                                                    inv.isPaid ? "bg-green-50 text-green-600" : "bg-amber-50 text-amber-600"
                                                )}>
                                                    {inv.isPaid ? <CheckCircle className="w-5 h-5" /> : <Receipt className="w-5 h-5" />}
                                                </div>
                                                <div>
                                                    <div className="text-base font-bold text-gray-800">{inv.name}</div>
                                                    <div className="text-xs text-gray-500 mt-0.5 font-medium">
                                                        {inv.studentName} {inv.studentHumanId && <span className="text-gray-400">({inv.studentHumanId})</span>}
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-1.5">
                                                        <span className="text-[11px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md font-medium">{inv.batchName}</span>
                                                        <span className="text-[11px] text-gray-400">{new Date(inv.createdAt).toLocaleDateString()}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-right flex flex-col items-end">
                                                <div className={cn("text-lg font-bold font-mono", inv.isPaid ? "text-green-600" : "text-red-500")}>
                                                    ₹{inv.amount.toLocaleString()}
                                                </div>
                                                <div className={cn(
                                                    "text-[10px] font-bold mt-1.5 px-2 py-0.5 rounded-full",
                                                    inv.isPaid ? "bg-green-50 text-green-600 border border-green-100" : "bg-red-50 text-red-500 border border-red-100"
                                                )}>
                                                    {inv.isPaid ? 'PAID' : 'UNPAID'}
                                                </div>
                                                {inv.lastPaymentDate && (
                                                    <div className="text-[10px] text-gray-400 mt-1">
                                                        Paid {new Date(inv.lastPaymentDate).toLocaleDateString()}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>

            {/* Payment Modal */}
            <AnimatePresence>
                {selectedStudent && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pt-[calc(5.5rem+env(safe-area-inset-top))]">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/40 backdrop-blur-md"
                            onClick={() => setSelectedStudent(null)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="bg-white rounded-[24px] shadow-2xl max-w-md w-full p-8 relative z-10"
                        >
                            <button
                                onClick={() => setSelectedStudent(null)}
                                className="absolute top-6 right-6 text-gray-400 hover:text-gray-800 p-1 rounded-full hover:bg-gray-100 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>

                            <h2 className="text-2xl font-black mb-1 text-gray-900">Record Payment</h2>
                            <p className="text-sm text-gray-500 mb-8">Enter amount received from parent.</p>

                            <div className="bg-gray-50 p-6 rounded-2xl mb-8 border border-black/5">
                                <div className="flex justify-between mb-3 items-center">
                                    <span className="text-sm text-gray-500 font-medium">Student</span>
                                    <span className="text-sm font-bold text-gray-900">{selectedStudent.name}</span>
                                </div>
                                <div className="h-px bg-gray-200 my-3"></div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-500 font-medium">Outstanding Balance</span>
                                    <span className="text-lg font-black text-red-500">₹{selectedStudent.balance.toLocaleString()}</span>
                                </div>

                                {selectedStudent.breakdown && selectedStudent.breakdown.length > 0 && (
                                    <div className="mt-4 pt-4 border-t border-gray-200">
                                        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Pending Payments:</p>
                                        <div className="space-y-1">
                                            {selectedStudent.breakdown.map((item, i) => (
                                                <div key={i} className="flex justify-between text-sm">
                                                    <span className="text-gray-600">{item.name}</span>
                                                    <span className="font-mono text-red-500 font-bold">₹{item.due.toLocaleString()}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <form onSubmit={handlePayment}>
                                <div className="mb-8 relative">
                                    <label htmlFor="paymentAmount" className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Payment Amount (₹)</label>
                                    <input
                                        id="paymentAmount"
                                        type="number"
                                        inputMode="numeric"
                                        required
                                        min="1"
                                        className="w-full bg-transparent text-5xl font-black text-gray-900 placeholder-gray-200 border-none outline-none py-2 transition-colors p-0"
                                        placeholder="0"
                                        value={paymentAmount}
                                        onChange={(e) => setPaymentAmount(e.target.value)}
                                        autoFocus
                                    />
                                    <p className="text-xs text-gray-400 mt-2">
                                        This payment will correct the oldest pending installments first.
                                    </p>
                                </div>
                                <div className="flex justify-end gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setSelectedStudent(null)}
                                        className="px-6 py-3 text-gray-500 font-bold hover:text-gray-900 transition rounded-xl hover:bg-gray-100"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={processing}
                                        className="px-8 py-3 bg-gray-900 text-white font-bold rounded-xl hover:bg-black disabled:opacity-50 shadow-xl shadow-gray-200 transition-all active:scale-[0.98]"
                                    >
                                        {processing ? 'Processing...' : 'Confirm Payment'}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}

                {/* Reports Modal */}
                {showReportsModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pt-[calc(5.5rem+env(safe-area-inset-top))]">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/40 backdrop-blur-md"
                            onClick={() => setShowReportsModal(false)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="bg-white rounded-[24px] shadow-2xl max-w-md w-full p-0 overflow-visible relative z-10"
                        >
                            <div className="p-6 border-b border-black/5 flex justify-between items-center bg-gray-50/50 rounded-t-[24px]">
                                <div>
                                    <h2 className="text-xl font-black text-gray-900">Download Reports</h2>
                                    <p className="text-xs text-gray-500 font-medium">Select a report to generate</p>
                                </div>
                                <button
                                    onClick={() => setShowReportsModal(false)}
                                    className="text-gray-400 hover:text-gray-800 p-2 rounded-full hover:bg-gray-200/50 transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="p-6 space-y-4">
                                {/* Defaulters Option */}
                                <div className="p-4 rounded-2xl border border-black/5 hover:border-red-200 hover:bg-red-50/30 transition-all group">
                                    <div className="flex justify-between items-start mb-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
                                                <TrendingDown className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-gray-900">Pending Dues List</h3>
                                                <p className="text-xs text-gray-500">Pending fees summary</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex gap-2 mb-3">
                                        {/* Report Batch Dropdown */}
                                        <div className="relative flex-1">
                                            <button
                                                onClick={() => setShowReportBatchMenu(!showReportBatchMenu)}
                                                className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-700 outline-none hover:border-red-200 focus:border-red-300 transition-all flex items-center justify-between"
                                            >
                                                <span className="truncate">{reportBatch === 'All' ? 'All Batches' : reportBatch}</span>
                                                <ChevronDown className="w-3 h-3 text-gray-400" />
                                            </button>

                                            {showReportBatchMenu && (
                                                <>
                                                    <div className="fixed inset-0 z-20" onClick={() => setShowReportBatchMenu(false)}></div>
                                                    <div className="absolute left-0 top-full mt-1 w-full bg-white rounded-xl shadow-xl border border-black/5 p-1 z-30 max-h-48 overflow-y-auto custom-scrollbar">
                                                        <button
                                                            onClick={() => { setReportBatch('All'); setShowReportBatchMenu(false); }}
                                                            className={cn("w-full text-left px-3 py-1.5 rounded-lg text-xs font-bold flex justify-between items-center", reportBatch === 'All' ? "bg-red-50 text-red-600" : "text-gray-700 hover:bg-gray-50")}
                                                        >
                                                            All Batches
                                                            {reportBatch === 'All' && <Check className="w-3 h-3" />}
                                                        </button>
                                                        {batches.map(b => (
                                                            <button
                                                                key={b}
                                                                onClick={() => { setReportBatch(b); setShowReportBatchMenu(false); }}
                                                                className={cn("w-full text-left px-3 py-1.5 rounded-lg text-xs font-bold flex justify-between items-center", reportBatch === b ? "bg-red-50 text-red-600" : "text-gray-700 hover:bg-gray-50")}
                                                            >
                                                                <span className="truncate">{b}</span>
                                                                {reportBatch === b && <Check className="w-3 h-3" />}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </>
                                            )}
                                        </div>

                                        {/* Report Sort Dropdown */}
                                        <div className="relative w-36">
                                            <button
                                                onClick={() => setShowReportSortMenu(!showReportSortMenu)}
                                                className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-700 outline-none hover:border-red-200 focus:border-red-300 transition-all flex items-center justify-between"
                                            >
                                                <span className="truncate">{reportSort === 'amount' ? 'Amount (High)' : 'Oldest Due'}</span>
                                                <ChevronDown className="w-3 h-3 text-gray-400" />
                                            </button>

                                            {showReportSortMenu && (
                                                <>
                                                    <div className="fixed inset-0 z-20" onClick={() => setShowReportSortMenu(false)}></div>
                                                    <div className="absolute right-0 top-full mt-1 w-full bg-white rounded-xl shadow-xl border border-black/5 p-1 z-30">
                                                        <button
                                                            onClick={() => { setReportSort('amount'); setShowReportSortMenu(false); }}
                                                            className={cn("w-full text-left px-3 py-1.5 rounded-lg text-xs font-bold flex justify-between items-center", reportSort === 'amount' ? "bg-red-50 text-red-600" : "text-gray-700 hover:bg-gray-50")}
                                                        >
                                                            Amount (High)
                                                            {reportSort === 'amount' && <Check className="w-3 h-3" />}
                                                        </button>
                                                        <button
                                                            onClick={() => { setReportSort('date'); setShowReportSortMenu(false); }}
                                                            className={cn("w-full text-left px-3 py-1.5 rounded-lg text-xs font-bold flex justify-between items-center", reportSort === 'date' ? "bg-red-50 text-red-600" : "text-gray-700 hover:bg-gray-50")}
                                                        >
                                                            Oldest Due
                                                            {reportSort === 'date' && <Check className="w-3 h-3" />}
                                                        </button>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    <button
                                        onClick={async () => {
                                            const toastId = toast.loading('Downloading...');
                                            try {
                                                const token = localStorage.getItem('token');
                                                const response = await fetch(`${API_URL}/fees/download-pending?batch=${reportBatch}&sortBy=${reportSort}`, {
                                                    headers: { 'Authorization': `Bearer ${token}` }
                                                });
                                                if (!response.ok) throw new Error('Download failed');
                                                const blob = await response.blob();
                                                const url = window.URL.createObjectURL(blob);
                                                try {
                                                    const a = document.createElement('a');
                                                    a.href = url;
                                                    a.download = `pending_dues_report_${reportBatch}.pdf`;
                                                    document.body.appendChild(a);
                                                    a.click();
                                                    a.remove();
                                                } finally {
                                                    window.URL.revokeObjectURL(url);
                                                }
                                                toast.success('Downloaded!', { id: toastId });
                                            } catch {
                                                toast.error('Download failed', { id: toastId });
                                            }
                                        }}
                                        className="w-full py-2.5 bg-gray-900 text-white font-bold rounded-xl text-sm hover:bg-black transition-all flex items-center justify-center gap-2 shadow-lg shadow-gray-200"
                                    >
                                        <Download className="w-4 h-4" /> Download PDF
                                    </button>
                                </div>

                                {/* Monthly Statement Option */}
                                <div className="p-4 rounded-2xl border border-black/5 hover:border-blue-200 hover:bg-blue-50/30 transition-all group">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                                                <FileText className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-gray-900">Monthly Statement</h3>
                                                <p className="text-xs text-gray-500">Transaction history</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex gap-2 mb-3">
                                        {/* Month Dropdown */}
                                        <div className="relative flex-1">
                                            <button
                                                onClick={() => setShowMonthMenu(!showMonthMenu)}
                                                className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-700 outline-none hover:border-blue-200 focus:border-blue-300 transition-all flex items-center justify-between"
                                            >
                                                <span>{new Date(0, reportMonth - 1).toLocaleString('default', { month: 'long' })}</span>
                                                <ChevronDown className="w-3 h-3 text-gray-400" />
                                            </button>

                                            {showMonthMenu && (
                                                <>
                                                    <div className="fixed inset-0 z-20" onClick={() => setShowMonthMenu(false)}></div>
                                                    <div className="absolute left-0 bottom-full mb-1 w-full bg-white rounded-xl shadow-xl border border-black/5 p-1 z-30 max-h-48 overflow-y-auto custom-scrollbar">
                                                        {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                                                            <button
                                                                key={m}
                                                                onClick={() => { setReportMonth(m); setShowMonthMenu(false); }}
                                                                className={cn("w-full text-left px-3 py-1.5 rounded-lg text-xs font-bold flex justify-between items-center", reportMonth === m ? "bg-blue-50 text-blue-600" : "text-gray-700 hover:bg-gray-50")}
                                                            >
                                                                {new Date(0, m - 1).toLocaleString('default', { month: 'long' })}
                                                                {reportMonth === m && <Check className="w-3 h-3" />}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </>
                                            )}
                                        </div>

                                        {/* Year Dropdown */}
                                        <div className="relative w-28">
                                            <button
                                                onClick={() => setShowYearMenu(!showYearMenu)}
                                                className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs font-bold text-gray-700 outline-none hover:border-blue-200 focus:border-blue-300 transition-all flex items-center justify-between"
                                            >
                                                <span>{reportYear}</span>
                                                <ChevronDown className="w-3 h-3 text-gray-400" />
                                            </button>

                                            {showYearMenu && (
                                                <>
                                                    <div className="fixed inset-0 z-20" onClick={() => setShowYearMenu(false)}></div>
                                                    <div className="absolute right-0 bottom-full mb-1 w-full bg-white rounded-xl shadow-xl border border-black/5 p-1 z-30">
                                                        {[2023, 2024, 2025, 2026].map(y => (
                                                            <button
                                                                key={y}
                                                                onClick={() => { setReportYear(y); setShowYearMenu(false); }}
                                                                className={cn("w-full text-left px-3 py-1.5 rounded-lg text-xs font-bold flex justify-between items-center", reportYear === y ? "bg-blue-50 text-blue-600" : "text-gray-700 hover:bg-gray-50")}
                                                            >
                                                                {y}
                                                                {reportYear === y && <Check className="w-3 h-3" />}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    <button
                                        onClick={async () => {
                                            const toastId = toast.loading('Generating...');
                                            try {
                                                const token = localStorage.getItem('token');
                                                const response = await fetch(`${API_URL}/fees/download-transactions?month=${reportMonth}&year=${reportYear}`, {
                                                    headers: { 'Authorization': `Bearer ${token}` }
                                                });
                                                if (!response.ok) throw new Error('Download failed');
                                                const blob = await response.blob();
                                                const url = window.URL.createObjectURL(blob);
                                                try {
                                                    const a = document.createElement('a');
                                                    a.href = url;
                                                    a.download = `Transactions_${reportMonth}_${reportYear}.pdf`;
                                                    document.body.appendChild(a);
                                                    a.click();
                                                    a.remove();
                                                } finally {
                                                    window.URL.revokeObjectURL(url);
                                                }
                                                toast.success('Downloaded!', { id: toastId });
                                            } catch {
                                                toast.error('Failed', { id: toastId });
                                            }
                                        }}
                                        className="w-full py-2.5 bg-gray-900 text-white font-bold rounded-xl text-sm hover:bg-black transition-all flex items-center justify-center gap-2 shadow-lg shadow-gray-200"
                                    >
                                        <Download className="w-4 h-4" /> Download Statement
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Floating Bulk Actions Bar */}
            <AnimatePresence>
                {selectedStudentIds.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 50, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 50, scale: 0.95 }}
                        className="fixed bottom-28 xl:bottom-6 left-1/2 -translate-x-1/2 z-50 bg-neutral-900 text-white rounded-2xl px-6 py-4 shadow-2xl border border-neutral-800 flex items-center justify-between gap-6 max-w-lg w-[calc(100%-2rem)]"
                    >
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setSelectedStudentIds([])}
                                className="text-neutral-400 hover:text-neutral-200 transition-colors p-1 rounded-lg hover:bg-neutral-800"
                            >
                                <X className="w-4 h-4" />
                            </button>
                            <span className="text-sm font-bold tracking-tight">
                                {selectedStudentIds.length} {selectedStudentIds.length === 1 ? 'student' : 'students'} selected
                            </span>
                        </div>
                        
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleSendBulkReminders}
                                disabled={bulkSending}
                                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-700/50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl transition-all shadow-md active:scale-95 shrink-0"
                            >
                                <Send className="w-3.5 h-3.5" />
                                {bulkSending ? 'Sending...' : 'Remind Selected'}
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Transaction Details Modal */}
            <AnimatePresence>
                {selectedTransaction && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setSelectedTransaction(null)}
                            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100]"
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-white rounded-[24px] shadow-2xl z-[110] overflow-hidden"
                        >
                            <div className="p-6 md:p-8">
                                <div className="flex items-center justify-between mb-6">
                                    <h3 className="text-lg font-black text-gray-900">Transaction Details</h3>
                                    <button 
                                        onClick={() => setSelectedTransaction(null)}
                                        className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                                
                                <div className="flex flex-col items-center justify-center mb-6 text-center">
                                    <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
                                        <CheckCircle className="w-8 h-8 text-emerald-600" />
                                    </div>
                                    <div className="text-3xl font-black text-emerald-600 font-mono mb-1">
                                        +₹{selectedTransaction.amount.toLocaleString()}
                                    </div>
                                    <div className="text-sm font-bold text-gray-400 uppercase tracking-widest">
                                        Payment Successful
                                    </div>
                                </div>

                                <div className="space-y-4 bg-gray-50 rounded-xl p-5 border border-black/5">
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm font-medium text-gray-500">Student</span>
                                        <span className="text-sm font-bold text-gray-900">{selectedTransaction.studentName}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm font-medium text-gray-500">Batch</span>
                                        <span className="text-sm font-bold text-gray-900 text-right max-w-[150px]">{selectedTransaction.batchName}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm font-medium text-gray-500">Type</span>
                                        <span className="text-sm font-bold text-gray-900">{selectedTransaction.type.replace('Installment: ', '')}</span>
                                    </div>
                                    <div className="flex justify-between items-center pt-4 border-t border-black/5">
                                        <span className="text-sm font-medium text-gray-500">Date & Time</span>
                                        <span className="text-sm font-bold text-gray-900">
                                            {new Date(selectedTransaction.date).toLocaleString(undefined, { 
                                                month: 'short', day: 'numeric', year: 'numeric',
                                                hour: 'numeric', minute: '2-digit', hour12: true 
                                            })}
                                        </span>
                                    </div>
                                </div>
                                
                                <div className="mt-6">
                                    <button 
                                        onClick={() => setSelectedTransaction(null)}
                                        className="w-full py-3 bg-gray-900 hover:bg-black text-white rounded-xl font-bold transition-all active:scale-95 shadow-md shadow-gray-200"
                                    >
                                        Done
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* Bottom spacer to prevent content clipping by mobile nav dock */}
            <div className="h-28 md:h-8" />
        </Layout >
    );
};

export default Fees;
