import { useState, useCallback, memo } from 'react';
import { apiRequest } from '../utils/api';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, ArrowLeft, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '../utils/cn';

interface LoginResponse {
    success: boolean;
    adminId?: string;
    token?: string;
    refreshToken?: string;
    role?: string;
    error?: string;
}

interface ApiErrorLike {
    message?: string;
    response?: {
        data?: {
            reason?: string;
        };
    };
}

// Extract background animation to a memoized component to prevent re-renders on every keystroke
const AnimatedBackground = memo(() => (
    <div className="absolute inset-0 pointer-events-none z-[-1] overflow-hidden">
        {/* Static Grid */}
        <div 
            className="absolute inset-0 opacity-[0.03] will-change-[background-position]" 
            style={{ backgroundImage: 'radial-gradient(#000 2px, transparent 2px)', backgroundSize: '48px 48px' }} 
        />
        
        {/* Horizontal Scanning Line */}
        <motion.div 
            animate={{ y: ["-10vh", "110vh"] }}
            transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
            className="absolute left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-black/20 to-transparent will-change-transform"
        />

        {/* Vertical Scanning Line */}
        <motion.div 
            animate={{ x: ["-10vw", "110vw"] }}
            transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
            className="absolute top-0 h-full w-[1px] bg-gradient-to-b from-transparent via-black/10 to-transparent will-change-transform"
        />

        {/* Accent Shapes */}
        <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
            className="absolute -top-40 -right-40 w-96 h-96 border-[1px] border-black/5 rounded-full will-change-transform"
        />
        <motion.div
            animate={{ rotate: -360 }}
            transition={{ duration: 80, repeat: Infinity, ease: "linear" }}
            className="absolute -bottom-60 -left-20 w-[600px] h-[600px] border-[1px] border-black/5 rounded-full will-change-transform"
        />
    </div>
));
AnimatedBackground.displayName = 'AnimatedBackground';

