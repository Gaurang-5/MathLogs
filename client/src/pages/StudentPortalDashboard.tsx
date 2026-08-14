import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { useMetaTags } from '../hooks/useMetaTags';
import {
    Wallet, LogOut, TrendingUp, BookOpen, Receipt,
    User, Phone, Mail, GraduationCap, School, X,
    ClipboardCheck, Timer, ChevronRight, CheckCircle2,
    ShieldAlert, Clock
} from 'lucide-react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts';

type Tab = 'performance' | 'quizzes' | 'fees';

const TABS: { key: Tab; label: string; Icon: React.ElementType }[] = [
    { key: 'performance', label: 'Tests', Icon: TrendingUp },
    { key: 'quizzes', label: 'Quizzes', Icon: ClipboardCheck },
    { key: 'fees', label: 'Fees', Icon: Wallet },
];

interface OnlineQuiz {
    id: string;
    title: string;
    topic?: string | null;
    difficulty?: string | null;
    timeLimitMins: number;
    totalMarks: number;
    availableFrom?: string | null;
    availableUntil?: string | null;
    availabilityStatus?: 'AVAILABLE' | 'MISSED' | 'SUBMITTED' | 'LOCKED' | 'SCHEDULED';
    canStart?: boolean;
    createdAt: string;
    questionCount: number;
    studentQuestionCount?: number | null;
    submission?: {
        id: string;
        score: number | null;
        startedAt: string;
        submittedAt: string | null;
    } | null;
}

