import React, { useState, useRef, memo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, Sparkles, Building, Store, AlertCircle, RotateCcw, Loader2, MapPin, CheckCircle2, ShieldCheck, CreditCard, Plus, MessageCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../utils/api';
import toast from 'react-hot-toast';

const SUBJECT_OPTIONS = [
    'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Science',
    'English', 'Hindi', 'Social Science', 'Commerce', 'Accountancy',
    'Economics', 'Computer Science'
];

type PlanId = 'basic' | 'pro' | 'listing' | 'quiz' | 'all_inclusive';

interface TrialResponse {
    success: boolean;
    error?: string;
    setupLink?: string;
}

interface CreateOrderResponse {
    success: boolean;
    error?: string;
    keyId?: string;
    orderId?: string;
    amount?: number;
    currency?: string;
    subscriptionId?: string;
}

interface VerifyPaymentResponse {
    success: boolean;
    setupLink?: string;
}

interface ResendSetupResponse {
    message?: string;
}

interface RazorpayHandlerResponse {
    razorpay_order_id?: string;
    razorpay_payment_id?: string;
    razorpay_signature?: string;
    razorpay_subscription_id?: string;
}

interface RazorpayOptions {
    key?: string;
    name: string;
    description: string;
    handler: (response: RazorpayHandlerResponse) => Promise<void>;
    prefill: {
        name: string;
        email: string;
        contact: string;
    };
    theme: {
        color: string;
    };
    modal: {
        ondismiss: () => void;
    };
    order_id?: string;
    amount?: number;
    currency?: string;
    subscription_id?: string;
}

interface RazorpayInstance {
    on: (event: 'payment.failed', handler: (response: any) => void) => void;
    open: () => void;
}

interface WindowWithRazorpay extends Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
}

const getErrorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

const loadScript = (src: string): Promise<boolean> => {
    return new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => resolve(true);
        script.onerror = () => resolve(false);
        document.body.appendChild(script);
    });
};

const pricingPlans = [
    {
        id: 'basic' as PlanId,
        name: 'Basic Plan',
        icon: Building,
        price: 999,
        tagline: 'Up to 100 Students',
        period: '/ month',
        description: 'Perfect for growing coaching centers managing up to 100 students.',
        trialInfo: '14-Day Free Trial (No Card Required)',
        features: [
            '14-Day Free Trial Included',
            'Up to 100 Active Students',
            'Full Batch & Attendance Tracking',
            'Fee Dues & Collection Records',
            'Automated WhatsApp Fee Reminders',
            'Public Directory Marketplace Listing'
        ],
        popular: false,
        badge: '100 STUDENTS',
        isOneTime: false,
        hasTrial: true,
    },
    {
        id: 'pro' as PlanId,
        name: 'Pro Plan',
        icon: Crown,
        price: 1999,
        tagline: 'Up to 250 Students',
        period: '/ month',
        description: 'Complete ERP suite for large coaching institutes managing up to 250 students.',
        trialInfo: '14-Day Free Trial Included',
        features: [
            'Up to 250 Active Students',
            'Everything in Basic Plan',
            'AI Test & Quiz Generator',
            'OMR Sheet Scanner',
            'Custom Payment Receipts & Invoices',
            'Priority 24/7 Dedicated Support'
        ],
        popular: true,
        badge: 'MOST POPULAR',
        isOneTime: false,
        hasTrial: true,
    }
];

// ─── Animated Background (Signature MathLogs Grid) ─────────────────────────

const AnimatedBackground = memo(() => (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
                backgroundImage:
                    'linear-gradient(to right, black 1px, transparent 1px), linear-gradient(to bottom, black 1px, transparent 1px)',
                backgroundSize: '80px 80px',
            }}
        />
        <motion.div
            animate={{ x: ['-10vw', '110vw'] }}
            transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}
            className="absolute top-0 h-full w-[1px] bg-gradient-to-b from-transparent via-black/10 to-transparent will-change-transform"
        />
        <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 70, repeat: Infinity, ease: 'linear' }}
            className="absolute -top-40 -right-40 w-96 h-96 border-[1px] border-black/5 rounded-full will-change-transform"
        />
        <motion.div
            animate={{ rotate: -360 }}
            transition={{ duration: 90, repeat: Infinity, ease: 'linear' }}
            className="absolute -bottom-60 -left-20 w-[600px] h-[600px] border-[1px] border-black/5 rounded-full will-change-transform"
        />
    </div>
));
AnimatedBackground.displayName = 'AnimatedBackground';

// ─── Main Onboarding Component ──────────────────────────────────────────────

