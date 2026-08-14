import { useState, useEffect } from 'react';
import { CreditCard, Sparkles, AlertCircle } from 'lucide-react';
import { api } from '../utils/api';
import toast from 'react-hot-toast';

interface QuizBillingProps {
    institute: any;
    fetchInstituteDetails: () => void;
    isCheckoutLoading: boolean;
    setIsCheckoutLoading: (val: boolean) => void;
    loadScript: (src: string) => Promise<boolean>;
}

const creditPackages = [
    { id: 'quiz_credits_5', credits: 5, price: 250, popular: false, oldPrice: 500 },
    { id: 'quiz_credits_10', credits: 10, price: 500, popular: false, oldPrice: 1000 },
    { id: 'quiz_credits_25', credits: 25, price: 1000, popular: true, oldPrice: 2000 },
    { id: 'quiz_credits_40', credits: 40, price: 1500, popular: false, oldPrice: 3000 }
];

export default function QuizBilling({ institute, fetchInstituteDetails, isCheckoutLoading, setIsCheckoutLoading, loadScript }: QuizBillingProps) {
    const [selectedPackage, setSelectedPackage] = useState<string | null>(null);

    const handleCheckout = async () => {
        if (!selectedPackage) return;
        setIsCheckoutLoading(true);
        
        try {
            const isLoaded = await loadScript('https://checkout.razorpay.com/v1/checkout.js');
            if (!isLoaded) {
                toast.error('Razorpay SDK failed to load. Are you online?');
                setIsCheckoutLoading(false);
                return;
            }

            const orderRes = await api.post<any>('/billing/create', {
                planId: selectedPackage,
                billingCycle: 'one-time',
            });

            if (!orderRes.success) {
                toast.error(orderRes.error || 'Failed to initialize payment.');
                setIsCheckoutLoading(false);
                return;
            }

            const options: any = {
                key: orderRes.keyId,
                name: 'MathLogs',
                description: 'Buy Quiz Credits',
                order_id: orderRes.orderId,
                amount: orderRes.amount,
                currency: orderRes.currency,
                handler: async (response: any) => {
                    try {
                        const verifyRes = await api.post<any>('/billing/verify', {
                            razorpay_order_id: response.razorpay_order_id,
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_signature: response.razorpay_signature,
                            planId: selectedPackage,
                            billingCycle: 'one-time',
                        });

                        if (verifyRes.success) {
                            toast.success('Payment verified! Credits have been added.');
                            fetchInstituteDetails();
                        } else {
                            toast.error('Payment verification failed.');
                        }
                    } catch (error: any) {
                        toast.error(error.message || 'Verification Error');
                    }
                },
                prefill: {
                    name: institute?.teacherName || '',
                    email: institute?.email || '',
                    contact: institute?.phoneNumber || '',
                },
                theme: { color: '#0071e3' },
                modal: { ondismiss: () => setIsCheckoutLoading(false) }
            };

            const razorpayWindow = window as any;
            const paymentObject = new razorpayWindow.Razorpay(options);
            paymentObject.on('payment.failed', (response: any) => {
                toast.error(response.error.description || 'Payment Failed');
            });
            paymentObject.open();
        } catch (error: any) {
            toast.error(error.message || 'Payment initialization failed.');
            setIsCheckoutLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8 pb-10">
            {/* Balance Card */}
            <div className="bg-white border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl p-6 lg:p-10 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl -translate-y-1/2 -translate-x-1/2 pointer-events-none" />
                
                <h3 className="text-xl font-bold text-app-text mb-1 flex items-center gap-2 relative z-10">
                    <Sparkles className="w-6 h-6 text-blue-500" />
                    Quiz Credits Balance
                </h3>
                <p className="text-app-text-secondary text-sm mb-8 relative z-10">Purchase credits to generate AI-powered quizzes.</p>
                
                <div className="bg-black text-white rounded-3xl p-8 relative overflow-hidden mb-8">
                    <div className="absolute bottom-0 right-0 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl translate-y-1/3 translate-x-1/3 pointer-events-none" />
                    <p className="text-sm font-bold uppercase tracking-widest opacity-70 mb-2 relative z-10">Available Credits</p>
                    <h4 className="text-5xl font-black relative z-10">{institute?.quizCredits || 0} <span className="text-xl opacity-70 font-semibold ml-2">Credits</span></h4>
                    <p className="opacity-70 mt-3 text-sm relative z-10">1 Credit = 1 Generated AI Quiz</p>
                </div>
            </div>

            {/* Packages */}
            <div className="bg-white border border-gray-100 rounded-3xl p-6 sm:p-12 shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative overflow-hidden">
                <div className="mb-8 pl-1">
                    <h2 className="text-xl font-bold tracking-tight mb-2">Buy More Credits</h2>
                    <p className="text-app-text-tertiary text-sm">Select a credit package that suits your needs. Credits never expire.</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-8 relative z-10">
                    {creditPackages.map((pkg) => (
                        <div
                            key={pkg.id}
                            onClick={() => setSelectedPackage(pkg.id)}
                            className={`relative cursor-pointer transition-all duration-300 p-6 rounded-3xl border ${selectedPackage === pkg.id
                                ? 'border-blue-600 bg-blue-50/30 shadow-xl ring-1 ring-blue-600 scale-[1.02]'
                                : 'border-gray-100 bg-gray-50 hover:bg-white hover:border-gray-300 hover:shadow-xl hover:scale-[1.01]'
                            }`}
                        >
                            {pkg.popular && (
                                <div className="absolute top-0 right-6 bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-[10px] font-bold uppercase tracking-widest py-1 px-3 rounded-b-lg flex items-center gap-1 shadow-sm">
                                    <Sparkles className="w-3 h-3" /> Most Popular
                                </div>
                            )}

                            <div className="mb-4">
                                <h3 className="text-xl font-black text-app-text mb-1">{pkg.credits} Credits</h3>
                                <p className="text-xs text-app-text-tertiary font-medium">Valid for life</p>
                            </div>

                            <div className="mb-6">
                                <div className="flex items-baseline gap-2">
                                    <span className="text-3xl font-extrabold tracking-tighter text-blue-600">₹{pkg.price.toLocaleString('en-IN')}</span>
                                    {pkg.oldPrice && <span className="text-sm font-medium text-gray-400 line-through">₹{pkg.oldPrice}</span>}
                                </div>
                                <div className="mt-2 text-xs font-bold text-green-600 bg-green-100 w-fit px-2 py-0.5 rounded-md">Save {Math.round((1 - pkg.price/pkg.oldPrice)*100)}%</div>
                            </div>

                            <div className={`mt-auto w-full py-3 rounded-xl font-bold text-sm text-center transition-colors ${selectedPackage === pkg.id ? 'bg-blue-600 text-white' : 'bg-neutral-200 text-neutral-900 group-hover:bg-neutral-300'}`}>
                                {selectedPackage === pkg.id ? 'Selected' : 'Select Package'}
                            </div>
                        </div>
                    ))}
                </div>

                {selectedPackage && (
                    <div className="bg-black text-white rounded-3xl p-6 sm:p-8 flex flex-col md:flex-row items-center justify-between gap-6 overflow-hidden relative">
                        <div className="absolute right-0 top-0 w-64 h-64 bg-blue-500/20 blur-[100px] rounded-full pointer-events-none" />
                        
                        <div className="relative z-10 w-full md:max-w-md">
                            <h3 className="text-xl font-extrabold !text-white tracking-tight mb-2">Secure Payment</h3>
                            <p className="text-neutral-400 font-medium text-sm leading-relaxed mb-4">
                                You are buying <span className="text-white font-bold">{creditPackages.find(p => p.id === selectedPackage)?.credits} Credits</span>. 
                            </p>
                        </div>

                        <button
                            onClick={handleCheckout}
                            disabled={isCheckoutLoading}
                            className="relative z-10 w-full md:w-auto whitespace-nowrap px-8 py-4 bg-blue-600 text-white hover:bg-blue-700 rounded-2xl font-bold text-base flex items-center justify-center gap-3 transition-all active:scale-95 disabled:opacity-70 cursor-pointer shadow-[0_0_30px_rgba(59,130,246,0.3)]"
                        >
                            {isCheckoutLoading ? (
                                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                                <>
                                    <CreditCard className="w-5 h-5" />
                                    Pay ₹{creditPackages.find(p => p.id === selectedPackage)?.price.toLocaleString('en-IN')} Securely
                                </>
                            )}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