export default function StudentPortalDashboard() {
    const { instituteSlug } = useParams<{ instituteSlug: string }>();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(!sessionStorage.getItem(`student_dash_${instituteSlug}`));
    const [data, setData] = useState<any>(() => {
        const cached = sessionStorage.getItem(`student_dash_${instituteSlug}`);
        return cached ? JSON.parse(cached) : null;
    });
    const [quizzes, setQuizzes] = useState<OnlineQuiz[]>(() => {
        const cached = sessionStorage.getItem(`student_quizzes_${instituteSlug}`);
        try {
            const parsed = cached ? JSON.parse(cached) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    });
    const [activeTab, setActiveTab] = useState<Tab>('performance');
    const [profileOpen, setProfileOpen] = useState(false);
    const [lockedQuizTitle, setLockedQuizTitle] = useState<string | null>(null);

    useMetaTags({
        title: data?.student?.instituteName ? `${data.student.instituteName} - Student Portal | MathLogs` : 'Student Dashboard - MathLogs',
        description: 'View your batch updates, test performance, fee receipts, and assigned quizzes on MathLogs.',
        robots: 'noindex, nofollow'
    });

    useEffect(() => {
        const fetchDashboard = async () => {
            const token = localStorage.getItem(`student_token_${instituteSlug}`);
            if (!token) { navigate(`/${instituteSlug}/student`); return; }
            const headers = { Authorization: `Bearer ${token}` };

            try {
                // Fetch in parallel
                const [dashboardRes, quizRes] = await Promise.all([
                    axios.get('/api/student-portal/dashboard', { headers }),
                    axios.get('/api/student-portal/quizzes', { headers })
                ]);
                
                setData(dashboardRes.data);
                const quizData = Array.isArray(quizRes.data) ? quizRes.data : [];
                setQuizzes(quizData);
                
                if (dashboardRes.data?.student?.isQuizOnly) {
                    setActiveTab('quizzes');
                }
                
                // PERF: Cache for instant loading on next visit
                sessionStorage.setItem(`student_dash_${instituteSlug}`, JSON.stringify(dashboardRes.data));
                sessionStorage.setItem(`student_quizzes_${instituteSlug}`, JSON.stringify(quizData));
            } catch {
                localStorage.removeItem(`student_token_${instituteSlug}`);
                sessionStorage.removeItem(`student_dash_${instituteSlug}`);
                sessionStorage.removeItem(`student_quizzes_${instituteSlug}`);
                toast.error('Session expired. Please log in again.');
                navigate(`/${instituteSlug}/student`);
            } finally {
                setLoading(false);
            }
        };

        fetchDashboard();

        // Auto-refresh when app regains focus
        const onFocus = () => fetchDashboard();
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
    }, [instituteSlug, navigate]);

    const handleLogout = () => {
        localStorage.removeItem(`student_token_${instituteSlug}`);
        navigate(`/${instituteSlug}/student`);
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="w-8 h-8 border-[3px] border-black border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }
    if (!data) return null;

    const initials = data.student.name.charAt(0).toUpperCase();
    const quizzesArray = Array.isArray(quizzes) ? quizzes : [];
    const scheduledQuizzes = quizzesArray.filter(quiz => quiz.availabilityStatus === 'SCHEDULED');
    const pendingQuizzes = quizzesArray.filter(quiz => !quiz.submission?.submittedAt && quiz.availabilityStatus !== 'LOCKED' && quiz.availabilityStatus !== 'SCHEDULED');
    const submittedQuizzes = quizzesArray.filter(quiz => quiz.submission?.submittedAt);

    return (
        <div className="min-h-screen bg-gray-50 text-gray-900 pb-32">
            {/* Pull-to-refresh spinner */}
            <header className="bg-white border-b border-gray-100 sticky top-0 z-40">
                <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
                    {/* Avatar circle — opens profile sheet */}
                    <button
                        onClick={() => setProfileOpen(true)}
                        className="w-9 h-9 rounded-full bg-black text-white flex items-center justify-center font-black text-sm flex-shrink-0 shadow-sm active:scale-95 transition-transform"
                        aria-label="View profile"
                    >
                        {initials}
                    </button>

                    {/* Name + batch centred */}
                    <div className="text-center min-w-0 flex-1 px-3">
                        <p className="font-bold text-sm leading-tight truncate">{data.student.name}</p>
                        {!data.student.isQuizOnly && <p className="text-xs text-gray-400 truncate">{data.student.batchName}</p>}
                    </div>

                    {/* Logout */}
                    <button
                        onClick={handleLogout}
                        className="p-2 -mr-1 text-gray-400 hover:text-black rounded-xl hover:bg-gray-100 active:bg-gray-200 transition-colors"
                        aria-label="Logout"
                    >
                        <LogOut className="w-5 h-5" />
                    </button>
                </div>
            </header>

            {/* ── CONTENT ── */}
            <main className="max-w-2xl mx-auto px-4 pt-5">
                <AnimatePresence mode="wait">

                    {/* ── PERFORMANCE ── */}
                    {activeTab === 'performance' && (
                        <motion.div key="performance"
                            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}
                            className="space-y-4"
                        >
                            {data.performance.length > 0 && (() => {
                                const scored = data.performance.filter((t: any) => t.status === 'SCORED');
                                const absent = data.performance.filter((t: any) => t.status === 'ABSENT');
                                const avg = scored.length
                                    ? scored.reduce((s: number, t: any) => s + t.percentage, 0) / scored.length
                                    : 0;
                                return (
                                    <div className="flex gap-3">
                                        <StatChip label="Tests Given" value={scored.length} />
                                        {absent.length > 0 && <StatChip label="Missed" value={absent.length} color="red" />}
                                        {scored.length > 0 && <StatChip label="Avg Score" value={`${avg.toFixed(1)}%`} color={avg >= 75 ? 'green' : avg >= 40 ? 'orange' : 'red'} />}
                                    </div>
                                );
                            })()}

                            {data.performance.filter((t: any) => t.status === 'SCORED').length > 0 && (
                                <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Score Trend</p>
                                    <div style={{ width: '100%', height: 192 }}>
                                        <ResponsiveContainer width="100%" height={192}>
                                            <LineChart data={data.performance.filter((t: any) => t.status === 'SCORED')} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                                                <XAxis
                                                    dataKey="testName"
                                                    tick={{ fontSize: 9, fill: '#9ca3af' }}
                                                    tickFormatter={(n: string) => n.length > 6 ? n.slice(0, 6) + '…' : n}
                                                    axisLine={false} tickLine={false}
                                                />
                                                <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                                                <ReferenceLine y={75} stroke="#22c55e" strokeDasharray="4 4" strokeWidth={1} />
                                                <Tooltip
                                                    contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: 12 }}
                                                    formatter={(v: number) => [`${Number(v).toFixed(1)}%`, 'Score']}
                                                />
                                                <Line type="monotone" dataKey="percentage" stroke="#000" strokeWidth={2.5}
                                                    dot={{ fill: '#000', r: 3, strokeWidth: 0 }} activeDot={{ r: 5 }} />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            )}

                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                                <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                                    <BookOpen className="w-4 h-4 text-gray-400" />
                                    <span className="font-bold text-sm">All Tests</span>
                                </div>
                                {data.performance.length === 0 ? (
                                    <EmptyState message="No test records yet" />
                                ) : (
                                    <div className="divide-y divide-gray-50">
                                        {data.performance.map((test: any) => {
                                            const isAbsent = test.status === 'ABSENT';
                                            return (
                                                <div key={test.testId} className={`px-4 py-3.5 flex items-center justify-between ${isAbsent ? 'opacity-60' : ''}`}>
                                                    <div className="min-w-0 mr-3">
                                                        <p className="font-semibold text-sm truncate">{test.testName}</p>
                                                        <p className="text-xs text-gray-400 mt-0.5">
                                                            {new Date(test.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                                            &nbsp;·&nbsp;{test.subject}
                                                        </p>
                                                    </div>
                                                    {isAbsent ? (
                                                        <span className="text-xs font-bold text-red-400 bg-red-50 px-2.5 py-1 rounded-full flex-shrink-0">
                                                            Absent
                                                        </span>
                                                    ) : (
                                                        <div className="text-right flex-shrink-0">
                                                            <p className="font-black text-base">
                                                                {test.score}<span className="text-gray-300 font-normal text-xs">/{test.maxMarks}</span>
                                                            </p>
                                                            <p className={`text-xs font-bold ${test.percentage >= 75 ? 'text-green-600' : test.percentage >= 40 ? 'text-orange-500' : 'text-red-500'}`}>
                                                                {test.percentage.toFixed(1)}%
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}

                    {/* ── QUIZZES ── */}
                    {activeTab === 'quizzes' && (
                        <motion.div key="quizzes"
                            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}
                            className="space-y-4"
                        >
                            <div className="grid grid-cols-2 gap-3">
                                <StatChip label="Pending" value={pendingQuizzes.length} color={pendingQuizzes.length ? 'orange' : 'green'} />
                                <StatChip label="Completed" value={submittedQuizzes.length} color="green" />
                            </div>

                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                                <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                                    <ClipboardCheck className="w-4 h-4 text-gray-400" />
                                    <span className="font-bold text-sm">Online Quizzes</span>
                                </div>
                                {quizzesArray.length === 0 ? (
                                    <EmptyState message="No online quizzes assigned yet" />
                                ) : (
                                    <div className="divide-y divide-gray-50">
                                        {quizzesArray.map((quiz) => {
                                            const submitted = Boolean(quiz.submission?.submittedAt);
                                            const missed = quiz.availabilityStatus === 'MISSED';
                                            const locked = quiz.availabilityStatus === 'LOCKED';
                                            const scheduled = quiz.availabilityStatus === 'SCHEDULED';
                                            const scoreText = submitted && quiz.submission?.score !== null
                                                ? `${quiz.submission?.score}/${quiz.totalMarks}`
                                                : null;

                                            // Format a human-friendly start time for scheduled quizzes
                                            const startsAtText = scheduled && quiz.availableFrom
                                                ? `Starts ${new Date(quiz.availableFrom).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                                                : null;

                                            return (
                                                <button
                                                    key={quiz.id}
                                                    onClick={() => {
                                                        if (locked) {
                                                            setLockedQuizTitle(quiz.title);
                                                            return;
                                                        }
                                                        if (!missed && !scheduled) navigate(`/${instituteSlug}/student/quiz/${quiz.id}`);
                                                    }}
                                                    disabled={missed || scheduled}
                                                    className="w-full px-4 py-4 flex items-center justify-between text-left hover:bg-gray-50 active:bg-gray-100 transition-colors disabled:opacity-90 disabled:cursor-not-allowed"
                                                >
                                                    <div className="min-w-0 mr-3">
                                                        <p className="font-bold text-sm truncate">{quiz.title}</p>
                                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-400 mt-1">
                                                            {quiz.topic && <span className="truncate max-w-[160px]">{quiz.topic}</span>}
                                                            {!scheduled && <span className="inline-flex items-center gap-1"><Timer className="w-3 h-3" />{quiz.timeLimitMins} min</span>}
                                                            {!scheduled && <span>{quiz.studentQuestionCount || quiz.questionCount} questions</span>}
                                                            {scheduled && startsAtText && (
                                                                <span className="inline-flex items-center gap-1 text-slate-500 font-semibold">
                                                                    <Clock className="w-3 h-3" />
                                                                    {startsAtText}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        {submitted ? (
                                                            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-green-600 bg-green-50 px-2.5 py-1 rounded-full">
                                                                <CheckCircle2 className="w-3 h-3" />{scoreText}
                                                            </span>
                                                        ) : locked ? (
                                                            <span className="text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-2.5 py-1 rounded-full">
                                                                Locked
                                                            </span>
                                                        ) : missed ? (
                                                            <span className="text-xs font-bold text-red-600 bg-red-50 px-2.5 py-1 rounded-full">
                                                                Missed
                                                            </span>
                                                        ) : scheduled ? (
                                                            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-full">
                                                                <Clock className="w-3 h-3" />Scheduled
                                                            </span>
                                                        ) : (
                                                            <span className="text-xs font-bold text-orange-600 bg-orange-50 px-2.5 py-1 rounded-full">
                                                                Pending
                                                            </span>
                                                        )}
                                                        <ChevronRight className="w-4 h-4 text-gray-300" />
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}

                    {/* ── FEES ── */}
                    {activeTab === 'fees' && (
                        <motion.div key="fees"
                            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}
                            className="space-y-4"
                        >
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total Paid</p>
                                    <p className="text-xl font-black text-green-600 mt-1">₹{data.fees.totalPaid.toLocaleString('en-IN')}</p>
                                </div>
                                <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Pending</p>
                                    <p className={`text-xl font-black mt-1 ${data.fees.balance > 0 ? 'text-red-500' : 'text-gray-400'}`}>
                                        ₹{data.fees.balance.toLocaleString('en-IN')}
                                    </p>
                                </div>
                            </div>

                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                                <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
                                    <Receipt className="w-4 h-4 text-gray-400" />
                                    <span className="font-bold text-sm">Payments</span>
                                </div>
                                {data.fees.transactions.length === 0 ? (
                                    <EmptyState message="No payments recorded yet" />
                                ) : (
                                    <div className="divide-y divide-gray-50">
                                        {data.fees.transactions.map((tx: any) => (
                                            <div key={tx.id} className="px-4 py-3.5 flex items-center justify-between">
                                                <div className="min-w-0 mr-3">
                                                    <p className="font-semibold text-sm">{tx.label}</p>
                                                    <p className="text-xs text-gray-400 mt-0.5">
                                                        {new Date(tx.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                    </p>
                                                </div>
                                                <div className="text-right flex-shrink-0">
                                                    <p className="font-black text-green-600 text-base">+₹{tx.amount.toLocaleString('en-IN')}</p>
                                                    <p className="text-[10px] font-bold text-green-500 uppercase">{tx.status}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Pending fee breakdown */}
                            {data.fees.installmentBreakdown?.length > 0 && (
                                <div className="bg-white rounded-2xl border border-red-100 shadow-sm overflow-hidden">
                                    <div className="px-4 py-3 border-b border-red-100 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-red-500" />
                                            <span className="font-bold text-sm text-red-600">Pending Breakdown</span>
                                        </div>
                                        <span className="text-xs font-bold text-red-500">
                                            ₹{data.fees.installmentBreakdown.reduce((s: number, i: any) => s + i.pending, 0).toLocaleString('en-IN')} due
                                        </span>
                                    </div>
                                    <div className="divide-y divide-red-50">
                                        {data.fees.installmentBreakdown.map((inst: any) => (
                                            <div key={inst.id} className="px-4 py-3.5">
                                                <div className="flex items-center justify-between mb-2">
                                                    <p className="font-semibold text-sm">{inst.name}</p>
                                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                                        inst.status === 'PARTIAL' ? 'bg-orange-50 text-orange-600' : 'bg-red-50 text-red-600'
                                                    }`}>
                                                        {inst.status}
                                                    </span>
                                                </div>
                                                <div className="flex items-center justify-between text-xs text-gray-500">
                                                    <span>Total: ₹{inst.totalAmount.toLocaleString('en-IN')}</span>
                                                    {inst.paid > 0 && <span className="text-green-600">Paid: ₹{inst.paid.toLocaleString('en-IN')}</span>}
                                                    <span className="text-red-600 font-bold">Due: ₹{inst.pending.toLocaleString('en-IN')}</span>
                                                </div>
                                                {/* Progress bar */}
                                                <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-green-500 rounded-full transition-all"
                                                        style={{ width: `${Math.min(100, (inst.paid / inst.totalAmount) * 100)}%` }}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>

            {/* ── BOTTOM NAV — Floating Island (matches teacher dashboard) ── */}
            <nav className="fixed bottom-6 left-4 right-4 z-50 bg-white/80 backdrop-blur-3xl border border-gray-200/60 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.15)] rounded-[32px] h-[72px]">
                <div className="flex items-center h-full w-full px-2">
                    {TABS.filter(t => !data.student.isQuizOnly || t.key === 'quizzes').map(({ key, label, Icon }) => {
                        const active = activeTab === key;
                        return (
                            <button
                                key={key}
                                onClick={() => setActiveTab(key)}
                                className="flex-1 flex flex-col items-center justify-center h-full relative group"
                            >
                                <div className={`flex flex-col items-center justify-center w-14 h-11 rounded-2xl transition-all duration-300 ${active ? 'text-gray-900' : 'text-gray-400 active:scale-90'}`}>
                                    <Icon className="w-[22px] h-[22px] mb-1" strokeWidth={active ? 2.5 : 1.5} />
                                    <span className={`text-[9px] font-bold tracking-wide transition-opacity duration-300 ${active ? 'opacity-100' : 'opacity-70'}`}>
                                        {label}
                                    </span>
                                </div>
                                {active && (
                                    <span className="absolute bottom-1 w-1 h-1 rounded-full bg-gray-900 animate-in zoom-in" />
                                )}
                            </button>
                        );
                    })}
                </div>
            </nav>

            {/* ── PROFILE BOTTOM SHEET ── */}
            <AnimatePresence>
                {profileOpen && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            key="backdrop"
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/40 z-50 backdrop-blur-sm"
                            onClick={() => setProfileOpen(false)}
                        />

                        {/* Sheet */}
                        <motion.div
                            key="sheet"
                            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
                            transition={{ type: 'spring', stiffness: 400, damping: 40 }}
                            className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl max-h-[85vh] overflow-y-auto"
                        >
                            {/* Handle */}
                            <div className="flex justify-center pt-3 pb-1">
                                <div className="w-10 h-1 bg-gray-200 rounded-full" />
                            </div>

                            {/* Sheet header */}
                            <div className="flex items-center justify-between px-5 pt-3 pb-4 border-b border-gray-100">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-full bg-black text-white flex items-center justify-center text-xl font-black shadow-sm">
                                        {initials}
                                    </div>
                                    <div>
                                        <p className="font-black text-base">{data.student.name}</p>
                                        {data.student.humanId && (
                                            <p className="text-xs text-gray-400 font-mono">ID: {data.student.humanId}</p>
                                        )}
                                    </div>
                                </div>
                                <button
                                    onClick={() => setProfileOpen(false)}
                                    className="p-2 rounded-xl bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Profile rows */}
                            <div className="px-2 py-2">
                                {!data.student.isQuizOnly && (
                                    <>
                                        <ProfileRow icon={GraduationCap} label="Batch" value={data.student.batchName} />
                                        <ProfileRow icon={User} label="Parent / Guardian" value={data.student.parentName} />
                                    </>
                                )}
                                <ProfileRow icon={Phone} label="Mobile" value={data.student.parentWhatsapp} />
                                {data.student.parentEmail && <ProfileRow icon={Mail} label="Email" value={data.student.parentEmail} />}
                                {data.student.schoolName && <ProfileRow icon={School} label="School" value={data.student.schoolName} />}
                            </div>

                            {/* Logout inside sheet */}
                            <div className="px-5 pt-2 pb-8">
                                <button
                                    onClick={handleLogout}
                                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border border-red-100 bg-red-50 text-red-600 font-bold text-sm active:scale-95 transition-all"
                                >
                                    <LogOut className="w-4 h-4" />
                                    Sign Out
                                </button>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* Locked Quiz Modal */}
            <AnimatePresence>
                {lockedQuizTitle && (
                    <>
                        <motion.div
                            key="locked-backdrop"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/40 z-50 backdrop-blur-sm"
                            onClick={() => setLockedQuizTitle(null)}
                        />
                        <motion.div
                            key="locked-modal"
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="fixed inset-x-4 top-[30%] md:max-w-md md:mx-auto z-50 bg-white rounded-3xl p-6 shadow-2xl border border-gray-100 text-center"
                        >
                            <div className="w-14 h-14 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center mx-auto mb-4">
                                <ShieldAlert className="w-7 h-7 text-red-600 animate-bounce" />
                            </div>
                            <h3 className="text-lg font-black text-gray-900 mb-2">Quiz Locked</h3>
                            <p className="text-sm text-gray-600 leading-relaxed mb-6">
                                Your attempt for <span className="font-bold text-gray-900">"{lockedQuizTitle}"</span> has been locked due to multiple integrity violations (cheating).
                                <br /><br />
                                This incident has been automatically reported to your teacher. Please contact your teacher to resolve this.
                            </p>
                            <button
                                onClick={() => setLockedQuizTitle(null)}
                                className="w-full bg-black text-white font-bold py-3.5 rounded-2xl hover:bg-gray-900 active:scale-95 transition-all text-sm"
                            >
                                Close
                            </button>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}

/* ── Sub-components ── */

function StatChip({ label, value, color = 'default' }: { label: string; value: string | number; color?: 'green' | 'orange' | 'red' | 'default' }) {
    const colorMap = {
        green: 'bg-green-50 text-green-700',
        orange: 'bg-orange-50 text-orange-700',
        red: 'bg-red-50 text-red-600',
        default: 'bg-gray-100 text-gray-700',
    };
    return (
        <div className={`flex-1 rounded-2xl px-4 py-3 ${colorMap[color]}`}>
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">{label}</p>
            <p className="text-xl font-black mt-0.5">{value}</p>
        </div>
    );
}

function ProfileRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
    return (
        <div className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-gray-50 transition-colors">
            <div className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                <Icon className="w-4 h-4 text-gray-500" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">{label}</p>
                <p className="font-semibold text-sm text-gray-900 truncate mt-0.5">{value}</p>
            </div>
        </div>
    );
}

function EmptyState({ message }: { message: string }) {
    return <div className="py-10 text-center text-sm text-gray-400">{message}</div>;
}
