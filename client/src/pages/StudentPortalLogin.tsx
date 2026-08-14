import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiRequest } from '../utils/api';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, GraduationCap, ChevronRight, Loader, ShieldCheck, ArrowLeft } from 'lucide-react';
import { useMetaTags } from '../hooks/useMetaTags';

interface Branding {
    name: string;
    logoUrl: string | null;
    primaryColor: string | null;
}

export default function StudentPortalLogin() {
    const { instituteSlug } = useParams<{ instituteSlug: string }>();
    const navigate = useNavigate();

    useMetaTags({
        title: branding?.name ? `${branding.name} - Student Portal | MathLogs` : 'Student Portal - MathLogs',
        description: 'Log in to your student portal to access your batch schedule, test marks, fee receipts, and online quizzes on MathLogs.'
    });

    const [mobileNumber, setMobileNumber] = useState('');
    const [otp, setOtp] = useState('');
    const [step, setStep] = useState<'mobile' | 'otp'>('mobile');
    const [pendingStudent, setPendingStudent] = useState<{ name: string; batchName: string; instituteName: string } | null>(null);
    const [loading, setLoading] = useState(false);
    const [resending, setResending] = useState(false);
    
    // PERF: Load branding from sessionStorage first for instant "Return" experience
    const [branding, setBranding] = useState<Branding | null>(() => {
        const cached = sessionStorage.getItem(`branding_${instituteSlug}`);
        return cached ? JSON.parse(cached) : null;
    });

    useEffect(() => {
        const fetchBranding = async () => {
            try {
                const data = await apiRequest<Branding>(`/student-portal/branding/${instituteSlug}`);
                setBranding(data);
                try {
                    sessionStorage.setItem(`branding_${instituteSlug}`, JSON.stringify(data));
                } catch (e) {
                    console.warn('Could not save branding to sessionStorage', e);
                }
            } catch (err) {
                if (!branding) {
                    setBranding({ name: 'Student Portal', logoUrl: null, primaryColor: null });
                }
            }
        };
        fetchBranding();
    }, [instituteSlug]);

    const cleanMobile = mobileNumber.replace(/\D/g, '');

    const [resendTimer, setResendTimer] = useState(0);
    const otpBoxRefs = React.useRef<(HTMLInputElement | null)[]>([]);

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (resendTimer > 0) {
            interval = setInterval(() => {
                setResendTimer(prev => prev - 1);
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [resendTimer]);

    const requestOtp = async (isResend = false) => {
        const cleanMobile = mobileNumber.replace(/\D/g, '');
        if (cleanMobile.length < 10) {
            toast.error('Enter a valid 10-digit mobile number');
            return;
        }

        if (isResend) setResending(true);
        else setLoading(true);
        try {
            const data = await apiRequest<{ success: boolean; requiresOtp: boolean; message: string; student: any }>(
                '/student-portal/login',
                'POST',
                { instituteSlug, mobileNumber: cleanMobile }
            );

            setPendingStudent(data.student);
            setStep('otp');
            setOtp('');
            setResendTimer(30); // 30s countdown timer
            toast.success(data.message || 'OTP sent on WhatsApp.');
            setTimeout(() => {
                otpBoxRefs.current[0]?.focus();
            }, 150);
        } catch (error: any) {
            toast.error(error.message || 'Login failed. Please try again.', {
                duration: 5000,
                id: 'login-error'
            });
            console.error('[LOGIN_ERROR]', error);
        } finally {
            setLoading(false);
            setResending(false);
        }
    };

    const handleOtpBoxChange = (index: number, val: string) => {
        const digits = val.replace(/\D/g, '');
        if (!digits) {
            const otpArr = otp.split('');
            otpArr[index] = '';
            setOtp(otpArr.join(''));
            return;
        }

        if (digits.length > 1) {
            // Pasted multi-digit code
            const pasted = digits.slice(0, 6);
            setOtp(pasted);
            const focusIndex = Math.min(pasted.length, 5);
            otpBoxRefs.current[focusIndex]?.focus();
            return;
        }

        const otpArr = otp.padEnd(6, ' ').split('');
        otpArr[index] = digits[0];
        const newCode = otpArr.join('').trim();
        setOtp(newCode);

        if (index < 5) {
            otpBoxRefs.current[index + 1]?.focus();
        }
    };

    const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Backspace') {
            if (!otp[index] && index > 0) {
                otpBoxRefs.current[index - 1]?.focus();
            }
        } else if (e.key === 'ArrowLeft' && index > 0) {
            otpBoxRefs.current[index - 1]?.focus();
        } else if (e.key === 'ArrowRight' && index < 5) {
            otpBoxRefs.current[index + 1]?.focus();
        }
    };

    const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
        e.preventDefault();
        const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
        if (pastedData) {
            setOtp(pastedData);
            const focusIndex = Math.min(pastedData.length, 5);
            otpBoxRefs.current[focusIndex]?.focus();
        }
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (step === 'otp') {
            await verifyOtp(e);
            return;
        }
        await requestOtp(false);
    };

    const verifyOtp = async (e?: React.FormEvent) => {
        e?.preventDefault();

        const code = otp.replace(/\D/g, '');
        if (code.length !== 6) {
            toast.error('Enter the complete 6-digit OTP');
            return;
        }

        setLoading(true);
        try {
            const data = await apiRequest<{ token: string; student: any }>(
                '/student-portal/verify-login-otp',
                'POST',
                { instituteSlug, mobileNumber: cleanMobile, otp: code }
            );

            localStorage.setItem(`student_token_${instituteSlug}`, data.token);
            toast.success(`Welcome, ${data.student.name}!`);
            navigate(`/${instituteSlug}/student/dashboard`);
        } catch (error: any) {
            toast.error(error.message || 'OTP verification failed. Please try again.', {
                duration: 5000,
                id: 'otp-error'
            });
            console.error('[OTP_VERIFY_ERROR]', error);
        } finally {
            setLoading(false);
        }
    };

    const inputClass = "w-full bg-neutral-50/80 border border-neutral-200/80 text-app-text pl-11 pr-4 py-3.5 rounded-xl focus:bg-white focus:ring-2 focus:ring-accent/20 focus:border-accent/40 outline-none transition-all placeholder:text-neutral-400 text-[15px]";
    const iconClass = "absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-neutral-400 group-focus-within:text-accent transition-colors";

    return (
        <div className="min-h-screen bg-app-bg font-sans flex flex-col overflow-hidden relative">
            <style>{`
                @keyframes float-top {
                    0%, 100% { transform: translate(33%, -33%) scale(1); opacity: 0.15; }
                    50% { transform: translate(33%, -35%) scale(1.1); opacity: 0.3; }
                }
                @keyframes float-bottom {
                    0%, 100% { transform: translate(-33%, 33%) scale(1); opacity: 0.1; }
                    50% { transform: translate(-33%, 35%) scale(1.15); opacity: 0.25; }
                }
                .animate-float-top { animation: float-top 5s ease-in-out infinite; }
                .animate-float-bottom { animation: float-bottom 7s ease-in-out infinite; }
            `}</style>
            
            {/* ─── Animated Background ─── */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div 
                    className="absolute inset-0 opacity-20 transition-all duration-1000" 
                    style={{ background: branding?.primaryColor ? `linear-gradient(180deg, ${branding.primaryColor} 0%, transparent 100%)` : undefined }} 
                />
                <div 
                    className="absolute top-0 right-0 w-[400px] h-[400px] rounded-full blur-[80px] animate-float-top" 
                    style={{ backgroundColor: branding?.primaryColor || '#1e40af' }}
                />
                <div 
                    className="absolute bottom-0 left-0 w-[300px] h-[300px] rounded-full blur-[80px] animate-float-bottom" 
                    style={{ backgroundColor: branding?.primaryColor || '#1e40af' }}
                />
            </div>

            <AnimatePresence mode="wait">
                <motion.div 
                    key="content" 
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 1 }} 
                    exit={{ opacity: 0 }} 
                    className="flex-1 flex flex-col justify-center items-center py-10 px-4 relative z-10"
                >
                    <div className="w-full max-w-md">
                        {/* ─── Branded Hero ─── */}
                        <div className="flex flex-col items-center text-center mb-8">
                            <motion.div 
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ type: "spring", bounce: 0.5, duration: 0.6 }}
                                className={`w-24 h-24 sm:w-28 sm:h-28 shrink-0 rounded-[1.5rem] flex items-center justify-center overflow-hidden bg-white mb-5 ${branding?.logoUrl ? 'border border-neutral-100 shadow-xl shadow-black/5 p-2' : 'bg-accent/10 ring-4 ring-accent/5'}`}
                            >
                                {branding?.logoUrl ? (
                                    <img src={branding.logoUrl} alt={branding.name} className="w-full h-full object-contain drop-shadow-sm" />
                                ) : (
                                    <GraduationCap className="w-12 h-12 text-accent" />
                                )}
                            </motion.div>

                            <motion.div 
                                initial={{ y: 10, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                transition={{ delay: 0.1 }}
                                className="flex flex-col items-center gap-2"
                            >
                                <h1 className="text-2xl sm:text-3xl font-black text-app-text tracking-tight leading-tight px-2">
                                    {branding?.name || 'Student Portal'}
                                </h1>
                                <div className="inline-flex items-center gap-1.5 bg-white/80 rounded-full px-3.5 py-1 shadow-sm border border-neutral-200/50 backdrop-blur-sm mt-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                    <span className="text-[10px] font-bold text-app-text-secondary tracking-widest uppercase">Student Portal</span>
                                </div>
                            </motion.div>
                        </div>

                        {/* ─── Form Card ─── */}
                        <motion.div
                            initial={{ opacity: 0, y: 16, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{ type: 'spring', stiffness: 350, damping: 30, delay: 0.1 }}
                            className="w-full bg-white/80 backdrop-blur-2xl rounded-3xl shadow-xl border border-white/60 p-6 sm:p-8"
                        >
                            <div className="text-center mb-6">
                                <h2 className="text-xl font-black text-app-text mb-2">{step === 'otp' ? 'Verify WhatsApp OTP' : 'Welcome Back!'}</h2>
                                <p className="text-app-text-secondary text-sm">
                                    {step === 'otp'
                                        ? `Enter the 6-digit verification code sent to WhatsApp ${cleanMobile ? `ending in ${cleanMobile.slice(-4)}` : ''}.`
                                        : 'Enter your registered mobile number to view your progress, attendance, fees, and quizzes.'}
                                </p>
                            </div>

                            <form onSubmit={handleLogin} className="space-y-6">
                                {step === 'mobile' ? (
                                    <div>
                                        <label className="block text-xs font-bold text-app-text-secondary mb-2 ml-1 tracking-wide uppercase">Mobile Number</label>
                                        <div className="relative group">
                                            <Phone className={iconClass} />
                                            <input
                                                type="tel"
                                                inputMode="numeric"
                                                pattern="[0-9]*"
                                                value={mobileNumber}
                                                onChange={(e) => setMobileNumber(e.target.value)}
                                                placeholder="Enter 10-digit number"
                                                className={inputClass}
                                                maxLength={15}
                                                required
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-5">
                                        {pendingStudent && (
                                            <div className="bg-neutral-50 border border-neutral-200/80 rounded-2xl px-4 py-3 flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center shrink-0">
                                                    <ShieldCheck className="w-5 h-5 text-green-600" />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="font-black text-app-text text-sm truncate">{pendingStudent.name}</p>
                                                    <p className="text-xs text-app-text-secondary truncate">{pendingStudent.batchName}</p>
                                                </div>
                                            </div>
                                        )}



                                        {/* ── 6-Digit Segmented OTP Input ── */}
                                        <div>
                                            <label className="block text-xs font-bold text-app-text-secondary mb-3 text-center tracking-wide uppercase">Enter 6-Digit Security Code</label>
                                            <div className="flex items-center justify-between gap-2 sm:gap-2.5">
                                                {Array.from({ length: 6 }).map((_, index) => {
                                                    const digit = otp[index] || '';
                                                    const isFocused = otp.length === index || (otp.length === 6 && index === 5);
                                                    return (
                                                        <input
                                                            key={index}
                                                            ref={(el) => { otpBoxRefs.current[index] = el; }}
                                                            type="text"
                                                            inputMode="numeric"
                                                            pattern="[0-9]*"
                                                            maxLength={6}
                                                            value={digit}
                                                            onChange={(e) => handleOtpBoxChange(index, e.target.value)}
                                                            onKeyDown={(e) => handleOtpKeyDown(index, e)}
                                                            onPaste={handleOtpPaste}
                                                            className={`w-11 h-13 sm:w-13 sm:h-15 text-center text-xl font-black rounded-2xl border-2 transition-all duration-150 outline-none select-none ${
                                                                digit
                                                                    ? 'border-emerald-500 bg-emerald-50/20 text-emerald-950 shadow-sm'
                                                                    : isFocused
                                                                        ? 'border-accent bg-white shadow-md ring-4 ring-accent/15'
                                                                        : 'border-neutral-200 bg-neutral-50/60 text-app-text hover:border-neutral-300'
                                                            }`}
                                                            autoFocus={index === 0}
                                                        />
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* ── Timer & Resend Controls ── */}
                                        <div className="flex items-center justify-between gap-3 pt-1">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setStep('mobile');
                                                    setOtp('');
                                                }}
                                                className="inline-flex items-center gap-1.5 text-xs font-bold text-app-text-secondary hover:text-app-text transition-colors"
                                            >
                                                <ArrowLeft className="w-3.5 h-3.5" />
                                                Change number
                                            </button>
                                            
                                            {resendTimer > 0 ? (
                                                <span className="text-xs font-semibold text-neutral-400">
                                                    Resend code in <strong className="text-app-text font-bold">{resendTimer}s</strong>
                                                </span>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => requestOtp(true)}
                                                    disabled={resending}
                                                    className="text-xs font-bold text-accent hover:opacity-80 disabled:opacity-50 transition-opacity"
                                                >
                                                    {resending ? 'Sending...' : 'Resend OTP'}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}

                                <button 
                                    type="submit" 
                                    disabled={loading || (step === 'mobile' ? cleanMobile.length < 10 : otp.length !== 6)}
                                    className="w-full py-4 text-white font-bold rounded-2xl shadow-lg transition-all duration-200 disabled:opacity-50 disabled:shadow-none hover:shadow-xl hover:-translate-y-0.5 focus:ring-2 focus:ring-offset-2 flex items-center justify-center gap-2 group active:scale-[0.98]"
                                    style={{
                                        backgroundColor: branding?.primaryColor && /^#[0-9A-Fa-f]{6}$/.test(branding.primaryColor) ? branding.primaryColor : '#111827',
                                    }}
                                >
                                    {loading ? (
                                        <Loader className="w-5 h-5 animate-spin" />
                                    ) : step === 'otp' ? (
                                        <>Verify & Continue <ChevronRight className="w-[18px] h-[18px] group-hover:translate-x-1 transition-transform" /></>
                                    ) : (
                                        <>Send WhatsApp OTP <ChevronRight className="w-[18px] h-[18px] group-hover:translate-x-1 transition-transform" /></>
                                    )}
                                </button>
                            </form>
                        </motion.div>
                        
                        {/* Footer branding */}
                        <motion.p 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.3 }}
                            className="text-center text-app-text-tertiary text-xs mt-8 tracking-wide"
                        >
                            Powered by <span className="font-bold text-app-text-secondary">MathLogs</span>
                        </motion.p>
                    </div>

                </motion.div>
            </AnimatePresence>
        </div>
    );
}
