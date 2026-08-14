/* eslint-disable */
import { useState, useEffect, useRef } from 'react';
import { CreditCard, Sparkles, Building, Check, CalendarCheck, CalendarOff, Info, AlertCircle, Crown, Store, ShieldCheck, X } from 'lucide-react';
import Layout from '../components/Layout';
import { api } from '../utils/api';
import toast from 'react-hot-toast';
import QuizBilling from './QuizBilling';

type PlanId = 'listing' | 'quiz' | 'all_inclusive' | 'custom';
type BillingCycle = 'monthly' | 'yearly';

interface BillingConfig {
    planName?: string;
    customPriceMonthly?: number;
    customPriceYearly?: number;
    maxStudents?: number;
}

interface InstituteBilling {
    plan?: string;
    config?: BillingConfig;
    teacherName?: string;
    email?: string;
    phoneNumber?: string;
    quizCredits?: number;
    planStartDate?: string | null;
    createdAt?: string | null;
    planExpiryDate?: string | null;
}

interface BillingCreateResponse {
    success: boolean;
    error?: string;
    keyId?: string;
    orderId?: string;
    amount?: number;
    currency?: string;
    subscriptionId?: string;
}

interface BillingCancelResponse {
    success: boolean;
    error?: string;
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
        id: 'listing',
        name: 'Marketplace Listing',
        icon: Store,
        monthlyPrice: 0,
        yearlyPrice: 0,
        period: 'free',
        description: 'Get listed on the MathLogs marketplace directory for free during our limited time offer!',
        limit: '100% Free Listing',
        features: [
            'Public Directory Profile Page',
            'Direct Student Lead Enquiries',
            'Google Maps Directions Link',
            '100% Free — No Credit Card Needed'
        ],
        popular: false,
    },
    {
        id: 'quiz',
        name: 'Quiz Starter',
        icon: Sparkles,
        monthlyPrice: 250,
        yearlyPrice: 2500,
        period: '/ month',
        description: 'Create & evaluate digital tests with automated grading and instant scorecards.',
        limit: '5 Credits / Month',
        features: [
            '5 Quiz Credits Included / Month',
            'Buy Extra Lifetime Credits',
            'Automated AI & Manual Test Builder',
            'Instant WhatsApp Scorecards',
            'Marketplace Profile Listing Included'
        ],
        popular: false,
    },
    {
        id: 'all_inclusive',
        name: 'All Inclusive ERP',
        icon: Building,
        monthlyPrice: 500,
        yearlyPrice: 5000,
        period: '/ month',
        description: 'Full coaching ERP — student records, attendance, fee collection, tests & directory listing.',
        limit: 'Complete Coaching ERP',
        features: [
            'Full Student Management & Batches',
            'Fee Collection & WhatsApp Dues Alerts',
            '5 Quiz Credits Included / Month',
            'Parent & Student Web Portals',
            'Coaching Directory Profile Page',
            '24/7 Dedicated Support'
        ],
        popular: true,
    }
];

