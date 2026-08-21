import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { api } from '../utils/api';
import Layout from '../components/Layout';
import { useNavigate } from 'react-router-dom';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, LineChart, BarChart, Bar } from 'recharts';
import { Users, Wallet, TrendingUp, Eye, EyeOff, BookOpen, IndianRupee, Sparkles } from 'lucide-react';
import CountUp from 'react-countup';
import StudentSearch from '../components/StudentSearch';
import { cn } from '../utils/cn';
import { monthLabel } from '../features/month-coverage/monthCoverageViewModel';

interface ClassAveragePoint {
    name: string;
    average: number;
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

interface CurrentDashboardSummaryResponse {
    feeMode?: 'CURRENT_DUE_BASED';
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

interface MonthCoverageDashboardSummaryResponse {
    feeMode: 'MONTH_COVERAGE';
    stats: { batches: number; students: number };
    monthCoverage: {
        collectedRupees: number;
        receivedMonths: number;
        pendingMonths: number;
        overdueMonths: number;
        applicableMonths: number;
        progressPercent: number;
    };
    followUps: Array<{
        studentId: string;
        name: string;
        batchName: string;
        overdueMonths: number;
        oldestOverdueMonth: string;
    }>;
    userName?: string;
}

type DashboardSummaryResponse = CurrentDashboardSummaryResponse | MonthCoverageDashboardSummaryResponse;

const formatIndianRupee = (value: number) => new Intl.NumberFormat('en-IN').format(value);

export default function Dashboard() {
    const navigate = useNavigate();
    const isQuizOnly = localStorage.getItem('isQuizOnly') === 'true';
    const isPageOnly = localStorage.getItem('isPageOnly') === 'true';

    useEffect(() => {
        if (isPageOnly) {
            navigate('/marketplace-settings', { replace: true });
        }
    }, [isPageOnly, navigate]);

    // Privacy toggle for fee data — persisted across sessions
    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);

    const [showFeeData, setShowFeeData] = useState(() => {
        const saved = localStorage.getItem('mathlogs_hide_fees');
        if (saved !== null) return saved === 'false';
        return true;
    });

    const { data: summary, isLoading: summaryLoading } = useQuery({
        queryKey: ['dashboardSummary'],
        queryFn: () => api.get<DashboardSummaryResponse>('/dashboard/summary'),
        staleTime: 30000,
    });

    const { data: classAverageData = [], isLoading: growthLoading } = useQuery({
        queryKey: ['classAverage'],
        queryFn: () => api.get<ClassAveragePoint[]>('/stats/class-average'),
        staleTime: 30000,
    });

    const { data: installmentStatsData = [], isLoading: installmentStatsLoading } = useQuery({
        queryKey: ['installmentStats'],
        queryFn: () => api.get<FinanceGrowthPoint[]>('/dashboard/installment-stats'),
        staleTime: 30000,
        enabled: Boolean(summary && summary.feeMode !== 'MONTH_COVERAGE'),
    });

    const stats = summary?.stats || { batches: 0, students: 0 };
    const isMonthCoverage = summary?.feeMode === 'MONTH_COVERAGE';
    const finances = summary && summary.feeMode !== 'MONTH_COVERAGE' ? summary.finances : { collected: 0, totalCollected: 0, pending: 0 };
    const defaulters = summary && summary.feeMode !== 'MONTH_COVERAGE' ? summary.defaulters : [];
    const monthCoverage = isMonthCoverage ? summary.monthCoverage : null;
    const followUps = isMonthCoverage ? summary.followUps : [];
    const userName = summary?.userName || 'Teacher';
    const loading = {
        summary: summaryLoading,
        growth: growthLoading,
        financeGrowth: installmentStatsLoading
    };

    const toggleFeePrivacy = () => {
        setShowFeeData((prev) => {
            const next = !prev;
            localStorage.setItem('mathlogs_hide_fees', next ? 'false' : 'true');
            return next;
        });
    };

    // Collection rate based on total collected (all-time), not monthly
    const collectionRate = monthCoverage ? monthCoverage.progressPercent : finances.totalCollected + finances.pending > 0
        ? Math.min(100, Math.round((finances.totalCollected / (finances.totalCollected + finances.pending)) * 100))
        : 0;

    const chartTotals = useMemo(() => {
        const collected = installmentStatsData.reduce((sum, d) => sum + (d.collected || 0), 0);
        const remaining = installmentStatsData.reduce((sum, d) => sum + (d.remaining || 0), 0);
        return { collected, remaining };
    }, [installmentStatsData]);