export default function AdminLogin() {
    const [identifier, setIdentifier] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [loadingText, setLoadingText] = useState('');
    const navigate = useNavigate();

    const handleLogin = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setLoadingText('Authenticating...');
        try {
            const data = await apiRequest<LoginResponse>('/auth/login', 'POST', { username: identifier, password });
            if (data.success) {
                setLoadingText('Verifying Security...');
                localStorage.setItem('adminId', data.adminId ?? '');
                localStorage.setItem('token', data.token ?? '');
                localStorage.setItem('refreshToken', data.refreshToken ?? '');
                
                await new Promise(r => setTimeout(r, 600));
                setLoadingText('Loading Dashboard...');
                await new Promise(r => setTimeout(r, 600));

                if (data.role === 'SUPER_ADMIN') {
                    navigate('/super-admin');
                } else {
                    navigate('/dashboard');
                }
            } else {
                setError(data.error || 'Login failed');
                setLoading(false);
            }
        } catch (err: unknown) {
            const error = err as ApiErrorLike;
            if (error.message?.includes('suspended')) {
                const errorData = error.response?.data;
                const reason = errorData?.reason;
                setError(reason ?
                    `🚫 ${error.message}\n\n📋 Reason: ${reason}\n\n📧 Contact support for assistance.` :
                    error.message ?? 'Login failed'
                );
            } else {
                setError(error.message || 'Login failed');
            }
            setLoading(false);
        }
    }, [identifier, password, navigate]);

    return (
        <div className="min-h-screen bg-[#FDFDFD] flex flex-col justify-center px-6 sm:px-12 relative overflow-hidden text-neutral-900 font-sans selection:bg-black selection:text-white z-0">
            <AnimatedBackground />

            {/* Top Left Back Button */}
            <div className="absolute top-8 left-8 sm:top-12 sm:left-12 z-20">
                <Link to="/" className="group flex items-center text-sm font-bold tracking-widest uppercase text-neutral-400 hover:text-black transition-colors duration-300">
                    <ArrowLeft className="w-4 h-4 mr-3 group-hover:-translate-x-1 transition-transform" strokeWidth={3} />
                    Return
                </Link>
            </div>

            <div className="w-full max-w-xl mx-auto z-10 mt-12 sm:mt-0">
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                >
                    <motion.img 
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 1, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
                        src="/icon-512x512.png" 
                        alt="MathLogs Logo" 
                        fetchPriority="high"
                        decoding="async"
                        className="w-16 h-16 sm:w-20 sm:h-20 mb-6 drop-shadow-sm rounded-2xl" 
                    />
                    <h1 className="text-[14vw] sm:text-[100px] font-black tracking-tighter leading-none mb-6">
                        MathLogs.
                    </h1>
                    <p className="text-lg sm:text-2xl text-neutral-400 font-medium tracking-tight mb-12 sm:mb-20 max-w-md">
                        Enter your credentials to access the secure administration gateway.
                    </p>
                </motion.div>

                <AnimatePresence>
                    {error && (
                        <motion.div
                            initial={{ opacity: 0, height: 0, y: -10 }}
                            animate={{ opacity: 1, height: 'auto', y: 0 }}
                            exit={{ opacity: 0, height: 0 }}
                            className="bg-black text-white p-5 mb-10 text-sm flex items-start overflow-hidden relative"
                        >
                            <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-red-500"></div>
                            <AlertCircle className="w-5 h-5 mr-3 flex-shrink-0 mt-0.5 text-red-500" />
                            <span className="whitespace-pre-line font-medium leading-relaxed">{error}</span>
                        </motion.div>
                    )}
                </AnimatePresence>

                <form onSubmit={handleLogin} className="space-y-10 sm:space-y-16">
                    <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
                        className="relative group"
                    >
                        <input
                            type="text"
                            id="identifier"
                            className="peer w-full bg-transparent border-b-2 border-neutral-200 text-black text-2xl sm:text-4xl pb-4 pt-6 focus:border-black outline-none transition-all placeholder:text-transparent font-medium rounded-none"
                            placeholder="Email or Mobile"
                            value={identifier}
                            onChange={(e) => setIdentifier(e.target.value.trim())}
                            required
                        />
                        <label 
                            htmlFor="identifier"
                            className={cn(
                                "absolute left-0 cursor-text transition-all duration-300",
                                identifier 
                                    ? "-top-4 text-xs sm:text-sm font-bold uppercase tracking-widest text-black"
                                    : "top-6 text-2xl sm:text-4xl text-neutral-300 font-medium",
                                "peer-focus:-top-4 peer-focus:text-xs peer-focus:sm:text-sm peer-focus:font-bold peer-focus:uppercase peer-focus:tracking-widest peer-focus:text-black"
                            )}
                        >
                            Email or Mobile
                        </label>
                    </motion.div>

                    <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
                        className="relative group"
                    >
                        <input
                            type="password"
                            id="password"
                            className="peer w-full bg-transparent border-b-2 border-neutral-200 text-black text-2xl sm:text-4xl pb-4 pt-6 focus:border-black outline-none transition-all placeholder:text-transparent font-medium rounded-none"
                            placeholder="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                        <label 
                            htmlFor="password"
                            className={cn(
                                "absolute left-0 cursor-text transition-all duration-300",
                                password 
                                    ? "-top-4 text-xs sm:text-sm font-bold uppercase tracking-widest text-black"
                                    : "top-6 text-2xl sm:text-4xl text-neutral-300 font-medium",
                                "peer-focus:-top-4 peer-focus:text-xs peer-focus:sm:text-sm peer-focus:font-bold peer-focus:uppercase peer-focus:tracking-widest peer-focus:text-black"
                            )}
                        >
                            Password
                        </label>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
                        className="pt-8"
                    >
                        <button
                            type="submit"
                            disabled={loading || !identifier || !password}
                            className="w-full bg-black text-white font-black py-7 sm:py-8 text-lg sm:text-xl uppercase tracking-widest rounded-none relative overflow-hidden transition-all duration-500 group disabled:bg-neutral-900 disabled:text-white disabled:cursor-not-allowed hover:bg-neutral-900 active:scale-[0.98] flex items-center justify-center"
                        >
                            <span className={cn("transition-transform duration-500", loading ? "translate-y-[-300%] opacity-0" : "translate-y-0 opacity-100")}>
                                Access Gateway
                            </span>
                            {!loading && (
                                <ArrowRight className="absolute right-8 w-6 h-6 opacity-0 -translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300 hidden sm:block" />
                            )}
                            <div className={cn("absolute inset-0 flex items-center justify-center transition-all duration-500", loading ? "translate-y-0 opacity-100" : "translate-y-[200%] opacity-0")}>
                                <div className="flex flex-col items-center gap-1.5 mt-1">
                                    <div className="flex items-end gap-1 h-4 mb-0.5">
                                        <motion.div animate={{ height: ["40%", "100%", "40%"] }} transition={{ duration: 1, repeat: Infinity, delay: 0, ease: "easeInOut" }} className="w-[3px] bg-white rounded-full" />
                                        <motion.div animate={{ height: ["60%", "100%", "60%"] }} transition={{ duration: 1, repeat: Infinity, delay: 0.15, ease: "easeInOut" }} className="w-[3px] bg-white rounded-full" />
                                        <motion.div animate={{ height: ["30%", "100%", "30%"] }} transition={{ duration: 1, repeat: Infinity, delay: 0.3, ease: "easeInOut" }} className="w-[3px] bg-white rounded-full" />
                                    </div>
                                    <span className="text-[10px] sm:text-xs uppercase tracking-[0.2em] text-white/90 font-bold">{loadingText}</span>
                                </div>
                            </div>
                        </button>
                    </motion.div>
                </form>
            </div>

            {/* Brutalist Corner Decorations */}
            <div className="absolute bottom-8 left-8 sm:bottom-12 sm:left-12 pointer-events-none hidden sm:block z-20">
                <p className="text-neutral-400 text-xs font-mono uppercase tracking-widest transform -rotate-90 origin-bottom-left">
                    v2.0 • System Active
                </p>
            </div>
            <div className="absolute bottom-8 right-8 sm:bottom-12 sm:right-12 pointer-events-none z-20">
                <div className="flex flex-col items-end gap-2">
                    <div className="h-1.5 w-12 bg-black"></div>
                    <div className="h-1.5 w-8 bg-neutral-300"></div>
                    <p className="text-neutral-400 text-xs font-mono uppercase tracking-widest mt-2">
                        AES-256
                    </p>
                </div>
            </div>
        </div>
    );
}
