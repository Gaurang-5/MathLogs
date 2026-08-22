import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiRequest } from '../utils/api';
import Layout from '../components/Layout';
import { ArrowLeft, User, Phone, Book, GraduationCap, CheckCircle2, CreditCard, Activity, CalendarDays, TrendingUp, MessageCircle, Mail, School, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '../utils/cn';
import { ConfiguredStudentFields } from '../features/student-profile/ConfiguredStudentFields';
import type { RegistrationFieldDefinition } from '../features/student-profile/registrationFields';

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
    batch?: {
        name: string;
        className: string | null;
        subject: string | null;
    };
    status: string;
    createdAt?: string;
    stats: {
        attendancePercentage: number | null;
    };
    attendanceRecords: Array<{
        id: string;
        attendanceDate: string;
        checkedInAt: string;
        source: string;
        note: string | null;
    }>;
    marks: Array<{
        id: string;
        score: number;
        test: {
            name: string;
            date: string;
            maxMarks: number;
            subject: string;
        };
    }>;
    feePayments: Array<{
        id: string;
        amountPaid: number;
        date: string;
        installment: {
            name: string;
        };
    }>;
    balance?: {
        totalFee: number;
        totalPaid: number;
        balance: number;
    };
}

const formatCurrency = (value?: number | null) => `₹${Number(value || 0).toLocaleString('en-IN')}`;
const formatDate = (value?: string | null, options?: Intl.DateTimeFormatOptions) => {
    if (!value) return 'Not available';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Not available';
    return date.toLocaleDateString('en-IN', options || { day: 'numeric', month: 'short', year: 'numeric' });
};

const scorePercent = (score: number, maxMarks: number) => maxMarks > 0 ? (score / maxMarks) * 100 : 0;