    const getGreeting = () => {
        return 'Hello';
    };

    return (
        <Layout>
            <div className="relative z-50 flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6 sm:mb-8 animate-fade-in-up">
                <div>
                    <h1 className="text-3xl sm:text-4xl font-extrabold text-black tracking-tighter mb-1.5">
                        {getGreeting()}, <span className="text-app-text-tertiary">{userName}</span>
                    </h1>
                    <p className="text-app-text-secondary font-medium text-sm sm:text-base">
                        {isQuizOnly ? "Welcome to your Quiz Portal." : "Here's what's happening with your institute today."}
                    </p>
                </div>
                {!isQuizOnly && (
                    <div className="w-full md:w-96">
                        <StudentSearch />
                    </div>
                )}
            </div>

            {isQuizOnly ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-6">
                    <div
                        onClick={() => navigate('/quizzes')}
                        className="animate-fade-in-up group bg-app-surface-opaque border-[1.5px] border-black/5 px-4 sm:px-5 py-6 sm:py-8 rounded-2xl sm:rounded-[24px] shadow-sm hover:shadow-xl hover:shadow-black/5 transition-all duration-300 cursor-pointer relative overflow-hidden"
                    >
                        <div className="flex flex-col items-center justify-center text-center gap-4 relative z-10">
                            <div className="w-12 h-12 bg-black text-white rounded-2xl flex items-center justify-center">
                                <Sparkles className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="font-bold text-lg text-black mb-1">Create a Quiz</h3>
                                <p className="text-sm text-app-text-tertiary">Generate or manage your quizzes</p>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <>
                    {/* Stats Overview - Premium Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
                {/* Total Students */}
                {loading.summary ? (
                    <div className="h-[100px] sm:h-[110px] rounded-2xl sm:rounded-[24px] bg-neutral-50/80 border border-black/5 animate-pulse" />
                ) : (
                    <div
                        style={{ animationDelay: '150ms' }}
                        className="animate-fade-in-up group bg-app-surface-opaque border-[1.5px] border-black/5 px-4 sm:px-5 py-4 sm:py-5 rounded-2xl sm:rounded-[24px] shadow-sm hover:shadow-xl hover:shadow-black/5 transition-all duration-300 cursor-pointer relative overflow-hidden hover:-translate-y-0.5"
                    >
                        <div className="absolute top-0 right-0 w-20 h-20 bg-accent-primary/5 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 -translate-y-1/2 translate-x-1/3" />
                        <div className="flex items-center gap-2 min-[375px]:gap-3 sm:gap-4 relative z-10">
                            <div className="w-8 h-8 min-[375px]:w-10 min-[375px]:h-10 sm:w-11 sm:h-11 bg-black text-white rounded-lg sm:rounded-2xl flex items-center justify-center shrink-0">
                                <Users className="w-4 h-4 min-[375px]:w-5 min-[375px]:h-5" strokeWidth={2} />
                            </div>
                            <div className="min-w-0">
                                <p className="text-[10px] sm:text-xs text-app-text-tertiary font-bold uppercase tracking-widest mb-0.5">Students</p>
                                <p className="text-xl min-[375px]:text-2xl sm:text-3xl font-extrabold text-black tracking-tighter truncate">
                                    <CountUp end={stats.students} duration={2} />
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Active Batches */}
                {loading.summary ? (
                    <div className="h-[100px] sm:h-[110px] rounded-2xl sm:rounded-[24px] bg-neutral-50/80 border border-black/5 animate-pulse" />
                ) : (
                    <div
                        style={{ animationDelay: '200ms' }}
                        className="animate-fade-in-up group bg-app-surface-opaque border-[1.5px] border-black/5 px-4 sm:px-5 py-4 sm:py-5 rounded-2xl sm:rounded-[24px] shadow-sm hover:shadow-xl hover:shadow-black/5 transition-all duration-300 cursor-pointer relative overflow-hidden hover:-translate-y-0.5"
                    >
                        <div className="absolute top-0 right-0 w-20 h-20 bg-accent-primary/5 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 -translate-y-1/2 translate-x-1/3" />
                        <div className="flex items-center gap-2 min-[375px]:gap-3 sm:gap-4 relative z-10">
                            <div className="w-8 h-8 min-[375px]:w-10 min-[375px]:h-10 sm:w-11 sm:h-11 bg-black text-white rounded-lg sm:rounded-2xl flex items-center justify-center shrink-0">
                                <BookOpen className="w-4 h-4 min-[375px]:w-5 min-[375px]:h-5" strokeWidth={2} />
                            </div>
                            <div className="min-w-0">
                                <p className="text-[10px] sm:text-xs text-app-text-tertiary font-bold uppercase tracking-widest mb-0.5">Batches</p>
                                <p className="text-xl min-[375px]:text-2xl sm:text-3xl font-extrabold text-black tracking-tighter truncate">
                                    <CountUp end={stats.batches} duration={2} />
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Fee Collection Rate - Circular Progress */}
                {loading.summary ? (
                    <div className="h-[100px] sm:h-[110px] rounded-2xl sm:rounded-[24px] bg-neutral-50/80 border border-black/5 animate-pulse" />
                ) : (
                    <motion.div
                        whileHover={{ scale: 1.015, y: -2 }}
                        transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                        className="group bg-white/80 backdrop-blur-2xl border border-white/60 px-4 sm:px-5 py-4 sm:py-5 rounded-2xl sm:rounded-[24px] shadow-sm hover:shadow-xl transition-all cursor-pointer relative overflow-hidden"
                    >
                        <div className="flex items-center gap-2 min-[375px]:gap-3 sm:gap-4 relative z-10">
                            <div className="relative w-8 h-8 min-[375px]:w-10 min-[375px]:h-10 sm:w-11 sm:h-11 shrink-0">
                                <svg className="w-full h-full transform -rotate-90">
                                    <circle cx="50%" cy="50%" r="42%" stroke="#f0f0f0" strokeWidth="3.5" fill="none" />
                                    <circle
                                        cx="50%"
                                        cy="50%"
                                        r="42%"
                                        stroke="#000000"
                                        strokeWidth="3.5"
                                        fill="none"
                                        strokeLinecap="round"
                                        style={{ 
                                            strokeDasharray: mounted ? `${(collectionRate / 100) * 125.6} 125.6` : '0 125.6',
                                            transition: 'stroke-dasharray 2s ease-out'
                                        }}
                                    />
                                </svg>
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <Wallet className="w-3.5 h-3.5 min-[375px]:w-4 min-[375px]:h-4 text-black" strokeWidth={2} />
                                </div>
                            </div>
                            <div className="min-w-0">
                                <p className="text-[10px] sm:text-xs text-neutral-500 font-bold uppercase tracking-widest mb-0.5">Collection</p>
                                <p className="text-xl min-[375px]:text-2xl sm:text-3xl font-extrabold text-black tracking-tighter truncate">
                                    {monthCoverage ? `${monthCoverage.receivedMonths} / ${monthCoverage.applicableMonths}` : <CountUp end={collectionRate} duration={2} suffix="%" />}
                                </p>
                                {monthCoverage && <p className="text-[10px] font-black text-emerald-700">{collectionRate}% received</p>}
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* Monthly Revenue - with Privacy Toggle */}
                {loading.summary ? (
                    <div className="h-[100px] sm:h-[110px] rounded-2xl sm:rounded-[24px] bg-neutral-50/80 border border-black/5 animate-pulse" />
                ) : (
                    <div
                        style={{ animationDelay: '300ms' }}
                        className="animate-fade-in-up group bg-app-surface-opaque border-[1.5px] border-black/5 px-4 sm:px-5 py-4 sm:py-5 rounded-2xl sm:rounded-[24px] shadow-sm hover:shadow-xl hover:shadow-black/5 transition-all duration-300 cursor-pointer relative overflow-hidden hover:-translate-y-0.5"
                    >
                        <div className="absolute top-0 right-0 w-20 h-20 bg-accent-primary/5 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 -translate-y-1/2 translate-x-1/3" />
                        <div className="flex items-center gap-2 min-[375px]:gap-3 sm:gap-4 relative z-10">
                            <div className="w-8 h-8 min-[375px]:w-10 min-[375px]:h-10 sm:w-11 sm:h-11 bg-black text-white rounded-lg sm:rounded-2xl flex items-center justify-center shrink-0">
                                <IndianRupee className="w-4 h-4 min-[375px]:w-5 min-[375px]:h-5" strokeWidth={2} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1 min-[375px]:gap-1.5 mb-0.5 -ml-0.5 sm:ml-0">
                                    <p className="text-[10px] sm:text-xs text-app-text-tertiary font-bold uppercase tracking-widest">{monthCoverage ? 'Total Received' : 'This Month'}</p>
                                    <button
                                        onClick={(e) => { 
                                            e.stopPropagation(); 
                                            const newValue = !showFeeData;
                                            setShowFeeData(newValue);
                                            localStorage.setItem('dashboard_show_fees', String(newValue));
                                        }}
                                        className="p-1 hover:bg-neutral-200 rounded-md transition-colors z-20 active:scale-90"
                                    >
                                        {showFeeData ? (
                                            <Eye className="w-3.5 h-3.5 min-[375px]:w-4 min-[375px]:h-4 text-app-text-tertiary" />
                                        ) : (
                                            <EyeOff className="w-3.5 h-3.5 min-[375px]:w-4 min-[375px]:h-4 text-app-text-tertiary" />
                                        )}
                                    </button>
                                </div>
                                <p className="text-[17px] min-[375px]:text-xl sm:text-3xl font-extrabold text-black tracking-tighter truncate">
                                    {showFeeData ? (
                                        <>₹<CountUp end={monthCoverage?.collectedRupees ?? finances.collected} duration={2} formattingFn={formatIndianRupee} /></>
                                    ) : (
                                        <span className="text-app-text-tertiary">••••••</span>
                                    )}
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-6">
                {/* Class Performance Chart */}
                <div
                    style={{ animationDelay: '400ms' }}
                    className="animate-fade-in-up bg-app-surface-opaque border-[1.5px] border-black/5 p-5 sm:p-6 rounded-2xl sm:rounded-[28px] shadow-sm"
                >
                    <h3 className="text-sm font-bold text-app-text mb-5 flex items-center gap-2.5 uppercase tracking-widest">
                        <div className="w-7 h-7 bg-black text-white rounded-lg flex items-center justify-center">
                            <TrendingUp className="w-4 h-4" />
                        </div>
                        Class Performance
                    </h3>
                    {loading.growth ? (
                        <div className="h-[260px] flex items-center justify-center">
                            <div className="w-7 h-7 border-2 border-black border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : classAverageData.length > 0 ? (
                        <div style={{ width: '100%', height: 260 }}>
                            <ResponsiveContainer width="100%" height={260}>
                                <BarChart data={classAverageData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                                    <XAxis dataKey="name" stroke="#9ca3af" style={{ fontSize: '11px', fontWeight: 600 }} />
                                    <YAxis
                                        stroke="#9ca3af"
                                        style={{ fontSize: '11px', fontWeight: 600 }}
                                        domain={[0, 100]}
                                        tickFormatter={(v) => `${v}%`}
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
                                        formatter={(value: number) => [`${value}%`, 'Average Marks']}
                                    />
                                    <Bar
                                        dataKey="average"
                                        name="Average Marks"
                                        fill="#000000"
                                        radius={[6, 6, 0, 0]}
                                        maxBarSize={36}
                                        animationDuration={1500}
                                    />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="h-[260px] flex items-center justify-center">
                            <div className="text-center">
                                <div className="w-14 h-14 bg-neutral-50 rounded-full flex items-center justify-center mx-auto mb-3">
                                    <TrendingUp className="w-7 h-7 text-app-text-tertiary" />
                                </div>
                                <p className="text-sm text-app-text-tertiary font-medium">No performance data available yet</p>
                            </div>
                        </div>
                    )}
                </div>


                {/* Fee Collected vs Remaining - Bar Chart */}
                <div
                    style={{ animationDelay: '500ms' }}
                    className="animate-fade-in-up bg-app-surface-opaque border-[1.5px] border-black/5 p-5 sm:p-6 rounded-2xl sm:rounded-[28px] shadow-sm flex flex-col justify-between"
                >
                    <div className="flex items-center justify-between mb-5">
                        <h3 className="text-sm font-bold text-app-text flex items-center gap-2.5 uppercase tracking-widest">
                            <div className="w-7 h-7 bg-black text-white rounded-lg flex items-center justify-center">
                                <Wallet className="w-4 h-4" />
                            </div>
                            Fee Overview
                        </h3>
                    </div>

                    {monthCoverage ? (
                        <div className="flex h-[260px] flex-col justify-center">
                            <div className="grid grid-cols-3 gap-3 text-center">
                                <div className="rounded-2xl bg-emerald-50 p-4"><p className="text-2xl font-black text-emerald-800">{monthCoverage.receivedMonths}</p><p className="mt-1 text-[10px] font-black uppercase tracking-wider text-emerald-700">Received</p></div>
                                <div className="rounded-2xl bg-amber-50 p-4"><p className="text-2xl font-black text-amber-800">{monthCoverage.pendingMonths}</p><p className="mt-1 text-[10px] font-black uppercase tracking-wider text-amber-700">Pending</p></div>
                                <div className="rounded-2xl bg-red-50 p-4"><p className="text-2xl font-black text-red-700">{monthCoverage.overdueMonths}</p><p className="mt-1 text-[10px] font-black uppercase tracking-wider text-red-600">Overdue</p></div>
                            </div>
                            <div className="mt-6"><div className="flex justify-between text-xs font-black"><span>Month fee progress</span><span>{monthCoverage.progressPercent}%</span></div><div className="mt-2 h-3 overflow-hidden rounded-full bg-neutral-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${monthCoverage.progressPercent}%` }} /></div></div>
                        </div>
                    ) : loading.financeGrowth ? (
                        <div className="h-[260px] flex items-center justify-center">
                            <div className="w-7 h-7 border-2 border-black border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : installmentStatsData.length > 0 ? (
                        <>
                            <div style={{ width: '100%', height: 260 }}>
                                <ResponsiveContainer width="100%" height={260}>
                                    <BarChart
                                        data={installmentStatsData}
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
                                                showFeeData ? `₹${new Intl.NumberFormat('en-IN').format(Number(value) || 0)}` : '₹••••••',
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
                                    <span className="text-xs text-app-text-secondary font-bold">Collected · {showFeeData ? `₹${new Intl.NumberFormat('en-IN').format(chartTotals.collected)}` : '₹••••••'}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-md bg-neutral-200" />
                                    <span className="text-xs text-app-text-secondary font-bold">Remaining · {showFeeData ? `₹${new Intl.NumberFormat('en-IN').format(chartTotals.remaining)}` : '₹••••••'}</span>
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
                </div>
            </div>

            {isMonthCoverage && followUps.length > 0 && (
                <div className="animate-fade-in-up rounded-2xl border-[1.5px] border-black/5 bg-app-surface-opaque p-5 shadow-sm sm:rounded-[28px] sm:p-6">
                    <h3 className="mb-5 flex items-center gap-2.5 text-sm font-bold uppercase tracking-widest text-app-text">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-black text-white"><Wallet className="h-4 w-4" /></span>
                        Fee Follow-ups
                    </h3>
                    <div className="space-y-2">
                        {followUps.map((student, index) => (
                            <div key={student.studentId} className="flex items-center justify-between gap-4 rounded-2xl border border-black/[0.03] bg-neutral-50/80 p-3.5 sm:p-4">
                                <div className="flex min-w-0 items-center gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-black text-xs font-bold text-white">{index + 1}</span><div className="min-w-0"><p className="truncate text-sm font-bold text-app-text">{student.name}</p><p className="truncate text-xs text-app-text-tertiary">{student.batchName}</p></div></div>
                                <div className="text-right"><p className="text-sm font-black text-red-600">{student.overdueMonths} overdue month{student.overdueMonths === 1 ? '' : 's'}</p><p className="mt-0.5 text-xs font-bold text-app-text-tertiary">Oldest: {monthLabel(student.oldestOverdueMonth)}</p></div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Pending Dues List */}
            {defaulters.length > 0 && (
                <div
                    style={{ animationDelay: '600ms' }}
                    className="animate-fade-in-up bg-app-surface-opaque border-[1.5px] border-black/5 p-5 sm:p-6 rounded-2xl sm:rounded-[28px] shadow-sm"
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
                                <div
                                    key={batch.name}
                                    style={{ animationDelay: `${80 * index}ms` }}
                                    className="animate-fade-in-left flex items-center justify-between p-3.5 sm:p-4 bg-neutral-50/80 hover:bg-neutral-100/80 rounded-2xl transition-all group border border-black/[0.03]"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 bg-black text-white rounded-xl flex items-center justify-center text-xs font-bold">
                                            {index + 1}
                                        </div>
                                        <span className="font-bold text-app-text text-sm">{batch.name}</span>
                                    </div>
                                    <span className="text-black font-extrabold text-base sm:text-lg tracking-tight">
                                        {showFeeData ? `₹${new Intl.NumberFormat('en-IN').format(batch.amount)}` : '₹••••••'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
            </>
            )}
        </Layout>
    );
}
