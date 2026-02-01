import { useState, useEffect } from 'react';
import { api } from '../utils/api';
import Layout from '../components/Layout';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, LineChart } from 'recharts';
import { Users, Wallet, TrendingUp, Eye, EyeOff, BookOpen, IndianRupee } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import CountUp from 'react-countup';

export default function Dashboard() {
    const [stats, setStats] = useState({ batches: 0, students: 0 });
    const [growthData, setGrowthData] = useState([]);
    const [finances, setFinances] = useState({ collected: 0, monthlyCollected: 0, pending: 0 }); // Added monthlyCollected
    const [defaulters, setDefaulters] = useState<any[]>([]);
    const [userName, setUserName] = useState('');

    // Separate loading states for progressive rendering
    const [loading, setLoading] = useState({ summary: true, growth: true });

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
                        const growth = await api.get('/stats/growth');
                        setGrowthData(growth);
                        setLoading(prev => ({ ...prev, growth: false }));
                    } catch (error) {
                        console.error('Failed to load growth data:', error);
                        setLoading(prev => ({ ...prev, growth: false }));
                    }
                });
            } else {
                // Fallback for browsers without requestIdleCallback
                setTimeout(async () => {
                    try {
                        const growth = await api.get('/stats/growth');
                        setGrowthData(growth);
                        setLoading(prev => ({ ...prev, growth: false }));
                    } catch (error) {
                        console.error('Failed to load growth data:', error);
                        setLoading(prev => ({ ...prev, growth: false }));
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

    const collectionRate = finances.collected + finances.pending > 0
        ? Math.min(100, Math.round((finances.collected / (finances.collected + finances.pending)) * 100))
        : 0;

    const getGreeting = () => {
        return 'Hello';
    };

    return (
        <Layout>
            {/* Personalized Greeting */}
            <div className="mb-8 animate-fadeIn">
                <h1 className="text-3xl font-bold tracking-tight text-slate-800">
                    {getGreeting()}, <span className="text-slate-500">{userName || 'Admin'}</span>
                </h1>
                <p className="text-slate-500 mt-2 text-lg">
                    Here's what's happening with your institute today.
                </p>
            </div>

            {/* Smart Insights Ticker */}
            <div className="mb-8 animate-fadeIn" style={{ animationDelay: '0.1s' }}>
                <div className="bg-white/80 backdrop-blur-sm border border-slate-200 rounded-2xl p-4 flex items-center justify-between shadow-sm hover:shadow-md transition-all">
                    <div className="flex items-center gap-3 overflow-hidden">
                        <AnimatePresence mode='wait'>
                            <motion.div
                                key={currentInsight}
                                initial={{ y: 20, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                exit={{ y: -20, opacity: 0 }}
                                className="flex items-center gap-3"
                            >
                                <div className={`w-2 h-2 rounded-full ${insights[currentInsight].type === 'warning' ? 'bg-amber-500' :
                                    insights[currentInsight].type === 'success' ? 'bg-green-500' : 'bg-blue-500'
                                    }`} />
                                <span className="text-slate-600 font-medium whitespace-nowrap">
                                    {insights[currentInsight].text}
                                </span>
                            </motion.div>
                        </AnimatePresence>
                    </div>
                    <div className="flex gap-1">
                        <div className="w-8 h-1.5 rounded-full bg-slate-800 transition-colors" />
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-200" />
                        <div className="w-1.5 h-1.5 rounded-full bg-slate-200" />
                    </div>
                </div>
            </div>

            {/* Main Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                {/* Total Students */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    whileHover={{ scale: 1.02 }}
                    className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl transition-all cursor-pointer group"
                >
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-slate-50 text-slate-700 rounded-2xl flex items-center justify-center group-hover:bg-slate-100 transition-colors">
                            <Users size={24} />
                        </div>
                        <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Total Students</p>
                            <h3 className="text-3xl font-black text-slate-800">
                                {loading.summary ? <div className="h-8 w-16 bg-slate-100 rounded animate-pulse" /> : <CountUp end={stats.students} duration={2} />}
                            </h3>
                        </div>
                    </div>
                </motion.div>

                {/* Active Batches */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    whileHover={{ scale: 1.02 }}
                    className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl transition-all cursor-pointer group"
                >
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-slate-50 text-slate-700 rounded-2xl flex items-center justify-center group-hover:bg-slate-100 transition-colors">
                            <BookOpen size={24} />
                        </div>
                        <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Active Batches</p>
                            <h3 className="text-3xl font-black text-slate-800">
                                {loading.summary ? <div className="h-8 w-16 bg-slate-100 rounded animate-pulse" /> : <CountUp end={stats.batches} duration={2} />}
                            </h3>
                        </div>
                    </div>
                </motion.div>

                {/* Collection Rate */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    whileHover={{ scale: 1.02 }}
                    className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl transition-all cursor-pointer group"
                >
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-slate-50 text-slate-700 rounded-2xl flex items-center justify-center group-hover:bg-slate-100 transition-colors">
                            <Wallet size={24} />
                        </div>
                        <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Collection Rate</p>
                            <h3 className="text-3xl font-black text-slate-800">
                                {loading.summary ? <div className="h-8 w-16 bg-slate-100 rounded animate-pulse" /> : <CountUp end={collectionRate} duration={2} suffix="%" />}
                            </h3>
                        </div>
                    </div>
                </motion.div>

                {/* Monthly Collected */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
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
                                    <>₹<CountUp end={finances.monthlyCollected} duration={2} separator="," /></>
                                ) : (
                                    <span className="text-gray-400">••••••</span>
                                )}
                            </p>
                        </div>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                setShowFeeData(!showFeeData);
                            }}
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
            </div>

            {/* Charts Grid - Mobile First */}
            <div className="mb-6">
                {/* Growth Trends Chart - Full Width */}
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
                        <div className="h-[250px] flex items-center justify-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                        </div>
                    ) : growthData.length > 0 ? (
                        <div className="h-[250px] w-full">
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
                        <div className="h-[250px] flex items-center justify-center">
                            <div className="text-center">
                                <TrendingUp className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                                <p className="text-sm text-gray-400">No growth data available</p>
                            </div>
                        </div>
                    )}
                </motion.div>
            </div>

            {/* Pending Dues List */}
            {showFeeData && defaulters.length > 0 && (
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
                                        ₹{batch.amount.toLocaleString()}
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
