import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Building2, User, Phone, Mail, CreditCard, Shield, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import { api } from '../utils/api';
import toast from 'react-hot-toast';

interface CreateOrderResponse {
    success: boolean;
    error?: string;
    freeSetup?: boolean;
    setupLink?: string;
    keyId?: string;
    orderId?: string;
    amount?: number;
    currency?: string;
}

interface VerifyPaymentResponse {
    success: boolean;
    setupLink?: string;
}

interface RazorpayHandlerResponse {
    razorpay_order_id?: string;
    razorpay_payment_id?: string;
    razorpay_signature?: string;
}

interface RazorpayFailureResponse {
    error?: {
        description?: string;
    };
}

interface RazorpayOptions {
    key?: string;
    order_id?: string;
    amount?: number;
    currency?: string;
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

interface LinkData {
    valid: boolean;
    plan: string;
    discountPercent: number;
    monthlyPrice: number;
    yearlyPrice: number;
    unlimitedStudents: true;
    isFreeTrial?: boolean;
    trialDays?: number;
}

export default function JoinOnboarding() {
    const { token } = useParams<{ token: string }>();
    const navigate = useNavigate();

    const [linkData, setLinkData] = useState<LinkData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [paymentSuccess, setPaymentSuccess] = useState(false);

    // Form fields — filled by the user
    const [instituteName, setInstituteName] = useState('');
    const [teacherName, setTeacherName] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [email, setEmail] = useState('');
    const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('yearly');

    useEffect(() => {
        if (!token) {
            setError('Invalid link.');
            setLoading(false);
            return;
        }

        const fetchLink = async () => {
            try {
                const res = await api.get<LinkData>(`/admin-onboarding/${token}`);
                if (res.valid) {
                    setLinkData(res);
                    if (res.plan === 'QUIZ') {
                        setBillingCycle('monthly');
                    }
                } else {
                    setError('This link is invalid or has expired.');
                }
            } catch (error: unknown) {
                setError(getErrorMessage(error, 'Failed to load onboarding link.'));
            } finally {
                setLoading(false);
            }
        };

        fetchLink();
    }, [token]);

    const displayPrice = linkData
        ? (billingCycle === 'monthly' ? linkData.monthlyPrice : linkData.yearlyPrice)
        : 0;

    const isFormValid = instituteName.length > 2 && teacherName.length > 2 && phoneNumber.length >= 10 && email.includes('@');

    const handlePayment = async () => {
        if (!isFormValid || !linkData) return;

        setIsProcessing(true);

        try {
            // First, create the order (or handle free setup)
            const orderRes = await api.post<CreateOrderResponse>('/admin-onboarding/create-order', {
                token,
                billingCycle,
                instituteName,
                teacherName,
                phoneNumber,
                email
            });

            if (!orderRes.success) {
                toast.error(orderRes.error || 'Failed to create payment order.');
                setIsProcessing(false);
                return;
            }

            // Handle promotional Marketplace activation (100% discount) — skip Razorpay entirely
            if (orderRes.freeSetup && orderRes.setupLink) {
                setPaymentSuccess(true);
                toast.success('Your free plan has been activated!');
                setTimeout(() => {
                    try {
                        const url = new URL(orderRes.setupLink);
                        navigate(`${url.pathname}${url.search}`);
                    } catch {
                        window.location.href = orderRes.setupLink;
                    }
                }, 1500);
                return;
            }

            // Paid plans — load Razorpay checkout
            const isLoaded = await loadScript('https://checkout.razorpay.com/v1/checkout.js');
            if (!isLoaded) {
                toast.error('Payment gateway failed to load. Are you online?');
                setIsProcessing(false);
                return;
            }

            const options: RazorpayOptions = {
                key: orderRes.keyId,
                order_id: orderRes.orderId,
                amount: orderRes.amount,
                currency: orderRes.currency,
                name: 'MathLogs',
                description: `MathLogs ${linkData.plan} Plan - ${billingCycle}`,
                handler: async (response: RazorpayHandlerResponse) => {
                    try {
                        const verifyRes = await api.post<VerifyPaymentResponse>('/admin-onboarding/verify-payment', {
                            token,
                            razorpay_order_id: response.razorpay_order_id,
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_signature: response.razorpay_signature,
                            billingCycle,
                            instituteName,
                            teacherName,
                            phoneNumber,
                            email,
                        });

                        if (verifyRes.success && verifyRes.setupLink) {
                            setPaymentSuccess(true);
                            toast.success('Payment verified! Redirecting to setup...');
                            setTimeout(() => {
                                try {
                                    const url = new URL(verifyRes.setupLink);
                                    navigate(`${url.pathname}${url.search}`);
                                } catch {
                                    window.location.href = verifyRes.setupLink;
                                }
                            }, 2000);
                        } else {
                            toast.error('Payment verification failed.');
                            setIsProcessing(false);
                        }
                    } catch (error: unknown) {
                        toast.error(getErrorMessage(error, 'Verification Error'));
                        setIsProcessing(false);
                    }
                },
                prefill: {
                    name: teacherName,
                    email: email,
                    contact: phoneNumber,
                },
                theme: {
                    color: '#0071e3',
                },
                modal: {
                    ondismiss: () => {
                        setIsProcessing(false);
                    }
                }
            };

            const razorpayWindow = window as WindowWithRazorpay;
            if (!razorpayWindow.Razorpay) {
                toast.error('Payment gateway is unavailable.');
                setIsProcessing(false);
                return;
            }

            const paymentObject = new razorpayWindow.Razorpay(options);

            paymentObject.on('payment.failed', (response: RazorpayFailureResponse) => {
                toast.error(response.error?.description || 'Payment Failed');
                setIsProcessing(false);
            });

            paymentObject.open();

        } catch (error: unknown) {
            toast.error(getErrorMessage(error, 'Payment initialization failed.'));
            setIsProcessing(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center px-4">
                <div className="max-w-md w-full bg-white rounded-3xl shadow-lg p-8 text-center border border-gray-100">
                    <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <AlertCircle className="w-8 h-8 text-red-500" />
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 mb-2">Link Unavailable</h2>
                    <p className="text-gray-500 text-sm mb-6">{error}</p>
                    <button
                        onClick={() => navigate('/')}
                        className="px-6 py-2.5 bg-black text-white rounded-xl font-bold hover:bg-gray-800 transition-colors"
                    >
                        Go to Homepage
                    </button>
                </div>
            </div>
        );
    }

    if (paymentSuccess) {
        return (
            <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center px-4">
                <div className="max-w-md w-full bg-white rounded-3xl shadow-lg p-8 text-center border border-gray-100">
                    <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle2 className="w-8 h-8 text-green-500" />
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 mb-2">Payment Successful!</h2>
                    <p className="text-gray-500 text-sm">Redirecting you to set up your account...</p>
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400 mx-auto mt-4" />
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#FAFAFA] font-sans text-gray-900 selection:bg-black selection:text-white">
            {/* Apple Translucent Glass Header */}
            <div className="sticky top-0 z-40 bg-white/70 backdrop-blur-2xl saturate-180 border-b border-white/40 shadow-xs">
                <div className="max-w-2xl mx-auto px-6 py-4 flex items-center gap-3">
                    <div className="w-8 h-8 bg-black rounded-xl flex items-center justify-center shadow-xs">
                        <span className="text-white font-bold text-sm">M</span>
                    </div>
                    <span className="text-lg font-extrabold tracking-[-0.02em]">MathLogs</span>
                </div>
            </div>

            <div className="max-w-2xl mx-auto px-6 py-10">
                {/* Plan Summary Card */}
                <div className="bg-black text-white rounded-3xl p-8 mb-8 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
                    <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-1">
                            <Shield className="w-4 h-4 text-gray-400" />
                            <span className="text-xs font-bold uppercase tracking-widest text-gray-400">Exclusive Invite</span>
                        </div>
                        <h1 className="text-3xl font-black mb-4">
                            {linkData?.plan === 'ENTERPRISE' ? 'Enterprise Plan' : linkData?.plan === 'QUIZ' ? 'Quiz Plan' : 'Marketplace Plan'}
                            {linkData?.isFreeTrial && (
                                <span className="ml-3 inline-block bg-amber-500 text-white text-sm font-bold px-3 py-1 rounded-full align-middle shadow-sm">
                                    {linkData.trialDays}-Day Free Trial
                                </span>
                            )}
                        </h1>

                        {/* Billing Cycle Toggle (Hidden for Free Trials) */}
                        {!linkData?.isFreeTrial && linkData?.plan !== 'MARKETPLACE' && (
                        <div className="flex gap-2 mb-4">
                            <button
                                onClick={() => setBillingCycle('monthly')}
                                className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                                    billingCycle === 'monthly'
                                        ? 'bg-white text-black'
                                        : 'bg-white/10 text-white/70 hover:bg-white/20'
                                }`}
                            >
                                Monthly
                            </button>
                            <button
                                onClick={() => setBillingCycle('yearly')}
                                className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                                    billingCycle === 'yearly'
                                        ? 'bg-white text-black'
                                        : 'bg-white/10 text-white/70 hover:bg-white/20'
                                }`}
                            >
                                Yearly
                                {linkData && linkData.discountPercent === 0 && (
                                    <span className="ml-1.5 text-[10px] bg-green-500 text-white px-1.5 py-0.5 rounded-full">Save ~17%</span>
                                )}
                            </button>
                        </div>
                        )}

                        <div className="flex items-baseline gap-2 mb-4">
                            <span className="text-4xl font-black">
                                {linkData?.isFreeTrial ? '₹0' : `₹${displayPrice.toLocaleString('en-IN')}`}
                            </span>
                            {!linkData?.isFreeTrial && linkData?.plan !== 'MARKETPLACE' && (
                                <span className="text-sm text-gray-400 font-medium">
                                    / {billingCycle === 'monthly' ? 'month' : 'year'}
                                </span>
                            )}
                            {!linkData?.isFreeTrial && linkData?.plan === 'MARKETPLACE' && (
                                <span className="text-sm text-gray-400 font-medium">
                                    (Promotional free activation; ₹99 one-time normally)
                                </span>
                            )}
                        </div>

                        {linkData && linkData.discountPercent > 0 && (
                            <div className="inline-block bg-green-500/20 text-green-300 text-xs font-bold px-3 py-1.5 rounded-full mb-3">
                                🎉 {linkData.discountPercent}% Special Discount Applied
                            </div>
                        )}

                        <div className="flex gap-4 text-sm text-gray-300">
                            <span className="flex items-center gap-1.5">
                                <CheckCircle2 className="w-4 h-4 text-green-400" />
                                Unlimited Students
                            </span>
                            <span className="flex items-center gap-1.5">
                                <CheckCircle2 className="w-4 h-4 text-green-400" />
                                Unlimited Batches
                            </span>
                        </div>
                    </div>
                </div>

                {/* Institute Details Form */}
                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 mb-6">
                    <h2 className="text-lg font-bold mb-1 flex items-center gap-2">
                        <Building2 className="w-5 h-5" />
                        Your Institute Details
                    </h2>
                    <p className="text-sm text-gray-500 mb-6">Fill in your details to proceed with the payment.</p>

                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1 block">Institute Name *</label>
                            <div className="relative">
                                <Building2 className="w-4 h-4 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />
                                <input
                                    type="text"
                                    value={instituteName}
                                    onChange={(e) => setInstituteName(e.target.value)}
                                    placeholder="e.g. Apex Academy"
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-11 pr-4 py-3 focus:ring-2 focus:ring-black focus:border-black outline-none font-medium placeholder:text-gray-400"
                                    required
                                />
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1 block">Owner / Teacher Name *</label>
                            <div className="relative">
                                <User className="w-4 h-4 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />
                                <input
                                    type="text"
                                    value={teacherName}
                                    onChange={(e) => setTeacherName(e.target.value)}
                                    placeholder="e.g. Rajesh Kumar"
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-11 pr-4 py-3 focus:ring-2 focus:ring-black focus:border-black outline-none font-medium placeholder:text-gray-400"
                                    required
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1 block">Phone Number *</label>
                                <div className="relative">
                                    <Phone className="w-4 h-4 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />
                                    <input
                                        type="tel"
                                        value={phoneNumber}
                                        onChange={(e) => setPhoneNumber(e.target.value)}
                                        placeholder="9876543210"
                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-11 pr-4 py-3 focus:ring-2 focus:ring-black focus:border-black outline-none font-medium placeholder:text-gray-400"
                                        required
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1 block">Email *</label>
                                <div className="relative">
                                    <Mail className="w-4 h-4 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="you@example.com"
                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-11 pr-4 py-3 focus:ring-2 focus:ring-black focus:border-black outline-none font-medium placeholder:text-gray-400"
                                        required
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Pay Button with Apple Spring Touch Feedback */}
                <motion.button
                    whileTap={{ scale: 0.95 }}
                    transition={{ type: 'spring', stiffness: 450, damping: 30 }}
                    onClick={handlePayment}
                    disabled={!isFormValid || isProcessing}
                    className="w-full bg-black text-white font-bold py-4 rounded-2xl shadow-lg shadow-black/10 hover:bg-neutral-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 text-lg cursor-pointer"
                >
                    {isProcessing ? (
                        <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Processing...
                        </>
                    ) : linkData?.isFreeTrial ? (
                        <>
                            Setup Account (Free Trial)
                        </>
                    ) : (
                        <>
                            <CreditCard className="w-5 h-5" />
                            Pay ₹{displayPrice.toLocaleString('en-IN')} & Setup Account
                        </>
                    )}
                </motion.button>

                {!linkData?.isFreeTrial && (
                    <p className="text-center text-xs text-gray-400 mt-4">
                        Secured by Razorpay. Your payment is encrypted and safe.
                    </p>
                )}
            </div>
        </div>
    );
}
