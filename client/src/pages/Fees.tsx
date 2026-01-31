
import React, { useEffect, useState } from 'react';
import { api } from '../utils/api';
import Layout from '../components/Layout';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Loader, X, TrendingUp, TrendingDown, IndianRupee, Mail, History, CheckCircle, Download, ArrowUpRight, FileText, ArrowUpDown, ChevronDown, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '../utils/cn';

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

const Fees: React.FC = () => {
    const [students, setStudents] = useState<FeeSummary[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedBatch, setSelectedBatch] = useState('All');
    const [viewMode, setViewMode] = useState<'all' | 'defaulters'>('defaulters'); // Default to defaulters usually more useful

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
    }, []);

    const fetchFees = async () => {
        try {
            const data = await api.get('/fees');
            setStudents(data);
        } catch (error) {
            toast.error("Failed to load fee records");
        } finally {
            setLoading(false);
        }
    };

    const fetchTransactions = async () => {
        try {
            const data = await api.get('/fees/recent');
            setTransactions(data);
        } catch (e) {
            console.error(e);
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
        } catch (error) {
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
        } catch (e) {
            toast.error('Failed to send reminder. Check email setup.', { id: toastId });
        }
    };

    const batches = Array.from(new Set(students.map(s => s.batchName))).filter(b => b !== 'N/A').sort();

    const filteredStudents = students.filter(s => {
        const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (s.humanId && s.humanId.toLowerCase().includes(searchTerm.toLowerCase()));
        const matchesBatch = selectedBatch === 'All' || s.batchName === selectedBatch;
        const matchesView = viewMode === 'all' || (viewMode === 'defaulters' && s.balance > 0);
        return matchesSearch && matchesBatch && matchesView;
    }).sort((a, b) => {
        if (listSort === 'date') {
            const dateA = a.oldestDue ? new Date(a.oldestDue).getTime() : Number.MAX_VALUE;
            const dateB = b.oldestDue ? new Date(b.oldestDue).getTime() : Number.MAX_VALUE;
            return dateA - dateB; // Ascending (Oldest First)
        }
        return b.balance - a.balance; // Descending Amount
    });

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

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                <div className="bg-white p-6 rounded-[24px] shadow-sm flex flex-col justify-between relative overflow-hidden group hover:shadow-md transition-all">
                    <div className="absolute right-0 top-0 p-6 opacity-5 group-hover:scale-110 transition-transform">
                        <TrendingUp className="w-24 h-24" />
                    </div>
                    <div className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Total Collected</div>
                    <div className="text-3xl font-black text-gray-800">₹{stats.totalCollected.toLocaleString()}</div>
                    <div className="h-1 w-12 bg-green-500 rounded-full mt-4"></div>
                </div>

                <div className="bg-white p-6 rounded-[24px] shadow-sm flex flex-col justify-between relative overflow-hidden group hover:shadow-md transition-all">
                    <div className="absolute right-0 top-0 p-6 opacity-5 group-hover:scale-110 transition-transform">
                        <TrendingDown className="w-24 h-24" />
                    </div>
                    <div className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Outstanding Dues</div>
                    <div className="text-3xl font-black text-red-500">₹{stats.totalDue.toLocaleString()}</div>
                    <div className="h-1 w-12 bg-red-500 rounded-full mt-4"></div>
                </div>

                <div className="bg-white p-6 rounded-[24px] shadow-sm flex flex-col justify-between relative overflow-hidden group hover:shadow-md transition-all">
                    <div className="absolute right-0 top-0 p-6 opacity-5 group-hover:scale-110 transition-transform">
                        <IndianRupee className="w-24 h-24" />
                    </div>
                    <div className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Collection Rate</div>
                    <div className="text-3xl font-black text-blue-600">{stats.collectionRate}%</div>
                    <div className="h-1 w-12 bg-blue-500 rounded-full mt-4"></div>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
                {/* Main List Section */}
                <div className="xl:col-span-8 space-y-6">

                    {/* Toolbar */}
                    <div className="bg-white p-4 rounded-[24px] shadow-sm flex flex-col gap-4">
                        {/* View Toggle */}
                        <div className="flex bg-gray-100 p-1 rounded-2xl w-full">
                            <button
                                onClick={() => setViewMode('defaulters')}
                                className={cn("flex-1 px-6 py-2 rounded-xl text-center text-sm font-bold transition-all", viewMode === 'defaulters' ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700")}
                            >
                                Defaulters
                            </button>
                            <button
                                onClick={() => setViewMode('all')}
                                className={cn("flex-1 px-6 py-2 rounded-xl text-center text-sm font-bold transition-all", viewMode === 'all' ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700")}
                            >
                                All Records
                            </button>
                        </div>

                        {/* Search & Filter */}
                        <div className="flex flex-col md:flex-row gap-3">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Search student..."
                                    className="w-full bg-gray-50 border-transparent focus:bg-white border focus:border-blue-500 rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none transition-all"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <div className="flex gap-2 w-full md:w-auto flex-wrap pb-0">
                                <div className="relative flex-1 md:flex-none">
                                    <button
                                        onClick={() => setShowBatchMenu(!showBatchMenu)}
                                        className="w-full md:w-48 bg-gray-50 border border-transparent hover:bg-white hover:border-blue-200 focus:bg-white focus:border-blue-500 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-600 outline-none transition-all flex items-center justify-between gap-2"
                                    >
                                        <span className="truncate">{selectedBatch === 'All' ? 'All Batches' : selectedBatch}</span>
                                        <ChevronDown className={cn("w-4 h-4 text-gray-400 transition-transform", showBatchMenu && "rotate-180")} />
                                    </button>

                                    {showBatchMenu && (
                                        <>
                                            <div className="fixed inset-0 z-10" onClick={() => setShowBatchMenu(false)}></div>
                                            <div className="absolute left-0 top-full mt-2 w-full md:w-56 bg-white rounded-xl shadow-xl border border-gray-100 p-1 z-20 max-h-64 overflow-y-auto custom-scrollbar">
                                                <button
                                                    onClick={() => { setSelectedBatch('All'); setShowBatchMenu(false); }}
                                                    className={cn("w-full text-left px-3 py-2 rounded-lg text-sm font-medium flex justify-between items-center transition-colors", selectedBatch === 'All' ? "bg-blue-50 text-blue-600" : "text-gray-700 hover:bg-gray-50")}
                                                >
                                                    All Batches
                                                    {selectedBatch === 'All' && <Check className="w-4 h-4" />}
                                                </button>
                                                {batches.map(b => (
                                                    <button
                                                        key={b}
                                                        onClick={() => { setSelectedBatch(b); setShowBatchMenu(false); }}
                                                        className={cn("w-full text-left px-3 py-2 rounded-lg text-sm font-medium flex justify-between items-center transition-colors", selectedBatch === b ? "bg-blue-50 text-blue-600" : "text-gray-700 hover:bg-gray-50")}
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
                                        className={cn("p-2.5 rounded-xl transition-all border", showSortMenu ? "bg-gray-900 text-white border-gray-900" : "bg-gray-50 hover:bg-white text-gray-500 hover:text-gray-900 border-transparent hover:border-gray-200")}
                                        title="Sort List"
                                    >
                                        <ArrowUpDown className="w-5 h-5" />
                                    </button>
                                    {showSortMenu && (
                                        <>
                                            <div className="fixed inset-0 z-10" onClick={() => setShowSortMenu(false)}></div>
                                            <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 p-1 z-20">
                                                <div className="px-3 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider">Sort List By</div>
                                                <button
                                                    onClick={() => { setListSort('amount'); setShowSortMenu(false); }}
                                                    className={cn("w-full text-left px-3 py-2 rounded-lg text-sm font-bold flex justify-between items-center", listSort === 'amount' ? "bg-blue-50 text-blue-600" : "text-gray-700 hover:bg-gray-50")}
                                                >
                                                    Highest Amount
                                                    {listSort === 'amount' && <CheckCircle className="w-3 h-3" />}
                                                </button>
                                                <button
                                                    onClick={() => { setListSort('date'); setShowSortMenu(false); }}
                                                    className={cn("w-full text-left px-3 py-2 rounded-lg text-sm font-bold flex justify-between items-center", listSort === 'date' ? "bg-blue-50 text-blue-600" : "text-gray-700 hover:bg-gray-50")}
                                                >
                                                    Oldest Pending
                                                    {listSort === 'date' && <CheckCircle className="w-3 h-3" />}
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>

                                <button
                                    onClick={() => setShowReportsModal(true)}
                                    className="bg-gray-900 text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-gray-200 hover:bg-black transition-all flex items-center gap-2 active:scale-95 whitespace-nowrap"
                                >
                                    <FileText className="w-4 h-4" /> Reports
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-[24px] shadow-sm overflow-hidden min-h-[500px] border border-gray-100">
                        {loading ? (
                            <div className="flex flex-col items-center justify-center h-96 text-gray-400">
                                <Loader className="w-8 h-8 animate-spin mb-4 text-blue-500" />
                                <p>Loading records...</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-gray-50/50 border-b border-gray-100">
                                        <tr>
                                            <th className="p-5 pl-8 font-bold text-gray-400 text-xs uppercase tracking-wider">Student Details</th>
                                            <th className="p-5 font-bold text-gray-400 text-xs uppercase tracking-wider text-right">Balance</th>
                                            <th className="p-5 pr-8 font-bold text-gray-400 text-xs uppercase tracking-wider text-center">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {filteredStudents.map(student => (
                                            <tr key={student.id} className="hover:bg-blue-50/30 transition-colors group">
                                                <td className="p-5 pl-8">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-10 h-10 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center font-bold text-sm shrink-0">
                                                            {student.name.charAt(0)}
                                                        </div>
                                                        <div>
                                                            <div className="font-bold text-gray-800">{student.name}</div>
                                                            <div className="text-xs text-gray-500 mt-0.5 font-medium">{student.humanId} • {student.batchName}</div>
                                                            {student.breakdown && student.breakdown.length > 0 && (
                                                                <div className="mt-1 flex flex-wrap gap-1">
                                                                    {student.breakdown.slice(0, 2).map((item, i) => (
                                                                        <span key={i} className="px-1.5 py-0.5 bg-red-50 text-red-600 text-[10px] rounded font-semibold border border-red-100">
                                                                            {item.name}
                                                                        </span>
                                                                    ))}
                                                                    {student.breakdown.length > 2 && (
                                                                        <span className="text-[10px] text-gray-400">+{student.breakdown.length - 2} more</span>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-5 text-right">
                                                    {student.balance > 0 ? (
                                                        <div className="flex flex-col items-end">
                                                            <span className="font-mono font-bold text-red-500 text-lg">₹{student.balance.toLocaleString()}</span>
                                                            <span className="text-xs text-red-400 font-medium">{student.breakdown?.length || 0} Dues</span>
                                                        </div>
                                                    ) : (
                                                        <span className="font-mono font-bold text-green-500 text-lg">₹0</span>
                                                    )}
                                                </td>
                                                <td className="p-5 pr-8">
                                                    <div className="flex items-center justify-center gap-2 opacity-100 sm:opacity-60 sm:group-hover:opacity-100 transition-opacity">
                                                        {student.balance > 0 ? (
                                                            <>
                                                                <button
                                                                    onClick={() => handleSendReminder(student)}
                                                                    className="p-2.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                                                                    title="Send Payment Reminder"
                                                                >
                                                                    <Mail className="w-5 h-5" />
                                                                </button>
                                                                <button
                                                                    onClick={() => {
                                                                        setSelectedStudent(student);
                                                                        setPaymentAmount(student.balance.toString());
                                                                    }}
                                                                    className="px-4 py-2 bg-gray-900 hover:bg-black text-white text-xs font-bold rounded-xl shadow-lg shadow-gray-200 transition-all flex items-center gap-2 active:scale-95"
                                                                >
                                                                    Collect <ArrowUpRight className="w-3 h-3" />
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-600 rounded-lg text-xs font-bold">
                                                                <CheckCircle className="w-4 h-4" /> Paid
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                        {filteredStudents.length === 0 && (
                                            <tr>
                                                <td colSpan={3} className="p-20 text-center text-gray-400">
                                                    No students found matching your criteria.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>

                {/* Sidebar */}
                <div className="xl:col-span-4 space-y-6">
                    {/* Recent Transactions List */}
                    <div className="bg-white rounded-[24px] shadow-sm border border-gray-100 p-6 flex flex-col h-[calc(100vh-200px)] sticky top-6">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                <History className="w-5 h-5 text-gray-400" /> Recent Payments
                            </h3>
                        </div>

                        <div className="flex-1 overflow-y-auto pr-1 space-y-4 custom-scrollbar">
                            {transactions.length === 0 ? (
                                <div className="text-center text-gray-400 text-sm py-10">No recent transactions</div>
                            ) : (
                                transactions.map(tx => (
                                    <div key={tx.id} className="group flex items-start justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-100">
                                        <div className="flex gap-3">
                                            <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs shrink-0">
                                                {tx.studentName.charAt(0)}
                                            </div>
                                            <div>
                                                <div className="text-sm font-bold text-gray-800">{tx.studentName}</div>
                                                <div className="text-[10px] text-gray-400 uppercase tracking-wide font-medium mt-0.5">{tx.batchName}</div>
                                                <div className="text-xs text-gray-500 mt-1">{tx.type.replace('Installment: ', '')}</div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-sm font-bold text-green-600 font-mono">+₹{tx.amount.toLocaleString()}</div>
                                            <div className="text-[10px] text-gray-400 mt-1">{new Date(tx.date).toLocaleDateString()}</div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Payment Modal */}
            <AnimatePresence>
                {selectedStudent && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
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

                            <div className="bg-gray-50 p-6 rounded-2xl mb-8 border border-gray-100">
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
                                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Pending Payments:</p>
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
                                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Payment Amount (₹)</label>
                                    <input
                                        type="number"
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
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
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
                            className="bg-white rounded-[24px] shadow-2xl max-w-md w-full p-0 overflow-hidden relative z-10"
                        >
                            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
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
                                <div className="p-4 rounded-2xl border border-gray-100 hover:border-red-200 hover:bg-red-50/30 transition-all group">
                                    <div className="flex justify-between items-start mb-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
                                                <TrendingDown className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-gray-900">Defaulters List</h3>
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
                                                    <div className="absolute left-0 top-full mt-1 w-full bg-white rounded-xl shadow-xl border border-gray-100 p-1 z-30 max-h-48 overflow-y-auto custom-scrollbar">
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
                                                    <div className="absolute right-0 top-full mt-1 w-full bg-white rounded-xl shadow-xl border border-gray-100 p-1 z-30">
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
                                                a.download = `defaulters_report_${reportBatch}.pdf`;
                                                document.body.appendChild(a);
                                                a.click();
                                                toast.success('Downloaded!', { id: toastId });
                                            } catch (error) {
                                                toast.error('Download failed', { id: toastId });
                                            }
                                        }}
                                        className="w-full py-2.5 bg-gray-900 text-white font-bold rounded-xl text-sm hover:bg-black transition-all flex items-center justify-center gap-2 shadow-lg shadow-gray-200"
                                    >
                                        <Download className="w-4 h-4" /> Download PDF
                                    </button>
                                </div>

                                {/* Monthly Statement Option */}
                                <div className="p-4 rounded-2xl border border-gray-100 hover:border-blue-200 hover:bg-blue-50/30 transition-all group">
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
                                                    <div className="absolute left-0 top-full mt-1 w-full bg-white rounded-xl shadow-xl border border-gray-100 p-1 z-30 max-h-48 overflow-y-auto custom-scrollbar">
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
                                                    <div className="absolute right-0 top-full mt-1 w-full bg-white rounded-xl shadow-xl border border-gray-100 p-1 z-30">
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
                                            } catch (error) {
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
