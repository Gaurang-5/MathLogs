import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, ChevronDown, Check, Building2, User, Phone, Mail, CreditCard, Sparkles, Building, AlertCircle, RotateCcw, Loader2 } from 'lucide-react';
import { api } from '../utils/api';
import toast from 'react-hot-toast';

type PlanId = 'basic' | 'pro';
type BillingCycle = 'monthly' | 'yearly';

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

interface RazorpayFailureResponse {
    error?: {
        description?: string;
    };
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
    on: (event: 'payment.failed', handler: (response: RazorpayFailureResponse) => void) => void;
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
        id: 'basic',
        name: 'Basic Plan',
        icon: Building,
        monthlyPrice: 999,
        yearlyPrice: 9999,
        period: '/ month',
        description: 'Perfect for independent tutors starting their journey.',
        limit: 'Up to 100 Students',
        features: ['Unlimited Batches', 'Automated Grading', 'WhatsApp Alerts'],
        popular: false,
    },
    {
        id: 'pro',
        name: 'Pro Plan',
        icon: Sparkles,
        monthlyPrice: 1999,
        yearlyPrice: 19999,
        period: '/ month',
        description: 'For growing coaching centers that need advanced tools.',
        limit: 'Up to 250 Students',
        features: ['Unlimited Batches', 'Automated Grading', 'WhatsApp Alerts'],
        popular: true,
    }
];

