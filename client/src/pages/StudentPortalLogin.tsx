import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiRequest } from '../utils/api';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, GraduationCap, ChevronRight, Loader } from 'lucide-react';

interface Branding {
    name: string;
    logoUrl: string | null;
    primaryColor: string | null;
}

export default function StudentPortalLogin() {
    const { instituteSlug } = useParams<{ instituteSlug: string }>();
    const navigate = useNavigate();

    const [mobileNumber, setMobileNumber] = useState('');
    const [loading, setLoading] = useState(false);
    
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
                sessionStorage.setItem(`branding_${instituteSlug}`, JSON.stringify(data));
            } catch (err) {
                if (!branding) {
                    setBranding({ name: 'Student Portal', logoUrl: null, primaryColor: null });
                }
            }
        };
        fetchBranding();
    }, [instituteSlug]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        
        const cleanMobile = mobileNumber.replace(/\D/g, '');
        if (cleanMobile.length < 10) {
            toast.error('Enter a valid 10-digit mobile number');
            return;
        }

        setLoading(true);
        try {
            const data = await apiRequest<{ token: string; student: any }>(
                '/student-portal/login',
                'POST',
                { instituteSlug, mobileNumber: cleanMobile }
            );
            
            localStorage.setItem(`student_token_${instituteSlug}`, data.token);
            toast.success(`Welcome, ${data.student.name}!`);
            navigate(`/${instituteSlug}/student/dashboard`);
        } catch (error: any) {
            // apiRequest automatically throws Error(serverMessage)
            toast.error(error.message || 'Login failed. Please try again.', {
                duration: 5000,
                id: 'login-error' // prevent duplicate toasts
            });
            console.error('[LOGIN_ERROR]', error);
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
                            {/* Institute Brand Icon/Logo */}
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

                            {/* Text Container */}
                            <motion.div 
                                initial={{ y: 10, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                transition={{ delay: 0.1 }}
                                className="flex flex-col items-center gap-2"
                            >
                                {/* Institute Name */}
                                <h1 className="text-2xl sm:text-3xl font-black text-app-text tracking-tight leading-tight px-2">
                                    {branding?.name || 'Student Portal'}
                                </h1>
                                {/* Badge */}
                                <div className="inline-flex items-center gap-1.5 bg-white/80 rounded-full px-3.5 py-1 shadow-sm border border-neutral-200/50 backdrop-blur-sm mt-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                    <span className="text-[10px] font-bold text-app-text-secondary tracking-widest uppercase">Student Portal</span>
                                </div>
                            </motion.div>
                        </div>

                        {/* ─── Form Card ─── */}
                        <motion.div
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2 }}
                            className="w-full bg-app-surface-opaque rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-white/60 p-6 sm:p-8 backdrop-blur-md"
                        >
                            <div className="text-center mb-6">
                                <h2 className="text-xl font-black text-app-text mb-2">Welcome Back!</h2>
                                <p className="text-app-text-secondary text-sm">Enter your registered mobile number to view your progress, attendance, and fees.</p>
                            </div>

                            <form onSubmit={handleLogin} className="space-y-6">
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

                                <button 
                                    type="submit" 
                                    disabled={loading || mobileNumber.replace(/\D/g, '').length < 10} 
                                    className="w-full py-4 text-white font-bold rounded-2xl shadow-lg transition-all duration-200 disabled:opacity-50 disabled:shadow-none hover:shadow-xl hover:-translate-y-0.5 focus:ring-2 focus:ring-offset-2 flex items-center justify-center gap-2 group active:scale-[0.98]"
                                    style={{
                                        backgroundColor: branding?.primaryColor && /^#[0-9A-Fa-f]{6}$/.test(branding.primaryColor) ? branding.primaryColor : '#111827',
                                    }}
                                >
                                    {loading ? <Loader className="w-5 h-5 animate-spin" /> : <>View Dashboard <ChevronRight className="w-[18px] h-[18px] group-hover:translate-x-1 transition-transform" /></>}
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