export default function Onboarding() {
    // Step 1: Center Details
    const [tuitionName, setTuitionName] = useState('');
    const [ownerName, setOwnerName] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');

    // Step 2: Plan
    const [selectedPlan, setSelectedPlan] = useState<PlanId | null>(null);

    // Step 3: Marketplace & Checkout Options
    const [listOnMarketplace, setListOnMarketplace] = useState(true);
    const [city, setCity] = useState('Muzaffarnagar');
    const [area, setArea] = useState('');
    const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
    const [googleMapsUrl, setGoogleMapsUrl] = useState('');
    const [customSubjectInput, setCustomSubjectInput] = useState('');
    const [customSubjects, setCustomSubjects] = useState<string[]>([]);

    const [paymentChoice, setPaymentChoice] = useState<'pay_now' | 'pay_later'>('pay_later');

    // Consents
    const [termsAccepted, setTermsAccepted] = useState(false);
    const [dpdpAccepted, setDpdpAccepted] = useState(false);

    // UI Flow State
    const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1);
    const [isLoading, setIsLoading] = useState(false);

    // Phone OTP verification (signup)
    const [phoneOtpSent, setPhoneOtpSent] = useState(false);
    const [phoneOtpCode, setPhoneOtpCode] = useState('');
    const [isPhoneVerified, setIsPhoneVerified] = useState(false);
    const [otpSending, setOtpSending] = useState(false);
    const [otpVerifying, setOtpVerifying] = useState(false);
    const [otpError, setOtpError] = useState('');
    const [otpResendTimer, setOtpResendTimer] = useState(0);
    const otpResendRef = useRef<NodeJS.Timeout | null>(null);

    // Resend Setup Link Drawer State
    const [showResend, setShowResend] = useState(false);
    const [resendPhone, setResendPhone] = useState('');
    const [resendLoading, setResendLoading] = useState(false);
    const [resendMessage, setResendMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const isQuizOnly = new URLSearchParams(window.location.search).get('type') === 'quiz_only';
    const selectedPlanData = pricingPlans.find(p => p.id === selectedPlan);
    const canPayLater = !isQuizOnly && selectedPlan !== 'listing';

    const formatPhone = (val: string) => val.replace(/\D/g, '').slice(0, 10);

    const toggleSubject = (sub: string) => {
        setSelectedSubjects(prev =>
            prev.includes(sub) ? prev.filter(s => s !== sub) : [...prev, sub]
        );
    };

    const addCustomSubject = () => {
        const trimmed = customSubjectInput.trim();
        if (!trimmed) return;
        if ([...SUBJECT_OPTIONS, ...customSubjects].some(s => s.toLowerCase() === trimmed.toLowerCase())) {
            setCustomSubjectInput('');
            return;
        }
        setCustomSubjects(prev => [...prev, trimmed]);
        setSelectedSubjects(prev => [...prev, trimmed]);
        setCustomSubjectInput('');
    };

    const isStep1Valid = tuitionName.trim().length > 2 && ownerName.trim().length > 2 && formatPhone(phone).length >= 10 && email.includes('@') && isPhoneVerified;

    const startOtpResendTimer = useCallback(() => {
        setOtpResendTimer(30);
        if (otpResendRef.current) clearInterval(otpResendRef.current);
        otpResendRef.current = setInterval(() => {
            setOtpResendTimer(prev => {
                if (prev <= 1) {
                    clearInterval(otpResendRef.current!);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    }, []);

    const handleSendPhoneOtp = useCallback(async () => {
        const cleanP = formatPhone(phone);
        if (cleanP.length < 10) {
            setOtpError('Please enter a valid 10-digit mobile number first.');
            return;
        }
        setOtpError('');
        setOtpSending(true);
        try {
            const res = await api.post<{ success: boolean; message?: string; error?: string }>('/auth/send-signup-otp', { phone: cleanP });
            if (res.success) {
                setPhoneOtpSent(true);
                setPhoneOtpCode('');
                startOtpResendTimer();
                toast.success('OTP sent to your WhatsApp!');
            } else {
                setOtpError(res.error || 'Failed to send OTP.');
            }
        } catch (err: any) {
            setOtpError(err.response?.data?.error || 'Failed to send OTP.');
        } finally {
            setOtpSending(false);
        }
    }, [phone, startOtpResendTimer]);

    const handleVerifyPhoneOtp = useCallback(async () => {
        if (phoneOtpCode.length !== 6) {
            setOtpError('Please enter the 6-digit OTP.');
            return;
        }
        setOtpError('');
        setOtpVerifying(true);
        try {
            const res = await api.post<{ success: boolean; verificationToken?: string; error?: string }>('/auth/verify-signup-otp', { phone: formatPhone(phone), otp: phoneOtpCode });
            if (res.success) {
                setIsPhoneVerified(true);
                setPhoneOtpSent(false);
                toast.success('Mobile number verified!');
            } else {
                setOtpError(res.error || 'Invalid OTP.');
            }
        } catch (err: any) {
            setOtpError(err.response?.data?.error || 'Invalid OTP.');
        } finally {
            setOtpVerifying(false);
        }
    }, [phone, phoneOtpCode]);

    // ── STEP HANDLERS ─────────────────────────────────────────────────────────

    const handleStep1Submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isStep1Valid) return;

        try {
            await api.post('/onboarding/lead', {
                tuitionName, ownerName, phone: formatPhone(phone), email, step: 'DETAILS_FILLED'
            });
        } catch (err) {
            console.debug('Lead tracking skipped', err);
        }

        if (isQuizOnly) {
            setSelectedPlan('quiz');
            setPaymentChoice('pay_now');
            setActiveStep(3);
        } else {
            setActiveStep(2);
        }
    };

    const handleSelectPlan = async (planId: PlanId) => {
        setSelectedPlan(planId);
        setPaymentChoice('pay_later');

        try {
            await api.post('/onboarding/lead', {
                tuitionName, ownerName, phone: formatPhone(phone), email, planId, step: 'PLAN_SELECTED'
            });
        } catch (error) {
            console.debug('Lead tracking skipped', error);
        }

        setActiveStep(3);
    };

    // ── CHECKOUT / TRIAL EXECUTION ────────────────────────────────────────────

    const handleCheckout = async () => {
        if (!selectedPlan) return;
        setIsLoading(true);

        const cleanPhone = formatPhone(phone);

        // 1) Pay Later / Start Free Trial
        if (paymentChoice === 'pay_later' && canPayLater) {
            try {
                const res = await api.post<TrialResponse>('/onboarding/start-trial', {
                    tuitionName,
                    ownerName,
                    phone: cleanPhone,
                    email,
                    planId: selectedPlan,
                    listOnMarketplace,
                    city: city.trim(),
                    area: area.trim(),
                    subjectsOffered: selectedSubjects,
                    googleMapsUrl: googleMapsUrl.trim(),
                });

                if (res.success && res.setupLink) {
                    toast.success('Trial started successfully! Redirecting...');
                    try {
                        await api.post('/onboarding/lead', { phone: cleanPhone, step: 'CONVERTED' });
                    } catch (error) {
                        console.debug('Lead conversion tracking skipped', error);
                    }
                    setTimeout(() => {
                        window.location.href = res.setupLink!;
                    }, 1200);
                } else {
                    toast.error(res.error || 'Failed to start trial.');
                    setIsLoading(false);
                }
            } catch (error: unknown) {
                toast.error(getErrorMessage(error, 'Trial initialization failed.'));
                setIsLoading(false);
            }
            return;
        }

        // 2) Pay Now (Razorpay Flow)
        try {
            const isLoaded = await loadScript('https://checkout.razorpay.com/v1/checkout.js');
            if (!isLoaded) {
                toast.error('Razorpay SDK failed to load. Please check your network.');
                setIsLoading(false);
                return;
            }

            const orderRes = await api.post<CreateOrderResponse>('/onboarding/create-order', {
                tuitionName,
                ownerName,
                phone: cleanPhone,
                email,
                planId: selectedPlan,
            });

            if (!orderRes.success || !orderRes.keyId) {
                toast.error(orderRes.error || 'Failed to create order.');
                setIsLoading(false);
                return;
            }

            try {
                await api.post('/onboarding/lead', {
                    tuitionName, ownerName, phone: cleanPhone, email, planId: selectedPlan, step: 'PAYMENT_STARTED'
                });
            } catch (error) {
                console.debug('Payment start lead tracking skipped', error);
            }

            const options: RazorpayOptions = {
                key: orderRes.keyId,
                name: 'MathLogs',
                description: `MathLogs ${selectedPlanData?.name || 'Subscription'}`,
                handler: async (response: RazorpayHandlerResponse) => {
                    try {
                        const verifyRes = await api.post<VerifyPaymentResponse>('/onboarding/verify-payment', {
                            razorpay_order_id: response.razorpay_order_id,
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_signature: response.razorpay_signature,
                            razorpay_subscription_id: response.razorpay_subscription_id,
                            tuitionName,
                            ownerName,
                            phone: cleanPhone,
                            email,
                            planId: selectedPlan,
                            listOnMarketplace,
                            city: city.trim(),
                            area: area.trim(),
                            subjectsOffered: selectedSubjects,
                            googleMapsUrl: googleMapsUrl.trim(),
                        });

                        if (verifyRes.success && verifyRes.setupLink) {
                            toast.success('Payment verified! Redirecting to setup...');
                            try {
                                await api.post('/onboarding/lead', { phone: cleanPhone, step: 'CONVERTED' });
                            } catch (error) {
                                console.debug('Lead conversion tracking skipped', error);
                            }
                            setTimeout(() => {
                                window.location.href = verifyRes.setupLink!;
                            }, 1200);
                        } else {
                            toast.error('Payment verification failed.');
                            setIsLoading(false);
                        }
                    } catch (error: unknown) {
                        toast.error(getErrorMessage(error, 'Verification Error'));
                        setIsLoading(false);
                    }
                },
                prefill: {
                    name: ownerName,
                    email: email,
                    contact: cleanPhone,
                },
                theme: {
                    color: '#000000',
                },
                modal: {
                    ondismiss: () => {
                        setIsLoading(false);
                    },
                },
            };

            const rzp = new (window as WindowWithRazorpay).Razorpay!(options);
            rzp.open();
        } catch (error: unknown) {
            toast.error(getErrorMessage(error, 'Payment error occurred.'));
            setIsLoading(false);
        }
    };

    // ── RENDER ────────────────────────────────────────────────────────────────

    return (
        <div className="min-h-screen bg-[#FDFDFD] flex flex-col justify-between px-4 sm:px-8 py-6 relative overflow-hidden text-neutral-900 font-sans selection:bg-black selection:text-white z-0">
            <AnimatedBackground />

            {/* TOP BAR / LOGO & STEP HEADER */}
            <div className="w-full max-w-5xl mx-auto z-10 flex flex-col sm:flex-row items-center justify-between gap-4 mb-8">
                <Link to="/" className="flex items-center gap-3 group">
                    <img src="/icon-512x512.png" alt="MathLogs" className="w-10 h-10 rounded-xl drop-shadow-sm" />
                    <span className="text-2xl font-black tracking-tighter">MathLogs</span>
                </Link>

                {/* Step indicator pills */}
                <div className="flex items-center gap-2 bg-neutral-100 p-1.5 rounded-full border border-neutral-200 text-xs font-bold">
                    <button
                        onClick={() => activeStep > 1 && setActiveStep(1)}
                        className={`px-3 py-1.5 rounded-full transition-all ${
                            activeStep === 1
                                ? 'bg-black text-white shadow-sm'
                                : 'text-neutral-500 hover:text-black'
                        }`}
                    >
                        01. Center Details
                    </button>
                    <span className="text-neutral-300">/</span>
                    <button
                        onClick={() => isStep1Valid && activeStep > 2 && setActiveStep(2)}
                        className={`px-3 py-1.5 rounded-full transition-all ${
                            activeStep === 2
                                ? 'bg-black text-white shadow-sm'
                                : 'text-neutral-500 hover:text-black'
                        }`}
                    >
                        02. Select Plan
                    </button>
                    <span className="text-neutral-300">/</span>
                    <button
                        disabled={!selectedPlan}
                        onClick={() => selectedPlan && setActiveStep(3)}
                        className={`px-3 py-1.5 rounded-full transition-all ${
                            activeStep === 3
                                ? 'bg-black text-white shadow-sm'
                                : 'text-neutral-500 hover:text-black disabled:opacity-40'
                        }`}
                    >
                        03. Checkout
                    </button>
                </div>
            </div>

            {/* MAIN CONTENT CARD CONTAINER */}
            <div className="w-full max-w-5xl mx-auto z-10 flex-1 flex flex-col justify-center my-4">
                <AnimatePresence mode="wait">
                    {/* ─────────────────────────────────────────────────────────────
                        STEP 1: CENTER DETAILS
                    ───────────────────────────────────────────────────────────── */}
                    {activeStep === 1 && (
                        <motion.div
                            key="step1"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                            className="max-w-xl mx-auto w-full"
                        >
                            <div className="mb-10 text-center sm:text-left">
                                <h1 className="text-4xl sm:text-5xl font-black tracking-tighter mb-3">
                                    Register Coaching.
                                </h1>
                                <p className="text-base sm:text-lg text-neutral-400 font-medium tracking-tight">
                                    Enter your center details to activate your MathLogs portal and directory profile.
                                </p>
                            </div>

                            <form onSubmit={handleStep1Submit} className="space-y-8">
                                {/* Coaching Name */}
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-widest text-neutral-500 mb-2">
                                        Coaching / Institute Name
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={tuitionName}
                                        onChange={e => setTuitionName(e.target.value)}
                                        placeholder="e.g. Apex Mathematics Academy"
                                        className="w-full bg-transparent border-b-2 border-neutral-200 text-black text-xl sm:text-2xl pb-3 pt-2 focus:border-black outline-none transition-all font-medium placeholder:text-neutral-300"
                                        autoFocus
                                    />
                                </div>

                                {/* Owner Name */}
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-widest text-neutral-500 mb-2">
                                        Director / Head Teacher Name
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={ownerName}
                                        onChange={e => setOwnerName(e.target.value)}
                                        placeholder="e.g. Prof. Rajesh Sharma"
                                        className="w-full bg-transparent border-b-2 border-neutral-200 text-black text-xl sm:text-2xl pb-3 pt-2 focus:border-black outline-none transition-all font-medium placeholder:text-neutral-300"
                                    />
                                </div>

                                {/* WhatsApp Number + OTP Verification */}
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-widest text-neutral-500 mb-2">
                                        WhatsApp Mobile Number
                                    </label>
                                    <div className={`flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b-2 transition-all pb-3 ${isPhoneVerified ? 'border-green-500' : 'border-neutral-200 focus-within:border-black'}`}>
                                        <div className="flex items-center flex-1 min-w-0">
                                            <span className="text-xl sm:text-2xl font-medium text-neutral-400 mr-2.5 shrink-0">
                                                +91
                                            </span>
                                            <input
                                                type="tel"
                                                required
                                                inputMode="numeric"
                                                maxLength={10}
                                                value={phone}
                                                onChange={e => {
                                                    setPhone(formatPhone(e.target.value));
                                                    setIsPhoneVerified(false);
                                                    setPhoneOtpSent(false);
                                                    setOtpError('');
                                                }}
                                                placeholder="98765 43210"
                                                disabled={isPhoneVerified}
                                                className="w-full bg-transparent text-black text-xl sm:text-2xl outline-none font-medium tracking-wider placeholder:text-neutral-300 disabled:opacity-70"
                                            />
                                        </div>
                                        {isPhoneVerified ? (
                                            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                                                <CheckCircle2 className="w-6 h-6 text-green-500" />
                                                <button
                                                    type="button"
                                                    onClick={() => { setIsPhoneVerified(false); setPhoneOtpSent(false); setOtpError(''); }}
                                                    className="text-xs text-neutral-400 hover:text-neutral-700 font-semibold underline"
                                                >
                                                    Change
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                type="button"
                                                disabled={formatPhone(phone).length < 10 || otpSending}
                                                onClick={handleSendPhoneOtp}
                                                className="shrink-0 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-neutral-200 disabled:text-neutral-400 text-white text-xs font-bold rounded-full transition-all whitespace-nowrap shadow-xs cursor-pointer"
                                            >
                                                {otpSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
                                                {phoneOtpSent ? 'Resend OTP' : 'Verify via WhatsApp'}
                                            </button>
                                        )}
                                    </div>

                                    {/* OTP Entry */}
                                    {phoneOtpSent && !isPhoneVerified && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -8 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="mt-4 p-4 bg-green-50 border border-green-200 rounded-2xl"
                                        >
                                            <p className="text-xs text-green-700 font-semibold mb-3 flex items-center gap-1.5">
                                                <MessageCircle className="w-4 h-4" />
                                                Enter the 6-digit OTP sent to your WhatsApp
                                            </p>
                                            <div className="flex gap-2 items-center">
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    maxLength={6}
                                                    value={phoneOtpCode}
                                                    onChange={e => setPhoneOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                                    placeholder="------"
                                                    className="flex-1 bg-white border-2 border-green-200 focus:border-green-500 rounded-xl px-4 py-2.5 text-center text-2xl font-black tracking-[0.3em] outline-none transition-all"
                                                />
                                                <button
                                                    type="button"
                                                    disabled={phoneOtpCode.length !== 6 || otpVerifying}
                                                    onClick={handleVerifyPhoneOtp}
                                                    className="px-5 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-neutral-200 disabled:text-neutral-400 text-white text-sm font-bold rounded-xl transition-all flex items-center gap-2"
                                                >
                                                    {otpVerifying ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify'}
                                                </button>
                                            </div>
                                            {otpResendTimer > 0 ? (
                                                <p className="text-xs text-neutral-400 mt-2">Resend in {otpResendTimer}s</p>
                                            ) : (
                                                <button type="button" onClick={handleSendPhoneOtp} className="text-xs text-green-600 hover:underline mt-2 font-semibold">Resend OTP</button>
                                            )}
                                        </motion.div>
                                    )}

                                    {/* OTP Error */}
                                    {otpError && (
                                        <p className="mt-2 text-xs font-semibold text-red-600 flex items-center gap-1.5">
                                            <AlertCircle className="w-3.5 h-3.5" />
                                            {otpError}
                                        </p>
                                    )}
                                </div>

                                {/* Email */}
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-widest text-neutral-500 mb-2">
                                        Email Address
                                    </label>
                                    <input
                                        type="email"
                                        required
                                        value={email}
                                        onChange={e => setEmail(e.target.value.trim())}
                                        placeholder="director@apexacademy.in"
                                        className="w-full bg-transparent border-b-2 border-neutral-200 text-black text-xl sm:text-2xl pb-3 pt-2 focus:border-black outline-none transition-all font-medium placeholder:text-neutral-300"
                                    />
                                </div>

                                {/* Submit Button */}
                                <div className="pt-6">
                                    <button
                                        type="submit"
                                        disabled={!isStep1Valid}
                                        className="w-full bg-black text-white font-black py-6 sm:py-7 text-lg uppercase tracking-widest rounded-none relative overflow-hidden transition-all duration-300 group disabled:bg-neutral-200 disabled:text-neutral-400 disabled:cursor-not-allowed hover:bg-neutral-900 active:scale-[0.98] flex items-center justify-center gap-3"
                                    >
                                        <span>Continue to Plans</span>
                                        <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    )}

                    {/* ─────────────────────────────────────────────────────────────
                        STEP 2: CHOOSE PLAN
                    ───────────────────────────────────────────────────────────── */}
                    {activeStep === 2 && (
                        <motion.div
                            key="step2"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                            className="w-full"
                        >
                            <div className="mb-10 text-center">
                                <h1 className="text-4xl sm:text-5xl font-black tracking-tighter mb-3">
                                    Select Scale Protocol.
                                </h1>
                                <p className="text-base sm:text-lg text-neutral-400 font-medium tracking-tight max-w-xl mx-auto">
                                    Choose the capacity level that aligns with your coaching institute's current requirements.
                                </p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {pricingPlans.map((plan) => (
                                    <div
                                        key={plan.id}
                                        onClick={() => handleSelectPlan(plan.id)}
                                        className={`relative cursor-pointer transition-all duration-300 p-7 rounded-3xl border-2 flex flex-col justify-between overflow-hidden group ${
                                            selectedPlan === plan.id
                                                ? 'border-black bg-black text-white shadow-2xl scale-[1.02]'
                                                : 'border-neutral-200 bg-white hover:border-black/40 hover:scale-[1.01]'
                                        }`}
                                    >
                                        {/* Badge */}
                                        {plan.badge && (
                                            <div className={`absolute top-0 right-6 text-[10px] font-black uppercase tracking-widest py-1.5 px-3 rounded-b-xl ${
                                                selectedPlan === plan.id
                                                    ? 'bg-white text-black'
                                                    : plan.popular
                                                    ? 'bg-black text-white'
                                                    : 'bg-neutral-100 text-neutral-600'
                                            }`}>
                                                {plan.badge}
                                            </div>
                                        )}

                                        <div>
                                            {/* Icon + Title */}
                                            <div className="flex items-center gap-3 mb-4">
                                                <div className={`p-3 rounded-2xl ${
                                                    selectedPlan === plan.id ? 'bg-white/10 text-white' : 'bg-neutral-100 text-black'
                                                }`}>
                                                    <plan.icon className="w-6 h-6" />
                                                </div>
                                                <div>
                                                    <h3 className="text-xl font-bold tracking-tight">{plan.name}</h3>
                                                    <p className={`text-xs font-semibold ${
                                                        selectedPlan === plan.id ? 'text-neutral-400' : 'text-neutral-500'
                                                    }`}>
                                                        {plan.tagline}
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Price */}
                                            <div className="mb-6 pb-6 border-b border-current/10">
                                                <div className="flex items-baseline gap-1">
                                                    <span className="text-5xl font-black tracking-tighter">₹{plan.price}</span>
                                                    <span className={`text-sm font-bold ${
                                                        selectedPlan === plan.id ? 'text-neutral-400' : 'text-neutral-500'
                                                    }`}>
                                                        {plan.period}
                                                    </span>
                                                </div>
                                                <p className={`text-xs font-medium leading-relaxed mt-2 ${
                                                    selectedPlan === plan.id ? 'text-neutral-300' : 'text-neutral-500'
                                                }`}>
                                                    {plan.description}
                                                </p>
                                            </div>

                                            {/* Features list */}
                                            <div className="space-y-3 mb-8">
                                                {plan.features.map((feature) => (
                                                    <div key={feature} className="flex items-start gap-3">
                                                        <Check className={`w-4 h-4 shrink-0 mt-0.5 ${
                                                            selectedPlan === plan.id ? 'text-white' : 'text-black'
                                                        }`} />
                                                        <span className="text-xs font-bold leading-snug">{feature}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Action Button */}
                                        <button
                                            type="button"
                                            className={`w-full py-4 text-xs font-black uppercase tracking-widest transition-all rounded-2xl flex items-center justify-center gap-2 ${
                                                selectedPlan === plan.id
                                                    ? 'bg-white text-black'
                                                    : 'bg-black text-white group-hover:bg-neutral-900'
                                            }`}
                                        >
                                            <span>{selectedPlan === plan.id ? '✓ Selected' : 'Select Plan'}</span>
                                            <ArrowRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    )}

                    {/* ─────────────────────────────────────────────────────────────
                        STEP 3: PROFILE & CHECKOUT
                    ───────────────────────────────────────────────────────────── */}
                    {activeStep === 3 && selectedPlanData && (
                        <motion.div
                            key="step3"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                            className="max-w-2xl mx-auto w-full space-y-8"
                        >
                            <div className="text-center sm:text-left">
                                <h1 className="text-3xl sm:text-4xl font-black tracking-tighter mb-2">
                                    {paymentChoice === 'pay_later' ? 'Start Free Trial' : 'Complete Activation'}
                                </h1>
                                <p className="text-sm sm:text-base text-neutral-400 font-medium">
                                    Selected Plan: <span className="text-black font-bold">{selectedPlanData.name}</span> (₹{selectedPlanData.price}{selectedPlanData.period})
                                </p>
                            </div>

                            {/* SECTION A: MARKETPLACE PROFILE SETUP */}
                            <div className="bg-white border-2 border-neutral-200 rounded-3xl p-6 sm:p-8 space-y-6">
                                <div className="flex items-center gap-3">
                                    <div className="p-2.5 bg-black text-white rounded-xl">
                                        <MapPin className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h3 className="text-base font-bold tracking-tight">Marketplace Directory Profile</h3>
                                        <p className="text-xs text-neutral-400 font-medium">Setup your public profile for local student discovery.</p>
                                    </div>
                                </div>

                                {/* Enable listing toggle for Quiz & All Inclusive */}
                                {selectedPlan !== 'listing' && (
                                    <label className="flex items-center gap-3 p-3 bg-neutral-50 rounded-2xl cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={listOnMarketplace}
                                            onChange={e => setListOnMarketplace(e.target.checked)}
                                            className="w-4 h-4 accent-black rounded cursor-pointer"
                                        />
                                        <span className="text-xs font-bold text-neutral-700">
                                            List my coaching center on the MathLogs Public Marketplace Directory (Free)
                                        </span>
                                    </label>
                                )}

                                {listOnMarketplace && (
                                    <div className="space-y-5 pt-2">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
                                                    City *
                                                </label>
                                                <select
                                                    value={city}
                                                    onChange={e => setCity(e.target.value)}
                                                    className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-bold outline-none focus:border-black transition-all cursor-pointer"
                                                >
                                                    <option value="Muzaffarnagar">Muzaffarnagar</option>
                                                </select>
                                            </div>

                                            <div>
                                                <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
                                                    Area / Locality
                                                </label>
                                                <input
                                                    type="text"
                                                    value={area}
                                                    onChange={e => setArea(e.target.value)}
                                                    placeholder="e.g. Kothrud, Baner"
                                                    className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-medium outline-none focus:border-black transition-all"
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2">
                                                Subjects Taught
                                            </label>
                                            <div className="flex flex-wrap gap-2">
                                                {[...SUBJECT_OPTIONS, ...customSubjects].map(sub => (
                                                    <button
                                                        key={sub}
                                                        type="button"
                                                        onClick={() => toggleSubject(sub)}
                                                        className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                                                            selectedSubjects.includes(sub)
                                                                ? 'bg-black text-white'
                                                                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                                                        }`}
                                                    >
                                                        {sub}
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="flex items-center gap-2 mt-2">
                                                <input
                                                    type="text"
                                                    value={customSubjectInput}
                                                    onChange={e => setCustomSubjectInput(e.target.value)}
                                                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCustomSubject())}
                                                    placeholder="Add a subject..."
                                                    className="flex-1 px-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium outline-none focus:border-black transition-all"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={addCustomSubject}
                                                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-neutral-900 text-white text-xs font-bold hover:bg-neutral-700 transition-all"
                                                >
                                                    <Plus className="w-3 h-3" /> Add
                                                </button>
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
                                                Google Maps Link <span className="text-neutral-300 font-normal">(Optional)</span>
                                            </label>
                                            <input
                                                type="url"
                                                value={googleMapsUrl}
                                                onChange={e => setGoogleMapsUrl(e.target.value)}
                                                placeholder="https://maps.app.goo.gl/..."
                                                className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-medium outline-none focus:border-black transition-all"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* SECTION B: PAYMENT TIMING OPTIONS (hidden for listing — always free) */}
                            {canPayLater && (
                                <div className="bg-white border-2 border-neutral-200 rounded-3xl p-6 sm:p-8 space-y-4">
                                    <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-500">
                                        Choose Activation Mode
                                    </h3>
                                    <div className="grid grid-cols-2 gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setPaymentChoice('pay_later')}
                                            className={`p-4 rounded-2xl border-2 text-left transition-all ${
                                                paymentChoice === 'pay_later'
                                                    ? 'border-black bg-black text-white'
                                                    : 'border-neutral-200 bg-white text-black hover:border-neutral-300'
                                            }`}
                                        >
                                            <Sparkles className="w-5 h-5 mb-2" />
                                            <p className="text-sm font-bold">Start Free Trial</p>
                                            <p className={`text-[11px] font-medium mt-1 ${
                                                paymentChoice === 'pay_later' ? 'text-neutral-300' : 'text-neutral-500'
                                            }`}>
                                                {selectedPlanData.trialInfo}
                                            </p>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setPaymentChoice('pay_now')}
                                            className={`p-4 rounded-2xl border-2 text-left transition-all ${
                                                paymentChoice === 'pay_now'
                                                    ? 'border-black bg-black text-white'
                                                    : 'border-neutral-200 bg-white text-black hover:border-neutral-300'
                                            }`}
                                        >
                                            <CreditCard className="w-5 h-5 mb-2" />
                                            <p className="text-sm font-bold">Pay Now</p>
                                            <p className={`text-[11px] font-medium mt-1 ${
                                                paymentChoice === 'pay_now' ? 'text-neutral-300' : 'text-neutral-500'
                                            }`}>
                                                Pay ₹{selectedPlanData.price} via Razorpay
                                            </p>
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* SECTION C: LEGAL CONSENTS */}
                            <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-5 space-y-3 text-xs">
                                <label className="flex items-start gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={termsAccepted}
                                        onChange={e => setTermsAccepted(e.target.checked)}
                                        className="mt-0.5 w-4 h-4 accent-black rounded cursor-pointer shrink-0"
                                    />
                                    <span className="text-neutral-600 leading-snug">
                                        I agree to the <a href="/terms" target="_blank" className="text-black font-bold underline">Terms &amp; Conditions</a> and <a href="/privacy-policy" target="_blank" className="text-black font-bold underline">Privacy Policy</a>.
                                    </span>
                                </label>

                                <label className="flex items-start gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={dpdpAccepted}
                                        onChange={e => setDpdpAccepted(e.target.checked)}
                                        className="mt-0.5 w-4 h-4 accent-black rounded cursor-pointer shrink-0"
                                    />
                                    <span className="text-neutral-600 leading-snug">
                                        I agree to comply with the <span className="text-black font-bold">DPDP Act, 2023</span> as a Data Fiduciary for student data.
                                    </span>
                                </label>
                            </div>

                            {/* SECTION D: ACTION BUTTON */}
                            <button
                                onClick={handleCheckout}
                                disabled={isLoading || !termsAccepted || !dpdpAccepted}
                                className="w-full bg-black text-white font-black py-7 text-lg uppercase tracking-widest rounded-none relative overflow-hidden transition-all duration-300 disabled:bg-neutral-200 disabled:text-neutral-400 disabled:cursor-not-allowed hover:bg-neutral-900 active:scale-[0.98] flex items-center justify-center gap-3"
                            >
                                {isLoading ? (
                                    <Loader2 className="w-6 h-6 animate-spin" />
                                ) : paymentChoice === 'pay_later' ? (
                                    <>
                                        <Sparkles className="w-5 h-5" />
                                        <span>Start Free Trial Now</span>
                                    </>
                                ) : (
                                    <>
                                        <CreditCard className="w-5 h-5" />
                                        <span>Pay ₹{selectedPlanData.price} Securely</span>
                                    </>
                                )}
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* RESEND SETUP LINK SECTION */}
                <div className="mt-12 text-center">
                    <button
                        type="button"
                        onClick={() => { setShowResend(!showResend); setResendMessage(null); }}
                        className="text-xs font-bold uppercase tracking-widest text-neutral-400 hover:text-black transition-colors inline-flex items-center gap-2"
                    >
                        <RotateCcw className="w-4 h-4" />
                        Already paid or started trial? Resend setup link
                    </button>

                    <AnimatePresence>
                        {showResend && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="overflow-hidden max-w-md mx-auto mt-4"
                            >
                                <div className="bg-white border-2 border-neutral-200 p-5 rounded-2xl text-left space-y-3">
                                    <p className="text-xs text-neutral-500 font-medium">
                                        Enter your registered mobile number to resend your setup link via WhatsApp.
                                    </p>
                                    <div className="flex gap-2">
                                        <input
                                            type="tel"
                                            value={resendPhone}
                                            onChange={e => { setResendPhone(formatPhone(e.target.value)); setResendMessage(null); }}
                                            placeholder="WhatsApp Mobile Number"
                                            className="flex-1 px-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium outline-none focus:border-black"
                                        />
                                        <button
                                            type="button"
                                            disabled={resendPhone.length < 10 || resendLoading}
                                            onClick={async () => {
                                                setResendLoading(true);
                                                setResendMessage(null);
                                                try {
                                                    const res = await api.post<ResendSetupResponse>('/onboarding/resend-setup-link', { phone: resendPhone });
                                                    setResendMessage({ type: 'success', text: res.message || 'Link sent to WhatsApp!' });
                                                    toast.success('Setup link resent!');
                                                } catch (error: unknown) {
                                                    const msg = getErrorMessage(error, 'Failed to resend link.');
                                                    setResendMessage({ type: 'error', text: msg });
                                                    toast.error(msg);
                                                } finally {
                                                    setResendLoading(false);
                                                }
                                            }}
                                            className="px-4 py-2.5 bg-black text-white font-bold text-xs rounded-xl hover:bg-neutral-800 disabled:opacity-50"
                                        >
                                            {resendLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Resend'}
                                        </button>
                                    </div>

                                    {resendMessage && (
                                        <p className={`text-xs font-bold ${
                                            resendMessage.type === 'success' ? 'text-emerald-600' : 'text-red-500'
                                        }`}>
                                            {resendMessage.text}
                                        </p>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* BRUTALIST FOOTER */}
            <div className="w-full max-w-5xl mx-auto z-10 text-center pt-6 border-t border-neutral-200 text-xs font-medium text-neutral-400">
                MathLogs Center Onboarding Protocol • AES-256 Encrypted &amp; DPDP Compliant
            </div>
        </div>
    );
}
