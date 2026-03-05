import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Eye, EyeOff, Loader2, CheckCircle, AlertTriangle, Building2,
    BookOpen, Users, ChevronRight, Settings, Plus, X
} from 'lucide-react';

const API_URL = import.meta.env.PROD ? '/api' : (import.meta.env.VITE_API_URL || 'http://localhost:3001/api');

type Step = 'loading' | 'invalid' | 'configure' | 'credentials' | 'done';

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

    // Step 2: Credentials
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (!token) {
            setStep('invalid');
            setError('Missing invite token.');
            return;
        }
        validateToken();
    }, [token]);

    const validateToken = async () => {
        try {
            const res = await axios.get(`${API_URL}/invites/${token}`);
            setInstituteName(res.data.instituteName);
            setStep('configure');
        } catch (err: any) {
            setError(err.response?.data?.error || 'Invalid or expired invite link.');
            setStep('invalid');
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
            const res = await axios.post(`${API_URL}/auth/setup-account`, {
                token,
                username,
                password,
                requiresGrades,
                allowedClasses: classList,
                subjects: subjectList,
            });

            if (res.data.success) {
                localStorage.setItem('token', res.data.token);
                localStorage.setItem('adminId', res.data.adminId);
                setStep('done');
                setTimeout(() => navigate('/dashboard'), 1500);
            }
        } catch (err: any) {
            setError(err.response?.data?.error || 'Setup failed. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    // ── LOADING ──────────────────────────────────────────────────────────────
    if (step === 'loading') {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
                <Loader2 className="h-10 w-10 text-black animate-spin mb-4" />
                <p className="text-gray-500 font-medium">Verifying your link...</p>
            </div>
        );
    }

    // ── INVALID ───────────────────────────────────────────────────────────────
    if (step === 'invalid') {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
                <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 max-w-md w-full text-center">
                    <div className="mx-auto bg-red-50 h-16 w-16 rounded-full flex items-center justify-center mb-6">
                        <AlertTriangle className="h-8 w-8 text-red-500" />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Link Invalid</h2>
                    <p className="text-gray-500 mb-6">{error || 'This setup link is invalid or has already been used.'}</p>
                    <button
                        onClick={() => navigate('/')}
                        className="w-full py-3 px-4 bg-gray-900 hover:bg-black text-white rounded-xl font-medium transition-colors"
                    >
                        Go Home
                    </button>
                </div>
            </div>
        );
    }

    // ── SUCCESS ───────────────────────────────────────────────────────────────
    if (step === 'done') {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
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
