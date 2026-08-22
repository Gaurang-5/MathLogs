import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../utils/api';
import { motion, AnimatePresence } from 'framer-motion';
import { LineChart, Line, ResponsiveContainer, YAxis, Tooltip, XAxis } from 'recharts';
import {
    X, Phone, Book, GraduationCap, CheckCircle2,
    CreditCard, Activity, CalendarDays, TrendingUp,
    MessageCircle, IndianRupee, School, Mail, User, AlertCircle,
    Award, Check, Clock
} from 'lucide-react';
import { cn } from '../utils/cn';
import { ConfiguredStudentFields } from '../features/student-profile/ConfiguredStudentFields';
import type { RegistrationFieldDefinition } from '../features/student-profile/registrationFields';
import { StudentFeeStartDialog } from '../features/month-coverage/StudentFeeStartDialog';
import { confirmStudentFeeProfile } from '../features/month-coverage/api';

interface StudentProfileData {
    id: string;
    humanId: string | null;
    name: string;
    parentName: string;
    parentWhatsapp: string;
    parentEmail?: string | null;
    schoolName?: string | null;
    additionalData?: Record<string, unknown> | null;
    registrationFields?: RegistrationFieldDefinition[];
    coachingFeeMode?: 'CURRENT_DUE_BASED' | 'MONTH_COVERAGE';
    monthCoverageProfile?: { feeStartMonth: string | null; feeEndMonth: string | null; status: string } | null;
    monthCoverageStats?: { receivedMonths: number; pendingMonths: number; overdueMonths: number; progressPercent: number } | null;
    status: string;
    createdAt?: string;
    batch?: { name: string; className: string | null; subject: string | null; startDate?: string | null; endDate?: string | null };
    stats: { attendancePercentage: number | null; attendedClasses?: number; totalClasses?: number };
    attendanceRecords: Array<{
        id: string; attendanceDate: string; checkedInAt: string; source: string; note: string | null;
    }>;
    marks: Array<{
        id: string; score: number;
        test: { name: string; date: string; maxMarks: number; subject: string };
    }>;
    feePayments: Array<{
        id: string; amountPaid: number; date: string;
        installment: { name: string };
    }>;
    balance?: { totalFee: number; totalPaid: number; balance: number };
}

type Tab = 'overview' | 'performance' | 'fees';

interface Props {
    studentId: string | null;
    onClose: () => void;
}

function EmptyState({ icon: Icon, label, description }: { icon: React.ElementType; label: string; description?: string }) {
    return (
        <div className="flex flex-col items-center justify-center py-10 px-4 text-center border border-dashed border-black/[0.08] rounded-2xl bg-neutral-50/50">
            <div className="w-11 h-11 rounded-2xl bg-neutral-100 flex items-center justify-center mb-2.5 text-neutral-400">
                <Icon className="w-5 h-5" />
            </div>
            <p className="text-sm font-bold text-neutral-700">{label}</p>
            {description && <p className="text-xs text-neutral-400 mt-0.5 max-w-xs">{description}</p>}
        </div>
    );
}

const formatCurrency = (value?: number | null) => `₹${Number(value || 0).toLocaleString('en-IN')}`;
const formatDate = (value?: string | null, options?: Intl.DateTimeFormatOptions) => {
    if (!value) return 'Not available';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Not available';
    return date.toLocaleDateString('en-IN', options || { day: 'numeric', month: 'short', year: 'numeric' });
};

const scorePercent = (score: number, maxMarks: number) => maxMarks > 0 ? (score / maxMarks) * 100 : 0;

function ProfileInfoRow({ icon: Icon, label, value, href, actionLabel }: { icon: React.ElementType; label: string; value?: string | null; href?: string; actionLabel?: string }) {
    const content = (
        <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl hover:bg-neutral-100/70 transition-colors">
            <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 bg-white border border-black/[0.08] rounded-xl flex items-center justify-center shrink-0 shadow-2xs">
                    <Icon className="w-4 h-4 text-neutral-600" />
                </div>
                <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-wider text-neutral-400 leading-none mb-1">{label}</p>
                    <p className="font-bold text-xs sm:text-sm text-neutral-900 truncate leading-none">{value || 'Not available'}</p>
                </div>
            </div>
            {href && value && actionLabel && (
                <span className="text-[11px] font-bold text-neutral-600 bg-neutral-100 px-2 py-1 rounded-lg shrink-0">
                    {actionLabel}
                </span>
            )}
        </div>
    );

    if (href && value) {
        return (
            <a href={href} target={href.startsWith('http') ? '_blank' : undefined} rel={href.startsWith('http') ? 'noopener noreferrer' : undefined} className="block">
                {content}
            </a>
        );
    }

    return content;
}

