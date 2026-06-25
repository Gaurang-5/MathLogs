
import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { apiRequest } from '../utils/api';
import { motion } from 'framer-motion';
import { User, Users, Smartphone, Mail, ArrowRight, CheckCircle, School, GraduationCap, BookOpen, AlertCircle, Hash, Type } from 'lucide-react';
import ToastProvider from '../components/ToastProvider';
import toast from 'react-hot-toast';
import { getCachedRegistration, type RegisteredStudent } from '../utils/registration';

interface RegisterProps {
    mode?: 'kiosk' | 'standard';
}

const DEFAULT_FORM_FIELDS = [
    { id: 'studentName', label: 'Student Name', type: 'text', required: true, system: true },
    { id: 'parentName', label: 'Parent / Guardian Name', type: 'text', required: true, system: true },
    { id: 'parentWhatsapp', label: 'WhatsApp Number', type: 'tel', required: true, system: true },
    { id: 'schoolName', label: 'School Name', type: 'text', required: false, system: true },
    { id: 'parentEmail', label: 'Parent Email (Optional)', type: 'email', required: false, system: true }
];

interface BatchStatus {
    error?: boolean;
    name?: string;
    subject?: string;
    isRegistrationEnded?: boolean;
    isRegistrationOpen?: boolean;
    autoSendWelcome?: boolean;
    whatsappGroupLink?: string;
    alreadyRegistered?: boolean;
    registeredStudent?: any;
    institute?: {
        name: string;
        logoUrl?: string | null;
        config?: {
            registrationForm?: {
                fields: any[];
            }
        }
    };
}

