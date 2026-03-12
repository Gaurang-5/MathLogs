import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Building2, User, Phone, Mail, CreditCard, Shield, CheckCircle2, Loader2, AlertCircle, BookOpen, GraduationCap } from 'lucide-react';
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

interface LinkData {
    valid: boolean;
    plan: string;
    discountPercent: number;
    monthlyPrice: number;
    yearlyPrice: number;
    maxStudents: number;
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
    const [subjects, setSubjects] = useState('');
    const [allowedClasses, setAllowedClasses] = useState('');
    const [requiresGrades, setRequiresGrades] = useState(true);

    useEffect(() => {
        if (!token) {
            setError('Invalid link.');
            setLoading(false);
            return;
        }

        const fetchLink = async () => {
            try {
                const res = await api.get(`/admin-onboarding/${token}`);
                if (res.valid) {
                    setLinkData(res);
                } else {
                    setError('This link is invalid or has expired.');
                }
            } catch (err: any) {
                setError(err?.message || 'Failed to load onboarding link.');
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
            const isLoaded = await loadScript('https://checkout.razorpay.com/v1/checkout.js');
            if (!isLoaded) {
                toast.error('Payment gateway failed to load. Are you online?');
                setIsProcessing(false);
                return;
            }

            const orderRes = await api.post('/admin-onboarding/create-order', {
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

            const options: any = {
                key: orderRes.keyId,
                order_id: orderRes.orderId,
                amount: orderRes.amount,
                currency: orderRes.currency,
                name: 'MathLogs',
                description: `MathLogs ${linkData.plan} Plan - ${billingCycle}`,
                handler: async function (response: any) {
                    try {
                        const verifyRes = await api.post('/admin-onboarding/verify-payment', {
                            token,
                            razorpay_order_id: response.razorpay_order_id,
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_signature: response.razorpay_signature,
                            billingCycle,
                            instituteName,
                            teacherName,
                            phoneNumber,
                            email,
                            subjects,
                            allowedClasses,
                            requiresGrades
                        });

                        if (verifyRes.success && verifyRes.setupLink) {
                            setPaymentSuccess(true);
                            toast.success('Payment verified! Redirecting to setup...');
                            setTimeout(() => {
                                window.location.href = verifyRes.setupLink;
                            }, 2000);
                        } else {
                            toast.error('Payment verification failed.');
                            setIsProcessing(false);
                        }
                    } catch (err: any) {
                        toast.error(err.message || 'Verification Error');
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
                    ondismiss: function () {
                        setIsProcessing(false);
                    }
                }
            };

            const paymentObject = new (window as any).Razorpay(options);

            paymentObject.on('payment.failed', function (response: any) {
                toast.error(response.error?.description || 'Payment Failed');
                setIsProcessing(false);
            });

            paymentObject.open();

        } catch (err: any) {
            toast.error(err.message || 'Payment initialization failed.');
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
        <div className="min-h-screen bg-[#FAFAFA] font-sans text-gray-900">
            {/* Header */}
            <div className="bg-white border-b border-gray-100">
                <div className="max-w-2xl mx-auto px-6 py-4 flex items-center gap-3">
                    <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
                        <span className="text-white font-bold text-sm">M</span>
                    </div>
                    <span className="text-lg font-bold tracking-tight">MathLogs</span>
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
                            {linkData?.plan === 'PRO' ? 'Pro Plan' : linkData?.plan === 'BASIC' ? 'Basic Plan' : 'Custom Plan'}
                        </h1>

                        {/* Billing Cycle Toggle */}
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
                                {linkData && linkData.discountPercent === 0 && linkData.plan !== 'CUSTOM' && (
                                    <span className="ml-1.5 text-[10px] bg-green-500 text-white px-1.5 py-0.5 rounded-full">Save ~17%</span>
                                )}
                            </button>
                        </div>

                        <div className="flex items-baseline gap-2 mb-4">
                            <span className="text-4xl font-black">₹{displayPrice.toLocaleString('en-IN')}</span>
                            <span className="text-sm text-gray-400 font-medium">
                                / {billingCycle === 'monthly' ? 'month' : 'year'}
                            </span>
                        </div>

                        {linkData && linkData.discountPercent > 0 && (
                            <div className="inline-block bg-green-500/20 text-green-300 text-xs font-bold px-3 py-1.5 rounded-full mb-3">
                                🎉 {linkData.discountPercent}% Special Discount Applied
                            </div>
                        )}

                        <div className="flex gap-4 text-sm text-gray-300">
                            <span className="flex items-center gap-1.5">
                                <CheckCircle2 className="w-4 h-4 text-green-400" />
                                Up to {linkData?.maxStudents} Students
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

                {/* Coaching Configuration */}
                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 mb-6">
                    <h2 className="text-lg font-bold mb-1 flex items-center gap-2">
                        <GraduationCap className="w-5 h-5" />
                        Coaching Configuration
                    </h2>
                    <p className="text-sm text-gray-500 mb-6">Set up your coaching subjects and classes.</p>

                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1 block">Subjects Offered</label>
                            <div className="relative">
                                <BookOpen className="w-4 h-4 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />
                                <input
                                    type="text"
                                    value={subjects}
                                    onChange={(e) => setSubjects(e.target.value)}
                                    placeholder="e.g. Math, Physics, Chemistry"
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-11 pr-4 py-3 focus:ring-2 focus:ring-black focus:border-black outline-none font-medium placeholder:text-gray-400"
                                />
                            </div>
                            <p className="text-[10px] text-gray-400 mt-1 pl-1">Comma separated list</p>
                        </div>

                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-200">
                            <div>
                                <label className="text-sm font-bold text-gray-700">Organize by Grades/Classes?</label>
                                <p className="text-xs text-gray-500">Enable if your students are grouped by classes.</p>
                            </div>
                            <div className="flex bg-gray-200 p-1 rounded-lg">
                                <button
                                    type="button"
                                    onClick={() => setRequiresGrades(true)}
                                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${requiresGrades ? 'bg-white shadow-sm text-black' : 'text-gray-500'}`}
                                >
                                    Yes
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setRequiresGrades(false)}
                                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${!requiresGrades ? 'bg-white shadow-sm text-black' : 'text-gray-500'}`}
                                >
                                    No
                                </button>
                            </div>
                        </div>

                        {requiresGrades && (
                            <div>
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1 block">Classes / Grades</label>
                                <div className="relative">
                                    <GraduationCap className="w-4 h-4 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />
                                    <input
                                        type="text"
                                        value={allowedClasses}
                                        onChange={(e) => setAllowedClasses(e.target.value)}
                                        placeholder="e.g. Class 9, Class 10, Class 11"
                                        className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-11 pr-4 py-3 focus:ring-2 focus:ring-black focus:border-black outline-none font-medium placeholder:text-gray-400"
                                    />
                                </div>
                                <p className="text-[10px] text-gray-400 mt-1 pl-1">Comma separated list</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Pay Button */}
                <button
                    onClick={handlePayment}
                    disabled={!isFormValid || isProcessing}
                    className="w-full bg-black text-white font-bold py-4 rounded-2xl shadow-lg shadow-black/10 hover:bg-gray-800 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 text-lg"
                >
                    {isProcessing ? (
                        <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Processing...
                        </>
                    ) : (
                        <>
                            <CreditCard className="w-5 h-5" />
                            Pay ₹{displayPrice.toLocaleString('en-IN')} & Setup Account
                        </>
                    )}
                </button>

                <p className="text-center text-xs text-gray-400 mt-4">
                    Secured by Razorpay. Your payment is encrypted and safe.
                </p>
            </div>
        </div>
    );
}
