import { useState, useEffect } from 'react';
import { api } from '../utils/api';
import Layout from '../components/Layout';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, LineChart, BarChart, Bar } from 'recharts';
import { Users, Wallet, TrendingUp, Eye, EyeOff, BookOpen, IndianRupee } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import CountUp from 'react-countup';

export default function Dashboard() {
    const [stats, setStats] = useState({ batches: 0, students: 0 });
    const [growthData, setGrowthData] = useState([]);
    const [financeGrowthData, setFinanceGrowthData] = useState([]);
    const [finances, setFinances] = useState({ collected: 0, totalCollected: 0, pending: 0 });
    const [defaulters, setDefaulters] = useState<any[]>([]);
    const [userName, setUserName] = useState('');

    // Separate loading states for progressive rendering
    const [loading, setLoading] = useState({ summary: true, growth: true, financeGrowth: true });

    // Privacy toggle for fee data
    const [showFeeData, setShowFeeData] = useState(true);

    // Rotating insights
    const [currentInsight, setCurrentInsight] = useState(0);
    const insights = [
        { text: 'Monitor fee collection regularly', type: 'warning' },
        { text: 'Student growth trending upward', type: 'success' },
        { text: 'Keep track of batch performance', type: 'info' }
    ];

    useEffect(() => {
        // OPTIMIZATION 1: Load critical summary data FIRST (non-blocking)
        const loadSummary = async () => {
            try {
                const data = await api.get('/dashboard/summary');

                setStats(data.stats);
                setFinances(data.finances);
                setDefaulters(data.defaulters);
                setUserName(data.userName || 'Teacher');

                setLoading(prev => ({ ...prev, summary: false }));
            } catch (error) {
                console.error('Failed to load dashboard summary:', error);
                setLoading(prev => ({ ...prev, summary: false }));
            }
        };

        // OPTIMIZATION 2: Load chart data in BACKGROUND (defer to idle time)
        const loadCharts = () => {
            // Use requestIdleCallback to defer chart loading until main thread is idle
            if ('requestIdleCallback' in window) {
                requestIdleCallback(async () => {
                    try {
                        const [growth, financeGrowth] = await Promise.all([
                            api.get('/stats/growth'),
                            api.get('/stats/finance-growth')
                        ]);
                        setGrowthData(growth);
                        setFinanceGrowthData(financeGrowth);
                        setLoading(prev => ({ ...prev, growth: false, financeGrowth: false }));
                    } catch (error) {
                        console.error('Failed to load chart data:', error);
                        setLoading(prev => ({ ...prev, growth: false, financeGrowth: false }));
                    }
                });
            } else {
                // Fallback for browsers without requestIdleCallback
                setTimeout(async () => {
                    try {
                        const [growth, financeGrowth] = await Promise.all([
                            api.get('/stats/growth'),
                            api.get('/stats/finance-growth')
                        ]);
                        setGrowthData(growth);
                        setFinanceGrowthData(financeGrowth);
                        setLoading(prev => ({ ...prev, growth: false, financeGrowth: false }));
                    } catch (error) {
                        console.error('Failed to load chart data:', error);
                        setLoading(prev => ({ ...prev, growth: false, financeGrowth: false }));
                    }
                }, 100);
            }
        };

        loadSummary();
        loadCharts();
    }, []);

    // Rotate insights every 4 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentInsight((prev) => (prev + 1) % insights.length);
        }, 4000);
        return () => clearInterval(interval);
    }, []);

    // Collection rate based on total collected (all-time), not monthly
    const collectionRate = finances.totalCollected + finances.pending > 0
        ? Math.min(100, Math.round((finances.totalCollected / (finances.totalCollected + finances.pending)) * 100))
        : 0;

    const getGreeting = () => {
        return 'Hello';
    };

    return (
        <Layout>
            {/* Personalized Greeting */}
            <div className="mb-8 animate-fadeIn">
                <h1 className="text-4xl font-bold text-gray-900 tracking-tight mb-2">
                    {getGreeting()}, <span className="text-gray-500">{userName}</span>
                </h1>
                <p className="text-gray-500 font-medium text-lg">Here's what's happening with your institute today.</p>
            </div>

            {/* Smart Insights Card - Animated Rotation */}
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-gray-50 to-gray-100 border border-gray-200 relative overflow-hidden"
            >
                <div className="absolute inset-0 bg-white/50 backdrop-blur-sm"></div>
                <AnimatePresence mode="wait">
                    <motion.div
                        key={currentInsight}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.4 }}
                        className="flex items-center gap-3 relative z-10"
                    >
                        <p className="text-sm font-medium text-gray-800">{insights[currentInsight].text}</p>
                    </motion.div>
                </AnimatePresence>
                <div className="absolute bottom-2 right-4 flex gap-1">
                    {insights.map((_, i) => (
                        <div
                            key={i}
                            className={`w-1.5 h-1.5 rounded-full transition-all ${i === currentInsight ? 'bg-gray-900 w-4' : 'bg-gray-400'
                                }`}
                        />
                    ))}
                </div>
            </motion.div>

            {/* Stats Overview - Mobile First Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                {/* Total Students - Glassmorphism */}
                {loading.summary ? (
                    <div className="animate-pulse bg-gray-100 h-24 rounded-2xl"></div>
                ) : (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        whileHover={{ scale: 1.02 }}
                        className="group bg-white/70 backdrop-blur-xl px-5 py-5 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-all cursor-pointer relative overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-gradient-to-br from-gray-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <div className="flex items-center gap-4 relative z-10">
                            <div className="w-12 h-12 bg-gray-100 border border-gray-200 text-gray-900 rounded-xl flex items-center justify-center">
                                <Users className="w-6 h-6" strokeWidth={1.5} />
                            </div>
                            <div>
                                <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1">Total Students</p>
                                <p className="text-3xl font-bold text-gray-900 tracking-tight">
                                    <CountUp end={stats.students} duration={2} />
                                </p>
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* Active Batches */}
                {loading.summary ? (
                    <div className="animate-pulse bg-gray-100 h-24 rounded-2xl"></div>
                ) : (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.1 }}
                        whileHover={{ scale: 1.02 }}
                        className="group bg-white/70 backdrop-blur-xl px-5 py-5 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-all cursor-pointer relative overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-gradient-to-br from-gray-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <div className="flex items-center gap-4 relative z-10">
                            <div className="w-12 h-12 bg-gray-100 border border-gray-200 text-gray-900 rounded-xl flex items-center justify-center">
                                <BookOpen className="w-6 h-6" strokeWidth={1.5} />
                            </div>
                            <div>
                                <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1">Active Batches</p>
                                <p className="text-3xl font-bold text-gray-900 tracking-tight">
                                    <CountUp end={stats.batches} duration={2} />
                                </p>
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* Fee Collection Rate - Circular Progress */}
                {loading.summary ? (
                    <div className="animate-pulse bg-gray-100 h-24 rounded-2xl"></div>
                ) : (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.2 }}
                        whileHover={{ scale: 1.02 }}
                        className="group bg-white/70 backdrop-blur-xl px-5 py-5 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-all cursor-pointer relative overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-gradient-to-br from-gray-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <div className="flex items-center gap-4 relative z-10">
                            <div className="relative w-12 h-12">
                                <svg className="w-12 h-12 transform -rotate-90">
                                    <circle cx="24" cy="24" r="20" stroke="#e5e7eb" strokeWidth="4" fill="none" />
                                    <motion.circle
                                        cx="24"
                                        cy="24"
                                        r="20"
                                        stroke="#111827"
                                        strokeWidth="4"
                                        fill="none"
                                        strokeLinecap="round"
                                        initial={{ strokeDasharray: '0 125.6' }}
                                        animate={{ strokeDasharray: `${(collectionRate / 100) * 125.6} 125.6` }}
                                        transition={{ duration: 2 }}
                                    />
                                </svg>
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <Wallet className="w-5 h-5 text-gray-900" strokeWidth={1.5} />
                                </div>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1">Collection Rate</p>
                                <p className="text-3xl font-bold text-gray-900 tracking-tight">
                                    <CountUp end={collectionRate} duration={2} suffix="%" />
                                </p>
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* Monthly Revenue - with Privacy Toggle */}
                {loading.summary ? (
                    <div className="animate-pulse bg-gray-100 h-24 rounded-2xl"></div>
                ) : (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.3 }}
                        whileHover={{ scale: 1.02 }}
                        className="group bg-white/70 backdrop-blur-xl px-5 py-5 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-all cursor-pointer relative overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-gradient-to-br from-gray-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <div className="flex items-center gap-4 relative z-10">
                            <div className="w-12 h-12 bg-gray-100 border border-gray-200 text-gray-900 rounded-xl flex items-center justify-center">
                                <IndianRupee className="w-6 h-6" strokeWidth={1.5} />
                            </div>
                            <div className="flex-1">
                                <p className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1">This Month</p>
                                <p className="text-3xl font-bold text-gray-900 tracking-tight">
                                    {showFeeData ? (
                                        <>₹<CountUp end={finances.collected} duration={2} separator="," /></>
                                    ) : (
                                        <span className="text-gray-400">••••••</span>
                                    )}
                                </p>
                            </div>
                            <button
                                onClick={() => setShowFeeData(!showFeeData)}
                                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                {showFeeData ? (
                                    <Eye className="w-4 h-4 text-gray-600" />
                                ) : (
                                    <EyeOff className="w-4 h-4 text-gray-400" />
                                )}
                            </button>
                        </div>
                    </motion.div>
                )}
            </div>

            {/* Charts Grid - Mobile First */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                {/* Growth Trends Chart */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="bg-white/70 backdrop-blur-xl p-5 rounded-2xl border border-gray-200 shadow-sm"
                >
                    <h3 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-gray-900" />
                        Growth Trends
                    </h3>
                    {loading.growth ? (
                        <div className="h-[280px] flex items-center justify-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                        </div>
                    ) : growthData.length > 0 ? (
                        <div className="h-[280px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={growthData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                    <XAxis dataKey="name" stroke="#9ca3af" style={{ fontSize: '12px' }} />
                                    <YAxis stroke="#9ca3af" style={{ fontSize: '12px' }} />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                            border: '1px solid #e5e7eb',
                                            borderRadius: '12px',
                                            backdropFilter: 'blur(10px)'
                                        }}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="students"
                                        stroke="#111827"
                                        strokeWidth={2}
                                        dot={{ fill: '#111827', r: 4 }}
                                        animationDuration={2000}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="h-[280px] flex items-center justify-center">
                            <div className="text-center">
                                <TrendingUp className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                                <p className="text-sm text-gray-400">No growth data available</p>
                            </div>
                        </div>
                    )}
                </motion.div>

                {/* Fee Collected vs Remaining - Bar Chart */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="bg-white/70 backdrop-blur-xl p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between"
                >
                    <h3 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <Wallet className="w-5 h-5 text-gray-900" />
                        Fee Overview
                    </h3>
                    {loading.financeGrowth ? (
                        <div className="h-[280px] flex items-center justify-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                        </div>
                    ) : financeGrowthData.length > 0 ? (
                        <>
                            <div className="h-[280px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart
                                        data={financeGrowthData}
                                        margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                                        barGap={4}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                                        <XAxis
                                            dataKey="name"
                                            stroke="#9ca3af"
                                            style={{ fontSize: '12px' }}
                                        />
                                        <YAxis
                                            stroke="#9ca3af"
                                            style={{ fontSize: '12px' }}
                                            tickFormatter={(v: number) => showFeeData ? `₹${(v / 1000).toFixed(0)}k` : '₹•••'}
                                        />
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                                border: '1px solid #e5e7eb',
                                                borderRadius: '12px',
                                                backdropFilter: 'blur(10px)',
                                                padding: '12px 16px'
                                            }}
                                            formatter={((value: number | undefined, name: string | undefined) => [
                                                showFeeData ? `₹${(value ?? 0).toLocaleString()}` : '₹••••••',
                                                name === 'collected' ? 'Collected' : 'Remaining'
                                            ]) as any}
                                        />
                                        <Bar dataKey="collected" name="Collected" fill="#111827" radius={[4, 4, 0, 0]} maxBarSize={40} />
                                        <Bar dataKey="remaining" name="Remaining" fill="#d1d5db" radius={[4, 4, 0, 0]} maxBarSize={40} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                            {/* Legend */}
                            <div className="flex items-center justify-center gap-6 mt-3">
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-sm bg-gray-900"></div>
                                    <span className="text-sm text-gray-600 font-medium">Collected · {showFeeData ? `₹${finances.totalCollected.toLocaleString()}` : '₹••••••'}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-sm bg-gray-300"></div>
                                    <span className="text-sm text-gray-600 font-medium">Remaining · {showFeeData ? `₹${finances.pending.toLocaleString()}` : '₹••••••'}</span>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="h-[280px] flex items-center justify-center">
                            <div className="text-center">
                                <Wallet className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                                <p className="text-sm text-gray-400">No fee data available yet</p>
                            </div>
                        </div>
                    )}
                </motion.div>
            </div>

            {/* Pending Dues List */}
            {defaulters.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 }}
                    className="bg-white/70 backdrop-blur-xl p-5 rounded-2xl border border-gray-200 shadow-sm"
                >
                    <h3 className="text-base font-bold text-gray-900 mb-4">Pending Dues by Batch</h3>
                    {loading.summary ? (
                        <div className="space-y-3">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="animate-pulse h-16 bg-gray-100 rounded-xl"></div>
                            ))}
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {defaulters.map((batch, index) => (
                                <motion.div
                                    key={batch.name}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: 0.1 * index }}
                                    className="flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors group"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 bg-gray-900 text-white rounded-lg flex items-center justify-center text-sm font-bold">
                                            {index + 1}
                                        </div>
                                        <span className="font-medium text-gray-900">{batch.name}</span>
                                    </div>
                                    <span className="text-gray-900 font-bold text-lg">
                                        {showFeeData ? `₹${batch.amount.toLocaleString()}` : '₹••••••'}
                                    </span>
                                </motion.div>
                            ))}
                        </div>
                    )}
                </motion.div>
            )}
        </Layout>
    );
}
