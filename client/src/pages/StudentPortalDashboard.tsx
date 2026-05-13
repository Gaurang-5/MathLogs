import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { Wallet, LogOut, TrendingUp, BookOpen, Receipt } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function StudentPortalDashboard() {
    const { instituteSlug } = useParams<{ instituteSlug: string }>();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<any>(null);
    const [activeTab, setActiveTab] = useState<'fees' | 'performance'>('fees');

    useEffect(() => {
        const fetchDashboard = async () => {
            const token = localStorage.getItem(`student_token_${instituteSlug}`);
            if (!token) {
                navigate(`/${instituteSlug}/student`);
                return;
            }

            try {
                const response = await axios.get('/api/student-portal/dashboard', {
                    headers: {
                        Authorization: `Bearer ${token}`
                    }
                });
                setData(response.data);
            } catch (error) {
                console.error('Error fetching dashboard:', error);
                localStorage.removeItem(`student_token_${instituteSlug}`);
                toast.error('Session expired. Please log in again.');
                navigate(`/${instituteSlug}/student`);
            } finally {
                setLoading(false);
            }
        };

        fetchDashboard();
    }, [instituteSlug, navigate]);

    const handleLogout = () => {
        localStorage.removeItem(`student_token_${instituteSlug}`);
        navigate(`/${instituteSlug}/student`);
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="w-8 h-8 border-4 border-black border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (!data) return null;

    return (
        <div className="min-h-screen bg-gray-50 text-gray-900 font-sans pb-20 md:pb-8">
            {/* Header */}
            <header className="bg-white border-b border-gray-100 sticky top-0 z-50">
                <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
                    <div>
                        <h1 className="font-bold text-lg">{data.student.name}</h1>
                        <p className="text-xs text-gray-500">{data.student.batchName}</p>
                    </div>
                    <button 
                        onClick={handleLogout}
                        className="p-2 text-gray-500 hover:text-black rounded-lg hover:bg-gray-100 transition-colors"
                    >
                        <LogOut className="w-5 h-5" />
                    </button>
                </div>
            </header>

            <main className="max-w-4xl mx-auto px-4 mt-6">
                {/* Tabs */}
                <div className="flex bg-white rounded-2xl p-1 border border-gray-100 mb-6 shadow-sm">
                    <button
                        onClick={() => setActiveTab('fees')}
                        className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors ${
                            activeTab === 'fees' ? 'bg-black text-white' : 'text-gray-500 hover:bg-gray-50'
                        }`}
                    >
                        <Wallet className="w-4 h-4" />
                        Fees Details
                    </button>
                    <button
                        onClick={() => setActiveTab('performance')}
                        className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors ${
                            activeTab === 'performance' ? 'bg-black text-white' : 'text-gray-500 hover:bg-gray-50'
                        }`}
                    >
                        <TrendingUp className="w-4 h-4" />
                        Performance
                    </button>
                </div>

                <AnimatePresence mode="wait">
                    {activeTab === 'fees' && (
                        <motion.div
                            key="fees"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="space-y-6"
                        >
                            {/* Fee Overview Cards */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                                    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Total Paid</p>
                                    <p className="text-2xl font-black text-green-600">₹{data.fees.totalPaid}</p>
                                </div>
                                <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                                    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Pending Dues</p>
                                    <p className="text-2xl font-black text-red-600">₹{data.fees.balance}</p>
                                </div>
                            </div>

                            {/* Transaction History */}
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                                <div className="p-5 border-b border-gray-100">
                                    <h2 className="font-bold flex items-center gap-2">
                                        <Receipt className="w-5 h-5 text-gray-400" />
                                        Transaction History
                                    </h2>
                                </div>
                                <div className="divide-y divide-gray-100">
                                    {data.fees.transactions.length === 0 ? (
                                        <div className="p-8 text-center text-gray-500">
                                            No transactions found
                                        </div>
                                    ) : (
                                        data.fees.transactions.map((tx: any) => (
                                            <div key={tx.id} className="p-4 flex items-center justify-between">
                                                <div>
                                                    <p className="font-bold">{new Date(tx.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                                                    <p className="text-sm text-gray-500">{tx.label}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="font-black text-green-600">+₹{tx.amount.toLocaleString('en-IN')}</p>
                                                    <p className="text-xs font-bold text-green-500 uppercase">{tx.status}</p>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {activeTab === 'performance' && (
                        <motion.div
                            key="performance"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="space-y-6"
                        >
                            {/* Chart */}
                            {data.performance.length > 0 && (
                                <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                                    <h2 className="font-bold mb-4 flex items-center gap-2">
                                        <TrendingUp className="w-5 h-5 text-gray-400" />
                                        Progress Chart
                                    </h2>
                                    <div className="h-[250px]">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <LineChart data={data.performance}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                                <XAxis 
                                                    dataKey="testName" 
                                                    tickFormatter={(name) => name.substring(0, 10) + '...'}
                                                    style={{ fontSize: 10, fill: '#9ca3af' }}
                                                />
                                                <YAxis 
                                                    domain={[0, 100]} 
                                                    style={{ fontSize: 10, fill: '#9ca3af' }}
                                                />
                                                <Tooltip 
                                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                                    formatter={(value: number) => [`${value.toFixed(1)}%`, 'Percentage']}
                                                />
                                                <Line 
                                                    type="monotone" 
                                                    dataKey="percentage" 
                                                    stroke="#000000" 
                                                    strokeWidth={3}
                                                    dot={{ fill: '#000000', strokeWidth: 2, r: 4 }}
                                                />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            )}

                            {/* Tests List */}
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                                <div className="p-5 border-b border-gray-100">
                                    <h2 className="font-bold flex items-center gap-2">
                                        <BookOpen className="w-5 h-5 text-gray-400" />
                                        Past Tests
                                    </h2>
                                </div>
                                <div className="divide-y divide-gray-100">
                                    {data.performance.length === 0 ? (
                                        <div className="p-8 text-center text-gray-500">
                                            No test records found
                                        </div>
                                    ) : (
                                        data.performance.map((test: any) => (
                                            <div key={test.testId} className="p-4 flex items-center justify-between">
                                                <div>
                                                    <p className="font-bold">{test.testName}</p>
                                                    <p className="text-sm text-gray-500">
                                                        {new Date(test.date).toLocaleDateString()} · {test.subject}
                                                    </p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="font-black text-lg">
                                                        {test.score} <span className="text-sm text-gray-400 font-medium">/ {test.maxMarks}</span>
                                                    </p>
                                                    <p className={`text-xs font-bold ${test.percentage >= 75 ? 'text-green-600' : test.percentage >= 40 ? 'text-orange-500' : 'text-red-600'}`}>
                                                        {test.percentage.toFixed(1)}%
                                                    </p>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>
        </div>
    );
}
