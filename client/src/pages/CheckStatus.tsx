import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiRequest } from '../utils/api';
import { motion } from 'framer-motion';
import { Search, CheckCircle, XCircle, ArrowLeft, Smartphone } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { appleSpringDefault, appleSpringSnappy } from '../utils/appleDesign';

interface RegistrationStatusStudent {
    id?: string;
    humanId?: string | null;
    name: string;
    schoolName?: string | null;
    status: string;
    registeredAt: string;
}

interface RegistrationStatusResult {
    error?: boolean;
    registered?: boolean;
    student?: RegistrationStatusStudent;
}

const getErrorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

export default function CheckStatus() {
    const { batchId } = useParams();
    const navigate = useNavigate();
    const [whatsapp, setWhatsapp] = useState('');
    const [checking, setChecking] = useState(false);
    const [result, setResult] = useState<RegistrationStatusResult | null>(null);

    const handleCheck = async (e: React.FormEvent) => {
        e.preventDefault();
        setChecking(true);
        setResult(null);

        try {
            const data = await apiRequest<RegistrationStatusResult>(`/public/check-status?whatsapp=${encodeURIComponent(whatsapp)}&batchId=${batchId}`, 'GET');
            setResult(data);

            if (data.registered) {
                toast.success('Registration found!');
            } else {
                toast.error('No registration found');
            }
        } catch (error: unknown) {
            toast.error(getErrorMessage(error, 'Failed to check status'));
            setResult({ error: true });
        } finally {
            setChecking(false);
        }
    };

    return (
        <div className="min-h-screen bg-neutral-50 flex items-center justify-center p-4 pt-[calc(5.5rem+env(safe-area-inset-top))] relative overflow-hidden font-sans text-neutral-900 selection:bg-neutral-900 selection:text-white">
            <Toaster position="top-center" />

            {/* Background Effects */}
            <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-neutral-200/50 rounded-full blur-[120px] translate-x-1/3 -translate-y-1/3 pointer-events-none"></div>

            <motion.div
                initial={{ opacity: 0, y: 16, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={appleSpringDefault}
                className="max-w-md w-full bg-white/80 backdrop-blur-2xl p-8 sm:p-10 rounded-3xl shadow-xl border border-white/60 relative z-10"
            >
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-extrabold text-neutral-900 tracking-[-0.025em] mb-2">Check Registration Status</h1>
                    <p className="text-neutral-500 font-medium text-sm">Verify if your registration was successful</p>
                </div>

                {!result ? (
                    <form onSubmit={handleCheck} className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-neutral-700 uppercase tracking-wider ml-1">
                                Parent WhatsApp Number
                            </label>
                            <div className="relative group">
                                <Smartphone className="absolute left-4 top-3.5 w-5 h-5 text-neutral-400 group-focus-within:text-neutral-900 transition-colors" />
                                <input
                                    className="w-full bg-neutral-50/80 border border-neutral-200 text-neutral-900 pl-12 p-3.5 rounded-2xl focus:bg-white focus:ring-2 focus:ring-neutral-900 outline-none transition-all placeholder:text-neutral-400 font-medium"
                                    placeholder="Enter WhatsApp number"
                                    value={whatsapp}
                                    onChange={e => setWhatsapp(e.target.value)}
                                    required
                                />
                            </div>
                            <p className="text-xs text-neutral-400 font-medium ml-1">
                                Enter the same number used during registration
                            </p>
                        </div>

                        <motion.button
                            type="submit"
                            disabled={checking}
                            whileTap={{ scale: 0.95 }}
                            transition={appleSpringSnappy}
                            className="w-full bg-neutral-900 hover:bg-black text-white font-bold py-4 rounded-2xl shadow-md transition-colors flex items-center justify-center group disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        >
                            {checking ? (
                                'Checking...'
                            ) : (
                                <>
                                    <span>Check Status</span>
                                    <Search className="w-5 h-5 ml-2 group-hover:scale-110 transition-transform" />
                                </>
                            )}
                        </motion.button>

                        <button
                            type="button"
                            onClick={() => navigate(`/register/${batchId}`)}
                            className="w-full text-neutral-500 hover:text-neutral-900 font-semibold text-xs py-3 rounded-xl transition-colors flex items-center justify-center cursor-pointer"
                        >
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            Back to Registration
                        </button>
                    </form>
                ) : result.registered ? (
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={appleSpringDefault}
                        className="space-y-6"
                    >
                        <div className="bg-emerald-50/80 border border-emerald-200/80 rounded-2xl p-6 text-center">
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={appleSpringSnappy}
                                className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4"
                            >
                                <CheckCircle className="w-8 h-8 text-emerald-600" />
                            </motion.div>
                            <h2 className="text-xl font-extrabold text-neutral-900 mb-1">Registration Found!</h2>
                            <p className="text-emerald-700 text-xs font-semibold">Your registration was successful</p>
                        </div>

                        <div className="bg-neutral-50/80 rounded-2xl p-5 space-y-4 border border-neutral-200/60 font-medium text-xs">
                            <div className="flex justify-between items-center pb-3 border-b border-neutral-200/60">
                                <span className="text-neutral-400 font-bold uppercase tracking-wider">Student ID</span>
                                <span className="text-sm font-mono font-extrabold text-neutral-900 bg-white px-2.5 py-1 rounded-lg border border-neutral-200">
                                    {result.student?.humanId || result.student?.id || '-'}
                                </span>
                            </div>
                            <div>
                                <p className="text-neutral-400 font-bold uppercase tracking-wider mb-1">Student Name</p>
                                <p className="text-neutral-900 font-bold text-sm">{result.student?.name}</p>
                            </div>
                            {result.student?.schoolName && (
                                <div>
                                    <p className="text-neutral-400 font-bold uppercase tracking-wider mb-1">School</p>
                                    <p className="text-neutral-700">{result.student.schoolName}</p>
                                </div>
                            )}
                            <div>
                                <p className="text-neutral-400 font-bold uppercase tracking-wider mb-1">Status</p>
                                <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${
                                    result.student?.status === 'APPROVED'
                                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                        : 'bg-amber-100 text-amber-800 border border-amber-200'
                                }`}>
                                    {result.student?.status}
                                </span>
                            </div>
                            {result.student?.registeredAt && (
                                <div>
                                    <p className="text-neutral-400 font-bold uppercase tracking-wider mb-1">Registered On</p>
                                    <p className="text-neutral-600 text-xs">
                                        {new Date(result.student.registeredAt).toLocaleString()}
                                    </p>
                                </div>
                            )}
                        </div>

                        <div className="space-y-3">
                            <motion.button
                                whileTap={{ scale: 0.95 }}
                                onClick={() => setResult(null)}
                                className="w-full bg-neutral-900 hover:bg-black text-white font-bold py-3.5 rounded-2xl transition-colors cursor-pointer"
                            >
                                Check Another Number
                            </motion.button>
                            <button
                                onClick={() => navigate(`/register/${batchId}`)}
                                className="w-full text-neutral-500 hover:text-neutral-900 font-semibold text-xs py-3 rounded-xl transition-colors flex items-center justify-center cursor-pointer"
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
                        transition={appleSpringDefault}
                        className="space-y-6"
                    >
                        <div className="bg-amber-50/80 border border-amber-200/80 rounded-2xl p-6 text-center">
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={appleSpringSnappy}
                                className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4"
                            >
                                <XCircle className="w-8 h-8 text-amber-600" />
                            </motion.div>
                            <h2 className="text-xl font-extrabold text-neutral-900 mb-1">No Registration Found</h2>
                            <p className="text-amber-800 text-xs font-semibold">
                                No registration found for this WhatsApp number in this batch
                            </p>
                        </div>

                        <div className="bg-neutral-50/80 rounded-2xl p-5 border border-neutral-200/60 text-xs font-medium text-neutral-600">
                            <p className="font-bold text-neutral-800 mb-2">This could mean:</p>
                            <ul className="space-y-1.5 list-disc list-inside">
                                <li>The WhatsApp number doesn't match the one used during registration</li>
                                <li>Registration wasn't completed successfully</li>
                                <li>There was a network issue during registration</li>
                            </ul>
                        </div>

                        <div className="space-y-3">
                            <motion.button
                                whileTap={{ scale: 0.95 }}
                                onClick={() => navigate(`/register/${batchId}`)}
                                className="w-full bg-neutral-900 hover:bg-black text-white font-bold py-3.5 rounded-2xl transition-colors cursor-pointer"
                            >
                                Register Now
                            </motion.button>
                            <button
                                onClick={() => setResult(null)}
                                className="w-full text-neutral-500 hover:text-neutral-900 font-semibold text-xs py-3 rounded-xl transition-colors cursor-pointer"
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