export default function StudentProfileDrawer({ studentId, onClose }: Props) {
    const [activeTab, setActiveTab] = useState<Tab>('overview');
    const [editingFeeStart, setEditingFeeStart] = useState(false);

    const { data: student, isLoading, isFetching, isError, refetch } = useQuery({
        queryKey: ['studentProfile', studentId],
        queryFn: () => api.get<StudentProfileData>(`/students/${studentId}/profile`),
        enabled: !!studentId,
        staleTime: 30000,
        gcTime: 5 * 60 * 1000,
        retry: 1,
    });

    useEffect(() => {
        if (studentId) setActiveTab('overview');
    }, [studentId]);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        if (studentId) {
            window.addEventListener('keydown', handler);
            document.body.style.overflow = 'hidden';
        }
        return () => {
            window.removeEventListener('keydown', handler);
            document.body.style.overflow = '';
        };
    }, [studentId, onClose]);

    const isOpen = !!studentId;

    const avgScore = useMemo(() => {
        if (!student?.marks?.length) return 0;
        return student.marks.reduce((acc, mark) => acc + scorePercent(mark.score, mark.test.maxMarks), 0) / student.marks.length;
    }, [student?.marks]);

    const performanceMetrics = useMemo(() => {
        if (!student?.marks?.length) return { best: 0, lowest: 0, passedCount: 0, totalTests: 0 };
        const percentages = student.marks.map(m => scorePercent(m.score, m.test.maxMarks));
        const best = Math.max(...percentages);
        const lowest = Math.min(...percentages);
        const passedCount = percentages.filter(p => p >= 50).length;
        return { best, lowest, passedCount, totalTests: student.marks.length };
    }, [student?.marks]);

    const feeCollectionPercent = useMemo(() => {
        if (student?.coachingFeeMode === 'MONTH_COVERAGE') return student.monthCoverageStats?.progressPercent ?? 0;
        const total = student?.balance?.totalFee || 0;
        const paid = student?.balance?.totalPaid || 0;
        if (total <= 0) return 100;
        return Math.min(100, Math.round((paid / total) * 100));
    }, [student?.balance, student?.coachingFeeMode, student?.monthCoverageStats?.progressPercent]);

    const chartData = useMemo(() => {
        if (!student?.marks?.length) return [];
        return [...student.marks]
            .reverse()
            .map(m => ({
                pct: Number(scorePercent(m.score, m.test.maxMarks).toFixed(1)),
                name: m.test.name,
                date: formatDate(m.test.date, { day: 'numeric', month: 'short' }),
                score: m.score,
                maxMarks: m.test.maxMarks,
            }));
    }, [student?.marks]);

    const sanitizedWhatsapp = student?.parentWhatsapp?.replace(/\D/g, '') || '';
    const whatsappHref = sanitizedWhatsapp ? `https://wa.me/${sanitizedWhatsapp.length === 10 ? `91${sanitizedWhatsapp}` : sanitizedWhatsapp}` : '';
    const phoneHref = student?.parentWhatsapp ? `tel:${student.parentWhatsapp}` : '';

    const getInitials = (name: string) => (name || 'Unknown').split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();

    const getStatusColor = (s: string) =>
        s === 'ACTIVE' || s === 'APPROVED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
        : s === 'PENDING' ? 'bg-amber-50 text-amber-700 border-amber-200'
        : 'bg-rose-50 text-rose-700 border-rose-200';

    const getScoreBadgeColor = (pct: number) => {
        if (pct >= 80) return 'text-emerald-700 bg-emerald-50 border-emerald-200';
        if (pct >= 50) return 'text-amber-700 bg-amber-50 border-amber-200';
        return 'text-rose-700 bg-rose-50 border-rose-200';
    };

    const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
        { id: 'overview', label: 'Overview', icon: Activity },
        { id: 'performance', label: 'Performance', icon: TrendingUp },
        { id: 'fees', label: 'Fees', icon: CreditCard },
    ];

    const modalContent = (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        key="backdrop"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50"
                        onClick={onClose}
                    />

                    {/* Modal container */}
                    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 pointer-events-none">
                        <motion.div
                            key="modal"
                            initial={{ y: '100%', opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: '100%', opacity: 0 }}
                            transition={{ type: 'spring', damping: 30, stiffness: 350 }}
                            className="w-full sm:w-[92vw] max-w-[720px] max-h-[90vh] sm:max-h-[85vh] h-[90vh] sm:h-auto bg-white rounded-t-[28px] sm:rounded-3xl flex flex-col shadow-2xl overflow-hidden pointer-events-auto border border-black/10"
                        >
                            {isLoading && (
                                <div className="p-6 space-y-4 animate-pulse">
                                    <div className="w-12 h-1.5 bg-neutral-200 rounded-full mx-auto sm:hidden" />
                                    <div className="flex items-center gap-3">
                                        <div className="w-14 h-14 rounded-2xl bg-neutral-200 shrink-0" />
                                        <div className="space-y-2 flex-1">
                                            <div className="h-5 w-40 bg-neutral-200 rounded-md" />
                                            <div className="h-3 w-28 bg-neutral-200 rounded-md" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2 pt-2">
                                        <div className="h-14 bg-neutral-100 rounded-xl" />
                                        <div className="h-14 bg-neutral-100 rounded-xl" />
                                        <div className="h-14 bg-neutral-100 rounded-xl" />
                                    </div>
                                    <div className="h-44 bg-neutral-100 rounded-2xl" />
                                </div>
                            )}

                            {!isLoading && isError && (
                                <div className="flex min-h-0 flex-1 flex-col p-6 items-center justify-center text-center">
                                    <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center mb-3">
                                        <AlertCircle className="w-7 h-7" />
                                    </div>
                                    <h2 className="text-lg font-black text-black">Could not load profile</h2>
                                    <p className="text-xs text-neutral-500 mt-1 max-w-xs">The profile request failed. Please check your connection and try again.</p>
                                    <div className="flex gap-2 mt-5">
                                        <button
                                            onClick={() => refetch()}
                                            className="px-4 py-2 rounded-xl bg-black text-white text-xs font-black uppercase tracking-wider hover:bg-neutral-800 transition-colors"
                                        >
                                            Retry
                                        </button>
                                        <button
                                            onClick={onClose}
                                            className="px-4 py-2 rounded-xl bg-neutral-100 text-black text-xs font-black uppercase tracking-wider hover:bg-neutral-200 transition-colors"
                                        >
                                            Close
                                        </button>
                                    </div>
                                </div>
                            )}

                            {!isLoading && student && (
                                <>
                                    {/* ── Top Header Bar ── */}
                                    <div className="bg-white px-4 sm:px-6 pt-3 pb-0 shrink-0 border-b border-black/[0.06] relative">
                                        {/* Mobile drag handle */}
                                        <div className="w-12 h-1 bg-neutral-200 rounded-full mx-auto mb-3 sm:hidden" />

                                        {/* Close button */}
                                        <button
                                            onClick={onClose}
                                            className="absolute top-3 right-4 sm:top-4 sm:right-6 w-8 h-8 rounded-full bg-neutral-100 hover:bg-neutral-200 text-neutral-600 flex items-center justify-center transition-colors z-10"
                                            aria-label="Close drawer"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>

                                        {isFetching && (
                                            <div className="absolute left-0 right-0 top-0 h-0.5 bg-blue-600 animate-pulse" />
                                        )}

                                        {/* Student Info & Quick Badges */}
                                        <div className="flex items-start gap-3.5 pr-8 mb-3">
                                            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-neutral-900 to-neutral-800 text-white flex items-center justify-center text-base sm:text-lg font-black shrink-0 shadow-sm">
                                                {getInitials(student.name)}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <h2 className="text-lg sm:text-xl font-black text-black tracking-tight leading-snug truncate">
                                                    {student.name}
                                                </h2>
                                                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                                    <span className={cn('text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border', getStatusColor(student.status))}>
                                                        {student.status}
                                                    </span>
                                                    {student.humanId && (
                                                        <span className="text-[10px] font-mono font-bold text-neutral-600 bg-neutral-100 px-1.5 py-0.5 rounded border border-black/[0.06]">
                                                            #{student.humanId}
                                                        </span>
                                                    )}
                                                    {student.batch && (
                                                        <span className="text-[10px] font-bold text-neutral-600 bg-neutral-100 px-2 py-0.5 rounded-md flex items-center gap-1 border border-black/[0.06] truncate max-w-[160px]">
                                                            <Book className="w-3 h-3 shrink-0" />
                                                            <span className="truncate">{student.batch.name}</span>
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Mobile Direct Action Buttons: WhatsApp & Call */}
                                        <div className="flex items-center gap-2 mb-3.5">
                                            {whatsappHref && (
                                                <a
                                                    href={whatsappHref}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex-1 flex items-center justify-center gap-1.5 bg-[#25D366] hover:bg-[#20bd5a] active:scale-[0.98] text-white font-bold text-xs py-2 px-3 rounded-xl transition-all shadow-xs"
                                                >
                                                    <MessageCircle className="w-4 h-4 shrink-0 fill-current" />
                                                    <span>WhatsApp</span>
                                                </a>
                                            )}
                                            {phoneHref && (
                                                <a
                                                    href={phoneHref}
                                                    className="flex-1 flex items-center justify-center gap-1.5 bg-neutral-100 hover:bg-neutral-200 active:scale-[0.98] text-neutral-800 font-bold text-xs py-2 px-3 rounded-xl transition-all border border-black/[0.06]"
                                                >
                                                    <Phone className="w-3.5 h-3.5 shrink-0" />
                                                    <span>Call Guardian</span>
                                                </a>
                                            )}
                                        </div>

                                        {/* Quick Metrics Bar (3 key stats) */}
                                        <div className="grid grid-cols-3 gap-2 pb-3">
                                            <div className="bg-neutral-50/80 border border-black/[0.06] rounded-xl p-2 text-center">
                                                <p className="text-[9px] font-black uppercase tracking-wider text-neutral-400 leading-tight">Tests</p>
                                                <p className="text-sm sm:text-base font-black text-black mt-0.5">{student.marks?.length || 0}</p>
                                            </div>
                                            <div className="bg-neutral-50/80 border border-black/[0.06] rounded-xl p-2 text-center">
                                                <p className="text-[9px] font-black uppercase tracking-wider text-neutral-400 leading-tight">Avg Score</p>
                                                <p className={cn('text-sm sm:text-base font-black mt-0.5', (student.marks || []).length > 0 ? (avgScore >= 80 ? 'text-emerald-600' : avgScore >= 50 ? 'text-amber-600' : 'text-rose-600') : 'text-neutral-400')}>
                                                    {(student.marks || []).length > 0 ? `${avgScore.toFixed(0)}%` : 'N/A'}
                                                </p>
                                            </div>
                                            <div className="bg-neutral-50/80 border border-black/[0.06] rounded-xl p-2 text-center">
                                                <p className="text-[9px] font-black uppercase tracking-wider text-neutral-400 leading-tight">{student.coachingFeeMode === 'MONTH_COVERAGE' ? 'Pending months' : 'Fee Balance'}</p>
                                                <p className={cn('text-sm sm:text-base font-black mt-0.5', (student.coachingFeeMode === 'MONTH_COVERAGE' ? (student.monthCoverageStats?.pendingMonths || 0) : (student.balance?.balance || 0)) > 0 ? 'text-rose-600' : 'text-emerald-600')}>
                                                    {student.coachingFeeMode === 'MONTH_COVERAGE' ? (student.monthCoverageStats?.pendingMonths ?? 0) : formatCurrency(student.balance?.balance)}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Tab Buttons */}
                                        <div className="flex border-t border-black/[0.06] -mx-4 sm:-mx-6 px-4 sm:px-6">
                                            {tabs.map(tab => (
                                                <button
                                                    key={tab.id}
                                                    onClick={() => setActiveTab(tab.id)}
                                                    className={cn(
                                                        'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-all',
                                                        activeTab === tab.id
                                                            ? 'border-black text-black font-black'
                                                            : 'border-transparent text-neutral-400 hover:text-neutral-700'
                                                    )}
                                                >
                                                    <tab.icon className="w-3.5 h-3.5" />
                                                    <span>{tab.label}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* ── Scrollable Tab Content ── */}
                                    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
                                        {/* OVERVIEW TAB */}
                                        {activeTab === 'overview' && (
                                            <div className="space-y-4">
                                                {/* Guardian & Contact Card */}
                                                <div className="bg-neutral-50/60 border border-black/[0.06] rounded-2xl p-3.5 sm:p-4">
                                                    <h3 className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-2 px-1">
                                                        Guardian & Contact
                                                    </h3>
                                                    <div className="divide-y divide-black/[0.04]">
                                                        <ProfileInfoRow icon={User} label="Guardian Name" value={student.parentName} />
                                                        <ProfileInfoRow icon={Phone} label="WhatsApp / Phone" value={student.parentWhatsapp} href={phoneHref} actionLabel="Call" />
                                                        {student.parentEmail && (
                                                            <ProfileInfoRow icon={Mail} label="Email Address" value={student.parentEmail} href={`mailto:${student.parentEmail}`} actionLabel="Email" />
                                                        )}
                                                        {student.schoolName && (
                                                            <ProfileInfoRow icon={School} label="School" value={student.schoolName} />
                                                        )}
                                                        <ProfileInfoRow icon={CalendarDays} label="Enrollment Date" value={formatDate(student.createdAt)} />
                                                    </div>
                                                </div>

                                                {(student.registrationFields?.length || 0) > 0 && (
                                                    <div className="bg-neutral-50/60 border border-black/[0.06] rounded-2xl p-3.5 sm:p-4">
                                                        <h3 className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-3 px-1">Onboarding details</h3>
                                                        <ConfiguredStudentFields student={student} fields={student.registrationFields || []} />
                                                    </div>
                                                )}

                                                {/* Fee Status Card */}
                                                <div className="bg-neutral-50/60 border border-black/[0.06] rounded-2xl p-4">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <h3 className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                                                            Fee Status
                                                        </h3>
                                                        {student.coachingFeeMode === 'MONTH_COVERAGE' ? <button type="button" onClick={() => setEditingFeeStart(true)} className="text-[11px] font-black text-neutral-700 underline">Edit start month</button> : <span className="text-[11px] font-bold text-neutral-500">{feeCollectionPercent}% Paid</span>}
                                                    </div>
                                                    
                                                    {/* Progress bar */}
                                                    <div className="w-full h-2 bg-neutral-200 rounded-full overflow-hidden mb-3">
                                                        <div
                                                            className={cn('h-full transition-all duration-500 rounded-full', feeCollectionPercent === 100 ? 'bg-emerald-500' : 'bg-neutral-900')}
                                                            style={{ width: `${feeCollectionPercent}%` }}
                                                        />
                                                    </div>

                                                    <div className="grid grid-cols-3 gap-2 text-center pt-1">
                                                        <div>
                                                            <p className="text-[9px] font-bold uppercase text-neutral-400">{student.coachingFeeMode === 'MONTH_COVERAGE' ? 'Fee start' : 'Total'}</p>
                                                            <p className="text-xs sm:text-sm font-black text-black">{student.coachingFeeMode === 'MONTH_COVERAGE' ? (student.monthCoverageProfile?.feeStartMonth || 'Not set') : formatCurrency(student.balance?.totalFee)}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-[9px] font-bold uppercase text-emerald-600">{student.coachingFeeMode === 'MONTH_COVERAGE' ? 'Paid months' : 'Paid'}</p>
                                                            <p className="text-xs sm:text-sm font-black text-emerald-700">{student.coachingFeeMode === 'MONTH_COVERAGE' ? (student.monthCoverageStats?.receivedMonths ?? 0) : formatCurrency(student.balance?.totalPaid)}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-[9px] font-bold uppercase text-rose-500">{student.coachingFeeMode === 'MONTH_COVERAGE' ? 'Overdue' : 'Balance'}</p>
                                                            <p className="text-xs sm:text-sm font-black text-rose-600">{student.coachingFeeMode === 'MONTH_COVERAGE' ? (student.monthCoverageStats?.overdueMonths ?? 0) : formatCurrency(student.balance?.balance)}</p>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Recent Performance Snapshot */}
                                                <div>
                                                    <div className="flex items-center justify-between mb-2 px-1">
                                                        <h3 className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Recent Tests</h3>
                                                        {student.marks?.length > 3 && (
                                                            <button
                                                                onClick={() => setActiveTab('performance')}
                                                                className="text-[11px] font-bold text-neutral-700 hover:text-black hover:underline"
                                                            >
                                                                View all ({student.marks.length})
                                                            </button>
                                                        )}
                                                    </div>
                                                    {(student.marks || []).length > 0 ? (
                                                        <div className="space-y-2">
                                                            {(student.marks || []).slice(0, 3).map(mark => {
                                                                const pct = scorePercent(mark.score, mark.test.maxMarks);
                                                                return (
                                                                    <div key={mark.id} className="bg-white border border-black/[0.06] rounded-xl p-3 shadow-2xs">
                                                                        <div className="flex items-center justify-between gap-2 mb-1.5">
                                                                            <div className="min-w-0 flex-1">
                                                                                <p className="font-bold text-xs sm:text-sm text-black truncate">{mark.test.name}</p>
                                                                                <p className="text-[10px] text-neutral-400">{formatDate(mark.test.date)}</p>
                                                                            </div>
                                                                            <div className="text-right shrink-0">
                                                                                <span className="font-black text-xs sm:text-sm text-black">{mark.score}</span>
                                                                                <span className="text-[10px] text-neutral-400"> /{mark.test.maxMarks}</span>
                                                                                <span className={cn('ml-2 text-[10px] font-black px-1.5 py-0.5 rounded border inline-block', getScoreBadgeColor(pct))}>
                                                                                    {pct.toFixed(0)}%
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                        <div className="w-full h-1 bg-neutral-100 rounded-full overflow-hidden">
                                                                            <div
                                                                                className={cn('h-full rounded-full', pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-rose-500')}
                                                                                style={{ width: `${Math.min(100, pct)}%` }}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    ) : (
                                                        <EmptyState icon={GraduationCap} label="No test marks recorded" description="Marks will show up here once entered." />
                                                    )}
                                                </div>

                                                {/* Recent Payments Snapshot */}
                                                {student.coachingFeeMode !== 'MONTH_COVERAGE' && <div>
                                                    <div className="flex items-center justify-between mb-2 px-1">
                                                        <h3 className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Recent Payments</h3>
                                                        {student.feePayments?.length > 3 && (
                                                            <button
                                                                onClick={() => setActiveTab('fees')}
                                                                className="text-[11px] font-bold text-neutral-700 hover:text-black hover:underline"
                                                            >
                                                                View all ({student.feePayments.length})
                                                            </button>
                                                        )}
                                                    </div>
                                                    {(student.feePayments || []).length > 0 ? (
                                                        <div className="space-y-2">
                                                            {(student.feePayments || []).slice(0, 3).map(p => (
                                                                <div key={p.id} className="flex items-center justify-between bg-white border border-black/[0.06] rounded-xl p-3 shadow-2xs">
                                                                    <div className="flex items-center gap-2.5">
                                                                        <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                                                                            <CheckCircle2 className="w-3.5 h-3.5" />
                                                                        </div>
                                                                        <div>
                                                                            <p className="font-bold text-xs sm:text-sm text-black">{p.installment.name}</p>
                                                                            <p className="text-[10px] text-neutral-400">{formatDate(p.date)}</p>
                                                                        </div>
                                                                    </div>
                                                                    <p className="font-black text-emerald-600 text-xs sm:text-sm">{formatCurrency(p.amountPaid)}</p>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <EmptyState icon={CreditCard} label="No payments recorded" description="Payments will show up here once collected." />
                                                    )}
                                                </div>}
                                            </div>
                                        )}

                                        {/* PERFORMANCE TAB */}
                                        {activeTab === 'performance' && (
                                            <div className="space-y-4">
                                                {/* Score Trend Chart Card */}
                                                <div className="bg-neutral-50/80 border border-black/[0.06] rounded-2xl p-4">
                                                    <div className="flex items-center justify-between mb-3">
                                                        <h3 className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Score Trend</h3>
                                                        <span className={cn('text-[11px] font-black px-2 py-0.5 rounded-full border', getScoreBadgeColor(avgScore))}>
                                                            Avg {avgScore.toFixed(1)}%
                                                        </span>
                                                    </div>

                                                    {chartData.length > 1 ? (
                                                        <div className="h-40 sm:h-48 w-full pt-2">
                                                            <ResponsiveContainer width="100%" height="100%">
                                                                <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                                                                    <YAxis domain={[0, 100]} hide />
                                                                    <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: '#888' }} />
                                                                    <Tooltip
                                                                        content={({ active, payload }) => {
                                                                            if (active && payload && payload.length) {
                                                                                const data = payload[0].payload;
                                                                                return (
                                                                                    <div className="bg-neutral-900 text-white text-xs p-2.5 rounded-xl shadow-lg">
                                                                                        <p className="font-bold">{data.name}</p>
                                                                                        <p className="text-[10px] text-neutral-400">{data.date}</p>
                                                                                        <p className="font-black text-emerald-400 mt-1">
                                                                                            {data.score} / {data.maxMarks} ({data.pct}%)
                                                                                        </p>
                                                                                    </div>
                                                                                );
                                                                            }
                                                                            return null;
                                                                        }}
                                                                    />
                                                                    <Line
                                                                        type="monotone"
                                                                        dataKey="pct"
                                                                        stroke="#10b981"
                                                                        strokeWidth={2.5}
                                                                        dot={{ r: 3, fill: '#10b981', strokeWidth: 2, stroke: '#fff' }}
                                                                        activeDot={{ r: 5, fill: '#10b981' }}
                                                                        isAnimationActive={false}
                                                                    />
                                                                </LineChart>
                                                            </ResponsiveContainer>
                                                        </div>
                                                    ) : (
                                                        <div className="py-8 text-center text-xs text-neutral-400">
                                                            {chartData.length === 1 ? '1 test recorded. Trend will show after 2+ tests.' : 'No test records to plot yet.'}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Academic KPIs */}
                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                                    <div className="bg-white border border-black/[0.06] rounded-xl p-3 text-center shadow-2xs">
                                                        <p className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Total Tests</p>
                                                        <p className="text-base font-black text-black mt-0.5">{performanceMetrics.totalTests}</p>
                                                    </div>
                                                    <div className="bg-white border border-black/[0.06] rounded-xl p-3 text-center shadow-2xs">
                                                        <p className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Highest Score</p>
                                                        <p className="text-base font-black text-emerald-600 mt-0.5">{performanceMetrics.best.toFixed(0)}%</p>
                                                    </div>
                                                    <div className="bg-white border border-black/[0.06] rounded-xl p-3 text-center shadow-2xs">
                                                        <p className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Lowest Score</p>
                                                        <p className="text-base font-black text-rose-600 mt-0.5">{performanceMetrics.lowest.toFixed(0)}%</p>
                                                    </div>
                                                    <div className="bg-white border border-black/[0.06] rounded-xl p-3 text-center shadow-2xs">
                                                        <p className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Pass Rate</p>
                                                        <p className="text-base font-black text-black mt-0.5">
                                                            {performanceMetrics.totalTests > 0
                                                                ? `${Math.round((performanceMetrics.passedCount / performanceMetrics.totalTests) * 100)}%`
                                                                : 'N/A'}
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* All Tests List */}
                                                <div>
                                                    <h3 className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-2 px-1">
                                                        All Test Marks ({student.marks?.length || 0})
                                                    </h3>
                                                    {(student.marks || []).length > 0 ? (
                                                        <div className="space-y-2">
                                                            {(student.marks || []).map(mark => {
                                                                const pct = scorePercent(mark.score, mark.test.maxMarks);
                                                                return (
                                                                    <div key={mark.id} className="bg-white border border-black/[0.06] rounded-xl p-3.5 shadow-2xs">
                                                                        <div className="flex items-start justify-between gap-3 mb-2">
                                                                            <div className="min-w-0 flex-1">
                                                                                <p className="font-black text-sm text-black truncate">{mark.test.name}</p>
                                                                                <div className="flex items-center gap-2 mt-0.5 text-[11px] text-neutral-400">
                                                                                    <span>{formatDate(mark.test.date)}</span>
                                                                                    {mark.test.subject && (
                                                                                        <>
                                                                                            <span>•</span>
                                                                                            <span>{mark.test.subject}</span>
                                                                                        </>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                            <div className="text-right shrink-0">
                                                                                <div className="flex items-baseline justify-end gap-1">
                                                                                    <span className="font-black text-base text-black">{mark.score}</span>
                                                                                    <span className="text-xs text-neutral-400">/{mark.test.maxMarks}</span>
                                                                                </div>
                                                                                <span className={cn('text-[10px] font-black px-1.5 py-0.5 rounded border inline-block mt-0.5', getScoreBadgeColor(pct))}>
                                                                                    {pct.toFixed(0)}%
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                        <div className="w-full h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                                                                            <div
                                                                                className={cn('h-full rounded-full transition-all', pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-rose-500')}
                                                                                style={{ width: `${Math.min(100, pct)}%` }}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    ) : (
                                                        <EmptyState icon={TrendingUp} label="No test records found" description="When tests are entered, detailed performance breakdown will show here." />
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {/* FEES TAB */}
                                        {activeTab === 'fees' && (
                                            <div className="space-y-4">
                                                {/* Fee Summary Cards */}
                                                <div className="grid grid-cols-3 gap-2">
                                                    <div className="bg-neutral-50 border border-black/[0.06] rounded-xl p-3 text-center">
                                                        <p className="text-[9px] font-black uppercase tracking-wider text-neutral-400">{student.coachingFeeMode === 'MONTH_COVERAGE' ? 'Paid months' : 'Total Fee'}</p>
                                                        <p className="text-xs sm:text-sm font-black text-black mt-0.5">{student.coachingFeeMode === 'MONTH_COVERAGE' ? (student.monthCoverageStats?.receivedMonths ?? 0) : formatCurrency(student.balance?.totalFee)}</p>
                                                    </div>
                                                    <div className="bg-emerald-50/60 border border-emerald-100 rounded-xl p-3 text-center">
                                                        <p className="text-[9px] font-black uppercase tracking-wider text-emerald-700">{student.coachingFeeMode === 'MONTH_COVERAGE' ? 'Pending months' : 'Collected'}</p>
                                                        <p className="text-xs sm:text-sm font-black text-emerald-700 mt-0.5">{student.coachingFeeMode === 'MONTH_COVERAGE' ? (student.monthCoverageStats?.pendingMonths ?? 0) : formatCurrency(student.balance?.totalPaid)}</p>
                                                    </div>
                                                    <div className="bg-rose-50/60 border border-rose-100 rounded-xl p-3 text-center">
                                                        <p className="text-[9px] font-black uppercase tracking-wider text-rose-600">{student.coachingFeeMode === 'MONTH_COVERAGE' ? 'Overdue months' : 'Pending'}</p>
                                                        <p className="text-xs sm:text-sm font-black text-rose-600 mt-0.5">{student.coachingFeeMode === 'MONTH_COVERAGE' ? (student.monthCoverageStats?.overdueMonths ?? 0) : formatCurrency(student.balance?.balance)}</p>
                                                    </div>
                                                </div>

                                                {/* Payment History List */}
                                                {student.coachingFeeMode !== 'MONTH_COVERAGE' && <div>
                                                    <h3 className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-2 px-1">
                                                        Payment History ({student.feePayments?.length || 0})
                                                    </h3>
                                                    {(student.feePayments || []).length > 0 ? (
                                                        <div className="space-y-2">
                                                            {(student.feePayments || []).map(p => (
                                                                <div key={p.id} className="bg-white border border-black/[0.06] rounded-xl p-3.5 flex items-center justify-between shadow-2xs">
                                                                    <div className="flex items-center gap-3 min-w-0">
                                                                        <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
                                                                            <CheckCircle2 className="w-4 h-4" />
                                                                        </div>
                                                                        <div className="min-w-0">
                                                                            <p className="font-bold text-xs sm:text-sm text-black truncate">{p.installment.name}</p>
                                                                            <p className="text-[11px] text-neutral-400">{formatDate(p.date)}</p>
                                                                        </div>
                                                                    </div>
                                                                    <div className="text-right shrink-0">
                                                                        <p className="font-black text-emerald-600 text-sm sm:text-base">{formatCurrency(p.amountPaid)}</p>
                                                                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                                                            Paid
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <EmptyState icon={IndianRupee} label="No fee payments recorded" description="Payments collected for this student will appear here." />
                                                    )}
                                                </div>}
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </motion.div>
                    </div>
                </>
            )}
        </AnimatePresence>
    );

    return createPortal(<>{modalContent}{editingFeeStart && student?.batch?.startDate && student.batch.endDate && (
        <StudentFeeStartDialog
            student={{ id: student.id, name: student.name, joinedAt: student.createdAt || student.batch.startDate }}
            batch={{ startDate: student.batch.startDate, endDate: student.batch.endDate }}
            defaultMonth={student.monthCoverageProfile?.feeStartMonth || student.batch.startDate.slice(0, 7)}
            onClose={() => setEditingFeeStart(false)}
            onConfirm={async feeStartMonth => {
                await confirmStudentFeeProfile(student.id, feeStartMonth);
                setEditingFeeStart(false);
                await refetch();
            }}
        />
    )}</>, document.body);
}
