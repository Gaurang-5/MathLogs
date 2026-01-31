
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiRequest } from '../utils/api';
import { motion } from 'framer-motion';
import { User, Users, Smartphone, Mail, ArrowRight, CheckCircle, School } from 'lucide-react';
import ToastProvider from '../components/ToastProvider';
import toast from 'react-hot-toast';

interface RegisterProps {
    mode?: 'kiosk' | 'standard';
}

export default function Register({ mode = 'standard' }: RegisterProps) {
    const { batchId } = useParams();
    const [submitted, setSubmitted] = useState(false);

    const [parentName, setParentName] = useState('');
    const [studentName, setStudentName] = useState('');
    const [whatsapp, setWhatsapp] = useState('');
    const [email, setEmail] = useState('');
    const [schoolName, setSchoolName] = useState('');

    const [submittedData, setSubmittedData] = useState<any>(null);

    // Status Check
    const [batchStatus, setBatchStatus] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    // Fetch batch status with timeout protection
    useState(() => {
        if (batchId) {
            apiRequest(`/public/batch/${batchId}`, 'GET')
                .then(data => {
                    setBatchStatus(data);
                    setLoading(false);
                })
                .catch((error) => {
                    console.error('[BATCH_STATUS_ERROR]', { batchId, error: error.message });
                    setBatchStatus({ error: true });
                    setLoading(false);
                });
        }
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const toastId = toast.loading('Submitting registration...');
        const startTime = Date.now();


        // Multi-stage progressive feedback for better UX
        const feedback3s = setTimeout(() => {
            toast.loading('📝 Registration submitted! Processing...', { id: toastId });
        }, 3000);

        const feedback10s = setTimeout(() => {
            toast.loading('⏳ You\'re in the queue. Please wait, this may take up to 30 seconds...', { id: toastId });
        }, 10000);

        const feedback30s = setTimeout(() => {
            toast.loading('⏰ Still processing... Almost there! The server is handling many registrations.', { id: toastId });
        }, 30000);

        const clearFeedback = () => {
            clearTimeout(feedback3s);
            clearTimeout(feedback10s);
            clearTimeout(feedback30s);
        };

        try {
            const student = await apiRequest('/public/register', 'POST', {
                batchId,
                name: studentName,
                parentName,
                parentWhatsapp: whatsapp,
                parentEmail: email,
                schoolName
            });

            clearFeedback();

            const latencyMs = Date.now() - startTime;
            console.log('[REGISTRATION_LATENCY]', {
                latency: latencyMs,
                studentName,
                humanId: student.humanId,
                timestamp: new Date().toISOString()
            });

            if (latencyMs > 30000) {
                console.warn('[SLOW_REGISTRATION]', {
                    latency: latencyMs,
                    threshold: '30s',
                    studentName,
                    message: 'Registration took longer than expected - monitor server load'
                });
            }

            toast.success('✅ ✅ Registration successful!', { id: toastId });
            setSubmittedData({ ...student, batchId });
            setSubmitted(true);
        } catch (e: any) {
            clearFeedback();

            const latencyMs = Date.now() - startTime;
            console.error('[REGISTRATION_ERROR_LATENCY]', {
                latency: latencyMs,
                studentName,
                error: e.message,
                timestamp: new Date().toISOString()
            });

            const errorMessage = e.message || 'Failed to register. Please try again.';
            toast.error(errorMessage, { id: toastId });
        }
    };

    if (loading) {
        return <div className="min-h-screen bg-app-bg flex items-center justify-center text-app-text-secondary">Loading...</div>;
    }

    if (!batchStatus || batchStatus.error) {
        return <div className="min-h-screen bg-app-bg flex items-center justify-center text-app-text-secondary">Batch not found</div>;
    }

    if (batchStatus.isRegistrationEnded) {
        return (
            <div className="min-h-screen bg-app-bg flex items-center justify-center p-4 relative overflow-hidden font-sans">
                <div className="max-w-md w-full bg-app-surface-opaque p-10 rounded-[32px] shadow-2xl border border-app-border text-center">
                    <h1 className="text-2xl font-bold text-app-text mb-4">Registration Closed</h1>
                    <p className="text-app-text-secondary">Enrollment for {batchStatus.name} has officially ended.</p>
                </div>
            </div>
        );
    }

    if (!batchStatus.isRegistrationOpen) {
        return (
            <div className="min-h-screen bg-app-bg flex items-center justify-center p-4 relative overflow-hidden font-sans">
                <div className="max-w-md w-full bg-app-surface-opaque p-10 rounded-[32px] shadow-2xl border border-app-border text-center">
                    <h1 className="text-2xl font-bold text-app-text mb-4">Temporarily Closed</h1>
                    <p className="text-app-text-secondary">Registration for {batchStatus.name} is currently paused. Please check back later.</p>
                </div>
            </div>
        );
    }

    if (submitted) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-app-bg px-4 relative overflow-hidden font-sans">
                <div className="absolute inset-0 bg-accent/5 pointer-events-none"></div>

                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-app-surface-opaque backdrop-blur-xl p-10 rounded-[32px] shadow-2xl text-center max-w-sm w-full border border-success/20 relative z-10"
                >
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
                        className="w-20 h-20 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-6 ring-4 ring-success/5"
                    >
                        <CheckCircle className="w-10 h-10 text-success" />
                    </motion.div>

                    <h2 className="text-3xl font-bold mt-4 text-app-text tracking-tight">Registration Sent!</h2>

                    {mode === 'standard' && submittedData ? (
                        <div className="mt-8 bg-app-bg rounded-2xl p-5 text-left space-y-4 border border-app-border">
                            <div className="flex justify-between items-center pb-3 border-b border-app-border">
                                <span className="text-xs text-app-text-secondary uppercase font-bold tracking-wider">Student ID</span>
                                <span className="text-sm font-mono font-bold text-app-text bg-app-surface px-2 py-1 rounded-md border border-app-border">{submittedData.humanId || submittedData.id || '-'}</span>
                            </div>
                            <div>
                                <p className="text-xs text-app-text-tertiary uppercase font-bold mb-1">Student Name</p>
                                <p className="text-app-text font-semibold">{submittedData.name}</p>
                            </div>
                            <div>
                                <p className="text-xs text-app-text-tertiary uppercase font-bold mb-1">School</p>
                                <p className="text-app-text">{submittedData.schoolName}</p>
                            </div>
                            <div className="pt-2">
                                <p className="text-app-text-tertiary text-xs italic">Please save a screenshot of this card.</p>
                            </div>
                        </div>
                    ) : (
                        <p className="text-app-text-secondary mt-4 leading-relaxed">Your request has been submitted successfully.</p>
                    )}

                    {mode === 'kiosk' ? (
                        <button
                            onClick={() => {
                                setSubmitted(false);
                                setStudentName('');
                                setParentName('');
                                setWhatsapp('');
                                setEmail('');
                                setSchoolName('');
                                setSubmittedData(null);
                            }}
                            className="mt-8 bg-gray-900 hover:bg-black text-white font-bold py-3.5 px-6 rounded-xl w-full transition-colors flex items-center justify-center"
                        >
                            Register Another Student
                        </button>
                    ) : (
                        <p className="text-app-text-tertiary text-sm mt-8">You can close this window now.</p>
                    )}
                </motion.div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-app-bg flex items-center justify-center p-4 relative overflow-hidden font-sans">
            <ToastProvider />
            <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-accent/5 rounded-full blur-[100px] translate-x-1/3 -translate-y-1/3 pointer-events-none"></div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-md w-full bg-app-surface-opaque p-10 rounded-[32px] shadow-2xl border border-app-border relative z-10"
            >
                <div className="text-center mb-10">
                    <h1 className="text-3xl font-bold text-app-text tracking-tight mb-2">Student Registration</h1>
                    <p className="text-app-text-secondary">Join your batch and start learning.</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest ml-1">Student Name</label>
                        <div className="relative group">
                            <User className="absolute left-4 top-3.5 w-5 h-5 text-gray-400 group-focus-within:text-accent transition-colors" />
                            <input
                                className="w-full !bg-neutral-50 border border-app-border text-app-text  pl-12 p-3.5 rounded-xl focus:ring-2 focus:ring-accent/10 focus:border-accent outline-none transition-all placeholder:text-gray-400"
                                placeholder="Enter full name"
                                value={studentName}
                                onChange={e => setStudentName(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest ml-1">Parent Name</label>
                        <div className="relative group">
                            <Users className="absolute left-4 top-3.5 w-5 h-5 text-gray-400 group-focus-within:text-accent transition-colors" />
                            <input
                                className="w-full !bg-neutral-50 border border-app-border text-app-text  pl-12 p-3.5 rounded-xl focus:ring-2 focus:ring-accent/10 focus:border-accent outline-none transition-all placeholder:text-gray-400"
                                placeholder="Enter parent name"
                                value={parentName}
                                onChange={e => setParentName(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest ml-1">Parent WhatsApp</label>
                        <div className="relative group">
                            <Smartphone className="absolute left-4 top-3.5 w-5 h-5 text-gray-400 group-focus-within:text-accent transition-colors" />
                            <input
                                className="w-full !bg-neutral-50 border border-app-border text-app-text  pl-12 p-3.5 rounded-xl focus:ring-2 focus:ring-accent/10 focus:border-accent outline-none transition-all placeholder:text-gray-400"
                                placeholder="10-digit number"
                                value={whatsapp}
                                onChange={e => setWhatsapp(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest ml-1">School Name</label>
                        <div className="relative group">
                            <School className="absolute left-4 top-3.5 w-5 h-5 text-gray-400 group-focus-within:text-accent transition-colors" />
                            <input
                                className="w-full !bg-neutral-50 border border-app-border text-app-text  pl-12 p-3.5 rounded-xl focus:ring-2 focus:ring-accent/10 focus:border-accent outline-none transition-all placeholder:text-gray-400"
                                placeholder="Enter school name"
                                value={schoolName}
                                onChange={e => setSchoolName(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest ml-1">Parent Email</label>
                        <div className="relative group">
                            <Mail className="absolute left-4 top-3.5 w-5 h-5 text-gray-400 group-focus-within:text-accent transition-colors" />
                            <input
                                className="w-full !bg-neutral-50 border border-app-border text-app-text  pl-12 p-3.5 rounded-xl focus:ring-2 focus:ring-accent/10 focus:border-accent outline-none transition-all placeholder:text-gray-400"
                                type="email"
                                placeholder="email@example.com"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <button className="w-full bg-gray-900 hover:bg-black text-white font-bold py-4 rounded-xl mt-6 shadow-lg shadow-gray-200 transition-all hover:scale-[1.01] active:scale-[0.98] flex items-center justify-center group">
                        Submit Registration
                        <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                    </button>
                </form>
            </motion.div>
        </div>
    )
}
