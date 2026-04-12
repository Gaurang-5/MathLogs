import React, { useState, useCallback, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, CheckCircle, AlertCircle, Loader, Phone, ChevronRight, IndianRupee, ArrowLeft, Clock, GraduationCap, PartyPopper, ArrowRight } from 'lucide-react';

const API_URL = import.meta.env.PROD ? '/api' : (import.meta.env.VITE_API_URL || 'http://localhost:3001/api');

interface FeeInstallment { id: string; name: string; amount: number; dueDate?: string; }
interface FeePayment { id: string; amount?: number; amountPaid?: number; installmentId?: string; }
interface FeeRecord { id: string; amount: number; }
interface PendingVerification { id: string; amount: number; createdAt: string; status: string; }
interface StudentData { studentId: string; studentName: string; batchName: string; feeInstallments: FeeInstallment[]; feePayments: FeePayment[]; feeRecords?: FeeRecord[]; pendingVerifications: PendingVerification[]; }
interface InstituteInfo { name: string; logoUrl: string | null; }

type Step = 'loading' | 'phone' | 'select-student' | 'upload' | 'success';

export default function StudentPaymentPortal() {
    const { slug } = useParams<{ slug: string }>();
    const [searchParams] = useSearchParams();
    const phoneFromUrl = searchParams.get('phone');
    const [step, setStep] = useState<Step>(phoneFromUrl ? 'loading' : 'phone');
    const [phone, setPhone] = useState(phoneFromUrl || '');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [institute, setInstitute] = useState<InstituteInfo | null>(null);
    const [loadingInstitute, setLoadingInstitute] = useState(true);
    const [instituteError, setInstituteError] = useState(false);
    const [students, setStudents] = useState<StudentData[]>([]);
    const [selectedStudent, setSelectedStudent] = useState<StudentData | null>(null);
    const [amount, setAmount] = useState('');

    const [file, setFile] = useState<File | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [paidByName, setPaidByName] = useState('');

    const [paymentType, setPaymentType] = useState<'full' | 'custom'>('full');

    // Auto-fetch when visited via personalized WhatsApp link (?phone=...)
    // Also fetch basic institute profile so logo/name display immediately
    useEffect(() => {
        if (!slug) return;

        setLoadingInstitute(true);
        axios.get(`${API_URL}/public/i/${slug}`)
            .then(res => {
                setInstitute(prev => prev || {
                    name: res.data.name,
                    logoUrl: res.data.logoUrl
                });
            })
            .catch(err => {
                console.error("Failed to fetch profile", err);
                setInstituteError(true);
            })
            .finally(() => setLoadingInstitute(false));

        if (phoneFromUrl) {
            const autoFetch = async () => {
                try {
                    const cleanPhone = phoneFromUrl.replace(/\D/g, '').slice(-10);
                    const res = await axios.get(`${API_URL}/public/i/${slug}/student-fees?phone=${cleanPhone}`);
                    setInstitute({ name: res.data.institute.name, logoUrl: res.data.institute.logoUrl });
                    setStudents(res.data.students);
                    if (res.data.students.length === 1) {
                        setSelectedStudent(res.data.students[0]);
                        setStep('upload');
                    } else if (res.data.students.length > 1) {
                        setStep('select-student');
                    } else {
                        setStep('phone');
                    }
                } catch {
                    setStep('phone'); // fallback to manual entry
                }
            };
            autoFetch();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [slug, phoneFromUrl]);

    const lookupStudent = useCallback(async () => {
        if (!slug || phone.length < 10) return;
        setLoading(true);
        setError('');
        try {
            const res = await axios.get(`${API_URL}/public/i/${slug}/student-fees?phone=${phone.replace(/\D/g, '').slice(-10)}`);
            setInstitute(res.data.institute);
            setStudents(res.data.students);
            if (res.data.students.length === 1) {
                setSelectedStudent(res.data.students[0]);
                setStep('upload');
            } else {
                setStep('select-student');
            }
        } catch (err: any) {
            setError(err.response?.data?.error || 'Could not find student. Please check the number.');
        } finally {
            setLoading(false);
        }
    }, [slug, phone]);

    const getBalance = (student: StudentData | null) => {
        if (!student) return 0;
        const totalFee = student.feeInstallments?.reduce((sum, i) => sum + Number(i.amount || 0), 0) || 0;
        // Only count payments linked to installments we know about (already filtered by joinDate on server)
        const validInstallmentIds = new Set((student.feeInstallments || []).map((i: any) => i.id));
        const totalPaidInstallments = (student.feePayments || [])
            .filter((p: any) => validInstallmentIds.has(p.installmentId))
            .reduce((sum, p) => sum + Number(p.amountPaid || p.amount || 0), 0);
        const totalPaidAdhoc = student.feeRecords?.reduce((sum, r) => sum + Number(r.amount || 0), 0) || 0;
        return Math.max(0, totalFee - (totalPaidInstallments + totalPaidAdhoc));
    };

    // Update Amount automatically when paymentType changes
    useEffect(() => {
        if (step === 'upload' && selectedStudent) {
            if (paymentType === 'full') {
                setAmount(String(getBalance(selectedStudent)));
            }
        }
    }, [step, selectedStudent, paymentType]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedStudent || !amount || !file) { setError('Please fill all fields and upload a screenshot.'); return; }
        
        const totalDue = getBalance(selectedStudent);
        if (Number(amount) > totalDue) {
            setError(`Amount cannot exceed the total due (₹${totalDue.toLocaleString()}).`);
            return;
        }

        setSubmitting(true);
        setError('');
        const formData = new FormData();
        formData.append('studentId', selectedStudent.studentId);
        formData.append('amount', amount);
        formData.append('screenshot', file);
        if (paidByName.trim()) formData.append('paidByName', paidByName.trim());
        try {
            await axios.post(`${API_URL}/public/i/${slug}/submit-upi`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
            setStep('success');
        } catch (err: any) {
            setError(err.response?.data?.error || 'Submission failed. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    if (!slug || instituteError) return (
        <div className="min-h-screen flex items-center justify-center bg-app-bg p-6">
            <div className="bg-app-surface-opaque p-8 rounded-3xl shadow-sm border border-app-border max-w-md w-full text-center">
                <AlertCircle className="w-12 h-12 text-danger mx-auto mb-4" />
                <h2 className="text-xl font-bold text-app-text">Invalid Link</h2>
                <p className="text-app-text-secondary mt-2">This payment link is not valid or the institute could not be found.</p>
            </div>
        </div>
    );

    if (loadingInstitute) {
        return (
            <div className="min-h-screen bg-app-bg flex flex-col items-center justify-center px-4 font-sans">
                <Loader className="w-10 h-10 text-neutral-400 animate-spin mb-4" />
                <p className="text-app-text-secondary font-medium">Loading portal...</p>
                <p className="text-xs text-app-text-tertiary mt-6">Powered by <span className="font-bold text-app-text-secondary">MathLogs</span></p>
            </div>
        );
    }

    const inputClass = "w-full bg-neutral-50/80 border border-neutral-200/80 text-app-text pl-11 pr-4 py-3 rounded-xl focus:bg-white focus:ring-2 focus:ring-accent/20 focus:border-accent/40 outline-none transition-all placeholder:text-neutral-400 text-[15px]";
    const iconClass = "absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-neutral-400 group-focus-within:text-accent transition-colors";

    return (
        <div className="min-h-screen bg-app-bg font-sans">
            <AnimatePresence mode="wait">

                {/* ── AUTO-FETCH LOADING ── */}
                {step === 'loading' && (
                    <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="min-h-screen flex flex-col items-center justify-center px-4">
                        <Loader className="w-10 h-10 text-neutral-400 animate-spin mb-4" />
                        <p className="text-app-text-secondary font-medium">Loading your fee details...</p>
                        <p className="text-xs text-app-text-tertiary mt-6">Powered by <span className="font-bold text-app-text-secondary">MathLogs</span></p>
                    </motion.div>
                )}

                {/* ── MAIN CONTENT (visible for other steps) ── */}
                {step !== 'loading' && (
                    <motion.div key="content" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="min-h-screen flex flex-col">
                        {/* ─── Branded Hero ─── */}
                        <div className="relative overflow-hidden">
                            {/* Decorative gradient background */}
                            <div className="absolute inset-0 bg-gradient-to-b from-accent/[0.06] via-accent/[0.02] to-transparent pointer-events-none" />
                            <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-accent/[0.04] rounded-full blur-[80px] translate-x-1/3 -translate-y-1/3 pointer-events-none" />

                            <div className="relative max-w-md mx-auto pt-8 sm:pt-10 pb-8 px-4">
                                <div className="flex flex-row items-center justify-center gap-4 sm:gap-6">
                                    {/* Institute Brand Icon/Logo */}
                                    <div className={`w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 shrink-0 rounded-2xl flex items-center justify-center overflow-hidden bg-white ${institute?.logoUrl ? 'border border-neutral-100 shadow-sm p-1' : 'bg-accent/10 ring-4 ring-accent/5'}`}>
                                        {institute?.logoUrl ? (
                                            <img src={institute.logoUrl} alt="Institute Logo" className="w-full h-full object-contain drop-shadow-sm" />
                                        ) : (
                                            <GraduationCap className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 text-accent" />
                                        )}
                                    </div>

                                    {/* Text Container */}
                                    {institute && (
                                        <div className="flex flex-col items-start text-left gap-1 sm:gap-1.5 flex-1">
                                            {/* Institute Name — THE BRAND */}
                                            <h1 className="text-[20px] sm:text-[24px] font-bold text-app-text tracking-tight leading-tight">
                                                {institute.name}
                                            </h1>

                                            {/* Batch Info Pill / Payment Verification outline */}
                                            <div className="inline-flex items-center gap-2 bg-neutral-100/90 rounded-full px-3 py-1 shadow-sm w-fit mt-0.5 border border-neutral-200/50">
                                                <IndianRupee className="w-3.5 h-3.5 text-accent flex-shrink-0" />
                                                <span className="text-xs font-semibold text-app-text">UPI Payment Verification</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* ─── Form Card ─── */}
                        <div className="px-4 pb-10">
                            <motion.div
                                initial={{ opacity: 0, y: 16 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.08 }}
                                className="max-w-md mx-auto bg-app-surface-opaque rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-white/60 p-6 sm:p-8"
                            >
                                {/* ── STEP 1: PHONE ── */}
                                {step === 'phone' && (
                                    <motion.div key="phone" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                        <h2 className="text-xl font-bold text-app-text mb-1">Find Your Fees</h2>
                                        <p className="text-app-text-secondary text-sm mb-6">Enter your registered phone number to look up pending fees.</p>

                                        <form onSubmit={(e) => { e.preventDefault(); lookupStudent(); }}>
                                            <div>
                                                <label className="block text-sm font-medium text-app-text-secondary mb-1.5 ml-0.5">Registered Phone Number</label>
                                                <div className="relative group mb-4">
                                                    <Phone className={iconClass} />
                                                    <input 
                                                        type="tel" 
                                                        value={phone} 
                                                        onChange={(e) => setPhone(e.target.value)} 
                                                        placeholder="Enter 10-digit number" 
                                                        className={inputClass}
                                                        maxLength={13} 
                                                        required 
                                                    />
                                                </div>
                                            </div>

                                            {error && (
                                                <div className="bg-danger/10 border border-danger/20 text-danger rounded-xl px-4 py-3 text-sm flex items-start gap-2 mb-4">
                                                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /><span>{error}</span>
                                                </div>
                                            )}

                                            <button type="submit" disabled={loading || phone.length < 10} className="w-full py-3.5 bg-neutral-900 text-white font-bold rounded-xl shadow-md shadow-neutral-900/20 disabled:opacity-40 disabled:shadow-none hover:shadow-lg focus:ring-2 focus:ring-offset-2 focus:ring-neutral-900 active:scale-[0.98] transition-all flex items-center justify-center gap-2 group">
                                                {loading ? <Loader className="w-5 h-5 animate-spin" /> : <>Find My Fees <ChevronRight className="w-[18px] h-[18px] group-hover:translate-x-0.5 transition-transform" /></>}
                                            </button>
                                        </form>
                                    </motion.div>
                                )}

                                {/* ── STEP 2: SELECT STUDENT ── */}
                                {step === 'select-student' && (
                                    <motion.div key="select" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                        <button onClick={() => { setStep('phone'); setError(''); }} className="text-xs text-app-text-tertiary font-medium flex items-center gap-1 mb-4 hover:text-app-text transition-colors">
                                            <ArrowLeft className="w-3.5 h-3.5" /> Back
                                        </button>
                                        <h2 className="text-xl font-bold text-app-text mb-1">Select Student</h2>
                                        <p className="text-app-text-secondary text-sm mb-5">We found {students.length} students linked to this number.</p>

                                        <div className="space-y-3">
                                            {students.map(s => (
                                                <button key={s.studentId} onClick={() => { setSelectedStudent(s); setStep('upload'); }} className="w-full flex items-center gap-3 p-4 bg-app-bg border border-app-border rounded-xl hover:border-neutral-400 transition-colors text-left shadow-sm">
                                                    <div className="w-10 h-10 rounded-lg bg-neutral-200 text-neutral-700 flex items-center justify-center font-bold text-sm flex-shrink-0">{s.studentName[0]}</div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-bold text-app-text text-sm truncate">{s.studentName}</p>
                                                        <p className="text-xs text-app-text-tertiary truncate">{s.batchName}</p>
                                                    </div>
                                                    {getBalance(s) > 0 ? (
                                                        <span className="text-sm font-bold text-danger whitespace-nowrap">₹{getBalance(s).toLocaleString()}</span>
                                                    ) : (
                                                        <span className="text-xs font-bold text-success bg-success/10 px-2.5 py-1 rounded-full border border-success/20 whitespace-nowrap">Paid ✓</span>
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    </motion.div>
                                )}

                                {/* ── STEP 3: UPLOAD ── */}
                                {step === 'upload' && selectedStudent && (
                                    <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                        {students.length > 1 && (
                                            <button onClick={() => { setStep('select-student'); setError(''); setFile(null); setAmount(''); }} className="text-xs text-app-text-tertiary font-medium flex items-center gap-1 mb-4 hover:text-app-text transition-colors">
                                                <ArrowLeft className="w-3.5 h-3.5" /> Change Student
                                            </button>
                                        )}

                                        {/* Selected student badge */}
                                        <div className="flex items-center gap-3 p-3 bg-app-bg rounded-xl mb-6 border border-app-border/50">
                                            <div className="w-10 h-10 rounded-lg bg-neutral-200 text-neutral-700 flex items-center justify-center font-bold text-sm flex-shrink-0">{selectedStudent.studentName[0]}</div>
                                            <div>
                                                <p className="font-bold text-app-text text-sm">{selectedStudent.studentName}</p>
                                                <p className="text-xs text-app-text-tertiary">{selectedStudent.batchName}</p>
                                            </div>
                                        </div>

                                        {/* ── ALL FEES PAID ── */}
                                        {getBalance(selectedStudent) <= 0 ? (
                                            <div className="py-6 text-center">
                                                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', damping: 12, stiffness: 200 }}>
                                                    <CheckCircle className="w-16 h-16 mx-auto mb-4 text-success" />
                                                </motion.div>
                                                <h3 className="text-xl font-bold text-app-text mb-2">All Fees Paid! 🎉</h3>
                                                <p className="text-sm text-app-text-secondary">No pending amount due. You're all caught up!</p>
                                                {students.length > 1 && (
                                                    <button onClick={() => setStep('select-student')} className="mt-6 text-sm font-bold text-app-text-secondary hover:text-app-text transition-colors flex items-center gap-1 mx-auto">
                                                        <ArrowLeft className="w-3.5 h-3.5" /> Check another student
                                                    </button>
                                                )}
                                            </div>

                                        ) : selectedStudent.pendingVerifications.length > 0 ? (
                                            /* ── PENDING VERIFICATION BLOCK ── */
                                            <div className="py-4 text-center">
                                                <div className="w-14 h-14 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-4">
                                                    <Clock className="w-7 h-7 text-accent" />
                                                </div>
                                                <h3 className="text-lg font-bold text-app-text mb-2">Verification Pending</h3>
                                                <p className="text-sm text-app-text-secondary leading-relaxed mb-5">
                                                    You have <strong className="text-app-text">{selectedStudent.pendingVerifications.length}</strong> payment(s) submitted and waiting for your teacher's approval.
                                                </p>
                                                <div className="bg-app-bg border border-app-border rounded-xl p-4 text-left space-y-3">
                                                    {selectedStudent.pendingVerifications.map((pv, i) => (
                                                        <div key={pv.id} className="flex items-center justify-between text-sm">
                                                            <span className="text-app-text-secondary font-medium">Payment {i + 1}</span>
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-bold text-app-text">₹{pv.amount.toLocaleString()}</span>
                                                                <span className="text-xs bg-accent/10 text-accent font-bold px-2.5 py-0.5 rounded-full border border-accent/20">Pending</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                                <p className="text-xs text-app-text-tertiary mt-5 max-w-[250px] mx-auto leading-relaxed">You'll receive a WhatsApp confirmation once approved. Please wait before submitting again.</p>
                                            </div>
                                        ) : (
                                            <>
                                                {/* ── PAYMENT TYPE ── */}
                                                <div className="mb-6">
                                                    <label className="block text-sm font-medium text-app-text-secondary mb-2 ml-0.5">Select Payment Option</label>
                                                    <div className="space-y-2">
                                                        <label className={`flex flex-col p-3.5 border rounded-xl cursor-pointer transition-colors shadow-sm ${paymentType === 'full' ? 'border-neutral-900 bg-neutral-50/80 ring-1 ring-neutral-900/10' : 'border-neutral-200/80 hover:border-neutral-400 bg-white'}`}>
                                                            <div className="flex items-center gap-3">
                                                                <input type="radio" name="paymentType" checked={paymentType === 'full'} onChange={() => setPaymentType('full')} className="accent-neutral-900 w-4 h-4 mt-0.5 self-start" />
                                                                <div className="flex-1 flex items-center justify-between">
                                                                    <span className="text-[15px] font-medium text-app-text">Full Due</span>
                                                                    <span className="text-[15px] font-bold text-danger">₹{getBalance(selectedStudent).toLocaleString()}</span>
                                                                </div>
                                                            </div>
                                                            {/* Fee Breakup UI */}
                                                            {paymentType === 'full' && selectedStudent.feeInstallments.length > 0 && (
                                                                <div className="ml-7 mt-2 pt-2 border-t border-neutral-200/60 space-y-1.5">
                                                                    {selectedStudent.feeInstallments.map(inst => {
                                                                        const paidSoFar = selectedStudent.feePayments?.filter(p => p.installmentId === inst.id).reduce((s, p) => s + Number(p.amountPaid || p.amount || 0), 0) || 0;
                                                                        const due = Number(inst.amount || 0) - paidSoFar;
                                                                        if (due <= 0) return null;
                                                                        return (
                                                                            <div key={inst.id} className="flex items-center justify-between text-[13px] text-app-text-secondary">
                                                                                <span>{inst.name}</span>
                                                                                <span className="font-medium text-app-text">₹{due.toLocaleString()}</span>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                    
                                                                    {/* Offset Adhoc Payments to Match Total Balance */}
                                                                    {(selectedStudent.feeRecords?.reduce((s, r) => s + Number(r.amount || 0), 0) || 0) > 0 && (
                                                                        <div className="flex items-center justify-between text-[13px] text-emerald-600 font-medium pt-1 mt-1 border-t border-neutral-200/50">
                                                                            <span>Less: Custom/Ad-hoc Payments</span>
                                                                            <span>-₹{(selectedStudent.feeRecords?.reduce((s, r) => s + Number(r.amount || 0), 0) || 0).toLocaleString()}</span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </label>
                                                        <label className={`flex items-center gap-3 p-3.5 border rounded-xl cursor-pointer transition-colors shadow-sm ${paymentType === 'custom' ? 'border-neutral-900 bg-neutral-50/80 ring-1 ring-neutral-900/10' : 'border-neutral-200/80 hover:border-neutral-400 bg-white'}`}>
                                                            <input type="radio" name="paymentType" checked={paymentType === 'custom'} onChange={() => { setPaymentType('custom'); setAmount(''); }} className="accent-neutral-900 w-4 h-4" />
                                                            <span className="flex-1 text-[15px] font-medium text-app-text">Custom Amount</span>
                                                        </label>
                                                    </div>
                                                </div>

                                                {/* ── UPLOAD FORM ── */}
                                                <form onSubmit={handleSubmit} className="space-y-5">
                                                    <div>
                                                        <label className="block text-sm font-medium text-app-text-secondary mb-1.5 ml-0.5">Amount Paid</label>
                                                        <div className="relative group">
                                                            <IndianRupee className={iconClass} />
                                                            <input 
                                                                type="number" 
                                                                value={amount} 
                                                                onChange={(e) => {
                                                                    const val = e.target.value;
                                                                    const totalDue = getBalance(selectedStudent!);
                                                                    if (paymentType === 'custom' && Number(val) > totalDue) {
                                                                        setAmount(String(totalDue));
                                                                    } else {
                                                                        setAmount(val);
                                                                    }
                                                                }} 
                                                                readOnly={paymentType === 'full'}
                                                                placeholder="Enter amount" 
                                                                className={inputClass + (paymentType === 'full' ? ' bg-neutral-50 text-neutral-500 cursor-not-allowed' : '')} 
                                                                min="1" 
                                                                max={getBalance(selectedStudent!)}
                                                                required 
                                                            />
                                                        </div>
                                                        {paymentType === 'custom' && (
                                                            <p className="text-xs text-app-text-tertiary mt-1.5 ml-0.5">Max: ₹{getBalance(selectedStudent!).toLocaleString()}</p>
                                                        )}
                                                    </div>

                                                    <div>
                                                        <label className="block text-sm font-medium text-app-text-secondary mb-1.5 ml-0.5">Paid By (Name)</label>
                                                        <div className="relative group">
                                                            <input 
                                                                type="text" 
                                                                value={paidByName} 
                                                                onChange={(e) => setPaidByName(e.target.value)} 
                                                                placeholder="e.g., Rajiv Kumar" 
                                                                className={inputClass}
                                                                required 
                                                            />
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <label className="block text-sm font-medium text-app-text-secondary mb-1.5 ml-0.5">Payment Screenshot</label>
                                                        <label className={`flex flex-col items-center justify-center w-full border-2 border-dashed rounded-xl cursor-pointer transition-all ${file ? 'border-neutral-900 bg-neutral-50/80 p-3' : 'border-neutral-300 hover:border-neutral-400 hover:bg-neutral-50/50 bg-white py-8'}`}>
                                                            <input type="file" accept="image/jpeg,image/png,image/jpg" onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])} hidden />
                                                            {file ? (
                                                                <div className="flex flex-col items-center gap-2 w-full">
                                                                    <img 
                                                                        src={URL.createObjectURL(file)} 
                                                                        alt="Payment preview" 
                                                                        className="w-full max-h-48 object-contain rounded-lg border border-neutral-200"
                                                                    />
                                                                    <span className="text-xs text-app-text-secondary mt-1">Tap to change</span>
                                                                </div>
                                                            ) : (
                                                                <>
                                                                    <div className="w-12 h-12 bg-neutral-100 rounded-full flex items-center justify-center mb-3 group-hover:bg-neutral-200 transition-colors">
                                                                        <Upload className="w-5 h-5 text-neutral-500" />
                                                                    </div>
                                                                    <span className="text-[15px] font-medium text-app-text">Tap to upload screenshot</span>
                                                                    <span className="text-xs text-app-text-tertiary mt-1.5">JPG, PNG — Max 5 MB</span>
                                                                </>
                                                            )}
                                                        </label>
                                                    </div>

                                                    {error && (
                                                        <div className="bg-danger/10 border border-danger/20 text-danger rounded-xl px-4 py-3 text-sm flex items-start gap-2">
                                                            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /><span>{error}</span>
                                                        </div>
                                                    )}

                                                    <button type="submit" disabled={submitting || !file || !amount} className="w-full py-3.5 bg-neutral-900 text-white font-semibold rounded-xl mt-2 shadow-md shadow-neutral-900/20 transition-all duration-200 hover:shadow-lg hover:shadow-black/25 active:scale-[0.98] disabled:opacity-40 disabled:shadow-none flex items-center justify-center gap-2 group">
                                                        {submitting ? <Loader className="w-5 h-5 animate-spin" /> : <>Submit Receipt <ArrowRight className="w-[18px] h-[18px] group-hover:translate-x-0.5 transition-transform" /></>}
                                                    </button>
                                                </form>
                                            </>
                                        )}
                                    </motion.div>
                                )}

                                {/* ── STEP 4: SUCCESS ── */}
                                {step === 'success' && (
                                    <motion.div key="success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-6">
                                        <motion.div
                                            initial={{ scale: 0 }}
                                            animate={{ scale: 1 }}
                                            transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
                                            className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-5 ring-4 ring-success/5"
                                        >
                                            <CheckCircle className="w-8 h-8 text-success" />
                                        </motion.div>
                                        <h2 className="text-2xl font-bold text-app-text mb-3 tracking-tight">Receipt Submitted!</h2>
                                        <p className="text-app-text-secondary text-sm leading-relaxed mb-4">
                                            Your payment of <strong className="text-app-text">₹{Number(amount).toLocaleString()}</strong> for <strong className="text-app-text">{selectedStudent?.studentName}</strong> has been submitted.
                                        </p>
                                        <div className="bg-accent/10 border border-accent/20 rounded-xl p-4 mb-4">
                                            <p className="text-app-text-secondary text-[13px] leading-relaxed">
                                                You'll receive a confirmation on WhatsApp once your teacher reviews it.
                                            </p>
                                        </div>
                                    </motion.div>
                                )}
                            </motion.div>

                            {/* Footer branding */}
                            <p className="text-center text-app-text-tertiary text-xs mt-6 tracking-wide">
                                Powered by <span className="font-semibold text-app-text-secondary">MathLogs</span>
                            </p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
