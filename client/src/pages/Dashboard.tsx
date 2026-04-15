import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../utils/api';
import Layout from '../components/Layout';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, LineChart, BarChart, Bar } from 'recharts';
import { Users, Wallet, TrendingUp, Eye, EyeOff, BookOpen, IndianRupee } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import CountUp from 'react-countup';

interface GrowthPoint {
    name: string;
    students: number;
}

interface FinanceGrowthPoint {
    name: string;
    collected: number;
    remaining: number;
}

interface Defaulter {
    name: string;
    amount: number;
}

interface DashboardSummaryResponse {
    stats: {
        batches: number;
        students: number;
    };
    finances: {
        collected: number;
        totalCollected: number;
        pending: number;
    };
    defaulters: Defaulter[];
    userName?: string;
}

const DASHBOARD_INSIGHTS = [
    { text: 'Monitor fee collection regularly', type: 'warning' },
    { text: 'Student growth trending upward', type: 'success' },
    { text: 'Keep track of batch performance', type: 'info' }
] as const;

export default function Dashboard() {
    const [stats, setStats] = useState({ batches: 0, students: 0 });
    const [growthData, setGrowthData] = useState<GrowthPoint[]>([]);
    const [financeGrowthData, setFinanceGrowthData] = useState<FinanceGrowthPoint[]>([]);
    const [finances, setFinances] = useState({ collected: 0, totalCollected: 0, pending: 0 });
    const [defaulters, setDefaulters] = useState<Defaulter[]>([]);
    const [userName, setUserName] = useState('');

    // Separate loading states for progressive rendering
    const [loading, setLoading] = useState({ summary: true, growth: true, financeGrowth: true });

    // Privacy toggle for fee data — persisted across sessions
    const [showFeeData, setShowFeeData] = useState(() => {
        const saved = localStorage.getItem('mathlogs_hide_fees');
        return saved === null ? true : saved !== 'true';
    });

    const toggleFeeVisibility = () => {
        setShowFeeData(prev => {
            const next = !prev;
            localStorage.setItem('mathlogs_hide_fees', next ? 'false' : 'true');
            return next;
        });
    };

    // Rotating insights
    const [currentInsight, setCurrentInsight] = useState(0);

    useEffect(() => {
        // OPTIMIZATION 1: Load critical summary data FIRST (non-blocking)
        const loadSummary = async () => {
            try {
                const data = await api.get<DashboardSummaryResponse>('/dashboard/summary');

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
                            api.get<GrowthPoint[]>('/stats/growth'),
                            api.get<FinanceGrowthPoint[]>('/stats/finance-growth')
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
                            api.get<GrowthPoint[]>('/stats/growth'),
                            api.get<FinanceGrowthPoint[]>('/stats/finance-growth')
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
            setCurrentInsight((prev) => (prev + 1) % DASHBOARD_INSIGHTS.length);
        }, 4000);
        return () => clearInterval(interval);
    }, []);

    // Collection rate based on total collected (all-time), not monthly
    const collectionRate = finances.totalCollected + finances.pending > 0
        ? Math.min(100, Math.round((finances.totalCollected / (finances.totalCollected + finances.pending)) * 100))
        : 0;

    // Synchronize the raw graph's remaining calculations with the exact clamped system pending dues 
    // to absorb edge-cases like overpayments overriding unallocated totals
    const adjustedFinanceGrowthData = useMemo(() => {
        if (!financeGrowthData.length) return [];
        const lastBar = financeGrowthData[financeGrowthData.length - 1];
        if (!lastBar || finances.pending <= 0) return financeGrowthData;
        
        const diff = finances.pending - lastBar.remaining;
        if (diff === 0) return financeGrowthData;
        
        return financeGrowthData.map(d => ({
            ...d,
            remaining: Math.max(0, d.remaining + diff)
        }));
    }, [financeGrowthData, finances.pending]);

    const getGreeting = () => {
        return 'Hello';
    };

    return (
        <Layout>
            {/* Personalized Greeting */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 sm:mb-8"
            >
                <h1 className="text-3xl sm:text-4xl font-extrabold text-black tracking-tighter mb-1.5">
                    {getGreeting()}, <span className="text-app-text-tertiary">{userName}</span>
                </h1>
                <p className="text-app-text-secondary font-medium text-sm sm:text-base">Here's what's happening with your institute today.</p>
            </motion.div>

            {/* Smart Insights Card - Animated Rotation */}
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="mb-6 p-4 rounded-2xl bg-app-surface-opaque border-[1.5px] border-black/5 relative overflow-hidden shadow-sm"
            >
                <AnimatePresence mode="wait">
                    <motion.div
                        key={currentInsight}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.4 }}
                        className="flex items-center gap-3 relative z-10"
                    >
                        <span className="w-2 h-2 rounded-full bg-accent-primary animate-pulse shrink-0" />
                        <p className="text-sm font-semibold text-app-text">{DASHBOARD_INSIGHTS[currentInsight].text}</p>
                    </motion.div>
                </AnimatePresence>
                <div className="absolute bottom-2 right-4 flex gap-1.5">
                    {DASHBOARD_INSIGHTS.map((_, i) => (
                        <div
                            key={i}
                            className={`h-1.5 rounded-full transition-all duration-300 ${i === currentInsight ? 'bg-black w-5' : 'bg-black/15 w-1.5'
                                }`}
                        />
                    ))}
                </div>
            </motion.div>

            {/* Stats Overview - Premium Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
                {/* Total Students */}
                {loading.summary ? (
                    <div className="h-[100px] sm:h-[110px] rounded-2xl sm:rounded-[24px] bg-neutral-50/80 border border-black/5 animate-pulse" />
                ) : (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15 }}
                        className="group bg-app-surface-opaque border-[1.5px] border-black/5 px-4 sm:px-5 py-4 sm:py-5 rounded-2xl sm:rounded-[24px] shadow-sm hover:shadow-xl hover:shadow-black/5 transition-all duration-300 cursor-pointer relative overflow-hidden hover:-translate-y-0.5"
                    >
                        <div className="absolute top-0 right-0 w-20 h-20 bg-accent-primary/5 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 -translate-y-1/2 translate-x-1/3" />
                        <div className="flex items-center gap-3 sm:gap-4 relative z-10">
                            <div className="w-10 h-10 sm:w-11 sm:h-11 bg-black text-white rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0">
                                <Users className="w-5 h-5" strokeWidth={2} />
                            </div>
                            <div className="min-w-0">
                                <p className="text-[10px] sm:text-xs text-app-text-tertiary font-bold uppercase tracking-widest mb-0.5">Students</p>
                                <p className="text-2xl sm:text-3xl font-extrabold text-black tracking-tighter">
                                    <CountUp end={stats.students} duration={2} />
                                </p>
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* Active Batches */}
                {loading.summary ? (
                    <div className="h-[100px] sm:h-[110px] rounded-2xl sm:rounded-[24px] bg-neutral-50/80 border border-black/5 animate-pulse" />
                ) : (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="group bg-app-surface-opaque border-[1.5px] border-black/5 px-4 sm:px-5 py-4 sm:py-5 rounded-2xl sm:rounded-[24px] shadow-sm hover:shadow-xl hover:shadow-black/5 transition-all duration-300 cursor-pointer relative overflow-hidden hover:-translate-y-0.5"
                    >
                        <div className="absolute top-0 right-0 w-20 h-20 bg-accent-primary/5 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 -translate-y-1/2 translate-x-1/3" />
                        <div className="flex items-center gap-3 sm:gap-4 relative z-10">
                            <div className="w-10 h-10 sm:w-11 sm:h-11 bg-black text-white rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0">
                                <BookOpen className="w-5 h-5" strokeWidth={2} />
                            </div>
                            <div className="min-w-0">
                                <p className="text-[10px] sm:text-xs text-app-text-tertiary font-bold uppercase tracking-widest mb-0.5">Batches</p>
                                <p className="text-2xl sm:text-3xl font-extrabold text-black tracking-tighter">
                                    <CountUp end={stats.batches} duration={2} />
                                </p>
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* Fee Collection Rate - Circular Progress */}
                {loading.summary ? (
                    <div className="h-[100px] sm:h-[110px] rounded-2xl sm:rounded-[24px] bg-neutral-50/80 border border-black/5 animate-pulse" />
                ) : (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.25 }}
                        className="group bg-app-surface-opaque border-[1.5px] border-black/5 px-4 sm:px-5 py-4 sm:py-5 rounded-2xl sm:rounded-[24px] shadow-sm hover:shadow-xl hover:shadow-black/5 transition-all duration-300 cursor-pointer relative overflow-hidden hover:-translate-y-0.5"
                    >
                        <div className="absolute top-0 right-0 w-20 h-20 bg-accent-primary/5 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 -translate-y-1/2 translate-x-1/3" />
                        <div className="flex items-center gap-3 sm:gap-4 relative z-10">
                            <div className="relative w-10 h-10 sm:w-11 sm:h-11 shrink-0">
                                <svg className="w-full h-full transform -rotate-90">
                                    <circle cx="50%" cy="50%" r="42%" stroke="#f0f0f0" strokeWidth="3.5" fill="none" />
                                    <motion.circle
                                        cx="50%"
                                        cy="50%"
                                        r="42%"
                                        stroke="#000000"
                                        strokeWidth="3.5"
                                        fill="none"
                                        strokeLinecap="round"
                                        initial={{ strokeDasharray: '0 125.6' }}
                                        animate={{ strokeDasharray: `${(collectionRate / 100) * 125.6} 125.6` }}
                                        transition={{ duration: 2 }}
                                    />
                                </svg>
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <Wallet className="w-4 h-4 text-black" strokeWidth={2} />
                                </div>
                            </div>
                            <div className="min-w-0">
                                <p className="text-[10px] sm:text-xs text-app-text-tertiary font-bold uppercase tracking-widest mb-0.5">Collection</p>
                                <p className="text-2xl sm:text-3xl font-extrabold text-black tracking-tighter">
                                    <CountUp end={collectionRate} duration={2} suffix="%" />
                                </p>
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* Monthly Revenue - with Privacy Toggle */}
                {loading.summary ? (
                    <div className="h-[100px] sm:h-[110px] rounded-2xl sm:rounded-[24px] bg-neutral-50/80 border border-black/5 animate-pulse" />
                ) : (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="group bg-app-surface-opaque border-[1.5px] border-black/5 px-4 sm:px-5 py-4 sm:py-5 rounded-2xl sm:rounded-[24px] shadow-sm hover:shadow-xl hover:shadow-black/5 transition-all duration-300 cursor-pointer relative overflow-hidden hover:-translate-y-0.5"
                    >
                        <div className="absolute top-0 right-0 w-20 h-20 bg-accent-primary/5 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 -translate-y-1/2 translate-x-1/3" />
                        <div className="flex items-center gap-3 sm:gap-4 relative z-10">
                            <div className="w-10 h-10 sm:w-11 sm:h-11 bg-black text-white rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0">
                                <IndianRupee className="w-5 h-5" strokeWidth={2} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 mb-0.5">
                                    <p className="text-[10px] sm:text-xs text-app-text-tertiary font-bold uppercase tracking-widest">This Month</p>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); toggleFeeVisibility(); }}
                                        className="p-1 hover:bg-neutral-200 rounded-md transition-colors z-20 active:scale-90"
                                    >
                                        {showFeeData ? (
                                            <Eye className="w-4 h-4 text-app-text-tertiary" />
                                        ) : (
                                            <EyeOff className="w-4 h-4 text-app-text-tertiary" />
                                        )}
                                    </button>
                                </div>
                                <p className="text-xl sm:text-3xl font-extrabold text-black tracking-tighter truncate">
                                    {showFeeData ? (
                                        <>₹<CountUp end={finances.collected} duration={2} separator="," /></>
                                    ) : (
                                        <span className="text-app-text-tertiary">••••••</span>
                                    )}
                                </p>
                            </div>
                        </div>
                    </motion.div>
                )}
            </div>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-6">
                {/* Growth Trends Chart */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="bg-app-surface-opaque border-[1.5px] border-black/5 p-5 sm:p-6 rounded-2xl sm:rounded-[28px] shadow-sm"
                >
                    <h3 className="text-sm font-bold text-app-text mb-5 flex items-center gap-2.5 uppercase tracking-widest">
                        <div className="w-7 h-7 bg-black text-white rounded-lg flex items-center justify-center">
                            <TrendingUp className="w-4 h-4" />
                        </div>
                        Growth Trends
                    </h3>
                    {loading.growth ? (
                        <div className="h-[260px] flex items-center justify-center">
                            <div className="w-7 h-7 border-2 border-black border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : growthData.length > 0 ? (
                        <div className="h-[260px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={growthData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                    <XAxis dataKey="name" stroke="#9ca3af" style={{ fontSize: '11px', fontWeight: 600 }} />
                                    <YAxis stroke="#9ca3af" style={{ fontSize: '11px', fontWeight: 600 }} />
                                    <Tooltip
                                        contentStyle={{
                                            backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                            border: '1.5px solid rgba(0,0,0,0.05)',
                                            borderRadius: '16px',
                                            backdropFilter: 'blur(10px)',
                                            padding: '10px 14px',
                                            fontWeight: 600,
                                            fontSize: '13px'
                                        }}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="students"
                                        stroke="#000000"
                                        strokeWidth={2.5}
                                        dot={{ fill: '#000000', r: 4, strokeWidth: 0 }}
                                        activeDot={{ fill: '#000000', r: 6, strokeWidth: 3, stroke: '#fff' }}
                                        animationDuration={2000}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="h-[260px] flex items-center justify-center">
                            <div className="text-center">
                                <div className="w-14 h-14 bg-neutral-50 rounded-full flex items-center justify-center mx-auto mb-3">
                                    <TrendingUp className="w-7 h-7 text-app-text-tertiary" />
                                </div>
                                <p className="text-sm text-app-text-tertiary font-medium">No growth data available</p>
                            </div>
                        </div>
                    )}
                </motion.div>

                {/* Fee Collected vs Remaining - Bar Chart */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="bg-app-surface-opaque border-[1.5px] border-black/5 p-5 sm:p-6 rounded-2xl sm:rounded-[28px] shadow-sm flex flex-col justify-between"
                >
                    <h3 className="text-sm font-bold text-app-text mb-5 flex items-center gap-2.5 uppercase tracking-widest">
                        <div className="w-7 h-7 bg-black text-white rounded-lg flex items-center justify-center">
                            <Wallet className="w-4 h-4" />
                        </div>
                        Fee Overview
                    </h3>
                    {loading.financeGrowth ? (
                        <div className="h-[260px] flex items-center justify-center">
                            <div className="w-7 h-7 border-2 border-black border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : financeGrowthData.length > 0 ? (
                        <>
                            <div className="h-[260px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart
                                        data={adjustedFinanceGrowthData}
                                        margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                                        barGap={4}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                                        <XAxis
                                            dataKey="name"
                                            stroke="#9ca3af"
                                            style={{ fontSize: '11px', fontWeight: 600 }}
                                        />
                                        <YAxis
                                            stroke="#9ca3af"
                                            style={{ fontSize: '11px', fontWeight: 600 }}
                                            tickFormatter={(v: number) => showFeeData ? `₹${(v / 1000).toFixed(0)}k` : '₹•••'}
                                        />
                                        <Tooltip
                                            contentStyle={{
                                                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                                                border: '1.5px solid rgba(0,0,0,0.05)',
                                                borderRadius: '16px',
                                                backdropFilter: 'blur(10px)',
                                                padding: '10px 14px',
                                                fontWeight: 600,
                                                fontSize: '13px'
                                            }}
                                            formatter={(value: number | string, name: string) => [
                                                showFeeData ? `₹${(value ?? 0).toLocaleString()}` : '₹••••••',
                                                name === 'Collected' ? 'Collected' : 'Remaining'
                                            ]}
                                        />
                                        <Bar dataKey="collected" name="Collected" fill="#000000" radius={[6, 6, 0, 0]} maxBarSize={36} />
                                        <Bar dataKey="remaining" name="Remaining" fill="#e5e5e5" radius={[6, 6, 0, 0]} maxBarSize={36} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                            {/* Legend */}
                            <div className="flex items-center justify-center gap-6 mt-4 pt-4 border-t border-black/5">
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-md bg-black" />
                                    <span className="text-xs text-app-text-secondary font-bold">Collected · {showFeeData ? `₹${finances.totalCollected.toLocaleString()}` : '₹••••••'}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-md bg-neutral-200" />
                                    <span className="text-xs text-app-text-secondary font-bold">Remaining · {showFeeData ? `₹${finances.pending.toLocaleString()}` : '₹••••••'}</span>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="h-[260px] flex items-center justify-center">
                            <div className="text-center">
                                <div className="w-14 h-14 bg-neutral-50 rounded-full flex items-center justify-center mx-auto mb-3">
                                    <Wallet className="w-7 h-7 text-app-text-tertiary" />
                                </div>
                                <p className="text-sm text-app-text-tertiary font-medium">No fee data available yet</p>
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
                    className="bg-app-surface-opaque border-[1.5px] border-black/5 p-5 sm:p-6 rounded-2xl sm:rounded-[28px] shadow-sm"
                >
                    <h3 className="text-sm font-bold text-app-text mb-5 flex items-center gap-2.5 uppercase tracking-widest">
                        <div className="w-7 h-7 bg-black text-white rounded-lg flex items-center justify-center">
                            <IndianRupee className="w-4 h-4" />
                        </div>
                        Pending Dues by Batch
                    </h3>
                    {loading.summary ? (
                        <div className="space-y-3">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="h-14 bg-neutral-50 border border-black/5 rounded-2xl animate-pulse" />
                            ))}
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {defaulters.map((batch, index) => (
                                <motion.div
                                    key={batch.name}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: 0.08 * index }}
                                    className="flex items-center justify-between p-3.5 sm:p-4 bg-neutral-50/80 hover:bg-neutral-100/80 rounded-2xl transition-all group border border-black/[0.03]"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 bg-black text-white rounded-xl flex items-center justify-center text-xs font-bold">
                                            {index + 1}
                                        </div>
                                        <span className="font-bold text-app-text text-sm">{batch.name}</span>
                                    </div>
                                    <span className="text-black font-extrabold text-base sm:text-lg tracking-tight">
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