export default function Register({ mode = 'standard' }: RegisterProps) {
    const { batchId } = useParams();
    const cachedRegistration = getCachedRegistration(batchId, mode);
    const [submitted, setSubmitted] = useState(() => cachedRegistration !== null);

    const [formData, setFormData] = useState<Record<string, string>>({});

    const [submittedData, setSubmittedData] = useState<RegisteredStudent | null>(() => cachedRegistration);

    // Status Check
    const [batchStatus, setBatchStatus] = useState<BatchStatus | null>(null);
    const [loading, setLoading] = useState(true);

    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');
    const [isPhoneLocked, setIsPhoneLocked] = useState(false);

    useEffect(() => {
        if (token) {
            try {
                const payloadStr = atob(token.split('.')[1]);
                const payload = JSON.parse(payloadStr);

                // Check expiration
                if (payload.exp && payload.exp * 1000 < Date.now()) {
                    toast.error("Invite link has expired!");
                } else if (payload.whatsapp) {
                    setFormData(prev => ({ ...prev, parentWhatsapp: payload.whatsapp }));
                    setIsPhoneLocked(true);
                }
            } catch (e) {
                console.error("Invalid token format");
                toast.error("Invalid invite link.");
            }
        }
    }, [token]);

    // Fetch batch status with timeout protection
    useEffect(() => {
        if (batchId) {
            const url = token ? `/public/batch/${batchId}?token=${encodeURIComponent(token)}` : `/public/batch/${batchId}`;
            apiRequest<BatchStatus & { alreadyRegistered?: boolean, registeredStudent?: any }>(url, 'GET')
                .then(data => {
                    setBatchStatus(data);
                    
                    // Priority 1: If backend says token is already registered, force success state
                    if (data.alreadyRegistered && data.registeredStudent) {
                        setSubmittedData({ ...data.registeredStudent, batchId });
                        setSubmitted(true);
                    } else if (token) {
                        // Priority 2: If we have a token but backend says NOT already registered,
                        // clear any stale cached registration that might belong to another student.
                        if (submitted && cachedRegistration && cachedRegistration.batchId === batchId) {
                            setSubmitted(false);
                            setSubmittedData(null);
                        }
                    }
                    setLoading(false);
                })
                .catch((error) => {
                    console.error('[BATCH_STATUS_ERROR]', { batchId, error: error.message });
                    setBatchStatus({ error: true });
                    setLoading(false);
                });
        }
    }, [batchId, token]);

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

        const studentName = formData['studentName'] || '';
        
        try {
            const additionalData: Record<string, string> = {};
            const formFields = batchStatus?.institute?.config?.registrationForm?.fields || DEFAULT_FORM_FIELDS;
            
            formFields.forEach(f => {
                if (!f.system) {
                    additionalData[f.id] = formData[f.id] || '';
                }
            });

            const student = await apiRequest<RegisteredStudent>('/public/register', 'POST', {
                batchId,
                name: formData['studentName'] || '',
                parentName: formData['parentName'] || '',
                parentWhatsapp: formData['parentWhatsapp'] || '',
                parentEmail: formData['parentEmail'] || undefined,
                schoolName: formData['schoolName'] || undefined,
                additionalData,
                ...(token && { token })
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
            const finalData = { ...student, batchId };
            setSubmittedData(finalData);
            setSubmitted(true);
            
            if (mode === 'standard') {
                localStorage.setItem(`registered_batch_${batchId}`, JSON.stringify(finalData));
            }

        } catch (error: unknown) {
            clearFeedback();

            const latencyMs = Date.now() - startTime;
            console.error('[REGISTRATION_ERROR_LATENCY]', {
                latency: latencyMs,
                studentName,
                error: error instanceof Error ? error.message : 'Unknown error',
                timestamp: new Date().toISOString()
            });

            const errorMessage = error instanceof Error ? error.message : 'Failed to register. Please try again.';
            toast.error(errorMessage, { id: toastId });
        }
    };



    // ─── Loading ───
    if (loading) {
        return (
            <div className="min-h-screen bg-app-bg flex items-center justify-center font-sans">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center gap-3"
                >
                    <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                    <p className="text-app-text-secondary text-sm">Loading registration...</p>
                </motion.div>
            </div>
        );
    }

    // ─── Not Found ───
    if (!batchStatus || batchStatus.error) {
        return (
            <div className="min-h-screen bg-app-bg flex items-center justify-center p-4 pt-[calc(5.5rem+env(safe-area-inset-top))] font-sans">
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="max-w-sm w-full bg-app-surface-opaque p-8 rounded-2xl shadow-lg border border-app-border text-center"
                >
                    <div className="w-14 h-14 bg-danger/10 rounded-full flex items-center justify-center mx-auto mb-4">
                        <AlertCircle className="w-7 h-7 text-danger" />
                    </div>
                    <h2 className="text-xl font-bold text-app-text mb-2">Batch Not Found</h2>
                    <p className="text-app-text-secondary text-sm">This registration link may have expired or is invalid. Please contact your coach.</p>
                </motion.div>
            </div>
        );
    }

    // ─── Registration Ended ───
    if (batchStatus.isRegistrationEnded) {
        return (
            <div className="min-h-screen bg-app-bg flex items-center justify-center p-4 pt-[calc(5.5rem+env(safe-area-inset-top))] font-sans">
                <motion.div
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="max-w-sm w-full bg-app-surface-opaque p-8 rounded-2xl shadow-lg border border-app-border text-center"
                >
                    <div className="text-center mb-6">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3 overflow-hidden ${batchStatus?.institute?.logoUrl ? 'shadow-md bg-transparent' : 'bg-accent/10 ring-4 ring-accent/5'}`}>
                            {batchStatus?.institute?.logoUrl ? (
                                <img src={batchStatus.institute.logoUrl} alt="Institute Logo" className="w-full h-full object-contain" />
                            ) : (
                                <GraduationCap className="w-6 h-6 text-accent" />
                            )}
                        </div>
                        {batchStatus?.institute?.name && (
                            <h2 className="text-xl font-bold text-app-text tracking-tight leading-tight">
                                {batchStatus.institute.name}
                            </h2>
                        )}
                    </div>
                    <div className="w-12 h-12 bg-neutral-100 rounded-full flex items-center justify-center mx-auto mb-4 mt-4">
                        <AlertCircle className="w-6 h-6 text-neutral-500" />
                    </div>
                    <h2 className="text-lg font-bold text-app-text mb-2">Registration Closed</h2>
                    <p className="text-app-text-secondary text-sm">
                        Enrollment for <span className="font-semibold text-app-text">{batchStatus.name}</span> has officially ended.
                    </p>
                </motion.div>
            </div>
        );
    }

    // ─── Registration Paused ───
    if (!batchStatus.isRegistrationOpen) {
        return (
            <div className="min-h-screen bg-app-bg flex items-center justify-center p-4 pt-[calc(5.5rem+env(safe-area-inset-top))] font-sans">
                <motion.div
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="max-w-sm w-full bg-app-surface-opaque p-8 rounded-2xl shadow-lg border border-app-border text-center"
                >
                    <div className="text-center mb-6">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3 overflow-hidden ${batchStatus?.institute?.logoUrl ? 'shadow-md bg-transparent' : 'bg-accent/10 ring-4 ring-accent/5'}`}>
                            {batchStatus?.institute?.logoUrl ? (
                                <img src={batchStatus.institute.logoUrl} alt="Institute Logo" className="w-full h-full object-contain" />
                            ) : (
                                <GraduationCap className="w-6 h-6 text-accent" />
                            )}
                        </div>
                        {batchStatus?.institute?.name && (
                            <h2 className="text-xl font-bold text-app-text tracking-tight leading-tight">
                                {batchStatus.institute.name}
                            </h2>
                        )}
                    </div>
                    <div className="w-12 h-12 bg-warning/10 rounded-full flex items-center justify-center mx-auto mb-4 mt-4">
                        <AlertCircle className="w-6 h-6 text-warning" />
                    </div>
                    <h2 className="text-lg font-bold text-app-text mb-2">Temporarily Paused</h2>
                    <p className="text-app-text-secondary text-sm">
                        Registration for <span className="font-semibold text-app-text">{batchStatus.name}</span> is currently paused. Please check back later.
                    </p>
                </motion.div>
            </div>
        );
    }

    // ─── Success Screen ───
    if (submitted) {
        return (
            <div className="min-h-screen bg-app-bg flex items-center justify-center px-4 font-sans">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-app-surface-opaque p-8 sm:p-10 rounded-2xl shadow-lg text-center max-w-sm w-full border border-success/20"
                >
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
                        className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-5 ring-4 ring-success/5"
                    >
                        <CheckCircle className="w-8 h-8 text-success" />
                    </motion.div>

                    <h2 className="text-2xl font-bold text-app-text tracking-tight">
                        {batchStatus?.alreadyRegistered ? 'Already Registered' : 'Registration Sent!'}
                    </h2>

                    {batchStatus?.institute?.name && (
                        <p className="text-app-text-secondary text-sm mt-1">{batchStatus.institute.name}</p>
                    )}

                    {mode === 'standard' && submittedData ? (
                        <div className="mt-6 bg-app-bg rounded-xl p-4 text-left space-y-3 border border-app-border">
                            <div className="flex justify-between items-center pb-3 border-b border-app-border">
                                <span className="text-xs text-app-text-secondary font-semibold uppercase tracking-wider">Student ID</span>
                                <span className="text-sm font-mono font-bold text-app-text bg-app-surface-opaque px-2.5 py-0.5 rounded-md border border-app-border">{submittedData.humanId || submittedData.id || '-'}</span>
                            </div>
                            <div>
                                <p className="text-xs text-app-text-tertiary font-semibold mb-0.5">Student Name</p>
                                <p className="text-app-text font-medium text-sm">{submittedData.name}</p>
                            </div>
                            <div>
                                <p className="text-xs text-app-text-tertiary font-semibold mb-0.5">School</p>
                                <p className="text-app-text text-sm">{submittedData.schoolName}</p>
                            </div>
                            <div className="pt-2 border-t border-app-border">
                                {mode === 'kiosk' ? (
                                    <div className="space-y-1 mt-1 bg-blue-50 p-3 rounded-lg border border-blue-100">
                                        <p className="text-sm text-blue-800 font-medium">WhatsApp Invitation</p>
                                        <p className="text-xs text-blue-600">A WhatsApp message will be sent to your registered number shortly.</p>
                                    </div>
                                ) : batchStatus?.autoSendWelcome && batchStatus?.whatsappGroupLink ? (
                                    <div className="space-y-2 mt-1">
                                        <p className="text-sm text-app-text font-medium">Join the WhatsApp Group</p>
                                        <p className="text-xs text-app-text-secondary">Join for updates and announcements.</p>
                                        <a href={batchStatus.whatsappGroupLink} target="_blank" rel="noopener noreferrer" className="block w-full bg-[#25D366] hover:bg-[#128C7E] text-white font-semibold py-2.5 px-4 rounded-xl text-center transition-colors text-sm">
                                            Join WhatsApp Group
                                        </a>
                                    </div>
                                ) : (
                                    <div className="space-y-1 mt-1 bg-warning/10 p-3 rounded-lg border border-warning/20">
                                        <p className="text-sm text-yellow-600 font-medium">WhatsApp Link Coming Soon</p>
                                        <p className="text-xs text-app-text-secondary">You will receive the group link on WhatsApp shortly.</p>
                                    </div>
                                )}
                            </div>
                            <p className="text-app-text-tertiary text-xs italic pt-1">Please save a screenshot of this card.</p>
                        </div>
                    ) : (
                        <div className="mt-5 space-y-4">
                            <p className="text-app-text-secondary text-sm leading-relaxed">Your request has been submitted successfully.</p>
                            {mode === 'kiosk' ? (
                                <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 text-left">
                                    <p className="text-sm text-blue-800 font-medium">WhatsApp Invitation</p>
                                    <p className="text-xs text-blue-600 mt-1">A WhatsApp message will be sent to your registered number shortly.</p>
                                </div>
                            ) : batchStatus?.autoSendWelcome && batchStatus?.whatsappGroupLink ? (
                                <a href={batchStatus.whatsappGroupLink} target="_blank" rel="noopener noreferrer" className="block w-full bg-[#25D366] hover:bg-[#128C7E] text-white font-semibold py-3 px-4 rounded-xl text-center transition-colors">
                                    Join WhatsApp Group
                                </a>
                            ) : (
                                <div className="bg-warning/10 p-3 rounded-lg border border-warning/20 text-left">
                                    <p className="text-sm text-yellow-600 font-medium">WhatsApp Link Coming Soon</p>
                                    <p className="text-xs text-app-text-secondary mt-1">You will receive the group link on WhatsApp shortly.</p>
                                </div>
                            )}
                        </div>
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
                            className="mt-6 bg-neutral-900 hover:bg-black text-white font-semibold py-3 px-6 rounded-xl w-full transition-colors flex items-center justify-center"
                        >
                            Register Another Student
                        </button>
                    ) : (
                        <p className="text-app-text-tertiary text-sm mt-6">You can close this window now.</p>
                    )}
                </motion.div>
            </div>
        )
    }

    // ─── Main Registration Form ───
    const inputClass = "w-full bg-neutral-50/80 border border-neutral-200/80 text-app-text pl-11 pr-4 py-3 rounded-xl focus:bg-white focus:ring-2 focus:ring-accent/20 focus:border-accent/40 outline-none transition-all placeholder:text-neutral-400 text-[15px]";
    const iconClass = "absolute left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-neutral-400 group-focus-within:text-accent transition-colors";

    return (
        <div className="min-h-screen bg-app-bg font-sans">
            <ToastProvider />

            {/* ─── Branded Hero ─── */}
            <div className="relative overflow-hidden">
                {/* Decorative gradient background */}
                <div className="absolute inset-0 bg-gradient-to-b from-accent/[0.06] via-accent/[0.02] to-transparent pointer-events-none" />
                <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-accent/[0.04] rounded-full blur-[80px] translate-x-1/3 -translate-y-1/3 pointer-events-none" />

                <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="relative max-w-md mx-auto pt-8 sm:pt-10 pb-8 px-4"
                >
                    <div className="flex flex-row items-center justify-center gap-4 sm:gap-6">
                        {/* Institute Brand Icon/Logo */}
                        <div className={`w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 shrink-0 rounded-2xl flex items-center justify-center overflow-hidden ${batchStatus?.institute?.logoUrl ? '' : 'bg-accent/10 ring-4 ring-accent/5'}`}>
                            {batchStatus?.institute?.logoUrl ? (
                                <img src={batchStatus.institute.logoUrl} alt="Institute Logo" className="w-full h-full object-contain drop-shadow-sm" />
                            ) : (
                                <GraduationCap className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 text-accent" />
                            )}
                        </div>

                        {/* Text Container */}
                        <div className="flex flex-col items-start text-left gap-1 sm:gap-1.5">
                            {/* Institute Name — THE BRAND */}
                            {batchStatus?.institute?.name && (
                                <h1 className="text-[20px] sm:text-[24px] font-bold text-app-text tracking-tight leading-none">
                                    {batchStatus.institute.name}
                                </h1>
                            )}

                            {/* Batch Info Pill */}
                            <div className="inline-flex items-center gap-2 bg-neutral-100/90 rounded-full px-3 py-1 shadow-sm w-fit mt-0.5 border border-neutral-200/50">
                                {batchStatus?.subject && (
                                    <>
                                        <BookOpen className="w-3.5 h-3.5 text-accent flex-shrink-0" />
                                        <span className="text-xs font-semibold text-app-text">{batchStatus.subject}</span>
                                        <span className="text-neutral-300">|</span>
                                    </>
                                )}
                                <span className="text-xs font-semibold text-app-text">{batchStatus?.name || 'Batch'}</span>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </div>

            {/* ─── Form Card ─── */}
            <div className="px-4 pb-10 -mt-1">
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.08 }}
                    className="max-w-md mx-auto bg-app-surface-opaque rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-white/60 p-6 sm:p-8"
                >
                    <h2 className="text-lg font-semibold text-app-text mb-1">Student Registration</h2>
                    <p className="text-sm text-app-text-tertiary mb-6">Fill in the details below to enroll.</p>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        {(batchStatus?.institute?.config?.registrationForm?.fields || DEFAULT_FORM_FIELDS).map((field) => (
                            <div key={field.id}>
                                <label className="block text-sm font-medium text-app-text-secondary mb-1.5 ml-0.5">
                                    {field.label} {!field.required && <span className="text-app-text-tertiary font-normal">(Optional)</span>}
                                </label>
                                <div className="relative group">
                                    {field.type === 'tel' || field.id === 'parentWhatsapp' ? (
                                        <Smartphone className={iconClass} />
                                    ) : field.type === 'email' ? (
                                        <Mail className={iconClass} />
                                    ) : field.type === 'number' ? (
                                        <Hash className={iconClass} />
                                    ) : field.id === 'studentName' ? (
                                        <User className={iconClass} />
                                    ) : field.id === 'parentName' ? (
                                        <Users className={iconClass} />
                                    ) : field.id === 'schoolName' ? (
                                        <School className={iconClass} />
                                    ) : (
                                        <Type className={iconClass} />
                                    )}
                                    <input
                                        type={field.type === 'tel' ? 'tel' : field.type === 'email' ? 'email' : field.type === 'number' ? 'number' : 'text'}
                                        inputMode={field.type === 'tel' || field.type === 'number' ? 'numeric' : undefined}
                                        maxLength={field.type === 'tel' ? 10 : undefined}
                                        readOnly={field.id === 'parentWhatsapp' && isPhoneLocked}
                                        className={`${inputClass} ${field.id === 'parentWhatsapp' && isPhoneLocked ? 'opacity-70 bg-neutral-100 cursor-not-allowed' : ''}`}
                                        placeholder={`Enter ${field.label.toLowerCase()}`}
                                        value={formData[field.id] || ''}
                                        onChange={e => {
                                            if (field.id === 'parentWhatsapp' && isPhoneLocked) return;
                                            
                                            let val = e.target.value;
                                            if (field.type === 'tel') {
                                                val = val.replace(/\D/g, '');
                                                if (val.length > 10) return;
                                            }
                                            setFormData(prev => ({ ...prev, [field.id]: val }));
                                        }}
                                        required={field.required}
                                    />
                                </div>
                            </div>
                        ))}

                        {/* Warning */}
                        <div className="pt-2">
                            <p className="text-xs text-app-text-tertiary text-center flex items-center justify-center gap-1.5">
                                <AlertCircle className="w-3.5 h-3.5" />
                                Please submit this form only once.
                            </p>
                        </div>

                        {/* Submit */}
                        <button
                            type="submit"
                            className="w-full bg-neutral-900 hover:bg-black text-white font-semibold py-3.5 rounded-xl mt-2 shadow-md shadow-neutral-900/20 transition-all duration-200 hover:shadow-lg hover:shadow-black/25 active:scale-[0.98] flex items-center justify-center gap-2 group"
                        >
                            Submit Registration
                            <ArrowRight className="w-[18px] h-[18px] group-hover:translate-x-0.5 transition-transform" />
                        </button>
                    </form>
                </motion.div>

                {/* Footer branding */}
                <p className="text-center text-app-text-tertiary text-xs mt-6 tracking-wide">
                    Powered by <span className="font-semibold">MathLogs</span>
                </p>
            </div>
        </div>
    )
}