export default function Onboarding() {
    // Step 1: Details
    const [tuitionName, setTuitionName] = useState('');
    const [ownerName, setOwnerName] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');

    // Step 2: Plan
    const [billingCycle, setBillingCycle] = useState<BillingCycle>('yearly');
    const [selectedPlan, setSelectedPlan] = useState<PlanId | null>(null);

    // UI State
    const [activeStep, setActiveStep] = useState(1);
    const [isLoading, setIsLoading] = useState(false);

    // Consents
    const [termsAccepted, setTermsAccepted] = useState(false);
    const [dpdpAccepted, setDpdpAccepted] = useState(false);

    // Resend Setup Link State
    const [showResend, setShowResend] = useState(false);
    const [resendPhone, setResendPhone] = useState('');
    const [resendLoading, setResendLoading] = useState(false);
    const [resendMessage, setResendMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // References for scrolling
    const planRef = useRef<HTMLDivElement>(null);
    const checkoutRef = useRef<HTMLDivElement>(null);

    const isQuizOnly = new URLSearchParams(window.location.search).get('type') === 'quiz_only';
    const isFreeTrial = isQuizOnly ? false : true;

    const isStep1Valid = tuitionName.length > 2 && ownerName.length > 2 && phone.length >= 10 && email.includes('@');

    const scrollToRef = (ref: React.RefObject<HTMLDivElement | null>) => {
        setTimeout(() => {
            if (ref.current) {
                ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }, 150);
    };

    const handleContinueToPlans = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isStep1Valid) return;

        // Track Step 1 completion
        try {
            await api.post('/onboarding/lead', {
                tuitionName, ownerName, phone, email, step: 'DETAILS_FILLED'
            });
        } catch (err) {
            console.error('Failed to track lead', err);
        }

        if (isQuizOnly) {
            setActiveStep(3);
            scrollToRef(checkoutRef);
        } else {
            setActiveStep(2);
            scrollToRef(planRef);
        }
    };

    const handleSelectPlan = async (planId: PlanId) => {
        setSelectedPlan(planId);

        // Track plan selection
        try {
            await api.post('/onboarding/lead', {
                tuitionName, ownerName, phone, email, planId, billingCycle, step: 'PLAN_SELECTED'
            });
        } catch (error) {
            console.debug('Lead tracking skipped at plan selection', error);
        }

        setActiveStep(3);
        scrollToRef(checkoutRef);
    };

    const handleCheckout = async () => {
        setIsLoading(true);

        if (isFreeTrial) {
            try {
                const res = await api.post<TrialResponse>('/onboarding/start-trial', {
                    tuitionName,
                    ownerName,
                    phone,
                    email,
                    planId: selectedPlan,
                    billingCycle,
                });

                if (res.success && res.setupLink) {
                    toast.success('Trial started! Redirecting to setup...');
                    try {
                        await api.post('/onboarding/lead', { phone, step: 'CONVERTED' });
                    } catch (error) {
                        console.debug('Lead tracking skipped at trial conversion', error);
                    }
                    setTimeout(() => {
                        window.location.href = res.setupLink;
                    }, 1500);
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

        try {
            const isLoaded = await loadScript('https://checkout.razorpay.com/v1/checkout.js');
            if (!isLoaded) {
                toast.error('Razorpay SDK failed to load. Are you online?');
                setIsLoading(false);
                return;
            }

            const orderRes = await api.post<CreateOrderResponse>('/onboarding/create-order', {
                tuitionName,
                ownerName,
                phone,
                email,
                planId: isQuizOnly ? 'quiz_only' : selectedPlan,
                billingCycle,
            });

            if (!orderRes.success) {
                toast.error(orderRes.error || 'Failed to create order');
                setIsLoading(false);
                return;
            }

            // Track payment initiation
            try {
                await api.post('/onboarding/lead', {
                    tuitionName, ownerName, phone, email, planId: selectedPlan, billingCycle, step: 'PAYMENT_STARTED'
                });
            } catch (error) {
                console.debug('Lead tracking skipped at payment start', error);
            }

            const options: RazorpayOptions = {
                key: orderRes.keyId,
                name: 'MathLogs',
                description: 'MathLogs License',
                handler: async (response: RazorpayHandlerResponse) => {
                    try {
                        const verifyRes = await api.post<VerifyPaymentResponse>('/onboarding/verify-payment', {
                            razorpay_order_id: response.razorpay_order_id,
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_signature: response.razorpay_signature,
                            razorpay_subscription_id: response.razorpay_subscription_id,
                            tuitionName,
                            ownerName,
                            phone,
                            email,
                            planId: isQuizOnly ? 'quiz_only' : selectedPlan,
                            billingCycle,
                        });

                        if (verifyRes.success && verifyRes.setupLink) {
                            toast.success('Payment verified! Redirecting to setup...');
                            // Track conversion
                            try {
                                await api.post('/onboarding/lead', {
                                    phone, step: 'CONVERTED'
                                });
                            } catch (error) {
                                console.debug('Lead tracking skipped after payment conversion', error);
                            }
                            setTimeout(() => {
                                window.location.href = verifyRes.setupLink;
                            }, 1500);
                        } else {
                            toast.error('Payment verification failed.');
                        }
                    } catch (error: unknown) {
                        toast.error(getErrorMessage(error, 'Verification Error'));
                    }
                },
                prefill: {
                    name: ownerName,
                    email: email,
                    contact: phone,
                },
                theme: {
                    color: '#0071e3',
                },
                modal: {
                    ondismiss: () => {
                        setIsLoading(false);
                    }
                }
            };

            if (billingCycle === 'yearly') {
                options.order_id = orderRes.orderId;
                options.amount = orderRes.amount;
                options.currency = orderRes.currency;
            } else {
                options.subscription_id = orderRes.subscriptionId;
            }

            const razorpayWindow = window as WindowWithRazorpay;
            if (!razorpayWindow.Razorpay) {
                toast.error('Payment gateway is unavailable.');
                setIsLoading(false);
                return;
            }

            const paymentObject = new razorpayWindow.Razorpay(options);

            paymentObject.on('payment.failed', async (response: RazorpayFailureResponse) => {
                try {
                    await api.post('/onboarding/lead', {
                        phone, step: 'PAYMENT_FAILED', failureReason: response.error?.description || 'Unknown Error'
                    });
                } catch (error) {
                    console.debug('Lead tracking skipped after payment failure', error);
                }
            });

            paymentObject.open();

        } catch (error: unknown) {
            toast.error(getErrorMessage(error, 'Payment initialization failed.'));
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-app-bg text-app-text font-sans overflow-x-hidden selection:bg-black selection:text-white">

            {/* Background Graphic */}
            <div className="fixed top-0 left-0 w-full h-full pointer-events-none z-0 overflow-hidden">
                <div className="absolute top-[-10%] right-[-5%] w-[50vw] h-[50vw] rounded-full bg-accent-subtle/40 blur-[120px]" />
                <div className="absolute bottom-[-20%] left-[-10%] w-[60vw] h-[60vw] rounded-full bg-blue-100/30 blur-[150px]" />
            </div>

            <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-16">

                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-8 sm:mb-12 text-center"
                >
                    <div className="inline-flex items-center justify-center px-4 py-1.5 rounded-full border border-black/10 bg-white/50 backdrop-blur-md text-xs font-bold tracking-widest uppercase mb-4 sm:mb-6 shadow-sm">
                        <span className="w-2 h-2 rounded-full bg-accent-primary mr-2 animate-pulse" />
                        MathLogs Setup
                    </div>
                    <h1 className="text-3xl sm:text-5xl md:text-7xl font-extrabold tracking-tighter text-black mb-4 sm:mb-6 leading-tight">
                        Digitize your <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-700 to-indigo-900 font-black">
                            coaching center.
                        </span>
                    </h1>
                    <p className="text-base sm:text-xl text-app-text-secondary max-w-2xl mx-auto font-medium leading-relaxed px-2">
                        Standardize your grading, automate WhatsApp updates, and manage students seamlessly in 3 minutes.
                    </p>
                </motion.div>

                {/* STEP 1: TUITION DETAILS */}
                <motion.div
                    className="bg-app-surface-opaque border-[1.5px] border-black/5 rounded-2xl sm:rounded-[32px] p-5 sm:p-8 md:p-12 shadow-2xl shadow-black/5 mb-8 relative overflow-hidden transition-all duration-500 hover:shadow-black/10"
                >
                    {activeStep > 1 && (
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-accent-primary to-blue-400" />
                    )}

                    <div className="flex items-start justify-between mb-10">
                        <div>
                            <h2 className="text-2xl font-bold tracking-tight flex items-center gap-3">
                                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-black text-white text-sm font-bold">1</span>
                                Center Geography
                            </h2>
                            <p className="text-app-text-tertiray mt-2 font-medium">Where the magic happens.</p>
                        </div>
                        {activeStep > 1 && (
                            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-success bg-success/10 p-2 rounded-full">
                                <CheckCircle2 className="w-6 h-6" />
                            </motion.div>
                        )}
                    </div>

                    <form onSubmit={handleContinueToPlans} className={`space-y-6 transition-opacity duration-300 ${activeStep !== 1 ? 'opacity-40 pointer-events-none grayscale-[0.5]' : ''}`}>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">

                            <div className="space-y-2 group">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">Coaching Name</label>
                                <div className="relative">
                                    <Building2 className="absolute left-4 top-4 w-5 h-5 text-gray-400 group-focus-within:text-accent-primary transition-colors" />
                                    <input
                                        type="text"
                                        required
                                        value={tuitionName}
                                        onChange={(e) => setTuitionName(e.target.value)}
                                        className="w-full bg-neutral-50/50 border-2 border-transparent focus:bg-white focus:border-accent-primary text-app-text pl-12 p-4 rounded-2xl outline-none transition-all placeholder:text-gray-400 font-semibold"
                                        placeholder="e.g. Apex Mathematics"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2 group">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">Owner Name</label>
                                <div className="relative">
                                    <User className="absolute left-4 top-4 w-5 h-5 text-gray-400 group-focus-within:text-accent-primary transition-colors" />
                                    <input
                                        type="text"
                                        required
                                        value={ownerName}
                                        onChange={(e) => setOwnerName(e.target.value)}
                                        className="w-full bg-neutral-50/50 border-2 border-transparent focus:bg-white focus:border-accent-primary text-app-text pl-12 p-4 rounded-2xl outline-none transition-all placeholder:text-gray-400 font-semibold"
                                        placeholder="Your full name"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2 group">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">Phone Number</label>
                                <div className="relative">
                                    <Phone className="absolute left-4 top-4 w-5 h-5 text-gray-400 group-focus-within:text-accent-primary transition-colors" />
                                    <input
                                        type="tel"
                                        required
                                        value={phone}
                                        onChange={(e) => setPhone(e.target.value)}
                                        className="w-full bg-neutral-50/50 border-2 border-transparent focus:bg-white focus:border-accent-primary text-app-text pl-12 p-4 rounded-2xl outline-none transition-all placeholder:text-gray-400 font-semibold"
                                        placeholder="+91 99999 99999"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2 group">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">Email Address</label>
                                <div className="relative">
                                    <Mail className="absolute left-4 top-4 w-5 h-5 text-gray-400 group-focus-within:text-accent-primary transition-colors" />
                                    <input
                                        type="email"
                                        required
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="w-full bg-neutral-50/50 border-2 border-transparent focus:bg-white focus:border-accent-primary text-app-text pl-12 p-4 rounded-2xl outline-none transition-all placeholder:text-gray-400 font-semibold"
                                        placeholder="hello@apexmath.com"
                                    />
                                </div>
                            </div>

                        </div>

                        {activeStep === 1 && (
                            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="pt-6">
                                <button
                                    type="submit"
                                    disabled={!isStep1Valid}
                                    className="w-full sm:w-auto px-8 py-4 bg-black text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-neutral-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                                >
                                    Continue to Pricing
                                    <ChevronDown className="w-5 h-5" />
                                </button>
                            </motion.div>
                        )}
                    </form>

                    {activeStep > 1 && (
                        <div className="pt-4 flex justify-end">
                            <button type="button" onClick={() => setActiveStep(1)} className="text-sm font-bold text-accent-primary hover:underline cursor-pointer">
                                Edit Details
                            </button>
                        </div>
                    )}
                </motion.div>

                {/* STEP 2: PRICING */}
                <AnimatePresence>
                    {!isQuizOnly && activeStep >= 2 && (
                        <motion.div
                            ref={planRef}
                            initial={{ opacity: 0, y: 50 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="mb-8"
                        >
                            <div className="mb-8 pl-4">
                                <h2 className="text-2xl font-bold tracking-tight flex items-center gap-3">
                                    <span className="flex items-center justify-center w-8 h-8 rounded-full bg-black text-white text-sm font-bold">2</span>
                                    Scale Protocol
                                </h2>
                                <p className="text-app-text-secondary mt-2 font-medium ml-11">Select the capacity that aligns with your current coaching volume.</p>
                            </div>

                            <div className="flex justify-center mb-6 sm:mb-10">
                                <div className="bg-white/60 border border-black/5 p-1 sm:p-1.5 rounded-xl sm:rounded-2xl flex items-center backdrop-blur-sm shadow-sm">
                                    <button
                                        onClick={() => setBillingCycle('monthly')}
                                        className={`px-3 sm:px-6 py-2 sm:py-2.5 rounded-lg sm:rounded-xl font-bold text-xs sm:text-sm transition-all focus:outline-none ${billingCycle === 'monthly' ? 'bg-black text-white shadow-lg scale-105' : 'text-gray-500 hover:text-black hover:bg-black/5'}`}
                                    >
                                        Monthly (Autopay)
                                    </button>
                                    <button
                                        onClick={() => setBillingCycle('yearly')}
                                        className={`px-3 sm:px-6 py-2 sm:py-2.5 rounded-lg sm:rounded-xl font-bold text-xs sm:text-sm transition-all focus:outline-none flex items-center gap-1 sm:gap-2 ${billingCycle === 'yearly' ? 'bg-black text-white shadow-lg scale-105' : 'text-gray-500 hover:text-black hover:bg-black/5'}`}
                                    >
                                        Yearly
                                        <span className={`px-1.5 sm:px-2 py-0.5 rounded-md text-[9px] sm:text-[10px] uppercase tracking-wider sm:tracking-widest ${billingCycle === 'yearly' ? 'bg-white/20 text-white' : 'bg-black/10 text-black font-extrabold'}`}>Save ~16%</span>
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {pricingPlans.map((plan) => {
                                    const displayPrice = billingCycle === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;
                                    const displayPeriod = billingCycle === 'yearly' ? '/ year' : '/ month';

                                    return (
                                        <div
                                            key={plan.id}
                                            onClick={() => handleSelectPlan(plan.id as 'basic' | 'pro')}
                                            className={`relative cursor-pointer transition-all duration-300 p-5 sm:p-8 rounded-2xl sm:rounded-[32px] border-2 overflow-hidden ${selectedPlan === plan.id
                                                ? 'border-black bg-white shadow-2xl scale-[1.02]'
                                                : 'border-transparent bg-white/60 hover:bg-white hover:border-black/20 hover:scale-[1.01]'
                                                }`}
                                        >
                                            {plan.popular && (
                                                <div className="absolute top-0 right-8 bg-black text-white text-xs font-bold uppercase tracking-widest py-1 px-3 rounded-b-lg">
                                                    Most Popular
                                                </div>
                                            )}

                                            <div className="flex items-center gap-4 mb-6">
                                                <div className={`p-3 rounded-2xl ${selectedPlan === plan.id ? 'bg-black text-white' : 'bg-neutral-100 text-neutral-600'}`}>
                                                    <plan.icon className="w-6 h-6" />
                                                </div>
                                                <div>
                                                    <h3 className="text-xl font-bold">{plan.name}</h3>
                                                    <p className="font-semibold text-accent-primary">{plan.limit}</p>
                                                </div>
                                            </div>

                                            <div className="mb-8">
                                                <div className="flex items-baseline gap-1">
                                                    <span className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tighter">₹{displayPrice.toLocaleString('en-IN')}</span>
                                                    <span className="text-app-text-tertiary font-bold">{displayPeriod}</span>
                                                </div>
                                                <p className="text-app-text-secondary mt-3 font-medium text-sm">{plan.description}</p>
                                            </div>

                                            <div className="space-y-4 pt-6 border-t border-black/5">
                                                {plan.features.map(feature => (
                                                    <div key={feature} className="flex items-start gap-3">
                                                        <Check className="w-5 h-5 text-black shrink-0" />
                                                        <span className="text-sm font-semibold">{feature}</span>
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Selection Indicator */}
                                            <div className={`mt-8 w-full py-3 rounded-xl font-bold text-center transition-colors ${selectedPlan === plan.id ? 'bg-black text-white' : 'bg-neutral-100 text-neutral-900 group-hover:bg-neutral-200'
                                                }`}>
                                                {selectedPlan === plan.id ? 'Selected' : (isFreeTrial ? 'Start 14-Day Free Trial' : 'Select Plan')}
                                            </div>

                                        </div>
                                    );
                                })}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* STEP 3: CHECKOUT */}
                <AnimatePresence>
                    {activeStep >= 3 && (
                        <motion.div
                            ref={checkoutRef}
                            initial={{ opacity: 0, y: 50 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-black text-white rounded-2xl sm:rounded-[32px] p-5 sm:p-8 md:p-12 shadow-2xl relative overflow-hidden"
                        >
                            <div className="absolute right-0 top-0 w-64 h-64 bg-accent-primary/20 blur-[100px] rounded-full" />

                            <div className="relative z-10 flex flex-col gap-6 sm:gap-8">
                                <div>
                                    <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-2 !text-white">
                                        {isQuizOnly ? "Complete your purchase" : (isFreeTrial ? "Start your 14-Day Free Trial" : "Ready to initialize?")}
                                    </h2>
                                    <p className="text-neutral-400 font-medium mb-4 text-sm sm:text-base">
                                        {isQuizOnly ? (
                                            <>You have selected the <span className="!text-white font-bold">Quiz Starter Pack (10 Credits)</span>. Secure your one-time payment of ₹500 via Razorpay to get started instantly.</>
                                        ) : (
                                            <>
                                                You have selected the <span className="!text-white font-bold">{pricingPlans.find(p => p.id === selectedPlan)?.name}</span>.
                                                {isFreeTrial 
                                                    ? " Start your 14-day free trial immediately without a credit card. You can upgrade anytime during the trial." 
                                                    : " Secure your payment via Razorpay to activate your center immediately."}
                                            </>
                                        )}
                                    </p>

                                    {!isFreeTrial && !isQuizOnly && (
                                        <div className="flex items-start gap-2 sm:gap-3 p-3 sm:p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-xs sm:text-sm font-medium text-neutral-300">
                                            <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-400 shrink-0 mt-0.5" />
                                            <p>
                                                <span className="text-red-400 font-bold">Heads up:</span> Failure to complete recurring payment renewals will result in your Center's subscription being revoked and locked after a <span className="text-white font-bold">7-day grace period</span>.
                                            </p>
                                        </div>
                                    )}

                                    {/* Legal Consents (Indian Laws) */}
                                    <div className="space-y-4 bg-white/5 border border-white/10 p-4 rounded-xl mt-4">
                                        <label className="flex items-start gap-3 cursor-pointer group">
                                            <input 
                                                type="checkbox" 
                                                checked={termsAccepted}
                                                onChange={e => setTermsAccepted(e.target.checked)}
                                                className="mt-0.5 w-4 h-4 text-accent-primary border-white/20 rounded focus:ring-accent-primary accent-accent-primary transition-all cursor-pointer"
                                            />
                                            <span className="text-[13px] text-neutral-400 leading-snug group-hover:text-neutral-300 transition-colors">
                                                I agree to the <a href="/terms" target="_blank" className="text-white hover:underline font-medium">Terms & Conditions</a> and <a href="/privacy-policy" target="_blank" className="text-white hover:underline font-medium">Privacy Policy</a>.
                                            </span>
                                        </label>
                                        
                                        <label className="flex items-start gap-3 cursor-pointer group">
                                            <input 
                                                type="checkbox" 
                                                checked={dpdpAccepted}
                                                onChange={e => setDpdpAccepted(e.target.checked)}
                                                className="mt-0.5 w-4 h-4 text-accent-primary border-white/20 rounded focus:ring-accent-primary accent-accent-primary transition-all cursor-pointer"
                                            />
                                            <span className="text-[13px] text-neutral-400 leading-snug group-hover:text-neutral-300 transition-colors">
                                                As a Data Fiduciary, I agree to comply with the <span className="text-white font-medium">Digital Personal Data Protection (DPDP) Act, 2023</span> and ensure verifiable consent from students/parents before adding their data to MathLogs.
                                            </span>
                                        </label>
                                    </div>
                                </div>

                                <button
                                    onClick={handleCheckout}
                                    disabled={isLoading || !termsAccepted || !dpdpAccepted}
                                    className="w-full whitespace-nowrap px-6 sm:px-8 py-4 sm:py-5 bg-white text-black rounded-2xl font-bold text-base sm:text-lg flex items-center justify-center gap-3 hover:bg-neutral-200 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-[0_0_40px_rgba(255,255,255,0.2)]"
                                >
                                    {isLoading ? (
                                        <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                        <>
                                            {isFreeTrial ? (
                                                <>
                                                    <Sparkles className="w-6 h-6" />
                                                    Start 14-Day Free Trial
                                                </>
                                            ) : (
                                                <>
                                                    <CreditCard className="w-6 h-6" />
                                                    {isQuizOnly ? (
                                                        <span>Pay ₹500 Securely</span>
                                                    ) : (
                                                        <span>
                                                            Pay ₹{(billingCycle === 'yearly'
                                                                ? pricingPlans.find(p => p.id === selectedPlan)?.yearlyPrice
                                                                : pricingPlans.find(p => p.id === selectedPlan)?.monthlyPrice)?.toLocaleString('en-IN')
                                                            } Securely
                                                        </span>
                                                    )}
                                                </>
                                            )}
                                        </>
                                    )}
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* RESEND SETUP LINK SECTION */}
                <div className="mt-10 mb-8">
                    <button
                        type="button"
                        onClick={() => { setShowResend(!showResend); setResendMessage(null); }}
                        className="w-full text-center text-sm font-semibold text-app-text-secondary hover:text-black transition-colors flex items-center justify-center gap-2 cursor-pointer"
                    >
                        <RotateCcw className="w-4 h-4" />
                        Already paid but didn't finish setup?
                    </button>

                    <AnimatePresence>
                        {showResend && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="overflow-hidden"
                            >
                                <div className="mt-4 bg-app-surface-opaque border border-black/5 rounded-2xl p-5 sm:p-6 shadow-sm">
                                    <p className="text-sm text-app-text-secondary mb-4">
                                        Enter the phone number you used during signup. We'll resend the setup link to your WhatsApp and email.
                                    </p>

                                    <div className="flex gap-3">
                                        <div className="relative flex-1">
                                            <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                            <input
                                                type="tel"
                                                value={resendPhone}
                                                onChange={(e) => { setResendPhone(e.target.value); setResendMessage(null); }}
                                                className="w-full bg-neutral-50 border border-gray-200 pl-11 pr-4 py-3 rounded-xl outline-none focus:border-black focus:ring-1 focus:ring-black/10 transition-all font-medium text-sm placeholder:text-gray-400"
                                                placeholder="+91 99999 99999"
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            disabled={resendPhone.length < 10 || resendLoading}
                                            onClick={async () => {
                                                setResendLoading(true);
                                                setResendMessage(null);
                                                try {
                                                    const res = await api.post<ResendSetupResponse>('/onboarding/resend-setup-link', { phone: resendPhone });
                                                    setResendMessage({ type: 'success', text: res.message || 'Setup link resent! Check your WhatsApp and email.' });
                                                    toast.success('Setup link resent!');
                                                } catch (error: unknown) {
                                                    const msg = getErrorMessage(error, 'Failed to resend. Please try again.');
                                                    setResendMessage({ type: 'error', text: msg });
                                                    toast.error(msg);
                                                } finally {
                                                    setResendLoading(false);
                                                }
                                            }}
                                            className="px-5 py-3 bg-black text-white rounded-xl font-bold text-sm hover:bg-neutral-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap cursor-pointer"
                                        >
                                            {resendLoading ? (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : (
                                                'Resend Link'
                                            )}
                                        </button>
                                    </div>

                                    {resendMessage && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -5 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className={`mt-3 p-3 rounded-xl text-sm font-medium ${
                                                resendMessage.type === 'success'
                                                    ? 'bg-green-50 text-green-700 border border-green-100'
                                                    : 'bg-red-50 text-red-600 border border-red-100'
                                            }`}
                                        >
                                            {resendMessage.text}
                                        </motion.div>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

            </div>
        </div>
    );
}
