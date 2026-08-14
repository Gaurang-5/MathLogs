import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight, AlertCircle, RotateCcw, MessageSquare, Building2, User } from 'lucide-react';
import { api } from '../utils/api';
import toast from 'react-hot-toast';

// ─── helpers ────────────────────────────────────────────────────────────────

function cn(...classes: (string | false | undefined | null)[]) {
    return classes.filter(Boolean).join(' ');
}

// ─── types ───────────────────────────────────────────────────────────────────

interface OtpSendResponse {
    success: boolean;
    message?: string;
    error?: string;
}

interface VerifyResponse {
    success: boolean;
    adminId?: string;
    token?: string;
    refreshToken?: string;
    role?: string;
    isQuizOnly?: boolean;
    isPageOnly?: boolean;
    quizCredits?: number;
    error?: string;
    multipleAccounts?: boolean;
    tempAuthToken?: string;
    accounts?: Array<{
        adminId: string;
        instituteName: string;
        teacherName: string;
        role: string;
        status: string;
    }>;
}

// ─── Animated Background (identical to the original) ────────────────────────

const AnimatedBackground = memo(() => (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        {/* Subtle grid */}
        <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
                backgroundImage:
                    'linear-gradient(to right, black 1px, transparent 1px), linear-gradient(to bottom, black 1px, transparent 1px)',
                backgroundSize: '80px 80px',
            }}
        />

        {/* Vertical Scanning Line */}
        <motion.div
            animate={{ x: ['-10vw', '110vw'] }}
            transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
            className="absolute top-0 h-full w-[1px] bg-gradient-to-b from-transparent via-black/10 to-transparent will-change-transform"
        />

        {/* Accent Shapes */}
        <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 60, repeat: Infinity, ease: 'linear' }}
            className="absolute -top-40 -right-40 w-96 h-96 border-[1px] border-black/5 rounded-full will-change-transform"
        />
        <motion.div
            animate={{ rotate: -360 }}
            transition={{ duration: 80, repeat: Infinity, ease: 'linear' }}
            className="absolute -bottom-60 -left-20 w-[600px] h-[600px] border-[1px] border-black/5 rounded-full will-change-transform"
        />
    </div>
));
AnimatedBackground.displayName = 'AnimatedBackground';

// ─── Component ───────────────────────────────────────────────────────────────

