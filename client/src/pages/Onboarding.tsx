import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, ChevronDown, Check, Building2, User, Phone, Mail, CreditCard, Sparkles, Building, AlertCircle } from 'lucide-react';
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

export default function Onboarding() {
    // Step 1: Details
    const [tuitionName, setTuitionName] = useState('');
    const [ownerName, setOwnerName] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');

    // Step 2: Plan
    const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('yearly');
    const [selectedPlan, setSelectedPlan] = useState<'basic' | 'pro' | null>(null);

    // UI State
    const [activeStep, setActiveStep] = useState(1);
    const [isLoading, setIsLoading] = useState(false);

    // References for scrolling
    const planRef = useRef<HTMLDivElement>(null);
    const checkoutRef = useRef<HTMLDivElement>(null);

    const isStep1Valid = tuitionName.length > 2 && ownerName.length > 2 && phone.length >= 10 && email.includes('@');

    const scrollToRef = (ref: React.RefObject<HTMLDivElement | null>) => {
        if (ref.current) {
            setTimeout(() => {
                ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
        }
    };

    const handleContinueToPlans = (e: React.FormEvent) => {
        e.preventDefault();
        if (!isStep1Valid) return;
        setActiveStep(2);
        scrollToRef(planRef);
    };

    const handleSelectPlan = (planId: 'basic' | 'pro') => {
        setSelectedPlan(planId);
        setActiveStep(3);
        scrollToRef(checkoutRef);
    };

    const handleCheckout = async () => {
        setIsLoading(true);
        try {
            const isLoaded = await loadScript('https://checkout.razorpay.com/v1/checkout.js');
            if (!isLoaded) {
                toast.error('Razorpay SDK failed to load. Are you online?');
                setIsLoading(false);
                return;
            }

            const orderRes = await api.post('/onboarding/create-order', {
                tuitionName,
                ownerName,
                phone,
                email,
                planId: selectedPlan,
                billingCycle,
            });

            if (!orderRes.success) {
                toast.error(orderRes.error || 'Failed to create order');
                setIsLoading(false);
                return;
            }

            const options: any = {
                key: orderRes.keyId,
                name: tuitionName,
                description: 'MathLogs License',
                handler: async function (response: any) {
                    try {
                        const verifyRes = await api.post('/onboarding/verify-payment', {
                            razorpay_order_id: response.razorpay_order_id,
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_signature: response.razorpay_signature,
                            razorpay_subscription_id: response.razorpay_subscription_id,
                            tuitionName,
                            ownerName,
                            phone,
                            email,
                            planId: selectedPlan,
                            billingCycle,
                        });

                        if (verifyRes.success && verifyRes.setupLink) {
                            toast.success('Payment verified! Redirecting to setup...');
                            setTimeout(() => {
                                window.location.href = verifyRes.setupLink;
                            }, 1500);
                        } else {
                            toast.error('Payment verification failed.');
                        }
                    } catch (err: any) {
                        toast.error(err.message || 'Verification Error');
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
                    ondismiss: function () {
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

            const paymentObject = new (window as any).Razorpay(options);
            paymentObject.open();

        } catch (err: any) {
            toast.error(err.message || 'Payment initialization failed.');
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
                    {activeStep >= 2 && (
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
                                        <span className={`px-1.5 sm:px-2 py-0.5 rounded-md text-[9px] sm:text-[10px] uppercase tracking-wider sm:tracking-widest ${billingCycle === 'yearly' ? 'bg-white/20 text-white' : 'bg-green-100 text-green-700'}`}>Save ~16%</span>
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
                                                {selectedPlan === plan.id ? 'Selected' : 'Select Plan'}
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
                                    <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-2 text-white">Ready to initialize?</h2>
                                    <p className="text-neutral-400 font-medium mb-4 text-sm sm:text-base">
                                        You have selected the <span className="text-white font-bold">{pricingPlans.find(p => p.id === selectedPlan)?.name}</span>.
                                        Secure your payment via Razorpay to activate your center immediately.
                                    </p>

                                    <div className="flex items-start gap-2 sm:gap-3 p-3 sm:p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-xs sm:text-sm font-medium text-neutral-300">
                                        <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-red-400 shrink-0 mt-0.5" />
                                        <p>
                                            <span className="text-red-400 font-bold">Heads up:</span> Failure to complete recurring payment renewals will result in your Center's subscription being revoked and locked after a <span className="text-white font-bold">7-day grace period</span>.
                                        </p>
                                    </div>
                                </div>

                                <button
                                    onClick={handleCheckout}
                                    disabled={isLoading}
                                    className="w-full whitespace-nowrap px-6 sm:px-8 py-4 sm:py-5 bg-white text-black rounded-2xl font-bold text-base sm:text-lg flex items-center justify-center gap-3 hover:bg-neutral-200 transition-all active:scale-95 disabled:opacity-70 cursor-pointer shadow-[0_0_40px_rgba(255,255,255,0.2)]"
                                >
                                    {isLoading ? (
                                        <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                        <>
                                            <CreditCard className="w-6 h-6" />
                                            Pay ₹{(billingCycle === 'yearly'
                                                ? pricingPlans.find(p => p.id === selectedPlan)?.yearlyPrice
                                                : pricingPlans.find(p => p.id === selectedPlan)?.monthlyPrice)?.toLocaleString('en-IN')
                                            } Securely
                                        </>
                                    )}
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

            </div>
        </div>
    );
}
