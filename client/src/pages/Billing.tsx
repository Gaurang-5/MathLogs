import { useState, useEffect, useRef } from 'react';
import { CreditCard, Sparkles, Building, Check, CalendarCheck, CalendarOff, Info, AlertCircle } from 'lucide-react';
import Layout from '../components/Layout';
import { api } from '../utils/api';
import toast from 'react-hot-toast';

const loadScript = (src: string) => {
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

export default function Billing() {
    const [institute, setInstitute] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);
    
    const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('yearly');
    const [selectedPlan, setSelectedPlan] = useState<'basic' | 'pro' | null>(null);
    const [showUpgradePlans, setShowUpgradePlans] = useState(false);
    const [showCancelModal, setShowCancelModal] = useState(false);
    const plansRef = useRef<HTMLDivElement>(null);

    const formatDate = (dateString: string | null) => {
        if (!dateString) return 'Not Available';
        return new Date(dateString).toLocaleDateString('en-IN', {
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
            const res = await api.get('/institute/me');
            if (res) {
                setInstitute(res);
                if (res.plan === 'PRO') setSelectedPlan('pro');
                else setSelectedPlan('basic');
            }
        } catch (error) {
            toast.error('Failed to load billing details.');
        } finally {
            setLoading(false);
        }
    };

    const handleCheckout = async () => {
        if (!selectedPlan) return;
        setIsCheckoutLoading(true);
        
        try {
            const isLoaded = await loadScript('https://checkout.razorpay.com/v1/checkout.js');
            if (!isLoaded) {
                toast.error('Razorpay SDK failed to load. Are you online?');
                setIsCheckoutLoading(false);
                return;
            }

            const orderRes = await api.post('/billing/create', {
                planId: selectedPlan,
                billingCycle,
            });

            if (!orderRes.success) {
                toast.error(orderRes.error || 'Failed to initialize billing.');
                setIsCheckoutLoading(false);
                return;
            }

            const options: any = {
                key: orderRes.keyId,
                name: 'MathLogs',
                description: 'MathLogs License Upgrade',
                handler: async function (response: any) {
                    try {
                        const verifyRes = await api.post('/billing/verify', {
                            razorpay_order_id: response.razorpay_order_id,
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_signature: response.razorpay_signature,
                            razorpay_subscription_id: response.razorpay_subscription_id,
                            planId: selectedPlan,
                            billingCycle,
                        });

                        if (verifyRes.success) {
                            toast.success('Payment verified! Your plan has been upgraded.');
                            fetchInstituteDetails(); // Refresh
                        } else {
                            toast.error('Payment verification failed.');
                        }
                    } catch (err: any) {
                        toast.error(err.message || 'Verification Error');
                    }
                },
                prefill: {
                    name: institute?.teacherName || '',
                    email: institute?.email || '',
                    contact: institute?.phoneNumber || '',
                },
                theme: {
                    color: '#0071e3',
                },
                modal: {
                    ondismiss: function () {
                        setIsCheckoutLoading(false);
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

            const paymentObject = new (window as any).Razorpay(options);

            paymentObject.on('payment.failed', async function (response: any) {
                toast.error(response.error.description || 'Payment Failed');
            });

            paymentObject.open();

        } catch (err: any) {
            toast.error(err.message || 'Payment initialization failed.');
            setIsCheckoutLoading(false);
        }
    };

    const executeCancelSubscription = async () => {
        setIsCheckoutLoading(true);
        try {
            const res = await api.delete('/billing/cancel');
            if (res.success) {
                toast.success('Subscription cancelled successfully.');
                fetchInstituteDetails(); 
            } else {
                toast.error(res.error || 'Failed to cancel subscription.');
            }
        } catch (err: any) {
            toast.error(err.message || 'An error occurred.');
        } finally {
            setIsCheckoutLoading(false);
            setShowCancelModal(false);
        }
    };

    if (loading) {
        return (
            <Layout title="Billing & Subscription">
                <div className="flex bg-app-bg items-center justify-center min-h-[50vh]">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent-primary"></div>
                </div>
            </Layout>
        );
    }

    const today = new Date();
    const expiry = institute?.planExpiryDate ? new Date(institute.planExpiryDate) : null;
    const daysLeft = expiry ? Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : 0;
    const isExpiringSoon = daysLeft <= 14; // e.g. within 14 days

    return (
        <Layout title="Billing & Subscription">
            <div className="max-w-4xl mx-auto space-y-8 pb-10">
                {/* Header section with current plan info */}
                <div className="bg-app-surface-opaque border border-app-border rounded-[24px] p-6 lg:p-10">
                    <h3 className="text-xl font-bold text-app-text mb-1 flex items-center gap-2">
                        <CreditCard className="w-6 h-6" />
                        Billing & Subscription
                    </h3>
                    <p className="text-app-text-secondary text-sm mb-8">Manage your subscription plan, capacity limits, and billing cycle.</p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                        {/* Plan Info Card */}
                        <div className="col-span-1 md:col-span-2 bg-black dark:bg-white text-white dark:text-black border border-black dark:border-white rounded-2xl p-6 shadow-xl relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
                            <div className="relative z-10 flex flex-col md:flex-row justify-between md:items-center gap-4">
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-widest opacity-70 mb-1 text-white dark:text-black">Current Plan</p>
                                    <h4 className="text-3xl font-black flex items-center gap-3 !text-white dark:!text-black">
                                        {institute?.plan === 'PRO' ? 'Pro Plan' : institute?.plan === 'BASIC' ? 'Basic Plan' : institute?.plan === 'FREE' ? 'Free Plan' : 'View Only Mode'}
                                        {institute?.plan === 'PRO' && (
                                            <span className="text-xs font-bold bg-white text-black px-2 py-1 rounded-md uppercase tracking-wide">
                                                Active
                                            </span>
                                        )}
                                        {institute?.plan === 'NO_PLAN' && (
                                            <span className="text-xs font-bold bg-red-500 text-white px-2 py-1 rounded-md uppercase tracking-wide">
                                                Paused
                                            </span>
                                        )}
                                    </h4>
                                    <p className="opacity-80 mt-2 text-sm">
                                        You are currently allowed up to <strong className="text-white dark:text-black">{institute?.plan === 'PRO' ? '250' : institute?.plan === 'BASIC' || institute?.plan === 'FREE' ? '100' : '0'} students</strong> in your institute.
                                    </p>
                                </div>
                                <div className="flex flex-col gap-2 min-w-[200px]">
                                    <button 
                                        onClick={() => {
                                            setShowUpgradePlans(true);
                                            setTimeout(() => plansRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
                                        }} 
                                        className="w-full bg-white dark:bg-black text-black dark:text-white font-bold py-3 px-6 rounded-xl hover:scale-105 transition-all shadow-lg active:scale-95 text-sm"
                                    >
                                        Upgrade Plan
                                    </button>
                                    {isExpiringSoon && (
                                        <button 
                                            onClick={() => {
                                                setShowUpgradePlans(true);
                                                setTimeout(() => plansRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
                                            }} 
                                            className="w-full bg-transparent border-2 border-white/20 text-white font-bold py-2.5 px-6 rounded-xl hover:bg-white/10 transition-all text-sm"
                                        >
                                            Renew Subscription
                                        </button>
                                    )}
                                        <button 
                                            onClick={() => setShowCancelModal(true)}
                                            disabled={isCheckoutLoading}
                                            className="w-full bg-transparent border border-red-500/50 text-red-200 font-semibold py-2 px-6 rounded-xl hover:bg-red-500/20 hover:text-white transition-all text-xs opacity-80 hover:opacity-100 mt-1"
                                        >
                                            {institute?.plan === 'PRO' ? 'Downgrade to Basic Plan' : institute?.plan === 'BASIC' || institute?.plan === 'FREE' ? 'Cancel Ongoing Plan' : 'Deactivate Auto-Renew'}
                                        </button>
                                </div>
                            </div>
                        </div>

                        {/* Billing Details */}
                        <div className="space-y-2">
                            <label className="block text-xs font-bold uppercase text-app-text-tertiary mb-1 pl-1">Subscription Start Date</label>
                            <div className="w-full bg-app-bg border border-app-border rounded-xl px-4 py-3.5 text-app-text font-medium shadow-sm flex items-center gap-2">
                                <CalendarCheck className="w-5 h-5 text-green-500" />
                                {formatDate(institute?.planStartDate)}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="block text-xs font-bold uppercase text-app-text-tertiary mb-1 pl-1">Expiry / Renewal Date</label>
                            <div className={`w-full bg-app-bg border border-app-border rounded-xl px-4 py-3.5 font-medium shadow-sm flex items-center justify-between ${isExpiringSoon ? 'border-red-500/50 bg-red-50 text-red-700' : 'text-app-text'}`}>
                                <div className="flex items-center gap-2">
                                    <CalendarOff className={`w-5 h-5 ${isExpiringSoon ? 'text-red-500' : 'text-orange-500'}`} />
                                    {formatDate(institute?.planExpiryDate)}
                                </div>
                                {isExpiringSoon && <span className="text-xs font-bold bg-red-100 text-red-600 px-2 py-0.5 rounded-md">Expiring Soon</span>}
                            </div>
                        </div>
                    </div>
                    
                    <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm p-4 rounded-xl flex items-start gap-3">
                        <Info className="w-5 h-5 shrink-0 mt-0.5 text-yellow-600" />
                        <p>
                            We recommend keeping your subscription active to avoid disruption. Your institute data remains completely safe after expiry, but you won't be able to add new students until renewed. Contact support at <strong>+91 8439245302</strong> for assistance.
                        </p>
                    </div>
                </div>

                {/* UPGRADE / PLAN PICKER SECTION */}
                {showUpgradePlans && (
                    <div ref={plansRef} className="bg-app-surface border border-app-border rounded-3xl p-6 sm:p-8 shadow-sm">
                    <div className="mb-8 pl-1">
                    <h2 className="text-xl font-bold tracking-tight mb-2">Upgrade or Renew</h2>
                    <p className="text-app-text-tertiary text-sm">Select the capacity that aligns with your current coaching volume.</p>
                </div>

                <div className="flex justify-center mb-8">
                    <div className="bg-app-bg border border-app-border p-1.5 rounded-2xl flex items-center backdrop-blur-sm shadow-inner overflow-hidden">
                        <button
                            onClick={() => setBillingCycle('monthly')}
                            className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all focus:outline-none ${billingCycle === 'monthly' ? 'bg-black text-white shadow-lg' : 'text-app-text-tertiary hover:text-black hover:bg-black/5'}`}
                        >
                            Monthly (Autopay)
                        </button>
                        <button
                            onClick={() => setBillingCycle('yearly')}
                            className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all focus:outline-none flex items-center gap-2 ${billingCycle === 'yearly' ? 'bg-black text-white shadow-lg' : 'text-app-text-tertiary hover:text-black hover:bg-black/5'}`}
                        >
                            Yearly
                            <span className={`px-2 py-0.5 rounded-md text-[10px] uppercase tracking-widest ${billingCycle === 'yearly' ? 'bg-white/20 text-white' : 'bg-black/10 text-black font-extrabold'}`}>Save ~16%</span>
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    {pricingPlans.map((plan) => {
                        const displayPrice = billingCycle === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;
                        const displayPeriod = billingCycle === 'yearly' ? '/ year' : '/ month';

                        return (
                            <div
                                key={plan.id}
                                onClick={() => setSelectedPlan(plan.id as 'basic' | 'pro')}
                                className={`relative cursor-pointer transition-all duration-300 p-6 rounded-3xl border-2 ${selectedPlan === plan.id
                                    ? 'border-black bg-white shadow-xl scale-[1.02]'
                                    : 'border-transparent bg-app-bg hover:bg-white hover:border-black/20 hover:scale-[1.01]'
                                    }`}
                            >
                                {plan.popular && (
                                    <div className="absolute top-0 right-6 bg-black text-white text-[10px] font-bold uppercase tracking-widest py-1 px-3 rounded-b-lg">
                                        Most Popular
                                    </div>
                                )}

                                <div className="flex items-center gap-4 mb-5">
                                    <div className={`p-3 rounded-2xl ${selectedPlan === plan.id ? 'bg-black text-white' : 'bg-neutral-200 text-neutral-600'}`}>
                                        <plan.icon className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-bold text-app-text">{plan.name}</h3>
                                        <p className="font-semibold text-accent-primary text-sm">{plan.limit}</p>
                                    </div>
                                </div>

                                <div className="mb-6">
                                    <div className="flex items-baseline gap-1">
                                        <span className="text-3xl font-extrabold tracking-tighter">₹{displayPrice.toLocaleString('en-IN')}</span>
                                        <span className="text-app-text-tertiary font-bold text-sm">{displayPeriod}</span>
                                    </div>
                                    <p className="text-app-text-secondary mt-2 font-medium text-xs leading-relaxed">{plan.description}</p>
                                </div>

                                <div className="space-y-3 pt-5 border-t border-app-border">
                                    {plan.features.map((feature, featureIdx) => (
                                        <div key={featureIdx} className="flex items-start gap-3">
                                            <Check className="w-5 h-5 text-black shrink-0" />
                                            <span className="text-sm font-semibold text-app-text-secondary">{feature}</span>
                                        </div>
                                    ))}
                                </div>

                                <div className={`mt-6 w-full py-3 rounded-xl font-bold text-sm text-center transition-colors ${selectedPlan === plan.id ? 'bg-black text-white' : 'bg-neutral-200 text-neutral-900 group-hover:bg-neutral-300'
                                    }`}>
                                    {selectedPlan === plan.id ? 'Selected' : 'Select Plan'}
                                </div>
                            </div>
                        );
                    })}
                </div>
                
                {/* Checkout Summary Block */}
                <div className="bg-black text-white rounded-3xl p-6 sm:p-8 flex flex-col md:flex-row items-center justify-between gap-6 overflow-hidden relative">
                    <div className="absolute right-0 top-0 w-64 h-64 bg-accent-primary/20 blur-[100px] rounded-full pointer-events-none" />
                    
                    <div className="relative z-10 w-full md:max-w-md">
                        <h3 className="text-xl font-extrabold !text-white tracking-tight mb-2">Secure Payment</h3>
                        <p className="text-neutral-400 font-medium text-sm leading-relaxed mb-4">
                            You're subscribing to the <span className="text-white font-bold">{pricingPlans.find(p => p.id === selectedPlan)?.name}</span>. 
                            If you have trial days left, your new plan will extend your access accordingly.
                        </p>
                    </div>

                    <button
                        onClick={handleCheckout}
                        disabled={isCheckoutLoading || !selectedPlan}
                        className="relative z-10 w-full md:w-auto whitespace-nowrap px-8 py-4 bg-white text-black rounded-2xl font-bold text-base flex items-center justify-center gap-3 hover:bg-neutral-200 transition-all active:scale-95 disabled:opacity-70 cursor-pointer shadow-[0_0_30px_rgba(255,255,255,0.15)]"
                    >
                        {isCheckoutLoading ? (
                            <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <>
                                <CreditCard className="w-5 h-5" />
                                Pay ₹{((billingCycle === 'yearly'
                                    ? pricingPlans.find(p => p.id === selectedPlan)?.yearlyPrice
                                    : pricingPlans.find(p => p.id === selectedPlan)?.monthlyPrice) || 0).toLocaleString('en-IN')
                                } Securely
                            </>
                        )}
                    </button>
                </div>
            </div>
            )}
            </div>

            {/* Cancel Subscription Modal */}
            {showCancelModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-zinc-900 rounded-3xl p-8 max-w-md w-full shadow-2xl border border-neutral-200 dark:border-zinc-800 animate-in fade-in zoom-in duration-200">
                        <div className="flex items-center gap-4 mb-6">
                            <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center shrink-0">
                                <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-app-text">
                                    {institute?.plan === 'PRO' ? 'Downgrade Plan' : 'Cancel Subscription'}
                                </h3>
                                <p className="text-app-text-secondary text-sm mt-1">
                                    {institute?.plan === 'PRO' ? 'Are you sure you want to downgrade?' : 'Are you sure you want to cancel?'}
                                </p>
                            </div>
                        </div>
                        <p className="text-app-text-secondary text-base mb-8 leading-relaxed">
                            {institute?.plan === 'PRO' 
                                ? 'Your ongoing Pro subscription will be canceled and you will be downgraded to the Basic Plan immediately. You will lose access to Pro features. This action cannot be undone.'
                                : 'Your ongoing subscription will be canceled immediately and you will lose access to premium features. This action cannot be undone.'}
                        </p>
                        <div className="flex gap-4">
                            <button
                                onClick={() => setShowCancelModal(false)}
                                disabled={isCheckoutLoading}
                                className="flex-1 py-3 px-4 bg-app-bg border border-app-border text-app-text font-semibold rounded-xl hover:bg-neutral-100 dark:hover:bg-zinc-800 transition-colors"
                            >
                                Keep Plan
                            </button>
                            <button
                                onClick={executeCancelSubscription}
                                disabled={isCheckoutLoading}
                                className="flex-1 py-3 px-4 bg-red-600 text-white font-semibold rounded-xl hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
                            >
                                {isCheckoutLoading ? (
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    institute?.plan === 'PRO' ? 'Yes, Downgrade' : 'Yes, Cancel'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </Layout>
    );
}