export default function AdminLogin() {
    const navigate = useNavigate();

    const [step, setStep] = useState<'phone' | 'otp' | 'select_account'>('phone');
    const [phone, setPhone] = useState('');
    const [otp, setOtp] = useState(['', '', '', '', '', '']);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [loadingText, setLoadingText] = useState('');
    const [resendTimer, setResendTimer] = useState(30);
    const [canResend, setCanResend] = useState(false);
    
    // New states for multiple accounts
    const [accounts, setAccounts] = useState<VerifyResponse['accounts']>([]);
    const [tempAuthToken, setTempAuthToken] = useState<string>('');

    const otpInputsRef = useRef<(HTMLInputElement | null)[]>([]);

    // Countdown for OTP resend
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (step === 'otp' && resendTimer > 0) {
            interval = setInterval(() => {
                setResendTimer(prev => {
                    if (prev <= 1) { setCanResend(true); return 0; }
                    return prev - 1;
                });
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [step, resendTimer]);

    const formatPhone = (val: string) => val.replace(/\D/g, '').slice(0, 10);

    // ── Step 1: send OTP ──────────────────────────────────────────────────────
    const handleSendOtp = useCallback(async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        const cleaned = formatPhone(phone);
        if (cleaned.length < 10) {
            setError('Please enter a valid 10-digit mobile number.');
            return;
        }

        setError('');
        setLoading(true);
        setLoadingText('Sending OTP...');

        try {
            const res = await api.post<OtpSendResponse>('/auth/send-mobile-otp', { phone: cleaned });
            if (res.success) {
                toast.success('WhatsApp OTP sent!');
                setStep('otp');
                setResendTimer(30);
                setCanResend(false);
                setTimeout(() => otpInputsRef.current[0]?.focus(), 120);
            } else {
                setError(res.error || 'Failed to send OTP.');
            }
        } catch (err: any) {
            setError(err.response?.data?.error || err.message || 'Failed to send OTP.');
        } finally {
            setLoading(false);
            setLoadingText('');
        }
    }, [phone]);

    // ── Step 2: verify OTP ────────────────────────────────────────────────────
    const handleVerifyOtp = useCallback(async (otpString?: string) => {
        const fullOtp = otpString || otp.join('');
        if (fullOtp.length !== 6) {
            setError('Please enter the complete 6-digit OTP.');
            return;
        }

        setError('');
        setLoading(true);
        setLoadingText('Verifying OTP...');

        try {
            const res = await api.post<VerifyResponse>('/auth/verify-mobile-otp', {
                phone: formatPhone(phone),
                otp: fullOtp,
            });

            if (res.success && res.multipleAccounts && res.accounts && res.tempAuthToken) {
                setTempAuthToken(res.tempAuthToken);
                setAccounts(res.accounts);
                setStep('select_account');
                setLoading(false);
                setLoadingText('');
                toast.success('OTP verified!');
            } else if (res.success && res.token) {
                setLoadingText('Loading Dashboard...');
                localStorage.setItem('adminId', res.adminId || '');
                localStorage.setItem('token', res.token);
                if (res.refreshToken) localStorage.setItem('refreshToken', res.refreshToken);
                localStorage.setItem('isQuizOnly', String(res.isQuizOnly || false));
                localStorage.setItem('isPageOnly', String(res.isPageOnly || false));
                localStorage.setItem('quizCredits', String(res.quizCredits || 0));

                toast.success('Signed in!');
                await new Promise(r => setTimeout(r, 500));

                if (res.role === 'SUPER_ADMIN') navigate('/super-admin');
                else if (res.isPageOnly) navigate('/marketplace-settings');
                else navigate('/dashboard');
            } else {
                setError(res.error || 'Invalid OTP code.');
                setLoading(false);
                setLoadingText('');
            }
        } catch (err: any) {
            setError(err.response?.data?.error || err.message || 'OTP verification failed.');
            setLoading(false);
            setLoadingText('');
        }
    }, [otp, phone, navigate]);

    const handleSelectAccount = async (adminId: string) => {
        setError('');
        setLoading(true);
        setLoadingText('Loading Dashboard...');

        try {
            const res = await api.post<VerifyResponse>('/auth/select-account', {
                adminId,
                tempAuthToken,
            });

            if (res.success && res.token) {
                localStorage.setItem('adminId', res.adminId || '');
                localStorage.setItem('token', res.token);
                if (res.refreshToken) localStorage.setItem('refreshToken', res.refreshToken);
                localStorage.setItem('isQuizOnly', String(res.isQuizOnly || false));
                localStorage.setItem('isPageOnly', String(res.isPageOnly || false));
                localStorage.setItem('quizCredits', String(res.quizCredits || 0));

                toast.success('Signed in!');
                await new Promise(r => setTimeout(r, 500));

                if (res.role === 'SUPER_ADMIN') navigate('/super-admin');
                else if (res.isPageOnly) navigate('/marketplace-settings');
                else navigate('/dashboard');
            } else {
                setError(res.error || 'Failed to select account.');
                setLoading(false);
                setLoadingText('');
            }
        } catch (err: any) {
            setError(err.response?.data?.error || err.message || 'Failed to select account.');
            setLoading(false);
            setLoadingText('');
        }
    };

    const handleOtpChange = (index: number, value: string) => {
        if (!/^\d*$/.test(value)) return;
        const newOtp = [...otp];
        newOtp[index] = value.slice(-1);
        setOtp(newOtp);
        if (value && index < 5) otpInputsRef.current[index + 1]?.focus();
        const combined = newOtp.join('');
        if (combined.length === 6) void handleVerifyOtp(combined);
    };

    const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Backspace' && !otp[index] && index > 0) {
            otpInputsRef.current[index - 1]?.focus();
        }
    };

    const handleOtpPaste = (e: React.ClipboardEvent) => {
        e.preventDefault();
        const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
        if (pasted.length === 6) {
            setOtp(pasted.split(''));
            void handleVerifyOtp(pasted);
        }
    };

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-[#FDFDFD] flex flex-col justify-center px-6 sm:px-12 relative overflow-hidden text-neutral-900 font-sans selection:bg-black selection:text-white z-0">
            <AnimatedBackground />

            {/* Top-left back button */}
            <div className="absolute top-8 left-8 sm:top-12 sm:left-12 z-20">
                <Link to="/" className="group flex items-center text-sm font-bold tracking-widest uppercase text-neutral-400 hover:text-black transition-colors duration-300">
                    <ArrowLeft className="w-4 h-4 mr-3 group-hover:-translate-x-1 transition-transform" strokeWidth={3} />
                    Return
                </Link>
            </div>

            <div className="w-full max-w-xl mx-auto z-10 mt-12 sm:mt-0">

                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                >
                    <motion.img
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 1, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
                        src="/icon-512x512.png"
                        alt="MathLogs Logo"
                        fetchPriority="high"
                        decoding="async"
                        className="w-16 h-16 sm:w-20 sm:h-20 mb-6 drop-shadow-sm rounded-2xl"
                    />
                    <h1 className="text-[14vw] sm:text-[100px] font-black tracking-tighter leading-none mb-6">
                        MathLogs
                    </h1>
                    <p className="text-lg sm:text-2xl text-neutral-400 font-medium tracking-tight mb-12 sm:mb-20 max-w-md">
                        {step === 'phone'
                            ? 'Enter your WhatsApp number to receive a one-time sign-in code.'
                            : `Enter the 6-digit code sent to +91 ${formatPhone(phone)} via WhatsApp.`
                        }
                    </p>
                </motion.div>

                {/* Error banner */}
                <AnimatePresence>
                    {error && (
                        <motion.div
                            initial={{ opacity: 0, height: 0, y: -10 }}
                            animate={{ opacity: 1, height: 'auto', y: 0 }}
                            exit={{ opacity: 0, height: 0 }}
                            className="bg-black text-white p-5 mb-10 text-sm flex items-start overflow-hidden relative"
                        >
                            <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-red-500" />
                            <AlertCircle className="w-5 h-5 mr-3 flex-shrink-0 mt-0.5 text-red-500" />
                            <span className="whitespace-pre-line font-medium leading-relaxed">{error}</span>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ── PHONE STEP ── */}
                <AnimatePresence mode="wait">
                    {step === 'phone' ? (
                        <motion.form
                            key="phone-form"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                            onSubmit={handleSendOtp}
                            className="space-y-10 sm:space-y-16"
                        >
                            {/* Phone field — floating label above, prefix + digits in a row */}
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
                                className="relative group"
                            >
                                <label
                                    htmlFor="phone"
                                    className="block text-xs font-bold uppercase tracking-widest text-neutral-500 mb-4"
                                >
                                    Mobile Number
                                </label>
                                <div className="flex items-end border-b-2 border-neutral-200 focus-within:border-black transition-all pb-3">
                                    <span className="text-2xl sm:text-4xl font-medium text-neutral-400 mr-3 whitespace-nowrap shrink-0 leading-none">
                                        +91
                                    </span>
                                    <input
                                        type="tel"
                                        id="phone"
                                        inputMode="numeric"
                                        maxLength={10}
                                        className="flex-1 bg-transparent text-black text-2xl sm:text-4xl outline-none font-medium tracking-widest placeholder:text-neutral-300 leading-none"
                                        placeholder="98765 43210"
                                        value={phone}
                                        onChange={e => setPhone(formatPhone(e.target.value))}
                                        autoFocus
                                        required
                                    />
                                </div>
                                <p className="text-[11px] text-neutral-400 mt-3 flex items-center gap-1.5">
                                    <MessageSquare size={13} className="text-emerald-500" />
                                    We'll send a 6-digit verification code to your WhatsApp.
                                </p>
                            </motion.div>

                            {/* Submit button — Apple Spring Touch Feedback */}
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ type: 'spring', stiffness: 350, damping: 30, delay: 0.2 }}
                                className="pt-8"
                            >
                                <motion.button
                                    type="submit"
                                    whileTap={{ scale: 0.95 }}
                                    transition={{ type: 'spring', stiffness: 450, damping: 30 }}
                                    disabled={loading || formatPhone(phone).length < 10}
                                    className="w-full bg-neutral-900 text-white font-black py-6 sm:py-7 text-lg sm:text-xl uppercase tracking-widest rounded-2xl relative overflow-hidden transition-all duration-300 group disabled:bg-neutral-300 disabled:cursor-not-allowed hover:bg-black active:scale-[0.98] flex items-center justify-center cursor-pointer shadow-md"
                                >
                                    <span className={cn('transition-transform duration-300', loading ? 'translate-y-[-300%] opacity-0' : 'translate-y-0 opacity-100')}>
                                        Send WhatsApp OTP
                                    </span>
                                    {!loading && (
                                        <ArrowRight className="absolute right-8 w-6 h-6 opacity-0 -translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300 hidden sm:block" />
                                    )}
                                    <div className={cn('absolute inset-0 flex items-center justify-center transition-all duration-300', loading ? 'translate-y-0 opacity-100' : 'translate-y-[200%] opacity-0')}>
                                        <div className="flex flex-col items-center gap-1.5 mt-1">
                                            <div className="flex items-end gap-1 h-4 mb-0.5">
                                                <motion.div animate={{ height: ['40%', '100%', '40%'] }} transition={{ duration: 1, repeat: Infinity, delay: 0, ease: 'easeInOut' }} className="w-[3px] bg-white rounded-full" />
                                                <motion.div animate={{ height: ['60%', '100%', '60%'] }} transition={{ duration: 1, repeat: Infinity, delay: 0.15, ease: 'easeInOut' }} className="w-[3px] bg-white rounded-full" />
                                                <motion.div animate={{ height: ['30%', '100%', '30%'] }} transition={{ duration: 1, repeat: Infinity, delay: 0.3, ease: 'easeInOut' }} className="w-[3px] bg-white rounded-full" />
                                            </div>
                                            <span className="text-[10px] sm:text-xs uppercase tracking-[0.2em] text-white/90 font-bold">{loadingText}</span>
                                        </div>
                                    </div>
                                </motion.button>

                                <p className="text-center mt-6 text-sm text-neutral-400 font-medium">
                                    New coaching?{' '}
                                    <Link to="/onboarding" className="text-black font-bold hover:underline">
                                        Register your center →
                                    </Link>
                                </p>
                            </motion.div>
                        </motion.form>
                    ) : step === 'otp' ? (
                        /* ── OTP STEP ── */
                        <motion.div
                            key="otp-form"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                            className="space-y-10 sm:space-y-16"
                        >
                            {/* 6-digit PIN inputs — styled to match old form feel */}
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
                            >
                                <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-6">
                                    6-Digit WhatsApp Code
                                </p>
                                <div className="flex gap-3 sm:gap-4" onPaste={handleOtpPaste}>
                                    {otp.map((digit, idx) => (
                                        <input
                                            key={idx}
                                            ref={el => (otpInputsRef.current[idx] = el)}
                                            type="text"
                                            inputMode="numeric"
                                            maxLength={1}
                                            value={digit}
                                            onChange={e => handleOtpChange(idx, e.target.value)}
                                            onKeyDown={e => handleOtpKeyDown(idx, e)}
                                            className="flex-1 min-w-0 h-16 sm:h-20 bg-transparent border-b-2 border-neutral-200 focus:border-black text-center text-3xl sm:text-5xl font-black text-black outline-none transition-all rounded-none"
                                        />
                                    ))}
                                </div>
                                {/* Resend + change number */}
                                <div className="flex items-center justify-between mt-5 text-xs font-semibold">
                                    <button
                                        type="button"
                                        onClick={() => { setStep('phone'); setOtp(['', '', '', '', '', '']); setError(''); }}
                                        className="text-neutral-400 hover:text-black transition-colors uppercase tracking-widest"
                                    >
                                        ← Change Number
                                    </button>
                                    <button
                                        type="button"
                                        disabled={!canResend || loading}
                                        onClick={() => handleSendOtp()}
                                        className="flex items-center gap-1.5 text-neutral-400 hover:text-black transition-colors disabled:opacity-40 uppercase tracking-widest"
                                    >
                                        <RotateCcw size={12} />
                                        {canResend ? 'Resend OTP' : `Resend in ${resendTimer}s`}
                                    </button>
                                </div>
                            </motion.div>

                            {/* Verify button */}
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
                                className="pt-8"
                            >
                                <button
                                    type="button"
                                    onClick={() => handleVerifyOtp()}
                                    disabled={loading || otp.join('').length !== 6}
                                    className="w-full bg-black text-white font-black py-7 sm:py-8 text-lg sm:text-xl uppercase tracking-widest rounded-none relative overflow-hidden transition-all duration-500 group disabled:bg-neutral-900 disabled:cursor-not-allowed hover:bg-neutral-900 active:scale-[0.98] flex items-center justify-center"
                                >
                                    <span className={cn('transition-transform duration-500', loading ? 'translate-y-[-300%] opacity-0' : 'translate-y-0 opacity-100')}>
                                        Verify &amp; Enter Dashboard
                                    </span>
                                    {!loading && (
                                        <ArrowRight className="absolute right-8 w-6 h-6 opacity-0 -translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300 hidden sm:block" />
                                    )}
                                    <div className={cn('absolute inset-0 flex items-center justify-center transition-all duration-500', loading ? 'translate-y-0 opacity-100' : 'translate-y-[200%] opacity-0')}>
                                        <div className="flex flex-col items-center gap-1.5 mt-1">
                                            <div className="flex items-end gap-1 h-4 mb-0.5">
                                                <motion.div animate={{ height: ['40%', '100%', '40%'] }} transition={{ duration: 1, repeat: Infinity, delay: 0, ease: 'easeInOut' }} className="w-[3px] bg-white rounded-full" />
                                                <motion.div animate={{ height: ['60%', '100%', '60%'] }} transition={{ duration: 1, repeat: Infinity, delay: 0.15, ease: 'easeInOut' }} className="w-[3px] bg-white rounded-full" />
                                                <motion.div animate={{ height: ['30%', '100%', '30%'] }} transition={{ duration: 1, repeat: Infinity, delay: 0.3, ease: 'easeInOut' }} className="w-[3px] bg-white rounded-full" />
                                            </div>
                                            <span className="text-[10px] sm:text-xs uppercase tracking-[0.2em] text-white/90 font-bold">{loadingText}</span>
                                        </div>
                                    </div>
                                </button>
                            </motion.div>
                        </motion.div>
                    ) : step === 'select_account' ? (
                        /* ── SELECT ACCOUNT STEP ── */
                        <motion.div
                            key="select-account-form"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                            className="space-y-6"
                        >
                            <p className="text-sm text-neutral-500 mb-2">
                                Multiple accounts found for this mobile number. Please select the one you want to log into.
                            </p>
                            <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
                                {accounts.map((acc, idx) => (
                                    <motion.div
                                        key={acc.adminId}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: idx * 0.1 }}
                                    >
                                        <button
                                            onClick={() => handleSelectAccount(acc.adminId)}
                                            disabled={loading}
                                            className="w-full text-left p-5 border-2 border-neutral-200 hover:border-black rounded-lg transition-all flex items-center justify-between group disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <Building2 className="w-5 h-5 text-black" />
                                                    <h3 className="font-bold text-lg text-black">{acc.instituteName}</h3>
                                                </div>
                                                <div className="flex items-center gap-2 text-sm text-neutral-500 ml-7">
                                                    <User className="w-4 h-4" />
                                                    <span>{acc.teacherName}</span>
                                                    <span className="mx-2">•</span>
                                                    <span className="capitalize">{acc.role.replace('_', ' ').toLowerCase()}</span>
                                                </div>
                                            </div>
                                            <ArrowRight className="w-5 h-5 text-neutral-300 group-hover:text-black group-hover:translate-x-1 transition-all" />
                                        </button>
                                    </motion.div>
                                ))}
                            </div>
                        </motion.div>
                    ) : null}
                </AnimatePresence>
            </div>

            {/* Brutalist Corner Decorations (original) */}
            <div className="absolute bottom-8 left-8 sm:bottom-12 sm:left-12 pointer-events-none hidden sm:block z-20">
                <p className="text-neutral-400 text-xs font-mono uppercase tracking-widest transform -rotate-90 origin-bottom-left">
                    v2.0 • System Active
                </p>
            </div>
            <div className="absolute bottom-8 right-8 sm:bottom-12 sm:right-12 pointer-events-none z-20">
                <div className="flex flex-col items-end gap-2">
                    <div className="h-1.5 w-12 bg-black" />
                    <div className="h-1.5 w-8 bg-neutral-300" />
                    <p className="text-neutral-400 text-xs font-mono uppercase tracking-widest mt-2">
                        AES-256
                    </p>
                </div>
            </div>
        </div>
    );
}
