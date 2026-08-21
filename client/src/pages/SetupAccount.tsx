import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Eye, EyeOff, Loader2, CheckCircle, AlertTriangle, Building2,
    BookOpen, Users, ChevronRight, Settings, Plus, X, Phone, RotateCcw
} from 'lucide-react';
import { API_URL } from '../utils/api';
import type { CoachingFeeMode } from '../features/month-coverage/types';

type Step = 'loading' | 'invalid' | 'configure' | 'credentials' | 'done';

interface ApiErrorResponse {
    error?: string;
}

interface InviteValidationResponse {
    instituteName: string;
    plan?: string;
    config?: any;
}

interface ResendSetupLinkResponse {
    message?: string;
}

interface SetupAccountResponse {
    success: boolean;
    adminId: string;
    token: string;
    refreshToken: string;
    isQuizOnly?: boolean;
}

const getAxiosErrorMessage = (error: unknown, fallback: string) => {
    if (axios.isAxiosError<ApiErrorResponse>(error)) {
        return error.response?.data?.error || fallback;
    }
    return fallback;
};

export default function SetupAccount() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const token = searchParams.get('token');

    const [step, setStep] = useState<Step>('loading');
    const [instituteName, setInstituteName] = useState('');
    const [error, setError] = useState('');

    // Step 1: Institute Configuration
    const [requiresGrades, setRequiresGrades] = useState(true);
    const [classesInput, setClassesInput] = useState('');
    const [subjectsInput, setSubjectsInput] = useState('');
    const [classList, setClassList] = useState<string[]>([]);
    const [subjectList, setSubjectList] = useState<string[]>(['Math', 'Science', 'English']);
    const [coachingFeeMode, setCoachingFeeMode] = useState<CoachingFeeMode>('CURRENT_DUE_BASED');

    // Step 2: Credentials
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Resend link state
    const [resendPhone, setResendPhone] = useState('');
    const [resendLoading, setResendLoading] = useState(false);
    const [resendResult, setResendResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        if (!token) {
            setStep('invalid');
            setError('Missing invite token.');
            return;
        }

        const validateToken = async () => {
            try {
                const res = await axios.get<InviteValidationResponse>(`${API_URL}/invites/${token}`);
                setInstituteName(res.data.instituteName);
                
                setStep('configure');
            } catch (error: unknown) {
                setError(getAxiosErrorMessage(error, 'Invalid or expired invite link.'));
                setStep('invalid');
            }
        };

        void validateToken();
    }, [token]);

    const handleResendLink = async () => {
        if (resendPhone.length < 10) return;
        setResendLoading(true);
        setResendResult(null);
        try {
            const res = await axios.post<ResendSetupLinkResponse>(`${API_URL}/onboarding/resend-setup-link`, { phone: resendPhone });
            setResendResult({ type: 'success', text: res.data.message || 'Setup link resent! Check your WhatsApp and email.' });
        } catch (error: unknown) {
            setResendResult({
                type: 'error',
                text: getAxiosErrorMessage(error, 'Failed to resend. Please try again.')
            });
        } finally {
            setResendLoading(false);
        }
    };

    const addTag = (value: string, list: string[], setter: (v: string[]) => void, inputSetter: (v: string) => void) => {
        const trimmed = value.trim();
        if (trimmed && !list.includes(trimmed)) {
            setter([...list, trimmed]);
        }
        inputSetter('');
    };

    const removeTag = (item: string, list: string[], setter: (v: string[]) => void) => {
        setter(list.filter(x => x !== item));
    };

    const handleConfigNext = (e: React.FormEvent) => {
        e.preventDefault();
        if (requiresGrades && classList.length === 0) {
            setError('Please add at least one class.');
            return;
        }
        if (subjectList.length === 0) {
            setError('Please add at least one subject.');
            return;
        }
        setError('');
        setStep('credentials');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError('');

        try {
            const res = await axios.post<SetupAccountResponse>(`${API_URL}/auth/setup-account`, {
                token,
                username,
                password,
                requiresGrades,
                allowedClasses: classList,
                subjects: subjectList,
                coachingFeeMode,
            });

            if (res.data.success) {
                localStorage.setItem('adminId', res.data.adminId);
                localStorage.setItem('token', res.data.token);
                if (res.data.refreshToken) localStorage.setItem('refreshToken', res.data.refreshToken);
                localStorage.setItem('isQuizOnly', String(res.data.isQuizOnly || false));
                setStep('done');
                setTimeout(() => navigate('/dashboard'), 1500);
            }
        } catch (error: unknown) {
            setError(getAxiosErrorMessage(error, 'Setup failed. Please try again.'));
        } finally {
            setIsSubmitting(false);
        }
    };

    // ── LOADING ──────────────────────────────────────────────────────────────
    if (step === 'loading') {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4 pt-[calc(5.5rem+env(safe-area-inset-top))]">
                <Loader2 className="h-10 w-10 text-black animate-spin mb-4" />
                <p className="text-gray-500 font-medium">Verifying your link...</p>
            </div>
        );
    }

    // ── INVALID ───────────────────────────────────────────────────────────────
    if (step === 'invalid') {
        return (
            <div className="min-h-screen bg-neutral-50 flex flex-col items-center justify-center p-4 pt-[calc(5.5rem+env(safe-area-inset-top))] font-sans selection:bg-neutral-900 selection:text-white">
                <motion.div
                    initial={{ opacity: 0, y: 16, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                    className="bg-white/80 backdrop-blur-2xl p-8 rounded-3xl shadow-xl border border-white/60 max-w-md w-full text-center"
                >
                    <div className="mx-auto bg-red-50 h-16 w-16 rounded-full flex items-center justify-center mb-6">
                        <AlertTriangle className="h-8 w-8 text-red-500" />
                    </div>
                    <h2 className="text-2xl font-extrabold text-neutral-900 tracking-[-0.025em] mb-2">Link Expired or Invalid</h2>
                    <p className="text-neutral-500 text-sm mb-6">{error || 'This setup link is invalid or has already been used.'}</p>

                    {/* Resend Section */}
                    <div className="bg-neutral-50/80 border border-neutral-200/80 rounded-2xl p-5 mb-6 text-left">
                        <div className="flex items-center gap-2 mb-3">
                            <RotateCcw className="h-4 w-4 text-neutral-600" />
                            <p className="text-sm font-bold text-neutral-800">Get a new setup link</p>
                        </div>
                        <p className="text-xs text-neutral-500 font-medium mb-3">Enter the phone number you used during signup:</p>
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                                <input
                                    type="tel"
                                    value={resendPhone}
                                    onChange={(e) => { setResendPhone(e.target.value); setResendResult(null); }}
                                    className="w-full bg-white border border-neutral-200 rounded-xl pl-10 pr-3 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-neutral-900 transition-all placeholder:text-neutral-400"
                                    placeholder="9876543210"
                                />
                            </div>
                            <motion.button
                                type="button"
                                whileTap={{ scale: 0.95 }}
                                transition={{ type: 'spring', stiffness: 450, damping: 30 }}
                                disabled={resendPhone.length < 10 || resendLoading}
                                onClick={handleResendLink}
                                className="px-4 py-2.5 bg-neutral-900 text-white rounded-xl font-bold text-sm hover:bg-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer"
                            >
                                {resendLoading ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    'Resend'
                                )}
                            </motion.button>
                        </div>

                        {resendResult && (
                            <motion.div
                                initial={{ opacity: 0, y: -5 }}
                                animate={{ opacity: 1, y: 0 }}
                                className={`mt-3 p-2.5 rounded-lg text-xs font-medium ${
                                    resendResult.type === 'success'
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                        : 'bg-red-50 text-red-600 border border-red-100'
                                }`}
                            >
                                {resendResult.text}
                            </motion.div>
                        )}
                    </div>

                    <button
                        onClick={() => navigate('/')}
                        className="w-full py-3 px-4 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-xl font-semibold transition-colors cursor-pointer text-sm"
                    >
                        Go Home
                    </button>
                </motion.div>
            </div>
        );
    }

    // ── SUCCESS ───────────────────────────────────────────────────────────────
    if (step === 'done') {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4 pt-[calc(5.5rem+env(safe-area-inset-top))]">
                <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="text-center"
                >
                    <div className="mx-auto bg-green-50 h-20 w-20 rounded-full flex items-center justify-center mb-6">
                        <CheckCircle className="h-10 w-10 text-green-500" />
                    </div>
                    <h2 className="text-3xl font-bold text-gray-900 mb-2">You're all set!</h2>
                    <p className="text-gray-500 mb-2">Launching your dashboard...</p>
                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-gray-400" />
                </motion.div>
            </div>
        );
    }

    // ── MAIN SETUP WRAPPER ───────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-3 sm:p-4 font-sans">
            <div className="max-w-lg w-full">

                {/* Header */}
                <div className="text-center mb-6 sm:mb-8">
                    <div className="mx-auto bg-blue-50 h-12 w-12 sm:h-14 sm:w-14 rounded-2xl flex items-center justify-center mb-3 sm:mb-4">
                        <Building2 className="h-6 w-6 sm:h-7 sm:w-7 text-blue-600" />
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight px-2">
                        Set up <span className="text-blue-600">{instituteName}</span>
                    </h1>
                    <p className="text-gray-500 mt-2 text-sm sm:text-base">
                        {step === 'configure' ? 'Configure your coaching center.' : 'Create your login credentials.'}
                    </p>
                </div>

                {/* Step indicators */}
                <div className="flex items-center justify-center gap-1.5 sm:gap-2 mb-6 sm:mb-8">
                    <div className={`flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-semibold ${step === 'configure' ? 'text-blue-600' : 'text-green-600'}`}>
                        <span className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-white text-xs font-bold ${step === 'configure' ? 'bg-blue-600' : 'bg-green-500'}`}>
                            {step === 'configure' ? '1' : <CheckCircle size={12} />}
                        </span>
                        Configure
                    </div>
                    <div className="w-6 sm:w-8 h-px bg-gray-300" />
                    <div className={`flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-semibold ${step === 'credentials' ? 'text-blue-600' : 'text-gray-400'}`}>
                        <span className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-xs font-bold ${step === 'credentials' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-400'}`}>
                            2
                        </span>
                        Create Login
                    </div>
                </div>

                <div className="bg-white rounded-2xl sm:rounded-3xl shadow-xl shadow-gray-100/50 border border-gray-100 overflow-hidden">
                    {/* Top accent bar */}
                    <div className="h-1.5 bg-gradient-to-r from-blue-500 to-indigo-600" />

                    <AnimatePresence mode="wait">

                        {/* ── STEP 1: CONFIGURE ─────────────────────────────── */}
                        {step === 'configure' && (
                            <motion.form
                                key="configure"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                onSubmit={handleConfigNext}
                                className="p-5 sm:p-8 space-y-6"
                            >
                                {error && (
                                    <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-sm text-red-600">
                                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                                        <p>{error}</p>
                                    </div>
                                )}

                                {/* Requires Grades */}
                                <div>
                                    <label className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-3">
                                        <Settings className="h-4 w-4 text-gray-400" />
                                        Require Grades / Classes?
                                    </label>
                                    <p className="text-xs text-gray-400 mb-3">Enable if your coaching organizes students by Class/Grade.</p>
                                    <div className="flex rounded-xl overflow-hidden border border-gray-200">
                                        <button
                                            type="button"
                                            onClick={() => setRequiresGrades(true)}
                                            className={`flex-1 py-3 text-sm font-bold transition-colors ${requiresGrades ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                                        >
                                            Yes
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setRequiresGrades(false)}
                                            className={`flex-1 py-3 text-sm font-bold transition-colors ${!requiresGrades ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                                        >
                                            No
                                        </button>
                                    </div>
                                </div>

                                {/* Classes */}
                                <AnimatePresence>
                                    {requiresGrades && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                        >
                                            <label className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-2">
                                                <Users className="h-4 w-4 text-gray-400" />
                                                Classes (press Enter to add)
                                            </label>
                                            <div className="flex gap-2 mb-2">
                                                <input
                                                    type="text"
                                                    value={classesInput}
                                                    onChange={e => setClassesInput(e.target.value)}
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter') {
                                                            e.preventDefault();
                                                            addTag(classesInput, classList, setClassList, setClassesInput);
                                                        }
                                                    }}
                                                    className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm font-medium"
                                                    placeholder="e.g. Class 9"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => addTag(classesInput, classList, setClassList, setClassesInput)}
                                                    className="px-3 py-2.5 bg-gray-900 text-white rounded-xl hover:bg-black transition-colors"
                                                >
                                                    <Plus className="h-4 w-4" />
                                                </button>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {classList.map(cls => (
                                                    <span key={cls} className="flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-700 rounded-lg text-sm font-semibold">
                                                        {cls}
                                                        <button type="button" onClick={() => removeTag(cls, classList, setClassList)}>
                                                            <X className="h-3 w-3" />
                                                        </button>
                                                    </span>
                                                ))}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                {/* Subjects */}
                                <div>
                                    <label className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-2">
                                        <BookOpen className="h-4 w-4 text-gray-400" />
                                        Subjects Offered (press Enter to add)
                                    </label>
                                    <div className="flex gap-2 mb-2">
                                        <input
                                            type="text"
                                            value={subjectsInput}
                                            onChange={e => setSubjectsInput(e.target.value)}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    addTag(subjectsInput, subjectList, setSubjectList, setSubjectsInput);
                                                }
                                            }}
                                            className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none text-sm font-medium"
                                            placeholder="e.g. Mathematics"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => addTag(subjectsInput, subjectList, setSubjectList, setSubjectsInput)}
                                            className="px-3 py-2.5 bg-gray-900 text-white rounded-xl hover:bg-black transition-colors"
                                        >
                                            <Plus className="h-4 w-4" />
                                        </button>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {subjectList.map(sub => (
                                            <span key={sub} className="flex items-center gap-1.5 px-3 py-1 bg-indigo-50 text-indigo-700 rounded-lg text-sm font-semibold">
                                                {sub}
                                                <button type="button" onClick={() => removeTag(sub, subjectList, setSubjectList)}>
                                                    <X className="h-3 w-3" />
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                <fieldset>
                                    <legend className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-2">
                                        <Settings className="h-4 w-4 text-gray-400" /> Fee planning system
                                    </legend>
                                    <p className="text-xs leading-5 text-gray-400 mb-3">Choose once for this coaching. Existing and new systems keep separate fee records.</p>
                                    <div className="grid gap-3">
                                        {([
                                            {
                                                value: 'CURRENT_DUE_BASED',
                                                title: 'Current amount-due system',
                                                copy: 'Use fixed fees, installments, and rupee balances.',
                                            },
                                            {
                                                value: 'MONTH_COVERAGE',
                                                title: 'Month coverage system',
                                                copy: 'Enter received amounts and track months received or pending.',
                                            },
                                        ] as const).map(option => {
                                            const selected = coachingFeeMode === option.value;
                                            return (
                                                <button
                                                    key={option.value}
                                                    type="button"
                                                    aria-pressed={selected}
                                                    onClick={() => setCoachingFeeMode(option.value)}
                                                    className={`rounded-2xl border-2 p-4 text-left transition-all ${selected ? 'border-blue-600 bg-blue-50/70 shadow-sm' : 'border-gray-200 bg-white hover:border-gray-300'}`}
                                                >
                                                    <span className="flex items-center justify-between gap-3">
                                                        <span className={`text-sm font-bold ${selected ? 'text-blue-900' : 'text-gray-800'}`}>{option.title}</span>
                                                        <span className={`h-4 w-4 rounded-full border-2 ${selected ? 'border-blue-600 bg-blue-600 ring-2 ring-blue-100' : 'border-gray-300'}`} />
                                                    </span>
                                                    <span className="mt-1 block text-xs leading-5 text-gray-500">{option.copy}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </fieldset>

                                <button
                                    type="submit"
                                    className="w-full py-4 bg-gray-900 hover:bg-black text-white rounded-xl font-bold text-base shadow-lg transition-all flex items-center justify-center gap-2"
                                >
                                    Continue
                                    <ChevronRight className="h-5 w-5" />
                                </button>
                            </motion.form>
                        )}

                        {/* ── STEP 2: CREDENTIALS ───────────────────────────── */}
                        {step === 'credentials' && (
                            <motion.form
                                key="credentials"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                onSubmit={handleSubmit}
                                className="p-5 sm:p-8 space-y-5"
                            >
                                {error && (
                                    <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-sm text-red-600">
                                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                                        <p>{error}</p>
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-gray-700 ml-1">Choose Username</label>
                                    <input
                                        type="text"
                                        value={username}
                                        onChange={e => setUsername(e.target.value)}
                                        className="w-full px-5 py-3.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-medium"
                                        placeholder="e.g. rahul_sir"
                                        required
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-gray-700 ml-1">Create Password</label>
                                    <div className="relative">
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            value={password}
                                            onChange={e => setPassword(e.target.value)}
                                            className="w-full px-5 py-3.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-medium"
                                            placeholder="••••••••"
                                            required
                                            minLength={6}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                        >
                                            {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                        </button>
                                    </div>
                                    <p className="text-xs text-gray-400 ml-1">Must be at least 6 characters</p>
                                </div>

                                <div className="flex gap-3 pt-2">
                                    <button
                                        type="button"
                                        onClick={() => setStep('configure')}
                                        className="py-4 px-5 border-2 border-gray-200 hover:border-gray-300 text-gray-700 rounded-xl font-bold transition-all"
                                    >
                                        Back
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className="flex-1 py-4 bg-gray-900 hover:bg-black text-white rounded-xl font-bold text-base shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 disabled:opacity-70"
                                    >
                                        {isSubmitting ? (
                                            <>
                                                <Loader2 className="h-5 w-5 animate-spin" />
                                                Creating Account...
                                            </>
                                        ) : (
                                            <>
                                                Create Account & Login
                                                <CheckCircle className="h-5 w-5 opacity-80" />
                                            </>
                                        )}
                                    </button>
                                </div>
                            </motion.form>
                        )}

                    </AnimatePresence>
                </div>

            </div>
        </div>
    );
}
