
import { useState } from 'react';
import { apiRequest } from '../utils/api';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Lock, User, ArrowRight, ShieldCheck, AlertOctagon, ArrowLeft } from 'lucide-react';

export default function AdminLogin() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        try {
            const data = await apiRequest('/auth/login', 'POST', { username, password });
            if (data.success) {
                localStorage.setItem('adminId', data.adminId);
                localStorage.setItem('token', data.token); // Store JWT
                localStorage.setItem('token', data.token); // Store JWT
                if (data.role === 'SUPER_ADMIN') {
                    navigate('/super-admin');
                } else {
                    navigate('/dashboard');
                }
            } else {
                setError(data.error || 'Login failed');
            }
        } catch (err: any) {
            // Handle suspension errors with reason
            if (err.message?.includes('suspended')) {
                const errorData = err.response?.data;
                const reason = errorData?.reason;
                setError(reason ?
                    `🚫 ${err.message}\n\n📋 Reason: ${reason}\n\n📧 Contact support for assistance.` :
                    err.message
                );
            } else {
                setError(err.message || 'Login failed');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-app-bg flex items-center justify-center p-4 relative overflow-hidden transition-colors duration-500">
            {/* Background Effects */}
            <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-accent/5 rounded-full blur-[128px] -translate-y-1/2 pointer-events-none"></div>

            <motion.div
                initial={{ opacity: 0, scale: 0.98, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
                className="bg-app-surface-opaque border border-app-border p-10 rounded-[32px] shadow-2xl w-full max-w-md relative z-10"
            >
                <div className="absolute top-6 left-6">
                    <Link to="/" className="text-app-text-tertiary hover:text-black transition-colors">
                        <ArrowLeft className="w-6 h-6" />
                    </Link>
                </div>

                <div className="text-center mb-10">
                    <div className="w-16 h-16 bg-transparent border-[1.5px] border-black rounded-3xl flex items-center justify-center mx-auto mb-6 text-black">
                        <ShieldCheck className="w-8 h-8" strokeWidth={1.5} />
                    </div>
                    <h1 className="text-3xl font-bold text-app-text tracking-tight mb-2">MathLogs</h1>
                    <p className="text-app-text-secondary text-sm">Secure Authentication Gateway</p>
                </div>

                {error && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="bg-danger/5 border border-danger/10 text-danger p-4 rounded-2xl mb-6 text-sm flex items-start"
                    >
                        <AlertOctagon className="w-5 h-5 mr-3 flex-shrink-0 mt-0.5" />
                        <span className="whitespace-pre-line">{error}</span>
                    </motion.div>
                )}

                <form onSubmit={handleLogin} className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest ml-1">Username</label>
                        <div className="relative group">
                            <User className="absolute left-4 top-3.5 w-5 h-5 text-gray-400 group-focus-within:text-black dark:group-focus-within:text-white transition-colors" />
                            <input
                                type="text"
                                className="w-full !bg-neutral-50 border-[1.5px] border-app-border text-app-text  pl-12 p-3.5 rounded-xl focus:ring-4 focus:ring-black/5 focus:border-black dark:focus:border-white outline-none transition-all placeholder:text-gray-400 font-medium"
                                placeholder="Enter admin username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest ml-1">Password</label>
                        <div className="relative group">
                            <Lock className="absolute left-4 top-3.5 w-5 h-5 text-gray-400 group-focus-within:text-black dark:group-focus-within:text-white transition-colors" />
                            <input
                                type="password"
                                className="w-full !bg-neutral-50 border-[1.5px] border-app-border text-app-text  pl-12 p-3.5 rounded-xl focus:ring-4 focus:ring-black/5 focus:border-black dark:focus:border-white outline-none transition-all placeholder:text-gray-400 font-medium"
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-gray-900 hover:bg-black dark:bg-white dark:text-black dark:hover:bg-gray-200 text-white font-bold py-4 rounded-xl mt-6 shadow-lg transition-all hover:scale-[1.01] active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center group"
                    >
                        {loading ? 'Authenticating...' : 'Access Dashboard'}
                        {!loading && <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />}
                    </button>
                </form>
            </motion.div>

            <p className="absolute bottom-6 text-app-text-tertiary/50 text-xs font-mono">v2.0 • Secured by AES-256</p>
        </div>
    );
}
