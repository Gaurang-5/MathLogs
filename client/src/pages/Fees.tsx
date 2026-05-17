
import React, { useEffect, useState } from 'react';
import { api } from '../utils/api';
import Layout from '../components/Layout';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Loader, X, TrendingUp, TrendingDown, IndianRupee, Mail, History, CheckCircle, Download, ArrowUpRight, FileText, ArrowUpDown, ChevronDown, Check, Receipt } from 'lucide-react';
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
    const [students, setStudents] = useState<FeeSummary[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
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

    // Report Dropdown States
    const [showReportBatchMenu, setShowReportBatchMenu] = useState(false);
    const [showReportSortMenu, setShowReportSortMenu] = useState(false);
    const [showMonthMenu, setShowMonthMenu] = useState(false);
    const [showYearMenu, setShowYearMenu] = useState(false);

    useEffect(() => {
        fetchFees();
        fetchTransactions();
        fetchCustomInvoices();
    }, []);

    const [customInvoices, setCustomInvoices] = useState<CustomInvoice[]>([]);

    const fetchCustomInvoices = async () => {
        try {
            const data = await api.get<CustomInvoice[]>(`/fees/custom-invoices?t=${Date.now()}`);
            setCustomInvoices(data);
        } catch {
            // Silently fail — tab will show empty state
        }
    };

    const fetchFees = async () => {
        try {
            const data = await api.get<FeeSummary[]>(`/fees?t=${Date.now()}`);
            setStudents(data);
        } catch {
            toast.error("Failed to load fee records");
        } finally {
            setLoading(false);
        }
    };

    const fetchTransactions = async () => {
        try {
            const data = await api.get<Transaction[]>(`/fees/recent?t=${Date.now()}`);
            setTransactions(data);
        } catch (error) {
            console.error(error);
        }
    };

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
            await fetchFees();
            await fetchTransactions(); // Refresh feed
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
            */}

            {/* iOS-Style Summary Widget */}
            <div className="bg-white rounded-[32px] p-6 md:p-8 border-[1.5px] border-black/5 shadow-sm mb-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-[0.02]">
                    <TrendingUp className="w-40 h-40" />
                </div>
                <div className="relative z-10">
                    <div className="flex flex-col md:flex-row justify-between md:items-end gap-6 mb-8">
                        <div>
                            <div className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1">Total Collected</div>
                            <div className="text-4xl md:text-5xl font-black text-gray-900 tracking-tight">₹{stats.totalCollected.toLocaleString()}</div>
                        </div>
                        <div className="text-left md:text-right">
                            <div className="text-[11px] font-bold text-red-400 uppercase tracking-widest mb-1">Outstanding Dues</div>
                            <div className="text-2xl md:text-3xl font-black text-red-500 tracking-tight">₹{stats.totalDue.toLocaleString()}</div>
                        </div>
                    </div>
                    
                    {/* Collection Progress Bar */}
                    <div className="mt-4 bg-gray-50/50 p-4 rounded-2xl border border-black-[0.02]">
                        <div className="flex justify-between items-center mb-3">
                            <span className="text-[13px] font-bold text-gray-600">Collection Rate</span>
                            <span className="text-[15px] font-black text-blue-600">{stats.collectionRate}%</span>
                        </div>
                        <div className="w-full h-3.5 bg-gray-200/80 rounded-full overflow-hidden shadow-inner">
                            <div 
                                className="h-full bg-blue-500 rounded-full transition-all duration-1000 ease-out shadow-sm" 
                                style={{ width: `${stats.collectionRate}%` }}
                            ></div>
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
                        <div className="flex overflow-x-auto custom-scrollbar pb-1 -mx-2 px-2 md:mx-0 md:px-0">
                            <div className="flex bg-neutral-100/80 border border-black/5 p-1 rounded-[20px] w-max md:w-full min-w-full">
                                <button
                                    onClick={() => setViewMode('defaulters')}
                                    className={cn("flex-1 px-5 py-2.5 rounded-[16px] text-center text-[13px] font-bold transition-all whitespace-nowrap", viewMode === 'defaulters' ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700")}
                                >
                                    Pending Dues
                                </button>
                                <button
                                    onClick={() => setViewMode('recent')}
                                    className={cn("flex-1 px-5 py-2.5 rounded-[16px] text-center text-[13px] font-bold transition-all whitespace-nowrap", viewMode === 'recent' ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700")}
                                >
                                    Recent Payments
                                </button>
                                <button
                                    onClick={() => setViewMode('upi')}
                                    className={cn("flex-1 px-5 py-2.5 rounded-[16px] text-center text-[13px] font-bold transition-all whitespace-nowrap", viewMode === 'upi' ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700")}
                                >
                                    UPI Approvals
                                </button>
                                <button
                                    onClick={() => setViewMode('custom')}
                                    className={cn("flex-1 px-5 py-2.5 rounded-[16px] text-center text-[13px] font-bold transition-all whitespace-nowrap flex items-center justify-center gap-1.5", viewMode === 'custom' ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700")}
                                >
                                    Custom Invoices
                                    {customInvoices.length > 0 && (
                                        <span className={cn("px-1.5 py-0.5 rounded-full text-[10px] font-bold", viewMode === 'custom' ? "bg-amber-100 text-amber-700" : "bg-gray-200 text-gray-500")}>
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
                        <div className="bg-white rounded-[28px] shadow-sm overflow-hidden min-h-[500px] border border-black/5 p-6 md:p-8">
                            <div className="flex items-center justify-between mb-8">
                                <h3 className="font-bold text-gray-800 flex items-center gap-2 text-lg">
                                    <History className="w-5 h-5 text-gray-500" /> Recent Transactions
                                </h3>
                            </div>
                            <div className="space-y-4">
                                {filteredTransactions.length === 0 ? (
                                    <div className="text-center text-gray-400 text-sm py-10">No recent transactions</div>
                                ) : (
                                    filteredTransactions.map(tx => (
                                        <div key={tx.id} className="group flex items-start justify-between p-5 rounded-2xl hover:bg-gray-50 transition-colors border border-black/5/80 hover:border-gray-200">
                                            <div className="flex gap-4">
                                                <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-lg shrink-0">
                                                    {tx.studentName.charAt(0)}
                                                </div>
                                                <div>
                                                    <div className="text-base font-bold text-gray-800">{tx.studentName}</div>
                                                    <div className="text-xs text-gray-400 uppercase tracking-wide font-bold mt-1">{tx.batchName}</div>
                                                    <div className="text-[11px] text-gray-500 mt-2 bg-gray-100 px-2 py-1 rounded-md mb-0.5 inline-block font-medium">{tx.type.replace('Installment: ', '')}</div>
                                                </div>
                                            </div>
                                            <div className="text-right flex flex-col items-end">
                                                <div className="text-lg font-bold text-green-600 font-mono">+₹{tx.amount.toLocaleString()}</div>
                                                <div className="text-xs text-gray-400 mt-1.5 font-medium">{new Date(tx.date).toLocaleDateString()}</div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    ) : viewMode === 'defaulters' ? (
                    <div className="bg-white rounded-[28px] shadow-sm overflow-hidden min-h-[500px] border border-black/5">
                        {loading ? (
                            <div className="flex flex-col items-center justify-center h-96 text-gray-400">
                                <Loader className="w-8 h-8 animate-spin mb-4 text-blue-500" />
                                <p className="font-medium text-sm">Loading records...</p>
                            </div>
                        ) : (
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
                                        <div key={student.id} className="p-4 sm:p-5 hover:bg-gray-50/50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4 group">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center font-bold text-base shrink-0 shadow-inner">
                                                    {student.name.charAt(0)}
                                                </div>
                                                <div>
                                                    <div className="font-bold text-gray-900 text-[15px]">{student.name}</div>
                                                    <div className="text-[12px] text-gray-500 mt-0.5 font-medium flex items-center gap-1.5">
                                                        {student.humanId} <span className="w-1 h-1 bg-gray-300 rounded-full"></span> {student.batchName}
                                                    </div>
                                                    {student.breakdown && student.breakdown.length > 0 && (
                                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                                            {student.breakdown.slice(0, 2).map((item, i) => (
                                                                <span key={i} className="px-2 py-0.5 bg-red-50 text-red-600 text-[10px] rounded-md font-bold border border-red-100">
                                                                    {item.name}
                                                                </span>
                                                            ))}
                                                            {student.breakdown.length > 2 && (
                                                                <span className="text-[10px] text-gray-500 font-bold bg-gray-100 px-1.5 py-0.5 rounded-md">+{student.breakdown.length - 2} more</span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            
                                            <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto pl-16 sm:pl-0">
                                                <div className="text-left sm:text-right">
                                                    {student.balance > 0 ? (
                                                        <div className="flex flex-col sm:items-end">
                                                            <span className="font-mono font-black text-red-500 text-lg tracking-tight">₹{student.balance.toLocaleString()}</span>
                                                            <span className="text-[11px] text-red-400 font-bold">{student.breakdown?.length || 0} Dues Pending</span>
                                                        </div>
                                                    ) : (
                                                        <span className="font-mono font-black text-green-500 text-lg tracking-tight">₹0</span>
                                                    )}
                                                </div>
                                                
                                                <div className="flex items-center gap-2">
                                                    {student.balance > 0 ? (
                                                        <>
                                                            <button
                                                                onClick={() => handleSendReminder(student)}
                                                                className="p-2.5 text-gray-400 hover:text-blue-600 bg-gray-50 hover:bg-blue-50 rounded-xl transition-all border border-transparent hover:border-blue-100"
                                                                title="Send Payment Reminder"
                                                            >
                                                                <Mail className="w-5 h-5" />
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    setSelectedStudent(student);
                                                                    setPaymentAmount(student.balance.toString());
                                                                }}
                                                                className="px-5 py-2.5 bg-gray-900 hover:bg-black text-white text-[13px] font-bold rounded-xl shadow-md shadow-gray-200 transition-all flex items-center gap-1.5 active:scale-95"
                                                            >
                                                                Collect
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <div className="flex items-center gap-1.5 px-4 py-2 bg-green-50 border border-green-100 text-green-600 rounded-xl text-xs font-bold">
                                                            <CheckCircle className="w-4 h-4" /> Paid
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
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
                                                const API_BASE = import.meta.env.PROD ? '/api' : (import.meta.env.VITE_API_URL || 'http://localhost:3001/api');
                                                const response = await fetch(`${API_BASE}/fees/download-pending?batch=${reportBatch}&sortBy=${reportSort}`, {
                                                    headers: { 'Authorization': `Bearer ${token}` }
                                                });
                                                if (!response.ok) throw new Error('Download failed');
                                                const blob = await response.blob();
                                                const url = window.URL.createObjectURL(blob);
                                                const a = document.createElement('a');
                                                a.href = url;
                                                a.download = `pending_dues_report_${reportBatch}.pdf`;
                                                document.body.appendChild(a);
                                                a.click();
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
                                                const API_BASE = import.meta.env.PROD ? '/api' : (import.meta.env.VITE_API_URL || 'http://localhost:3001/api');
                                                const response = await fetch(`${API_BASE}/fees/download-transactions?month=${reportMonth}&year=${reportYear}`, {
                                                    headers: { 'Authorization': `Bearer ${token}` }
                                                });
                                                if (!response.ok) throw new Error('Download failed');
                                                const blob = await response.blob();
                                                const url = window.URL.createObjectURL(blob);
                                                const a = document.createElement('a');
                                                a.href = url;
                                                a.download = `Transactions_${reportMonth}_${reportYear}.pdf`;
                                                document.body.appendChild(a);
                                                a.click();
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
        </Layout >
    );
};

export default Fees;
