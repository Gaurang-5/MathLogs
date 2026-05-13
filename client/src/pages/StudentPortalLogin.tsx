import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
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
    const [branding, setBranding] = useState<Branding | null>(null);

    useEffect(() => {
        axios.get(`/api/student-portal/branding/${instituteSlug}`)
            .then(res => setBranding(res.data))
            .catch(() => setBranding({ name: 'Student Portal', logoUrl: null, primaryColor: null }));
    }, [instituteSlug]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (mobileNumber.replace(/\D/g, '').length < 10) {
            toast.error('Enter a valid 10-digit mobile number');
            return;
        }
        setLoading(true);
        try {
            const response = await axios.post<{ token: string; student: any }>(
                '/api/student-portal/login',
                { instituteSlug, mobileNumber: mobileNumber.replace(/\D/g, '') }
            );
            localStorage.setItem(`student_token_${instituteSlug}`, response.data.token);
            toast.success(`Welcome, ${response.data.student.name}!`);
            navigate(`/${instituteSlug}/student/dashboard`);
        } catch (error: any) {
            toast.error(error?.response?.data?.error || 'Mobile number not found. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const inputClass = "w-full bg-neutral-50/80 border border-neutral-200/80 text-app-text pl-11 pr-4 py-3.5 rounded-xl focus:bg-white focus:ring-2 focus:ring-accent/20 focus:border-accent/40 outline-none transition-all placeholder:text-neutral-400 text-[15px]";
    const iconClass = "absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-neutral-400 group-focus-within:text-accent transition-colors";

    return (
        <div className="min-h-screen bg-app-bg font-sans flex flex-col">
            <AnimatePresence mode="wait">
                <motion.div key="content" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 flex flex-col">
                    
                    {/* ─── Branded Hero ─── */}
                    <div className="relative overflow-hidden">
                        {/* Decorative gradient background matching primaryColor or accent */}
                        <div 
                            className="absolute inset-0 pointer-events-none opacity-10" 
                            style={{ background: branding?.primaryColor ? `linear-gradient(180deg, ${branding.primaryColor} 0%, transparent 100%)` : undefined }} 
                        />
                        <div className="absolute inset-0 bg-gradient-to-b from-accent/[0.06] via-accent/[0.02] to-transparent pointer-events-none" />
                        <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-accent/[0.04] rounded-full blur-[80px] translate-x-1/3 -translate-y-1/3 pointer-events-none" />

                        <div className="relative max-w-md mx-auto pt-12 sm:pt-16 pb-8 px-4 flex flex-col items-center text-center">
                            {/* Institute Brand Icon/Logo */}
                            <div className={`w-24 h-24 sm:w-28 sm:h-28 shrink-0 rounded-[1.5rem] flex items-center justify-center overflow-hidden bg-white mb-5 ${branding?.logoUrl ? 'border border-neutral-100 shadow-xl shadow-black/5 p-2' : 'bg-accent/10 ring-4 ring-accent/5'}`}>
                                {branding?.logoUrl ? (
                                    <img src={branding.logoUrl} alt={branding.name} className="w-full h-full object-contain drop-shadow-sm" />
                                ) : (
                                    <GraduationCap className="w-12 h-12 text-accent" />
                                )}
                            </div>

                            {/* Text Container */}
                            <div className="flex flex-col items-center gap-2">
                                {/* Institute Name */}
                                <h1 className="text-2xl sm:text-3xl font-black text-app-text tracking-tight leading-tight px-2">
                                    {branding?.name || 'Student Portal'}
                                </h1>
                                {/* Badge */}
                                <div className="inline-flex items-center gap-1.5 bg-white/80 rounded-full px-3.5 py-1 shadow-sm border border-neutral-200/50 backdrop-blur-sm mt-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                    <span className="text-[10px] font-bold text-app-text-secondary tracking-widest uppercase">Student Portal</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ─── Form Card ─── */}
                    <div className="px-4 pb-12 flex-1 flex flex-col justify-start sm:justify-center">
                        <motion.div
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.08 }}
                            className="w-full max-w-md mx-auto bg-app-surface-opaque rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-white/60 p-6 sm:p-8"
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
                        <p className="text-center text-app-text-tertiary text-xs mt-8 tracking-wide">
                            Powered by <span className="font-bold text-app-text-secondary">MathLogs</span>
                        </p>
                    </div>

                </motion.div>
            </AnimatePresence>
        </div>
    );
}