export default function Billing() {
    const [institute, setInstitute] = useState<InstituteBilling | null>(null);
    const [loading, setLoading] = useState(true);
    const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);

    const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
    const [selectedPlan, setSelectedPlan] = useState<PlanId>('all_inclusive');
    const [showUpgradePlans, setShowUpgradePlans] = useState(false);
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [showQuizCreditsModal, setShowQuizCreditsModal] = useState(false);
    const [showCheckoutSummaryModal, setShowCheckoutSummaryModal] = useState(false);
    const [selectedCreditPack, setSelectedCreditPack] = useState<{ id: string; credits: number; price: number; oldPrice: number } | null>(null);
    const [showCreditsSummaryModal, setShowCreditsSummaryModal] = useState(false);
    const plansRef = useRef<HTMLDivElement>(null);

    // Hide bottom nav when any modal is open (prevents nav bleeding through bottom sheet)
    useEffect(() => {
        const anyModalOpen = showCancelModal || showQuizCreditsModal || showCheckoutSummaryModal || showCreditsSummaryModal;
        document.body.setAttribute('data-modal-open', anyModalOpen ? 'true' : 'false');
        return () => document.body.setAttribute('data-modal-open', 'false');
    }, [showCancelModal, showQuizCreditsModal, showCheckoutSummaryModal, showCreditsSummaryModal]);

    const formatDate = (dateString?: string | null) => {
        if (!dateString) return null;
        const d = new Date(dateString);
        if (isNaN(d.getTime())) return null;
        return d.toLocaleDateString('en-IN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    useEffect(() => {
        fetchInstituteDetails();
    }, []);

    const fetchInstituteDetails = async () => {
        try {
            const res = await api.get<InstituteBilling>('/institute/me');
            if (res) {
                setInstitute(res);
                if (res.quizCredits !== undefined) {
                    localStorage.setItem('quizCredits', String(res.quizCredits));
                }
                if (res.plan === 'PRO') setSelectedPlan('all_inclusive');
                else if (res.plan === 'BASIC') setSelectedPlan('quiz');
                else setSelectedPlan('listing');
            }
        } catch {
            toast.error('Failed to load billing details.');
        } finally {
            setLoading(false);
        }
    };

    // Detect custom plan from config
    const config = institute?.config || {};
    const isCustomPlan = config.planName === 'CUSTOM';
    const customMonthlyPrice = config.customPriceMonthly || 0;
    const customYearlyPrice = config.customPriceYearly || 0;
    const maxStudents = config.maxStudents || (institute?.plan === 'PRO' ? 500 : 100);

    const handleQuizCreditsCheckout = async (packId: string) => {
        setIsCheckoutLoading(true);
        try {
            const isLoaded = await loadScript('https://checkout.razorpay.com/v1/checkout.js');
            if (!isLoaded) {
                toast.error('Razorpay SDK failed to load. Are you online?');
                setIsCheckoutLoading(false);
                return;
            }

            const orderRes = await api.post<BillingCreateResponse>('/billing/create', {
                planId: packId,
                billingCycle: 'one-time'
            });

            if (!orderRes.success) {
                toast.error(orderRes.error || 'Failed to initialize payment order');
                setIsCheckoutLoading(false);
                return;
            }

            const options: RazorpayOptions = {
                key: orderRes.keyId,
                name: 'MathLogs Quiz Credits',
                description: `Purchase AI Quiz Credits (${packId.replace('quiz_credits_', '')} Credits)`,
                order_id: orderRes.orderId,
                amount: orderRes.amount,
                currency: orderRes.currency,
                handler: async (response: RazorpayHandlerResponse) => {
                    const toastId = toast.loading('Verifying payment...');
                    try {
                        const verifyRes = await api.post<{ success: boolean; message?: string }>('/billing/verify', {
                            ...response,
                            planId: packId,
                            billingCycle: 'one-time'
                        });

                        if (verifyRes.success) {
                            toast.success(verifyRes.message || 'Payment verified! Quiz credits added.', { id: toastId });
                            fetchInstituteDetails();
                            setShowQuizCreditsModal(false);
                        } else {
                            toast.error('Payment verification failed', { id: toastId });
                        }
                    } catch (err: unknown) {
                        toast.error(getErrorMessage(err, 'Verification failed'), { id: toastId });
                    } finally {
                        setIsCheckoutLoading(false);
                    }
                },
                prefill: {
                    name: institute?.teacherName || '',
                    email: institute?.email || '',
                    contact: institute?.phoneNumber || '',
                },
                theme: { color: '#2563eb' },
                modal: {
                    ondismiss: () => setIsCheckoutLoading(false)
                }
            };

            const razorpayWindow = window as WindowWithRazorpay;
            if (!razorpayWindow.Razorpay) {
                toast.error('Razorpay SDK is unavailable.');
                setIsCheckoutLoading(false);
                return;
            }

            const paymentObject = new razorpayWindow.Razorpay(options);
            paymentObject.open();

        } catch (error: unknown) {
            toast.error(getErrorMessage(error, 'Payment initialization failed.'));
            setIsCheckoutLoading(false);
        }
    };

    const handleCheckout = async () => {
        if (!selectedPlan && !isCustomPlan) return;
        setIsCheckoutLoading(true);

        try {
            const isLoaded = await loadScript('https://checkout.razorpay.com/v1/checkout.js');
            if (!isLoaded) {
                toast.error('Razorpay SDK failed to load. Are you online?');
                setIsCheckoutLoading(false);
                return;
            }

            const orderRes = await api.post<BillingCreateResponse>('/billing/create', {
                planId: isCustomPlan ? 'custom' : selectedPlan,
                billingCycle
            });

            if (!orderRes.success) {
                toast.error(orderRes.error || 'Failed to initialize payment order');
                setIsCheckoutLoading(false);
                return;
            }

            const options: RazorpayOptions = {
                key: orderRes.keyId,
                name: 'MathLogs Coaching System',
                description: `Subscription Payment (${selectedPlan.toUpperCase()} - ${billingCycle.toUpperCase()})`,
                handler: async (response: RazorpayHandlerResponse) => {
                    const toastId = toast.loading('Verifying payment details...');
                    try {
                        const verifyRes = await api.post<{ success: boolean; message?: string }>('/billing/verify', {
                            ...response,
                            planId: isCustomPlan ? 'custom' : selectedPlan,
                            billingCycle
                        });

                        if (verifyRes.success) {
                            toast.success(verifyRes.message || 'Payment verified successfully!', { id: toastId });
                            fetchInstituteDetails();
                            setShowUpgradePlans(false);
                        } else {
                            toast.error('Payment verification failed', { id: toastId });
                        }
                    } catch (err: unknown) {
                        toast.error(getErrorMessage(err, 'Verification failed'), { id: toastId });
                    } finally {
                        setIsCheckoutLoading(false);
                    }
                },
                prefill: {
                    name: institute?.teacherName || '',
                    email: institute?.email || '',
                    contact: institute?.phoneNumber || '',
                },
                theme: {
                    color: '#000000',
                },
                modal: {
                    ondismiss: () => {
                        setIsCheckoutLoading(false);
                    },
                },
            };

            if (billingCycle === 'yearly' || selectedPlan === 'listing') {
                options.order_id = orderRes.orderId;
                options.amount = orderRes.amount;
                options.currency = orderRes.currency;
            } else {
                options.subscription_id = orderRes.subscriptionId;
            }

            const razorpayWindow = window as WindowWithRazorpay;
            if (!razorpayWindow.Razorpay) {
                toast.error('Razorpay SDK is unavailable.');
                setIsCheckoutLoading(false);
                return;
            }

            const paymentObject = new razorpayWindow.Razorpay(options);

            paymentObject.on('payment.failed', (response: RazorpayFailureResponse) => {
                toast.error(response.error?.description || 'Payment Failed');
            });

            paymentObject.open();

        } catch (error: unknown) {
            toast.error(getErrorMessage(error, 'Payment initialization failed.'));
            setIsCheckoutLoading(false);
        }
    };

    const executeCancelSubscription = async () => {
        setIsCheckoutLoading(true);
        try {
            const res = await api.delete<BillingCancelResponse>('/billing/cancel');
            if (res.success) {
                toast.success('Subscription cancelled successfully.');
                fetchInstituteDetails();
            } else {
                toast.error(res.error || 'Failed to cancel subscription.');
            }
        } catch (error: unknown) {
            toast.error(getErrorMessage(error, 'An error occurred.'));
        } finally {
            setIsCheckoutLoading(false);
            setShowCancelModal(false);
        }
    };

    if (loading) {
        return (
            <Layout title="Billing & Subscription">
                <div className="flex bg-[#FAFAFA] items-center justify-center min-h-[50vh] rounded-3xl">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-black border-r-transparent"></div>
                </div>
            </Layout>
        );
    }

    const isQuizOnly = localStorage.getItem('isQuizOnly') === 'true';

    if (isQuizOnly) {
        return (
            <Layout title="Buy Credits">
                <QuizBilling
                    institute={institute}
                    fetchInstituteDetails={fetchInstituteDetails}
                    isCheckoutLoading={isCheckoutLoading}
                    setIsCheckoutLoading={setIsCheckoutLoading}
                    loadScript={loadScript}
                />
            </Layout>
        );
    }

    const today = new Date();
    const expiry = institute?.planExpiryDate ? new Date(institute.planExpiryDate) : null;
    const daysLeft = expiry ? Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : 999;
    const isExpiringSoon = daysLeft <= 14 && daysLeft >= 0;

    const customDisplayPrice = billingCycle === 'yearly' ? customYearlyPrice : customMonthlyPrice;
    const customDisplayPeriod = billingCycle === 'yearly' ? '/ year' : '/ month';

    const currentPlanName = isCustomPlan
        ? 'Custom Plan'
        : institute?.plan === 'PRO' ? 'Pro Plan'
        : institute?.plan === 'BASIC' ? 'Basic Plan'
        : institute?.plan === 'FREE' ? 'Free Plan'
        : 'View Only Mode';

    const startDateDisplay = formatDate(institute?.planStartDate) || formatDate(institute?.createdAt) || 'Active since registration';
    const expiryDateDisplay = formatDate(institute?.planExpiryDate) || 'No Expiry (Trial / Active)';

    return (
        <Layout title="Billing & Subscription">
            <div className="max-w-4xl mx-auto space-y-8 pb-10">
                {/* Header section with current plan info */}
                <div className="bg-white border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl p-6 lg:p-10 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-80 h-80 bg-accent/5 rounded-full blur-3xl -translate-y-1/2 -translate-x-1/2 pointer-events-none" />

                    <h3 className="text-xl font-bold text-app-text mb-1 flex items-center gap-2 relative z-10">
                        <CreditCard className="w-6 h-6" />
                        Billing & Subscription
                    </h3>
                    <p className="text-app-text-secondary text-sm mb-8 relative z-10">Manage your subscription plan, capacity limits, and billing cycle.</p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 relative z-10">
                        {/* Plan Info Card - High Contrast Black Container */}
                        <div className="col-span-1 md:col-span-2 bg-neutral-950 text-white rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden border border-neutral-800">
                            <div className="absolute bottom-0 right-0 w-80 h-80 bg-white/5 rounded-full blur-3xl translate-y-1/3 translate-x-1/3 pointer-events-none" />
                            
                            <div className="relative z-10 flex flex-col md:flex-row justify-between md:items-center gap-6">
                                <div>
                                    <p className="text-xs font-extrabold uppercase tracking-widest text-neutral-400 mb-1.5">Current Plan</p>
                                    <h4 className="text-2xl sm:text-3xl font-black !text-white flex items-center gap-3 flex-wrap" style={{ color: '#ffffff' }}>
                                        <span className="!text-white font-black" style={{ color: '#ffffff' }}>{currentPlanName}</span>
                                        {isCustomPlan && (
                                            <span className="text-xs font-bold bg-amber-400 text-black px-2.5 py-1 rounded-full uppercase tracking-wide flex items-center gap-1 shadow-sm">
                                                <Crown className="w-3.5 h-3.5" /> Custom
                                            </span>
                                        )}
                                        {(institute?.plan === 'PRO' || institute?.plan === 'BASIC') && !isCustomPlan && (
                                            <span className="text-xs font-bold bg-emerald-500 text-white px-2.5 py-1 rounded-full uppercase tracking-wide flex items-center gap-1 shadow-sm">
                                                <ShieldCheck className="w-3.5 h-3.5" /> Active
                                            </span>
                                        )}
                                        {institute?.plan === 'FREE' && (
                                            <span className="text-xs font-bold bg-blue-500 text-white px-2.5 py-1 rounded-full uppercase tracking-wide shadow-sm">
                                                Free Trial
                                            </span>
                                        )}
                                        {institute?.plan === 'NO_PLAN' && (
                                            <span className="text-xs font-bold bg-rose-500 text-white px-2.5 py-1 rounded-full uppercase tracking-wide shadow-sm">
                                                Paused
                                            </span>
                                        )}
                                    </h4>
                                    <p className="text-neutral-300 mt-2 text-sm font-medium">
                                        You are currently allowed up to <strong className="text-white font-extrabold">{maxStudents} students</strong> in your institute.
                                    </p>
                                    {isCustomPlan && customMonthlyPrice > 0 && (
                                        <p className="text-neutral-400 mt-1 text-xs">
                                            Custom pricing: ₹{customMonthlyPrice.toLocaleString('en-IN')}/mo · ₹{customYearlyPrice.toLocaleString('en-IN')}/yr
                                        </p>
                                    )}
                                </div>
                                <div className="flex flex-col gap-2.5 min-w-[200px]">
                                    <button
                                        onClick={() => {
                                            setShowUpgradePlans(true);
                                            setTimeout(() => plansRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
                                        }}
                                        className="w-full bg-white hover:bg-neutral-100 text-neutral-950 font-extrabold py-3.5 px-6 rounded-2xl transition-all shadow-lg active:scale-95 text-sm cursor-pointer"
                                    >
                                        {isCustomPlan
                                            ? 'Renew Custom Plan'
                                            : institute?.plan === 'PRO'
                                            ? 'Renew All Inclusive ERP'
                                            : institute?.plan === 'BASIC'
                                            ? 'Upgrade to All Inclusive ERP'
                                            : 'Upgrade Subscription'}
                                    </button>

                                    {!isCustomPlan && institute?.plan !== 'PRO' && (
                                        <button
                                            onClick={() => setShowCancelModal(true)}
                                            disabled={isCheckoutLoading}
                                            className="w-full bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold py-2.5 px-6 rounded-2xl transition-all text-xs active:scale-95 cursor-pointer"
                                        >
                                            Cancel Subscription
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Subscription Start Date */}
                        <div className="space-y-2">
                            <label className="block text-xs font-bold uppercase text-gray-500 mb-1.5 ml-1 tracking-wider">Subscription Start Date</label>
                            <div className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 text-app-text font-semibold shadow-sm flex items-center gap-3">
                                <CalendarCheck className="w-5 h-5 text-emerald-600" />
                                <span>{startDateDisplay}</span>
                            </div>
                        </div>

                        {/* Expiry / Renewal Date */}
                        <div className="space-y-2">
                            <label className="block text-xs font-bold uppercase text-gray-500 mb-1.5 ml-1 tracking-wider">Expiry / Renewal Date</label>
                            <div className={`w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 font-semibold shadow-sm flex items-center justify-between ${isExpiringSoon ? '!bg-red-50 !border-red-200 text-red-700' : 'text-app-text'}`}>
                                <div className="flex items-center gap-3">
                                    <CalendarOff className={`w-5 h-5 ${isExpiringSoon ? 'text-red-500' : 'text-amber-500'}`} />
                                    <span>{expiryDateDisplay}</span>
                                </div>
                                {isExpiringSoon && <span className="text-xs font-bold bg-red-100 text-red-600 px-3 py-1 rounded-full uppercase tracking-wider shadow-sm">Expiring Soon</span>}
                            </div>
                        </div>

                        {/* AI Quiz Credits Balance */}
                        <div className="space-y-2 col-span-1 md:col-span-2">
                            <label className="block text-xs font-bold uppercase text-gray-500 mb-1.5 ml-1 tracking-wider">AI Quiz Credits Balance</label>
                            <div className="w-full bg-blue-50/70 border border-blue-100 rounded-2xl px-5 py-4 text-app-text font-semibold shadow-xs flex items-center justify-between flex-wrap gap-3">
                                <div className="flex items-center gap-3">
                                    <Sparkles className="w-5 h-5 text-blue-600 shrink-0" />
                                    <span className="text-sm font-bold text-blue-950">
                                        {institute?.quizCredits ?? 0} Quiz Credits Available
                                    </span>
                                </div>
                                <button
                                    onClick={() => setShowQuizCreditsModal(true)}
                                    className="text-xs font-extrabold bg-blue-600 text-white px-4 py-2 rounded-xl shadow-xs hover:bg-blue-700 transition-all cursor-pointer flex items-center gap-1.5"
                                >
                                    <Sparkles className="w-3.5 h-3.5" /> Buy Extra Credits (₹250/pack)
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="bg-amber-50 border border-amber-200 text-amber-900 text-sm p-5 rounded-2xl flex items-start gap-4 relative z-10">
                        <Info className="w-5 h-5 shrink-0 mt-0.5 text-amber-600" />
                        <p className="leading-relaxed font-medium">
                            {isCustomPlan
                                ? 'You are on a custom plan configured by your administrator. To change your plan type or capacity, please contact support at '
                                : 'We recommend keeping your subscription active to avoid disruption. Your institute data remains completely safe after expiry, but you won\'t be able to add new students until renewed. Contact support at '}
                            <strong className="font-bold underline decoration-amber-400 underline-offset-2">+91 8439245302</strong> for instant assistance.
                        </p>
                    </div>
                </div>

                {/* UPGRADE / PLAN PICKER SECTION */}
                {showUpgradePlans && (
                    <div ref={plansRef} className="bg-white border border-gray-100 rounded-3xl p-6 sm:p-10 shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />

                        {isCustomPlan ? (
                            <>
                                <div className="mb-8 pl-1">
                                    <h2 className="text-xl font-bold tracking-tight mb-1">Renew Your Custom Plan</h2>
                                    <p className="text-app-text-tertiary text-sm font-medium">Your plan has been specially configured for your institute. Select your billing cycle and renew below.</p>
                                </div>

                                <div className="flex justify-center mb-8 relative z-10">
                                    <div className="bg-neutral-100 p-1.5 rounded-2xl flex items-center shadow-inner overflow-hidden">
                                        {customMonthlyPrice > 0 && (
                                            <button
                                                onClick={() => setBillingCycle('monthly')}
                                                className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all focus:outline-none cursor-pointer ${billingCycle === 'monthly' ? 'bg-white text-black shadow-sm' : 'text-gray-500 hover:text-black'}`}
                                            >
                                                Monthly
                                            </button>
                                        )}
                                        {customYearlyPrice > 0 && (
                                            <button
                                                onClick={() => setBillingCycle('yearly')}
                                                className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all focus:outline-none cursor-pointer ${billingCycle === 'yearly' ? 'bg-white text-black shadow-sm' : 'text-gray-500 hover:text-black'}`}
                                            >
                                                Yearly
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="max-w-md mx-auto mb-8">
                                    <div className="relative p-6 rounded-3xl border-2 border-black bg-white shadow-xl">
                                        <div className="absolute top-0 right-6 bg-gradient-to-r from-amber-400 to-orange-500 text-black text-[10px] font-bold uppercase tracking-widest py-1 px-3 rounded-b-lg flex items-center gap-1 shadow-sm">
                                            <Crown className="w-3 h-3" /> Custom Plan
                                        </div>

                                        <div className="flex items-center gap-4 mb-5">
                                            <div className="p-3 rounded-2xl bg-black text-white">
                                                <Crown className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <h3 className="text-lg font-bold text-app-text">Custom Plan</h3>
                                                <p className="font-semibold text-accent-primary text-sm">Up to {maxStudents} Students</p>
                                            </div>
                                        </div>

                                        <div className="mb-6">
                                            <div className="flex items-baseline gap-1">
                                                <span className="text-3xl font-extrabold tracking-tighter">₹{customDisplayPrice.toLocaleString('en-IN')}</span>
                                                <span className="text-app-text-tertiary font-bold text-sm">{customDisplayPeriod}</span>
                                            </div>
                                            <p className="text-app-text-secondary mt-2 font-medium text-xs leading-relaxed">
                                                Custom tier configured for your coaching capacity.
                                            </p>
                                        </div>

                                        <div className="space-y-3 pt-5 border-t border-app-border">
                                            {['Unlimited Batches', 'Automated Grading', 'WhatsApp Alerts', `Up to ${maxStudents} Students`].map((feature, featureIdx) => (
                                                <div key={featureIdx} className="flex items-start gap-3">
                                                    <Check className="w-5 h-5 text-black shrink-0" />
                                                    <span className="text-sm font-semibold text-app-text-secondary">{feature}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-black text-white rounded-3xl p-6 sm:p-8 flex flex-col md:flex-row items-center justify-between gap-6 overflow-hidden relative">
                                    <div className="relative z-10 w-full md:max-w-md">
                                        <h3 className="text-xl font-extrabold text-white tracking-tight mb-2">Renew Custom Plan</h3>
                                        <p className="text-neutral-400 font-medium text-sm leading-relaxed mb-4">
                                            You're renewing your <span className="text-white font-bold">Custom Plan</span> ({billingCycle}). Access will be extended automatically upon payment.
                                        </p>
                                    </div>

                                    <button
                                        onClick={handleCheckout}
                                        disabled={isCheckoutLoading || customDisplayPrice <= 0}
                                        className="relative z-10 w-full md:w-auto whitespace-nowrap px-8 py-4 bg-white text-black rounded-2xl font-bold text-base flex items-center justify-center gap-3 hover:bg-neutral-100 transition-all active:scale-95 disabled:opacity-70 cursor-pointer shadow-[0_0_30px_rgba(255,255,255,0.15)]"
                                    >
                                        {isCheckoutLoading ? (
                                            <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                                        ) : (
                                            <>
                                                <CreditCard className="w-5 h-5" />
                                                Pay ₹{customDisplayPrice.toLocaleString('en-IN')} Securely
                                            </>
                                        )}
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="mb-8 pl-1">
                                    <h2 className="text-xl font-bold tracking-tight mb-1">Upgrade or Renew Subscription</h2>
                                    <p className="text-app-text-tertiary text-sm font-medium">Select the student capacity tier that best aligns with your coaching growth.</p>
                                </div>

                                {/* Billing Cycle Toggle */}
                                <div className="flex justify-center mb-8 relative z-10">
                                    <div className="bg-neutral-100 p-1.5 rounded-2xl flex items-center shadow-inner overflow-hidden">
                                        <button
                                            onClick={() => setBillingCycle('monthly')}
                                            className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all focus:outline-none cursor-pointer ${billingCycle === 'monthly' ? 'bg-white text-black shadow-sm' : 'text-gray-500 hover:text-black'}`}
                                        >
                                            Monthly (Autopay)
                                        </button>
                                        <button
                                            onClick={() => setBillingCycle('yearly')}
                                            className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all focus:outline-none flex items-center gap-2 cursor-pointer ${billingCycle === 'yearly' ? 'bg-white text-black shadow-sm' : 'text-gray-500 hover:text-black'}`}
                                        >
                                            Yearly
                                            <span className={`px-2 py-0.5 rounded-md text-[10px] uppercase tracking-widest font-black ${billingCycle === 'yearly' ? 'bg-emerald-100 text-emerald-800' : 'bg-black/10 text-black'}`}>Save ~17%</span>
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 relative z-10">
                                    {pricingPlans.map((plan) => {
                                        const displayPrice = billingCycle === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;
                                        const displayPeriod = plan.period === 'free' ? 'free' : (billingCycle === 'yearly' ? '/ year' : '/ month');
                                        const isSelected = selectedPlan === plan.id;
                                        const isCurrent = (institute?.plan === 'PRO' && plan.id === 'all_inclusive') ||
                                                          (institute?.plan === 'BASIC' && plan.id === 'quiz') ||
                                                          (institute?.plan === 'FREE' && plan.id === 'listing');

                                        return (
                                            <div
                                                key={plan.id}
                                                onClick={() => setSelectedPlan(plan.id as PlanId)}
                                                className={`relative cursor-pointer transition-all duration-300 p-6 rounded-3xl border flex flex-col justify-between ${isSelected
                                                    ? 'border-black bg-white shadow-xl ring-2 ring-black scale-[1.02]'
                                                    : 'border-gray-100 bg-gray-50 hover:bg-white hover:border-gray-300 hover:shadow-lg'
                                                    }`}
                                            >
                                                {isCurrent && (
                                                    <div className="absolute top-0 right-6 bg-emerald-500 text-white text-[10px] font-bold uppercase tracking-widest py-1 px-3 rounded-b-lg flex items-center gap-1 shadow-sm">
                                                        <ShieldCheck className="w-3 h-3" /> Current Plan
                                                    </div>
                                                )}
                                                {plan.popular && !isCurrent && (
                                                    <div className="absolute top-0 right-6 bg-gradient-to-r from-amber-400 to-orange-500 text-black text-[10px] font-bold uppercase tracking-widest py-1 px-3 rounded-b-lg flex items-center gap-1 shadow-sm">
                                                        <Sparkles className="w-3 h-3" /> Most Popular
                                                    </div>
                                                )}

                                                <div>
                                                    <div className="flex items-center gap-3 mb-4">
                                                        <div className={`p-3 rounded-2xl ${isSelected ? 'bg-black text-white' : 'bg-neutral-200 text-neutral-700'}`}>
                                                            <plan.icon className="w-5 h-5" />
                                                        </div>
                                                        <div>
                                                            <h3 className="text-base font-bold text-app-text">{plan.name}</h3>
                                                            <p className="font-bold text-accent-primary text-xs">{plan.limit}</p>
                                                        </div>
                                                    </div>

                                                    <div className="mb-5">
                                                        <div className="flex items-baseline gap-1">
                                                            <span className="text-3xl font-black tracking-tighter">₹{displayPrice.toLocaleString('en-IN')}</span>
                                                            <span className="text-app-text-tertiary font-bold text-xs">{displayPeriod}</span>
                                                        </div>
                                                        <p className="text-app-text-secondary mt-2 font-medium text-xs leading-relaxed">{plan.description}</p>
                                                    </div>

                                                    <div className="space-y-2.5 pt-4 border-t border-app-border">
                                                        {plan.features.map((feature, featureIdx) => (
                                                            <div key={featureIdx} className="flex items-start gap-2.5">
                                                                <Check className="w-4 h-4 text-black shrink-0 mt-0.5" />
                                                                <span className="text-xs font-semibold text-app-text-secondary">{feature}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>

                                                <div className={`mt-6 w-full py-3 rounded-xl font-bold text-xs text-center transition-colors ${isSelected ? 'bg-black text-white' : 'bg-neutral-200 text-neutral-800'
                                                    }`}>
                                                    {isSelected ? 'Selected Plan' : 'Select Plan'}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Proceed to Checkout CTA Bar */}
                                <div className="bg-neutral-950 text-white rounded-3xl p-6 sm:p-8 flex flex-col md:flex-row items-center justify-between gap-6 overflow-hidden relative border border-neutral-800 shadow-xl">
                                    <div className="relative z-10 w-full md:max-w-md">
                                        <h3 className="text-xl font-extrabold !text-white tracking-tight mb-1.5" style={{ color: '#ffffff' }}>
                                            Ready to Continue?
                                        </h3>
                                        <p className="text-neutral-300 font-medium text-sm leading-relaxed" style={{ color: '#d4d4d4' }}>
                                            Selected: <span className="!text-white font-extrabold" style={{ color: '#ffffff' }}>{pricingPlans.find(p => p.id === selectedPlan)?.name}</span> · <span className="!text-white font-semibold" style={{ color: '#ffffff' }}>₹{((billingCycle === 'yearly' ? pricingPlans.find(p => p.id === selectedPlan)?.yearlyPrice : pricingPlans.find(p => p.id === selectedPlan)?.monthlyPrice) || 0).toLocaleString('en-IN')}</span> {billingCycle === 'yearly' ? '/ year' : '/ month'}
                                        </p>
                                    </div>

                                    <button
                                        onClick={() => setShowCheckoutSummaryModal(true)}
                                        disabled={!selectedPlan}
                                        className="relative z-10 w-full md:w-auto whitespace-nowrap px-8 py-4 bg-white text-black rounded-2xl font-bold text-base flex items-center justify-center gap-3 hover:bg-neutral-100 transition-all active:scale-95 disabled:opacity-70 cursor-pointer shadow-xl"
                                    >
                                        <CreditCard className="w-5 h-5" />
                                        Review Order
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Checkout Summary Confirmation Modal */}
            {showCheckoutSummaryModal && (() => {
                const plan = pricingPlans.find(p => p.id === selectedPlan);
                const price = billingCycle === 'yearly' ? plan?.yearlyPrice : plan?.monthlyPrice;
                const period = billingCycle === 'yearly' ? 'year' : 'month';
                const saving = plan && billingCycle === 'yearly' ? (plan.monthlyPrice * 12 - plan.yearlyPrice) : 0;
                return (
                    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex flex-col justify-end sm:justify-center sm:items-center sm:p-4 overflow-hidden">
                        <div className="bg-white rounded-t-[32px] sm:rounded-3xl w-full sm:max-w-md shadow-2xl border border-neutral-100 animate-in slide-in-from-bottom-4 sm:zoom-in duration-300 max-h-[92dvh] overflow-y-auto">
                            {/* Drag handle */}
                            <div className="flex justify-center pt-3 pb-1 sm:hidden">
                                <div className="w-10 h-1 rounded-full bg-neutral-200" />
                            </div>
                            {/* Modal Header */}
                            <div className="flex items-start justify-between p-6 pb-0">
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-1">Order Review</p>
                                    <h2 className="text-2xl font-black text-neutral-900 tracking-tight">Confirm your plan</h2>
                                </div>
                                <button
                                    onClick={() => setShowCheckoutSummaryModal(false)}
                                    className="p-2 rounded-full hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 transition-colors cursor-pointer mt-1"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Plan Card */}
                            <div className="mx-6 mt-5 p-5 bg-neutral-950 rounded-2xl text-white">
                                <div className="flex items-center gap-3 mb-4">
                                    {plan && <div className="p-2.5 bg-white/10 rounded-xl"><plan.icon className="w-5 h-5 text-white" /></div>}
                                    <div>
                                        <p className="font-black text-base text-white">{plan?.name}</p>
                                        <p className="text-neutral-400 text-xs font-medium">{plan?.limit}</p>
                                    </div>
                                </div>
                                <div className="flex items-baseline gap-1 mb-2">
                                    <span className="text-4xl font-black text-white">₹{(price || 0).toLocaleString('en-IN')}</span>
                                    <span className="text-neutral-400 text-sm font-semibold">/ {period}</span>
                                </div>
                                {billingCycle === 'yearly' && saving > 0 && (
                                    <span className="inline-flex items-center gap-1 bg-emerald-500/20 text-emerald-400 text-xs font-bold px-2.5 py-1 rounded-full">
                                        <Check className="w-3 h-3" /> Save ₹{saving.toLocaleString('en-IN')} vs monthly billing
                                    </span>
                                )}
                            </div>

                            {/* Features */}
                            <div className="mx-6 mt-5">
                                <p className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-3">What's included</p>
                                <div className="space-y-2.5">
                                    {plan?.features.map((feat, i) => (
                                        <div key={i} className="flex items-start gap-2.5">
                                            <div className="w-4 h-4 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 mt-0.5">
                                                <Check className="w-2.5 h-2.5 text-emerald-600" />
                                            </div>
                                            <span className="text-sm text-neutral-700 font-medium">{feat}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Billing breakdown */}
                            <div className="mx-6 mt-5 p-4 bg-neutral-50 border border-neutral-100 rounded-2xl space-y-2.5">
                                <div className="flex justify-between text-sm">
                                    <span className="text-neutral-500 font-medium">Billing cycle</span>
                                    <span className="font-bold text-neutral-900 capitalize">{billingCycle}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-neutral-500 font-medium">Amount due today</span>
                                    <span className="font-black text-neutral-900">₹{(price || 0).toLocaleString('en-IN')}</span>
                                </div>
                                <div className="pt-2 border-t border-neutral-200 flex justify-between text-sm">
                                    <span className="text-neutral-500 font-medium">Activation</span>
                                    <span className="font-bold text-emerald-600">Instant upon payment</span>
                                </div>
                            </div>

                            {/* CTA Buttons */}
                            <div className="p-6 pt-5 space-y-3">
                                <button
                                    onClick={() => {
                                        setShowCheckoutSummaryModal(false);
                                        handleCheckout();
                                    }}
                                    disabled={isCheckoutLoading}
                                    className="w-full py-4 bg-neutral-950 hover:bg-black text-white font-black rounded-2xl flex items-center justify-center gap-2.5 transition-all active:scale-95 disabled:opacity-70 cursor-pointer shadow-lg text-base"
                                >
                                    {isCheckoutLoading ? (
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <>
                                            <CreditCard className="w-5 h-5" />
                                            Confirm & Pay ₹{(price || 0).toLocaleString('en-IN')}
                                        </>
                                    )}
                                </button>
                                <button
                                    onClick={() => setShowCheckoutSummaryModal(false)}
                                    className="w-full py-3 text-neutral-500 hover:text-neutral-800 font-semibold text-sm transition-colors cursor-pointer"
                                >
                                    ← Go back and change plan
                                </button>
                            </div>

                            <p className="text-center text-xs text-neutral-400 font-medium pb-5 px-6">
                                🔒 Secured by Razorpay · Your data is always safe
                            </p>
                        </div>
                    </div>
                );
            })()}

            {/* Buy Extra Quiz Credits — Pack Selection Modal */}
            {showQuizCreditsModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex flex-col justify-end sm:justify-center sm:items-center sm:p-4 overflow-hidden">
                    <div className="bg-white rounded-t-[32px] sm:rounded-3xl w-full sm:max-w-lg shadow-2xl border border-neutral-200 animate-in slide-in-from-bottom-4 sm:zoom-in duration-300 max-h-[92dvh] overflow-y-auto relative">
                        {/* Drag handle */}
                        <div className="flex justify-center pt-3 pb-1 sm:hidden">
                            <div className="w-10 h-1 rounded-full bg-neutral-200" />
                        </div>
                        <div className="p-6 sm:p-8">
                        <button
                            onClick={() => setShowQuizCreditsModal(false)}
                            className="absolute top-5 right-5 p-2 rounded-full hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 transition-colors cursor-pointer"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                                <Sparkles className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="text-xl font-extrabold text-neutral-900">Buy Quiz Credits</h3>
                                <p className="text-xs font-semibold text-neutral-500">1 Credit = 1 AI Quiz Generation · Lifetime Validity</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3.5 my-6">
                            {[
                                { id: 'quiz_credits_5', credits: 5, price: 250, popular: false, oldPrice: 500 },
                                { id: 'quiz_credits_10', credits: 10, price: 500, popular: false, oldPrice: 1000 },
                                { id: 'quiz_credits_25', credits: 25, price: 1000, popular: true, oldPrice: 2000 },
                                { id: 'quiz_credits_40', credits: 40, price: 1500, popular: false, oldPrice: 3000 }
                            ].map((pkg) => {
                                const isSelected = selectedCreditPack?.id === pkg.id;
                                return (
                                    <div
                                        key={pkg.id}
                                        onClick={() => setSelectedCreditPack(pkg)}
                                        className={`relative cursor-pointer p-4 rounded-2xl border-2 transition-all duration-200 flex flex-col justify-between ${
                                            isSelected
                                                ? 'border-blue-600 bg-blue-50/60 ring-2 ring-blue-600/20 shadow-md scale-[1.02]'
                                                : pkg.popular
                                                ? 'border-blue-300 bg-blue-50/30 hover:border-blue-500'
                                                : 'border-neutral-200 hover:border-blue-400 hover:bg-blue-50/10'
                                        }`}
                                    >
                                        {pkg.popular && !isSelected && (
                                            <span className="absolute -top-2.5 right-3 bg-blue-600 text-white text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shadow-xs">
                                                Most Popular
                                            </span>
                                        )}
                                        {isSelected && (
                                            <span className="absolute -top-2.5 right-3 bg-emerald-600 text-white text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shadow-xs flex items-center gap-1">
                                                <Check className="w-2.5 h-2.5" /> Selected
                                            </span>
                                        )}
                                        <div>
                                            <span className="text-base font-black text-neutral-900">{pkg.credits} Credits</span>
                                            <div className="flex items-baseline gap-1.5 mt-1">
                                                <span className={`text-xl font-black ${isSelected ? 'text-blue-700' : 'text-blue-600'}`}>₹{pkg.price}</span>
                                                <span className="text-xs text-neutral-400 line-through">₹{pkg.oldPrice}</span>
                                            </div>
                                            <p className="text-[11px] text-neutral-400 mt-1 font-medium">₹{(pkg.price / pkg.credits).toFixed(0)} per credit</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                            <button
                                disabled={!selectedCreditPack}
                                onClick={() => {
                                    if (selectedCreditPack) {
                                        setShowQuizCreditsModal(false);
                                        setShowCreditsSummaryModal(true);
                                    }
                                }}
                                className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95 cursor-pointer shadow-md text-sm"
                            >
                                <CreditCard className="w-4 h-4" />
                                {selectedCreditPack ? `Review Order · ₹${selectedCreditPack.price}` : 'Select a pack to continue'}
                            </button>

                            <p className="text-neutral-400 text-xs text-center mt-3 pb-1 font-medium">Credits never expire and roll over automatically.</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Quiz Credits — Checkout Summary Modal */}
            {showCreditsSummaryModal && selectedCreditPack && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex flex-col justify-end sm:justify-center sm:items-center sm:p-4 overflow-hidden">
                    <div className="bg-white rounded-t-[32px] sm:rounded-3xl w-full sm:max-w-md shadow-2xl border border-neutral-100 animate-in slide-in-from-bottom-4 sm:zoom-in duration-300 max-h-[92dvh] overflow-y-auto">
                        {/* Drag handle */}
                        <div className="flex justify-center pt-3 pb-1 sm:hidden">
                            <div className="w-10 h-1 rounded-full bg-neutral-200" />
                        </div>
                        {/* Header */}
                        <div className="flex items-start justify-between p-6 pb-0">
                            <div>
                                <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-1">Order Review</p>
                                <h2 className="text-2xl font-black text-neutral-900 tracking-tight">Confirm your credits</h2>
                            </div>
                            <button
                                onClick={() => { setShowCreditsSummaryModal(false); setShowQuizCreditsModal(true); }}
                                className="p-2 rounded-full hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 transition-colors cursor-pointer mt-1"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Credit Pack Card */}
                        <div className="mx-6 mt-5 p-5 bg-blue-600 rounded-2xl text-white">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2.5 bg-white/15 rounded-xl">
                                    <Sparkles className="w-5 h-5 text-white" />
                                </div>
                                <div>
                                    <p className="font-black text-base text-white">{selectedCreditPack.credits} AI Quiz Credits</p>
                                    <p className="text-blue-100 text-xs font-medium">Lifetime validity · Never expires</p>
                                </div>
                            </div>
                            <div className="flex items-baseline gap-2 mb-1">
                                <span className="text-4xl font-black text-white">₹{selectedCreditPack.price}</span>
                                <span className="text-blue-200 text-sm font-semibold line-through">₹{selectedCreditPack.oldPrice}</span>
                            </div>
                            <span className="inline-flex items-center gap-1 bg-white/15 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                                <Check className="w-3 h-3" /> {Math.round((1 - selectedCreditPack.price / selectedCreditPack.oldPrice) * 100)}% off — Save ₹{selectedCreditPack.oldPrice - selectedCreditPack.price}
                            </span>
                        </div>

                        {/* What you get */}
                        <div className="mx-6 mt-5">
                            <p className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-3">What you get</p>
                            <div className="space-y-2.5">
                                {[
                                    `${selectedCreditPack.credits} AI quiz generation credits`,
                                    `₹${(selectedCreditPack.price / selectedCreditPack.credits).toFixed(0)} per quiz generated`,
                                    'Credits roll over — never expire',
                                    'Instant credit top-up on payment',
                                    'Works across all batches & topics',
                                ].map((item, i) => (
                                    <div key={i} className="flex items-start gap-2.5">
                                        <div className="w-4 h-4 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                                            <Check className="w-2.5 h-2.5 text-blue-600" />
                                        </div>
                                        <span className="text-sm text-neutral-700 font-medium">{item}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Billing breakdown */}
                        <div className="mx-6 mt-5 p-4 bg-neutral-50 border border-neutral-100 rounded-2xl space-y-2.5">
                            <div className="flex justify-between text-sm">
                                <span className="text-neutral-500 font-medium">Pack size</span>
                                <span className="font-bold text-neutral-900">{selectedCreditPack.credits} Credits</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-neutral-500 font-medium">Original price</span>
                                <span className="font-medium text-neutral-400 line-through">₹{selectedCreditPack.oldPrice}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-neutral-500 font-medium">Amount due today</span>
                                <span className="font-black text-neutral-900">₹{selectedCreditPack.price}</span>
                            </div>
                            <div className="pt-2 border-t border-neutral-200 flex justify-between text-sm">
                                <span className="text-neutral-500 font-medium">Credits added</span>
                                <span className="font-bold text-emerald-600">Instantly upon payment</span>
                            </div>
                        </div>

                        {/* CTAs */}
                        <div className="p-6 pt-5 space-y-3">
                            <button
                                onClick={() => {
                                    setShowCreditsSummaryModal(false);
                                    handleQuizCreditsCheckout(selectedCreditPack.id);
                                }}
                                disabled={isCheckoutLoading}
                                className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-2xl flex items-center justify-center gap-2.5 transition-all active:scale-95 disabled:opacity-70 cursor-pointer shadow-lg text-base"
                            >
                                {isCheckoutLoading ? (
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <>
                                        <CreditCard className="w-5 h-5" />
                                        Confirm & Pay ₹{selectedCreditPack.price}
                                    </>
                                )}
                            </button>
                            <button
                                onClick={() => { setShowCreditsSummaryModal(false); setShowQuizCreditsModal(true); }}
                                className="w-full py-3 text-neutral-500 hover:text-neutral-800 font-semibold text-sm transition-colors cursor-pointer"
                            >
                                ← Choose a different pack
                            </button>
                        </div>

                        <p className="text-center text-xs text-neutral-400 font-medium pb-5 px-6">
                            🔒 Secured by Razorpay · Your credits are always safe
                        </p>
                    </div>
                </div>
            )}

            {/* Cancel Subscription Modal */}
            {showCancelModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-neutral-200 animate-in fade-in zoom-in duration-200">
                        <div className="flex items-center gap-4 mb-5">
                            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center shrink-0">
                                <AlertCircle className="w-6 h-6 text-red-600" />
                            </div>
                            <div>
                                <h3 className="text-lg font-extrabold text-neutral-900">
                                    {institute?.plan === 'PRO' ? 'Downgrade Plan' : 'Cancel Subscription'}
                                </h3>
                                <p className="text-neutral-500 text-xs font-semibold mt-0.5">
                                    {institute?.plan === 'PRO' ? 'Are you sure you want to downgrade?' : 'Are you sure you want to cancel auto-renewal?'}
                                </p>
                            </div>
                        </div>
                        <p className="text-neutral-600 text-sm mb-6 leading-relaxed">
                            {institute?.plan === 'PRO'
                                ? 'Your auto-renewal will be canceled. You will continue to have full access until your current billing period ends.'
                                : 'Your auto-renewal will be canceled. Your coaching data remains completely safe and accessible.'}
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowCancelModal(false)}
                                disabled={isCheckoutLoading}
                                className="flex-1 py-3 px-4 bg-neutral-100 border border-neutral-200 text-neutral-800 font-bold rounded-xl hover:bg-neutral-200 transition-colors text-xs cursor-pointer"
                            >
                                Keep Active
                            </button>
                            <button
                                onClick={executeCancelSubscription}
                                disabled={isCheckoutLoading}
                                className="flex-1 py-3 px-4 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors flex items-center justify-center gap-2 text-xs cursor-pointer shadow-md"
                            >
                                {isCheckoutLoading ? (
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    institute?.plan === 'PRO' ? 'Confirm Downgrade' : 'Confirm Cancel'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </Layout>
    );
}
