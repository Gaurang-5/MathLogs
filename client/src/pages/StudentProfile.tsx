import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiRequest } from '../utils/api';
import Layout from '../components/Layout';
import { ArrowLeft, User, Phone, Book, GraduationCap, CheckCircle2, XCircle, CreditCard, Clock, Activity, CalendarDays } from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '../utils/cn';

interface StudentProfileData {
    id: string;
    humanId: string | null;
    name: string;
    parentName: string;
    parentWhatsapp: string;
    batch?: {
        name: string;
        className: string | null;
        subject: string | null;
    };
    status: string;
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

    if (loading) {
        return (
            <Layout hideMobileNav>
                <div className="flex flex-col items-center justify-center h-96 gap-4">
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

    // Calculate derived data
    const avgScore = student.marks.length > 0 
        ? (student.marks.reduce((acc, curr) => acc + (curr.score / curr.test.maxMarks), 0) / student.marks.length) * 100 
        : 0;

    return (
        <Layout hideMobileNav>
            <div className="mb-6 sm:mb-8">
                <button
                    onClick={() => navigate(-1)}
                    className="inline-flex items-center gap-2 text-app-text-tertiary hover:text-black mb-8 transition-colors text-xs font-bold uppercase tracking-widest group"
                >
                    <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" /> Back
                </button>

                {/* Header Section */}
                <div className="bg-white border border-black/[0.06] rounded-2xl p-6 shadow-sm mb-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="flex items-start gap-4">
                            <div className="w-16 h-16 bg-neutral-100 rounded-2xl flex items-center justify-center shrink-0 border border-black/5">
                                <User className="w-8 h-8 text-neutral-400" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-black text-black tracking-tight mb-1">
                                    {student.name}
                                </h1>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                    {student.humanId && (
                                        <span className="text-xs font-bold text-app-text-tertiary uppercase tracking-wider bg-neutral-100 px-2 py-0.5 rounded">
                                            ID: {student.humanId}
                                        </span>
                                    )}
                                    {student.batch && (
                                        <span className="flex items-center gap-1.5 text-xs font-semibold text-app-text-secondary">
                                            <Book className="w-3.5 h-3.5" />
                                            {student.batch.name}
                                        </span>
                                    )}
                                    <span className="flex items-center gap-1.5 text-xs font-semibold text-app-text-secondary">
                                        <Phone className="w-3.5 h-3.5" />
                                        {student.parentName} ({student.parentWhatsapp})
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Quick Stats Summary */}
                        <div className="flex flex-wrap gap-4 md:justify-end">
                            <div className="bg-neutral-50 px-4 py-3 rounded-xl border border-black/5 min-w-[120px]">
                                <p className="text-[10px] font-bold text-app-text-tertiary uppercase tracking-widest mb-1">Fee Balance</p>
                                <p className={cn("text-xl font-black", student.balance?.balance ? "text-red-500" : "text-green-500")}>
                                    ₹{student.balance?.balance || 0}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Navigation Tabs */}
                <div className="flex overflow-x-auto scrollbar-hide border-b border-black/[0.06] mb-6">
                    {[
                        { id: 'overview', label: 'Overview', icon: Activity },
                        { id: 'performance', label: 'Performance', icon: GraduationCap },
                        { id: 'fees', label: 'Fee History', icon: CreditCard }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={cn(
                                "flex items-center gap-2 px-6 py-3 border-b-2 text-sm font-bold transition-colors whitespace-nowrap",
                                activeTab === tab.id 
                                    ? "border-black text-black" 
                                    : "border-transparent text-app-text-tertiary hover:text-black"
                            )}
                        >
                            <tab.icon className="w-4 h-4" />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                <div className="bg-white border border-black/[0.06] rounded-2xl p-6 shadow-sm min-h-[400px]">
                    
                    {/* OVERVIEW TAB */}
                    {activeTab === 'overview' && (
                        <div className="space-y-8">
                            <h2 className="text-lg font-black text-black tracking-tight">Recent Activity Overview</h2>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Recent Performance */}
                                <div className="border border-black/[0.06] rounded-xl p-5">
                                    <h3 className="text-sm font-bold uppercase tracking-widest text-app-text-secondary mb-4 flex items-center gap-2">
                                        <GraduationCap className="w-4 h-4" /> Latest Marks
                                    </h3>
                                    {student.marks.length > 0 ? (
                                        <div className="space-y-3">
                                            {student.marks.slice(0, 3).map(mark => (
                                                <div key={mark.id} className="flex justify-between items-center bg-neutral-50 p-3 rounded-lg">
                                                    <div>
                                                        <p className="font-semibold text-sm">{mark.test.name}</p>
                                                        <p className="text-xs text-app-text-tertiary">{new Date(mark.test.date).toLocaleDateString()}</p>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className="font-black text-black">{mark.score}</span>
                                                        <span className="text-xs text-app-text-tertiary"> / {mark.test.maxMarks}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-app-text-tertiary">No test marks recorded yet.</p>
                                    )}
                                </div>

                                {/* Recent Payments */}
                                <div className="border border-black/[0.06] rounded-xl p-5">
                                    <h3 className="text-sm font-bold uppercase tracking-widest text-app-text-secondary mb-4 flex items-center gap-2">
                                        <CreditCard className="w-4 h-4" /> Recent Payments
                                    </h3>
                                    {student.feePayments.length > 0 ? (
                                        <div className="space-y-3">
                                            {student.feePayments.slice(0, 3).map(payment => (
                                                <div key={payment.id} className="flex justify-between items-center bg-neutral-50 p-3 rounded-lg">
                                                    <div>
                                                        <p className="font-semibold text-sm">{payment.installment.name}</p>
                                                        <p className="text-xs text-app-text-tertiary">{new Date(payment.date).toLocaleDateString()}</p>
                                                    </div>
                                                    <p className="font-black text-green-600">₹{payment.amountPaid}</p>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-app-text-tertiary">No fee payments recorded yet.</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Attendance UI removed */}

                    {/* PERFORMANCE TAB */}
                    {activeTab === 'performance' && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center">
                                <h2 className="text-lg font-black text-black tracking-tight">Academic Performance</h2>
                                <div className="bg-neutral-100 px-3 py-1.5 rounded-lg text-sm font-bold">
                                    Average: <span className={cn(avgScore >= 80 ? "text-green-600" : avgScore >= 50 ? "text-orange-500" : "text-red-500")}>
                                        {avgScore.toFixed(1)}%
                                    </span>
                                </div>
                            </div>
                            
                            {student.marks.length > 0 ? (
                                <div className="border border-black/[0.06] rounded-xl overflow-hidden">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-neutral-50 text-xs uppercase tracking-widest text-app-text-tertiary">
                                            <tr>
                                                <th className="px-4 py-3 font-bold">Test Name</th>
                                                <th className="px-4 py-3 font-bold">Date</th>
                                                <th className="px-4 py-3 font-bold text-right">Score</th>
                                                <th className="px-4 py-3 font-bold text-right">%</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-black/[0.04]">
                                            {student.marks.map(mark => {
                                                const pct = (mark.score / mark.test.maxMarks) * 100;
                                                return (
                                                    <tr key={mark.id} className="hover:bg-neutral-50/50">
                                                        <td className="px-4 py-3 font-semibold text-black">{mark.test.name}</td>
                                                        <td className="px-4 py-3 text-app-text-secondary">{new Date(mark.test.date).toLocaleDateString()}</td>
                                                        <td className="px-4 py-3 text-right">
                                                            <span className="font-black text-black">{mark.score}</span>
                                                            <span className="text-xs text-app-text-tertiary"> / {mark.test.maxMarks}</span>
                                                        </td>
                                                        <td className="px-4 py-3 text-right font-bold">
                                                            <span className={cn(pct >= 80 ? "text-green-600" : pct >= 50 ? "text-orange-500" : "text-red-500")}>
                                                                {pct.toFixed(1)}%
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="text-center py-12 text-app-text-tertiary border-2 border-dashed border-neutral-200 rounded-xl">
                                    <GraduationCap className="w-8 h-8 mx-auto mb-3 opacity-20" />
                                    <p className="font-semibold">No test marks recorded.</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* FEES TAB */}
                    {activeTab === 'fees' && (
                        <div className="space-y-6">
                            <h2 className="text-lg font-black text-black tracking-tight">Fee Payment History</h2>
                            
                            <div className="grid grid-cols-3 gap-4 mb-6">
                                <div className="bg-neutral-50 p-4 rounded-xl border border-black/[0.04]">
                                    <p className="text-xs font-bold text-app-text-tertiary uppercase tracking-widest mb-1">Total Fee</p>
                                    <p className="text-2xl font-black">₹{student.balance?.totalFee || 0}</p>
                                </div>
                                <div className="bg-green-50 p-4 rounded-xl border border-green-100">
                                    <p className="text-xs font-bold text-green-700 uppercase tracking-widest mb-1">Total Paid</p>
                                    <p className="text-2xl font-black text-green-700">₹{student.balance?.totalPaid || 0}</p>
                                </div>
                                <div className="bg-red-50 p-4 rounded-xl border border-red-100">
                                    <p className="text-xs font-bold text-red-700 uppercase tracking-widest mb-1">Balance Due</p>
                                    <p className="text-2xl font-black text-red-700">₹{student.balance?.balance || 0}</p>
                                </div>
                            </div>

                            {student.feePayments.length > 0 ? (
                                <div className="border border-black/[0.06] rounded-xl overflow-hidden">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-neutral-50 text-xs uppercase tracking-widest text-app-text-tertiary">
                                            <tr>
                                                <th className="px-4 py-3 font-bold">Installment</th>
                                                <th className="px-4 py-3 font-bold">Payment Date</th>
                                                <th className="px-4 py-3 font-bold text-right">Amount Paid</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-black/[0.04]">
                                            {student.feePayments.map(payment => (
                                                <tr key={payment.id} className="hover:bg-neutral-50/50">
                                                    <td className="px-4 py-3 font-semibold text-black flex items-center gap-2">
                                                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                                                        {payment.installment.name}
                                                    </td>
                                                    <td className="px-4 py-3 text-app-text-secondary">
                                                        {new Date(payment.date).toLocaleDateString()}
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-black text-green-600">
                                                        ₹{payment.amountPaid}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="text-center py-12 text-app-text-tertiary border-2 border-dashed border-neutral-200 rounded-xl">
                                    <CreditCard className="w-8 h-8 mx-auto mb-3 opacity-20" />
                                    <p className="font-semibold">No payments recorded.</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </Layout>
    );
}
