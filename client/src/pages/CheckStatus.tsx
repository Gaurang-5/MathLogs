import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiRequest } from '../utils/api';
import { motion } from 'framer-motion';
import { Search, CheckCircle, XCircle, ArrowLeft, Smartphone } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';

export default function CheckStatus() {
    const { batchId } = useParams();
    const navigate = useNavigate();
    const [whatsapp, setWhatsapp] = useState('');
    const [checking, setChecking] = useState(false);
    const [result, setResult] = useState<any>(null);

    const handleCheck = async (e: React.FormEvent) => {
        e.preventDefault();
        setChecking(true);
        setResult(null);

        try {
            const data = await apiRequest(`/public/check-status?whatsapp=${encodeURIComponent(whatsapp)}&batchId=${batchId}`, 'GET');
            setResult(data);

            if (data.registered) {
                toast.success('Registration found!');
            } else {
                toast.error('No registration found');
            }
        } catch (error: any) {
            toast.error(error.message || 'Failed to check status');
            setResult({ error: true });
        } finally {
            setChecking(false);
        }
    };

    return (
        <div className="min-h-screen bg-app-bg flex items-center justify-center p-4 relative overflow-hidden font-sans">
            <Toaster position="top-center" />

            {/* Background Effects */}
            <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-accent/5 rounded-full blur-[100px] translate-x-1/3 -translate-y-1/3 pointer-events-none"></div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-md w-full bg-app-surface-opaque p-10 rounded-[32px] shadow-2xl border border-app-border relative z-10"
            >
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-app-text tracking-tight mb-2">Check Registration Status</h1>
                    <p className="text-app-text-secondary">Verify if your registration was successful</p>
                </div>

                {!result ? (
                    <form onSubmit={handleCheck} className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-app-text-secondary uppercase tracking-widest ml-1">
                                Parent WhatsApp Number
                            </label>
                            <div className="relative group">
                                <Smartphone className="absolute left-4 top-3.5 w-5 h-5 text-app-text-tertiary group-focus-within:text-accent transition-colors" />
                                <input
                                    className="w-full bg-app-bg border border-app-border text-app-text pl-12 p-3.5 rounded-xl focus:ring-2 focus:ring-accent/10 focus:border-accent outline-none transition-all placeholder:text-app-text-tertiary/50"
                                    placeholder="Enter WhatsApp number"
                                    value={whatsapp}
                                    onChange={e => setWhatsapp(e.target.value)}
                                    required
                                />
                            </div>
                            <p className="text-xs text-app-text-tertiary ml-1">
                                Enter the same number used during registration
                            </p>
                        </div>

                        <button
                            type="submit"
                            disabled={checking}
                            className="w-full bg-gray-900 hover:bg-black text-white font-bold py-4 rounded-xl shadow-lg transition-all hover:scale-[1.01] active:scale-[0.98] flex items-center justify-center group disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {checking ? (
                                'Checking...'
                            ) : (
                                <>
                                    Check Status
                                    <Search className="w-5 h-5 ml-2 group-hover:scale-110 transition-transform" />
                                </>
                            )}
                        </button>

                        <button
                            type="button"
                            onClick={() => navigate(`/register/${batchId}`)}
                            className="w-full text-app-text-secondary hover:text-app-text py-3 rounded-xl transition-colors flex items-center justify-center"
                        >
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            Back to Registration
                        </button>
                    </form>
                ) : result.registered ? (
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="space-y-6"
                    >
                        <div className="bg-success/10 border border-success/20 rounded-2xl p-6 text-center">
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
                                className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-4"
                            >
                                <CheckCircle className="w-8 h-8 text-success" />
                            </motion.div>
                            <h2 className="text-xl font-bold text-app-text mb-2">Registration Found!</h2>
                            <p className="text-app-text-secondary text-sm">Your registration was successful</p>
                        </div>

                        <div className="bg-app-bg rounded-2xl p-5 space-y-4 border border-app-border">
                            <div className="flex justify-between items-center pb-3 border-b border-app-border">
                                <span className="text-xs text-app-text-secondary uppercase font-bold">Student ID</span>
                                <span className="text-sm font-mono font-bold text-app-text bg-app-surface px-2 py-1 rounded-md border border-app-border">
                                    {result.student.humanId || result.student.id || '-'}
                                </span>
                            </div>
                            <div>
                                <p className="text-xs text-app-text-tertiary uppercase font-bold mb-1">Student Name</p>
                                <p className="text-app-text font-semibold">{result.student.name}</p>
                            </div>
                            <div>
                                <p className="text-xs text-app-text-tertiary uppercase font-bold mb-1">School</p>
                                <p className="text-app-text">{result.student.schoolName}</p>
                            </div>
                            <div>
                                <p className="text-xs text-app-text-tertiary uppercase font-bold mb-1">Status</p>
                                <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${result.student.status === 'APPROVED'
                                        ? 'bg-success/10 text-success'
                                        : 'bg-orange-500/10 text-orange-500'
                                    }`}>
                                    {result.student.status}
                                </span>
                            </div>
                            <div>
                                <p className="text-xs text-app-text-tertiary uppercase font-bold mb-1">Registered On</p>
                                <p className="text-app-text text-sm">
                                    {new Date(result.student.registeredAt).toLocaleString()}
                                </p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <button
                                onClick={() => setResult(null)}
                                className="w-full bg-gray-900 hover:bg-black text-white font-bold py-3 rounded-xl transition-colors"
                            >
                                Check Another Number
                            </button>
                            <button
                                onClick={() => navigate(`/register/${batchId}`)}
                                className="w-full text-app-text-secondary hover:text-app-text py-3 rounded-xl transition-colors flex items-center justify-center"
                            >
                                <ArrowLeft className="w-4 h-4 mr-2" />
                                Back to Registration
                            </button>
                        </div>
                    </motion.div>
                ) : (
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="space-y-6"
                    >
                        <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-6 text-center">
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
                                className="w-16 h-16 bg-orange-500/10 rounded-full flex items-center justify-center mx-auto mb-4"
                            >
                                <XCircle className="w-8 h-8 text-orange-500" />
                            </motion.div>
                            <h2 className="text-xl font-bold text-app-text mb-2">No Registration Found</h2>
                            <p className="text-app-text-secondary text-sm">
                                No registration found for this WhatsApp number in this batch
                            </p>
                        </div>

                        <div className="bg-app-bg rounded-2xl p-5 border border-app-border">
                            <p className="text-sm text-app-text-secondary mb-3">This could mean:</p>
                            <ul className="space-y-2 text-sm text-app-text-secondary">
                                <li className="flex items-start">
                                    <span className="mr-2">•</span>
                                    <span>The WhatsApp number doesn't match the one used during registration</span>
                                </li>
                                <li className="flex items-start">
                                    <span className="mr-2">•</span>
                                    <span>Registration wasn't completed successfully</span>
                                </li>
                                <li className="flex items-start">
                                    <span className="mr-2">•</span>
                                    <span>There was a network issue during registration</span>
                                </li>
                            </ul>
                        </div>

                        <div className="space-y-3">
                            <button
                                onClick={() => navigate(`/register/${batchId}`)}
                                className="w-full bg-gray-900 hover:bg-black text-white font-bold py-3 rounded-xl transition-colors"
                            >
                                Register Now
                            </button>
                            <button
                                onClick={() => setResult(null)}
                                className="w-full text-app-text-secondary hover:text-app-text py-3 rounded-xl transition-colors"
                            >
                                Try Different Number
                            </button>
                        </div>
                    </motion.div>
                )}
            </motion.div>
        </div>
    );
}
