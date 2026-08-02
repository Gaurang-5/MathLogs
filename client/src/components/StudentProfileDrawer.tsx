import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../utils/api';
import { motion, AnimatePresence } from 'framer-motion';
import { LineChart, Line, ResponsiveContainer, YAxis, Tooltip } from 'recharts';
import {
    X, Phone, Book, GraduationCap, CheckCircle2,
    CreditCard, Activity, CalendarDays, TrendingUp,
    MessageCircle, IndianRupee, School, Mail, User, AlertCircle
} from 'lucide-react';
import { cn } from '../utils/cn';

interface StudentProfileData {
    id: string;
    humanId: string | null;
    name: string;
    parentName: string;
    parentWhatsapp: string;
    parentEmail?: string | null;
    schoolName?: string | null;
    status: string;
    createdAt?: string;
    batch?: { name: string; className: string | null; subject: string | null };
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

function EmptyState({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
    return (
        <div className="flex flex-col items-center justify-center py-12 text-neutral-300 border-2 border-dashed border-neutral-100 rounded-2xl">
            <Icon className="w-8 h-8 mb-3" />
            <p className="text-sm font-semibold text-neutral-400">{label}</p>
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

function ProfileInfoRow({ icon: Icon, label, value, href }: { icon: React.ElementType; label: string; value?: string | null; href?: string }) {
    const content = (
        <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 bg-white border border-black/[0.06] rounded-lg flex items-center justify-center shrink-0">
                <Icon className="w-3.5 h-3.5 text-neutral-500" />
            </div>
            <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">{label}</p>
                <p className="font-semibold text-sm text-black truncate">{value || 'Not available'}</p>
            </div>
        </div>
    );

    if (href && value) {
        return <a href={href} target="_blank" rel="noopener noreferrer" className="block rounded-xl hover:bg-white/70 transition-colors">{content}</a>;
    }

    return content;
}

export default function StudentProfileDrawer({ studentId, onClose }: Props) {
    const [activeTab, setActiveTab] = useState<Tab>('overview');

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

    const latestMark = student?.marks?.[0];
    const latestPayment = student?.feePayments?.[0];
    const sanitizedWhatsapp = student?.parentWhatsapp?.replace(/\D/g, '') || '';
    const whatsappHref = sanitizedWhatsapp ? `https://wa.me/${sanitizedWhatsapp.length === 10 ? `91${sanitizedWhatsapp}` : sanitizedWhatsapp}` : '';

    const getInitials = (name: string) => (name || 'Unknown').split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();

    const getStatusColor = (s: string) =>
        s === 'ACTIVE' || s === 'APPROVED' ? 'bg-green-100 text-green-700 border-green-200'
        : s === 'PENDING' ? 'bg-yellow-100 text-yellow-700 border-yellow-200'
        : 'bg-red-100 text-red-700 border-red-200';

    const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
        { id: 'overview', label: 'Overview', icon: Activity },
        { id: 'performance', label: 'Performance', icon: TrendingUp },
        { id: 'fees', label: 'Fees', icon: CreditCard },
    ];

    const modalContent = (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div key="backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }} className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40" onClick={onClose} />
                    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6 pointer-events-none">
                        <motion.div key="modal" initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }}
                            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
                            className="w-full sm:w-[90vw] max-w-[760px] h-[95vh] sm:h-[88vh] sm:max-h-[760px] bg-white rounded-t-[2rem] sm:rounded-3xl flex flex-col shadow-2xl overflow-hidden pointer-events-auto mt-auto sm:mt-0">

                        {isLoading && (
                            <>
                                {/* Skeleton Header */}
                                <div className="bg-white px-5 pt-5 pb-0 shrink-0 border-b border-black/5 animate-pulse pointer-events-none">
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="flex items-center gap-3.5">
                                            <div className="w-14 h-14 rounded-2xl bg-neutral-200 shrink-0" />
                                            <div className="space-y-2.5 mt-1">
                                                <div className="h-5 w-40 bg-neutral-200 rounded" />
                                                <div className="flex gap-1.5">
                                                    <div className="h-4 w-16 bg-neutral-200 rounded-full" />
                                                    <div className="h-4 w-12 bg-neutral-200 rounded-md" />
                                                    <div className="h-4 w-24 bg-neutral-200 rounded" />
                                                </div>
                                            </div>
                                        </div>
                                        <div className="w-8 h-8 rounded-xl bg-neutral-200 shrink-0" />
                                    </div>
                                    <div className="grid grid-cols-3 gap-2 mb-4">
                                        <div className="h-[52px] bg-neutral-200 rounded-xl" />
                                        <div className="h-[52px] bg-neutral-200 rounded-xl" />
                                        <div className="h-[52px] bg-neutral-200 rounded-xl" />
                                    </div>
                                    <div className="flex mb-4">
                                        <div className="h-10 w-full bg-neutral-200 rounded-xl" />
                                    </div>
                                    <div className="flex border-b border-black/5">
                                        <div className="flex-1 py-2.5 flex justify-center"><div className="h-4 w-16 bg-neutral-200 rounded" /></div>
                                        <div className="flex-1 py-2.5 flex justify-center"><div className="h-4 w-20 bg-neutral-200 rounded" /></div>
                                        <div className="flex-1 py-2.5 flex justify-center"><div className="h-4 w-12 bg-neutral-200 rounded" /></div>
                                    </div>
                                </div>
                                {/* Skeleton Content */}
                                <div className="flex-1 p-5 space-y-5 animate-pulse pointer-events-none">
                                    <div className="h-[104px] bg-neutral-200 rounded-2xl" />
                                    <div>
                                        <div className="h-3 w-24 bg-neutral-200 rounded mb-3" />
                                        <div className="space-y-2">
                                            <div className="h-[60px] bg-neutral-200 rounded-xl" />
                                            <div className="h-[60px] bg-neutral-200 rounded-xl" />
                                            <div className="h-[60px] bg-neutral-200 rounded-xl" />
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}

                        {!isLoading && isError && (
                            <div className="flex min-h-0 flex-1 flex-col">
                                <div className="flex items-center justify-between border-b border-black/5 px-5 py-4">
                                    <p className="text-sm font-black text-black">Student profile</p>
                                    <button onClick={onClose} className="w-8 h-8 rounded-xl bg-neutral-100 hover:bg-neutral-200 flex items-center justify-center transition-colors">
                                        <X className="w-4 h-4 text-neutral-500" />
                                    </button>
                                </div>
                                <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
                                    <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center mb-4">
                                        <AlertCircle className="w-6 h-6" />
                                    </div>
                                    <h2 className="text-lg font-black text-black">Could not load profile</h2>
                                    <p className="text-sm text-neutral-500 mt-1 max-w-sm">The profile request failed. Check your connection and try again.</p>
                                    <button onClick={() => refetch()} className="mt-5 px-4 py-2.5 rounded-xl bg-black text-white text-xs font-black uppercase tracking-widest hover:bg-neutral-800 transition-colors">
                                        Retry
                                    </button>
                                </div>
                            </div>
                        )}

                        {!isLoading && student && (
                            <>
                                {/* ── Header ── */}
                                <div className="bg-white text-black px-5 pt-2 sm:pt-5 pb-0 shrink-0 border-b border-black/5 relative">
                                    {/* Mobile drag handle indicator */}
                                    <div className="w-12 h-1.5 bg-black/10 rounded-full mx-auto mb-4 sm:hidden" />
                                    
                                    <button onClick={onClose} className="absolute top-4 sm:top-5 right-5 w-8 h-8 rounded-xl bg-neutral-100 hover:bg-neutral-200 flex items-center justify-center transition-colors z-10">
                                        <X className="w-4 h-4 text-neutral-500" />
                                    </button>
                                    {isFetching && (
                                        <div className="absolute left-0 right-0 top-0 h-0.5 bg-blue-500/80 animate-pulse" />
                                    )}
                                    
                                    <div className="flex flex-col sm:flex-row gap-5 mb-4">
                                        {/* Left Side: Info */}
                                        <div className="flex-1 space-y-4">
                                            <div className="flex items-start gap-3.5 pr-8">
                                                <div className="w-14 h-14 rounded-2xl bg-neutral-100 border border-black/5 flex items-center justify-center text-xl font-black shrink-0">
                                                    {getInitials(student.name)}
                                                </div>
                                                <div>
                                                    <h2 className="text-lg font-black tracking-tight leading-snug">{student.name}</h2>
                                                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                                        <span className={cn('text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border', getStatusColor(student.status))}>
                                                            {student.status}
                                                        </span>
                                                        {student.humanId && (
                                                            <span className="text-[10px] font-mono font-bold text-neutral-500 bg-neutral-100 px-2 py-0.5 rounded-md border border-black/5">#{student.humanId}</span>
                                                        )}
                                                    {student.batch && (
                                                        <span className="text-[10px] font-bold text-neutral-500 flex items-center gap-1">
                                                            <Book className="w-3 h-3" />{student.batch.name}
                                                        </span>
                                                    )}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Quick stats */}
                                            <div className="grid grid-cols-2 gap-2">
                                                {[
                                                    { label: 'Avg Score', value: (student.marks || []).length > 0 ? `${avgScore.toFixed(0)}%` : 'N/A', color: 'text-black' },
                                                    { label: 'Balance', value: formatCurrency(student.balance?.balance), color: (student.balance?.balance || 0) > 0 ? 'text-red-600' : 'text-green-600' },
                                                ].map(s => (
                                                    <div key={s.label} className="bg-neutral-50 border border-black/5 rounded-xl p-2 text-center">
                                                        <p className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 mb-0.5">{s.label}</p>
                                                        <p className={cn('text-[15px] font-black', s.color)}>{s.value}</p>
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Actions */}
                                            {student.parentWhatsapp && (
                                                <a href={whatsappHref} target="_blank" rel="noopener noreferrer"
                                                    className="w-full flex items-center justify-center gap-1.5 bg-[#25d366] hover:bg-[#20ba5c] text-white text-xs font-bold py-2.5 rounded-xl transition-colors">
                                                    <MessageCircle className="w-4 h-4" /> WhatsApp
                                                </a>
                                            )}
                                        </div>

                                        {/* Right Side: Graph */}
                                        <div className="w-full sm:w-[40%] flex flex-col pt-10 sm:pt-0">
                                                    <div className="flex-1 bg-neutral-50 border border-black/5 rounded-2xl p-3 flex flex-col justify-between min-h-[140px]">
                                                <h3 className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-2">Performance Trend</h3>
                                                {(student.marks || []).length > 1 ? (
                                                    <div className="h-28 w-full relative">
                                                        <ResponsiveContainer width="100%" height="100%">
                                                            <LineChart data={[...(student.marks || [])].reverse().map(m => ({ pct: scorePercent(m.score, m.test.maxMarks), name: m.test.name }))}>
                                                                <YAxis domain={[0, 100]} hide />
                                                                <Tooltip content={({ active, payload }) => {
                                                                    if (active && payload && payload.length) {
                                                                        return (
                                                                            <div className="bg-black text-white text-[10px] font-bold px-2 py-1 rounded-md">
                                                                                {Number(payload[0].value || 0).toFixed(0)}%
                                                                            </div>
                                                                        );
                                                                    }
                                                                    return null;
                                                                }} />
                                                                <Line type="monotone" dataKey="pct" stroke="#16a34a" strokeWidth={2.5} dot={{ r: 2, fill: '#16a34a', strokeWidth: 0 }} activeDot={{ r: 4 }} isAnimationActive={false} />
                                                            </LineChart>
                                                        </ResponsiveContainer>
                                                    </div>
                                                ) : (
                                                    <div className="flex-1 flex items-center justify-center text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
                                                        Need 2+ tests
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Tabs */}
                                    <div className="flex border-b border-black/5">
                                        {tabs.map(tab => (
                                            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                                                className={cn('flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-bold uppercase tracking-widest border-b-2 transition-colors',
                                                    activeTab === tab.id ? 'border-black text-black' : 'border-transparent text-neutral-400 hover:text-black')}>
                                                <tab.icon className="w-3.5 h-3.5" />{tab.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* ── Tab Content ── */}
                                <div className="flex-1 overflow-y-auto p-5">

                                    {/* OVERVIEW */}
                                    {activeTab === 'overview' && (
                                        <div className="space-y-5">
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <div className="bg-neutral-50 border border-black/[0.06] rounded-2xl p-4 space-y-3">
                                                    <h3 className="text-[11px] font-black uppercase tracking-widest text-neutral-400">Contact</h3>
                                                    <ProfileInfoRow icon={User} label="Guardian" value={student.parentName} />
                                                    <ProfileInfoRow icon={Phone} label="WhatsApp" value={student.parentWhatsapp} href={whatsappHref} />
                                                    {student.parentEmail && <ProfileInfoRow icon={Mail} label="Email" value={student.parentEmail} href={`mailto:${student.parentEmail}`} />}
                                                    {student.schoolName && <ProfileInfoRow icon={School} label="School" value={student.schoolName} />}
                                                </div>
                                                <div className="bg-neutral-50 border border-black/[0.06] rounded-2xl p-4 space-y-3">
                                                    <h3 className="text-[11px] font-black uppercase tracking-widest text-neutral-400">Snapshot</h3>
                                                    <ProfileInfoRow icon={CalendarDays} label="Joined" value={formatDate(student.createdAt)} />
                                                    <ProfileInfoRow icon={GraduationCap} label="Latest Test" value={latestMark ? `${latestMark.test.name} · ${scorePercent(latestMark.score, latestMark.test.maxMarks).toFixed(0)}%` : null} />
                                                    <ProfileInfoRow icon={CreditCard} label="Latest Payment" value={latestPayment ? `${formatCurrency(latestPayment.amountPaid)} · ${formatDate(latestPayment.date, { day: 'numeric', month: 'short' })}` : null} />
                                                </div>
                                            </div>
                                            <div>
                                                <h3 className="text-[11px] font-black uppercase tracking-widest text-neutral-400 mb-3">Recent Tests</h3>
                                                {(student.marks || []).length > 0 ? (
                                                    <div className="space-y-2">
                                                        {(student.marks || []).slice(0, 4).map(mark => {
                                                            const pct = scorePercent(mark.score, mark.test.maxMarks);
                                                            return (
                                                                <div key={mark.id} className="flex items-center justify-between gap-3 bg-white border border-black/[0.06] rounded-xl px-4 py-3">
                                                                    <div className="min-w-0">
                                                                        <p className="font-semibold text-sm text-black truncate">{mark.test.name}</p>
                                                                        <p className="text-[11px] text-neutral-400">{new Date(mark.test.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                                                                    </div>
                                                                    <div className="text-right">
                                                                        <span className="font-black text-sm text-black">{mark.score}</span>
                                                                        <span className="text-xs text-neutral-400"> / {mark.test.maxMarks}</span>
                                                                        <p className={cn('text-[11px] font-bold', pct >= 80 ? 'text-green-600' : pct >= 50 ? 'text-orange-500' : 'text-red-500')}>{pct.toFixed(0)}%</p>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                ) : <EmptyState icon={GraduationCap} label="No test marks recorded" />}
                                            </div>
                                            <div>
                                                <h3 className="text-[11px] font-black uppercase tracking-widest text-neutral-400 mb-3">Recent Payments</h3>
                                                {(student.feePayments || []).length > 0 ? (
                                                    <div className="space-y-2">
                                                        {(student.feePayments || []).slice(0, 3).map(p => (
                                                            <div key={p.id} className="flex items-center justify-between bg-white border border-black/[0.06] rounded-xl px-4 py-3">
                                                                <div>
                                                                    <p className="font-semibold text-sm text-black">{p.installment.name}</p>
                                                                    <p className="text-[11px] text-neutral-400">{new Date(p.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                                                                </div>
                                                                <p className="font-black text-green-600">{formatCurrency(p.amountPaid)}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : <EmptyState icon={CreditCard} label="No payments recorded" />}
                                            </div>
                                        </div>
                                    )}

                                    {/* PERFORMANCE */}
                                    {activeTab === 'performance' && (
                                        <div className="space-y-4">
                                            {(student.marks || []).length > 0 ? (
                                                <>
                                                    <div className="flex items-center justify-between">
                                                        <h3 className="text-[11px] font-black uppercase tracking-widest text-neutral-400">All Tests</h3>
                                                        <span className={cn('text-sm font-black px-3 py-1 rounded-full', avgScore >= 80 ? 'bg-green-100 text-green-700' : avgScore >= 50 ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700')}>
                                                            Avg {avgScore.toFixed(1)}%
                                                        </span>
                                                    </div>
                                                    <div className="border border-black/[0.06] rounded-2xl overflow-x-auto">
                                                        <table className="w-full min-w-[460px] text-left text-sm">
                                                            <thead className="bg-neutral-50 text-[10px] uppercase tracking-widest text-neutral-400">
                                                                <tr>
                                                                    <th className="px-4 py-3 font-bold">Test</th>
                                                                    <th className="px-4 py-3 font-bold text-right">Score</th>
                                                                    <th className="px-4 py-3 font-bold text-right">%</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-black/[0.04]">
                                                                {(student.marks || []).map(mark => {
                                                                    const pct = scorePercent(mark.score, mark.test.maxMarks);
                                                                    return (
                                                                        <tr key={mark.id} className="hover:bg-neutral-50/50">
                                                                            <td className="px-4 py-3">
                                                                                <p className="font-semibold text-black text-sm">{mark.test.name}</p>
                                                                                <p className="text-[11px] text-neutral-400">{new Date(mark.test.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                                                                            </td>
                                                                            <td className="px-4 py-3 text-right font-black text-black">{mark.score}<span className="text-xs text-neutral-400 font-normal"> /{mark.test.maxMarks}</span></td>
                                                                            <td className="px-4 py-3 text-right font-bold"><span className={cn(pct >= 80 ? 'text-green-600' : pct >= 50 ? 'text-orange-500' : 'text-red-500')}>{pct.toFixed(0)}%</span></td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </>
                                            ) : <EmptyState icon={TrendingUp} label="No test marks recorded yet" />}
                                        </div>
                                    )}

                                    {/* FEES */}
                                    {activeTab === 'fees' && (
                                        <div className="space-y-4">
                                            <div className="grid grid-cols-1 min-[420px]:grid-cols-3 gap-3">
                                                <div className="bg-neutral-50 border border-black/[0.05] rounded-xl p-3 text-center">
                                                    <p className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 mb-1">Total Fee</p>
                                                    <p className="text-base font-black text-black">{formatCurrency(student.balance?.totalFee)}</p>
                                                </div>
                                                <div className="bg-green-50 border border-green-100 rounded-xl p-3 text-center">
                                                    <p className="text-[9px] font-bold uppercase tracking-widest text-green-600 mb-1">Paid</p>
                                                    <p className="text-base font-black text-green-700">{formatCurrency(student.balance?.totalPaid)}</p>
                                                </div>
                                                <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-center">
                                                    <p className="text-[9px] font-bold uppercase tracking-widest text-red-500 mb-1">Due</p>
                                                    <p className="text-base font-black text-red-600">{formatCurrency(student.balance?.balance)}</p>
                                                </div>
                                            </div>
                                            {student.feePayments.length > 0 ? (
                                                <div className="border border-black/[0.06] rounded-2xl overflow-x-auto">
                                                    <table className="w-full min-w-[420px] text-left text-sm">
                                                        <thead className="bg-neutral-50 text-[10px] uppercase tracking-widest text-neutral-400">
                                                            <tr>
                                                                <th className="px-4 py-3 font-bold">Installment</th>
                                                                <th className="px-4 py-3 font-bold text-right">Amount</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-black/[0.04]">
                                                            {student.feePayments.map(p => (
                                                                <tr key={p.id} className="hover:bg-neutral-50/50">
                                                                    <td className="px-4 py-3">
                                                                        <div className="flex items-center gap-2">
                                                                            <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                                                                            <div>
                                                                                <p className="font-semibold text-black text-sm">{p.installment.name}</p>
                                                                                <p className="text-[11px] text-neutral-400">{new Date(p.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                                                                            </div>
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-4 py-3 text-right font-black text-green-600">{formatCurrency(p.amountPaid)}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            ) : <EmptyState icon={IndianRupee} label="No fee payments recorded" />}
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

    return createPortal(modalContent, document.body);
}