export default function StudentProfile() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [student, setStudent] = useState<StudentProfileData | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'overview' | 'performance' | 'fees'>('overview');

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const data = await apiRequest<StudentProfileData>(`/students/${id}/profile`);
                setStudent(data);
            } catch (err) {
                toast.error('Failed to load student profile');
                navigate('/batches');
            } finally {
                setLoading(false);
            }
        };
        fetchProfile();
    }, [id, navigate]);

    const avgScore = useMemo(() => {
        if (!student?.marks?.length) return 0;
        return student.marks.reduce((acc, mark) => acc + scorePercent(mark.score, mark.test.maxMarks), 0) / student.marks.length;
    }, [student?.marks]);

    const feeCollectionPercent = useMemo(() => {
        if (student?.coachingFeeMode === 'MONTH_COVERAGE') return student.monthCoverageStats?.progressPercent ?? 0;
        const total = student?.balance?.totalFee || 0;
        const paid = student?.balance?.totalPaid || 0;
        if (total <= 0) return 100;
        return Math.min(100, Math.round((paid / total) * 100));
    }, [student?.balance, student?.coachingFeeMode, student?.monthCoverageStats?.progressPercent]);

    if (loading) {
        return (
            <Layout hideMobileNav>
                <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
                    <div className="flex gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-neutral-300 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-2.5 h-2.5 rounded-full bg-neutral-300 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-2.5 h-2.5 rounded-full bg-neutral-300 animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <p className="text-xs font-bold text-app-text-tertiary uppercase tracking-widest">Loading Profile</p>
                </div>
            </Layout>
        );
    }

    if (!student) return null;

    const sanitizedWhatsapp = student.parentWhatsapp?.replace(/\D/g, '') || '';
    const whatsappHref = sanitizedWhatsapp ? `https://wa.me/${sanitizedWhatsapp.length === 10 ? `91${sanitizedWhatsapp}` : sanitizedWhatsapp}` : '';
    const phoneHref = student.parentWhatsapp ? `tel:${student.parentWhatsapp}` : '';

    const getInitials = (name: string) => (name || 'Unknown').split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();

    const getScoreBadgeColor = (pct: number) => {
        if (pct >= 80) return 'text-emerald-700 bg-emerald-50 border-emerald-200';
        if (pct >= 50) return 'text-amber-700 bg-amber-50 border-amber-200';
        return 'text-rose-700 bg-rose-50 border-rose-200';
    };

    return (
        <Layout hideMobileNav>
            <div className="max-w-4xl mx-auto pb-12">
                <button
                    onClick={() => navigate(-1)}
                    className="inline-flex items-center gap-2 text-neutral-500 hover:text-black mb-4 sm:mb-6 transition-colors text-xs font-bold uppercase tracking-widest group"
                >
                    <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" /> Back
                </button>

                {/* Header Section */}
                <div className="bg-white border border-black/[0.06] rounded-3xl p-5 sm:p-7 shadow-xs mb-5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
                        <div className="flex items-start gap-4">
                            <div className="w-14 h-14 sm:w-16 sm:h-16 bg-neutral-900 text-white rounded-2xl flex items-center justify-center text-lg sm:text-xl font-black shrink-0 shadow-xs">
                                {getInitials(student.name)}
                            </div>
                            <div className="min-w-0">
                                <h1 className="text-xl sm:text-2xl font-black text-black tracking-tight mb-1 truncate">
                                    {student.name}
                                </h1>
                                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                                    {student.status && (
                                        <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                                            {student.status}
                                        </span>
                                    )}
                                    {student.humanId && (
                                        <span className="text-[10px] font-mono font-bold text-neutral-600 bg-neutral-100 px-2 py-0.5 rounded-md border border-black/[0.06]">
                                            #{student.humanId}
                                        </span>
                                    )}
                                    {student.batch && (
                                        <span className="flex items-center gap-1 text-xs font-semibold text-neutral-600 bg-neutral-100 px-2 py-0.5 rounded-md border border-black/[0.06]">
                                            <Book className="w-3.5 h-3.5" />
                                            {student.batch.name}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Quick Contact & Stats Bar */}
                        <div className="flex flex-wrap items-center gap-2">
                            {whatsappHref && (
                                <a
                                    href={whatsappHref}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1.5 bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold text-xs py-2 px-3 rounded-xl transition-all shadow-xs"
                                >
                                    <MessageCircle className="w-4 h-4 fill-current" />
                                    <span>WhatsApp</span>
                                </a>
                            )}
                            {phoneHref && (
                                <a
                                    href={phoneHref}
                                    className="flex items-center gap-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-bold text-xs py-2 px-3 rounded-xl transition-all border border-black/[0.06]"
                                >
                                    <Phone className="w-3.5 h-3.5" />
                                    <span>Call</span>
                                </a>
                            )}
                        </div>
                    </div>

                    {/* KPI Tiles */}
                    <div className="grid grid-cols-3 gap-2.5 mt-5 pt-4 border-t border-black/[0.06]">
                        <div className="bg-neutral-50/80 border border-black/[0.06] rounded-xl p-3 text-center">
                            <p className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Tests</p>
                            <p className="text-base sm:text-lg font-black text-black mt-0.5">{student.marks?.length || 0}</p>
                        </div>
                        <div className="bg-neutral-50/80 border border-black/[0.06] rounded-xl p-3 text-center">
                            <p className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Avg Score</p>
                            <p className={cn('text-base sm:text-lg font-black mt-0.5', (student.marks || []).length > 0 ? (avgScore >= 80 ? 'text-emerald-600' : avgScore >= 50 ? 'text-amber-600' : 'text-rose-600') : 'text-neutral-400')}>
                                {(student.marks || []).length > 0 ? `${avgScore.toFixed(0)}%` : 'N/A'}
                            </p>
                        </div>
                        <div className="bg-neutral-50/80 border border-black/[0.06] rounded-xl p-3 text-center">
                            <p className="text-[9px] font-black uppercase tracking-wider text-neutral-400">{student.coachingFeeMode === 'MONTH_COVERAGE' ? 'Pending months' : 'Fee Balance'}</p>
                            <p className={cn('text-base sm:text-lg font-black mt-0.5', (student.coachingFeeMode === 'MONTH_COVERAGE' ? (student.monthCoverageStats?.pendingMonths || 0) : (student.balance?.balance || 0)) > 0 ? 'text-rose-600' : 'text-emerald-600')}>
                                {student.coachingFeeMode === 'MONTH_COVERAGE' ? (student.monthCoverageStats?.pendingMonths ?? 0) : formatCurrency(student.balance?.balance)}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Navigation Tabs */}
                <div className="flex border-b border-black/[0.06] mb-5">
                    {[
                        { id: 'overview', label: 'Overview', icon: Activity },
                        { id: 'performance', label: 'Performance', icon: TrendingUp },
                        { id: 'fees', label: 'Fee History', icon: CreditCard }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={cn(
                                "flex items-center gap-2 px-4 sm:px-6 py-3 border-b-2 text-xs sm:text-sm font-bold uppercase tracking-wider transition-all whitespace-nowrap",
                                activeTab === tab.id 
                                    ? "border-black text-black font-black" 
                                    : "border-transparent text-neutral-400 hover:text-black"
                            )}
                        >
                            <tab.icon className="w-4 h-4" />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                <div className="bg-white border border-black/[0.06] rounded-3xl p-5 sm:p-7 shadow-xs">
                    {/* OVERVIEW TAB */}
                    {activeTab === 'overview' && (
                        <div className="space-y-6">
                            {/* Guardian Card */}
                            <div className="bg-neutral-50/60 border border-black/[0.06] rounded-2xl p-4 sm:p-5">
                                <h3 className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-3">Guardian & Contact</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="bg-white border border-black/[0.06] rounded-xl p-3 flex items-center gap-3">
                                        <User className="w-4 h-4 text-neutral-400 shrink-0" />
                                        <div className="min-w-0">
                                            <p className="text-[10px] font-black uppercase text-neutral-400">Guardian</p>
                                            <p className="text-sm font-bold text-black truncate">{student.parentName || 'Not available'}</p>
                                        </div>
                                    </div>
                                    <div className="bg-white border border-black/[0.06] rounded-xl p-3 flex items-center gap-3">
                                        <Phone className="w-4 h-4 text-neutral-400 shrink-0" />
                                        <div className="min-w-0">
                                            <p className="text-[10px] font-black uppercase text-neutral-400">Phone</p>
                                            <p className="text-sm font-bold text-black truncate">{student.parentWhatsapp || 'Not available'}</p>
                                        </div>
                                    </div>
                                    {student.schoolName && (
                                        <div className="bg-white border border-black/[0.06] rounded-xl p-3 flex items-center gap-3">
                                            <School className="w-4 h-4 text-neutral-400 shrink-0" />
                                            <div className="min-w-0">
                                                <p className="text-[10px] font-black uppercase text-neutral-400">School</p>
                                                <p className="text-sm font-bold text-black truncate">{student.schoolName}</p>
                                            </div>
                                        </div>
                                    )}
                                    <div className="bg-white border border-black/[0.06] rounded-xl p-3 flex items-center gap-3">
                                        <CalendarDays className="w-4 h-4 text-neutral-400 shrink-0" />
                                        <div className="min-w-0">
                                            <p className="text-[10px] font-black uppercase text-neutral-400">Joined Date</p>
                                            <p className="text-sm font-bold text-black truncate">{formatDate(student.createdAt)}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {(student.registrationFields?.length || 0) > 0 && (
                                <div className="bg-neutral-50/60 border border-black/[0.06] rounded-2xl p-4 sm:p-5">
                                    <h3 className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-3">Onboarding details</h3>
                                    <ConfiguredStudentFields student={student} fields={student.registrationFields || []} />
                                </div>
                            )}

                            {/* Recent Performance */}
                            <div>
                                <h3 className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-3 px-1">Latest Test Marks</h3>
                                {student.marks.length > 0 ? (
                                    <div className="space-y-2">
                                        {student.marks.slice(0, 4).map(mark => {
                                            const pct = scorePercent(mark.score, mark.test.maxMarks);
                                            return (
                                                <div key={mark.id} className="bg-white border border-black/[0.06] rounded-xl p-3.5 shadow-2xs">
                                                    <div className="flex items-center justify-between gap-3 mb-1.5">
                                                        <div className="min-w-0">
                                                            <p className="font-black text-sm text-black truncate">{mark.test.name}</p>
                                                            <p className="text-[11px] text-neutral-400">{formatDate(mark.test.date)}</p>
                                                        </div>
                                                        <div className="text-right shrink-0">
                                                            <span className="font-black text-sm text-black">{mark.score}</span>
                                                            <span className="text-xs text-neutral-400">/{mark.test.maxMarks}</span>
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
                                    <p className="text-sm text-neutral-400 py-6 text-center border border-dashed border-black/[0.06] rounded-xl">No test marks recorded yet.</p>
                                )}
                            </div>

                            {/* Recent Payments */}
                            {student.coachingFeeMode !== 'MONTH_COVERAGE' && <div>
                                <h3 className="text-[10px] font-black uppercase tracking-widest text-neutral-400 mb-3 px-1">Recent Payments</h3>
                                {student.feePayments.length > 0 ? (
                                    <div className="space-y-2">
                                        {student.feePayments.slice(0, 4).map(p => (
                                            <div key={p.id} className="flex items-center justify-between bg-white border border-black/[0.06] rounded-xl p-3.5 shadow-2xs">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                                                        <CheckCircle2 className="w-4 h-4" />
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-sm text-black">{p.installment.name}</p>
                                                        <p className="text-[11px] text-neutral-400">{formatDate(p.date)}</p>
                                                    </div>
                                                </div>
                                                <p className="font-black text-emerald-600 text-sm sm:text-base">{formatCurrency(p.amountPaid)}</p>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm text-neutral-400 py-6 text-center border border-dashed border-black/[0.06] rounded-xl">No fee payments recorded yet.</p>
                                )}
                            </div>}
                        </div>
                    )}

                    {/* PERFORMANCE TAB */}
                    {activeTab === 'performance' && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h2 className="text-base sm:text-lg font-black text-black tracking-tight">Academic Performance</h2>
                                <span className={cn('text-xs font-black px-2.5 py-1 rounded-full border', getScoreBadgeColor(avgScore))}>
                                    Avg {avgScore.toFixed(1)}%
                                </span>
                            </div>
                            
                            {student.marks.length > 0 ? (
                                <div className="space-y-2">
                                    {student.marks.map(mark => {
                                        const pct = scorePercent(mark.score, mark.test.maxMarks);
                                        return (
                                            <div key={mark.id} className="bg-white border border-black/[0.06] rounded-2xl p-4 shadow-2xs">
                                                <div className="flex items-start justify-between gap-3 mb-2">
                                                    <div className="min-w-0 flex-1">
                                                        <p className="font-black text-sm sm:text-base text-black truncate">{mark.test.name}</p>
                                                        <div className="flex items-center gap-2 mt-0.5 text-xs text-neutral-400">
                                                            <span>{formatDate(mark.test.date)}</span>
                                                            {mark.test.subject && <span>• {mark.test.subject}</span>}
                                                        </div>
                                                    </div>
                                                    <div className="text-right shrink-0">
                                                        <span className="font-black text-base text-black">{mark.score}</span>
                                                        <span className="text-xs text-neutral-400">/{mark.test.maxMarks}</span>
                                                        <span className={cn('ml-2 text-xs font-black px-2 py-0.5 rounded border inline-block', getScoreBadgeColor(pct))}>
                                                            {pct.toFixed(0)}%
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="w-full h-1.5 bg-neutral-100 rounded-full overflow-hidden">
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
                                <div className="text-center py-12 text-neutral-400 border border-dashed border-black/[0.06] rounded-2xl">
                                    <GraduationCap className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                    <p className="font-bold text-sm">No test marks recorded.</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* FEES TAB */}
                    {activeTab === 'fees' && (
                        <div className="space-y-5">
                            <h2 className="text-base sm:text-lg font-black text-black tracking-tight">{student.coachingFeeMode === 'MONTH_COVERAGE' ? 'Fee month progress' : 'Fee Payment History'}</h2>
                            
                            <div className="grid grid-cols-3 gap-2 sm:gap-3">
                                <div className="bg-neutral-50 border border-black/[0.06] rounded-xl p-3 text-center">
                                    <p className="text-[9px] font-black uppercase tracking-wider text-neutral-400">{student.coachingFeeMode === 'MONTH_COVERAGE' ? 'Paid months' : 'Total Fee'}</p>
                                    <p className="text-sm sm:text-base font-black text-black mt-0.5">{student.coachingFeeMode === 'MONTH_COVERAGE' ? (student.monthCoverageStats?.receivedMonths ?? 0) : formatCurrency(student.balance?.totalFee)}</p>
                                </div>
                                <div className="bg-emerald-50/60 border border-emerald-100 rounded-xl p-3 text-center">
                                    <p className="text-[9px] font-black uppercase tracking-wider text-emerald-700">{student.coachingFeeMode === 'MONTH_COVERAGE' ? 'Pending months' : 'Total Paid'}</p>
                                    <p className="text-sm sm:text-base font-black text-emerald-700 mt-0.5">{student.coachingFeeMode === 'MONTH_COVERAGE' ? (student.monthCoverageStats?.pendingMonths ?? 0) : formatCurrency(student.balance?.totalPaid)}</p>
                                </div>
                                <div className="bg-rose-50/60 border border-rose-100 rounded-xl p-3 text-center">
                                    <p className="text-[9px] font-black uppercase tracking-wider text-rose-600">{student.coachingFeeMode === 'MONTH_COVERAGE' ? 'Overdue months' : 'Balance Due'}</p>
                                    <p className="text-sm sm:text-base font-black text-rose-600 mt-0.5">{student.coachingFeeMode === 'MONTH_COVERAGE' ? (student.monthCoverageStats?.overdueMonths ?? 0) : formatCurrency(student.balance?.balance)}</p>
                                </div>
                            </div>

                            {student.coachingFeeMode !== 'MONTH_COVERAGE' && (student.feePayments.length > 0 ? (
                                <div className="space-y-2">
                                    {student.feePayments.map(p => (
                                        <div key={p.id} className="flex items-center justify-between bg-white border border-black/[0.06] rounded-2xl p-4 shadow-2xs">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
                                                    <CheckCircle2 className="w-4 h-4" />
                                                </div>
                                                <div>
                                                    <p className="font-bold text-sm text-black">{p.installment.name}</p>
                                                    <p className="text-xs text-neutral-400">{formatDate(p.date)}</p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-black text-emerald-600 text-base">{formatCurrency(p.amountPaid)}</p>
                                                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                                    Paid
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-12 text-neutral-400 border border-dashed border-black/[0.06] rounded-2xl">
                                    <CreditCard className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                    <p className="font-bold text-sm">No fee payments recorded.</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </Layout>
    );
}
