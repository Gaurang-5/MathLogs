import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Loader2, CheckCircle2, AlertTriangle, Building2,
    BookOpen, Users, ArrowRight, Plus, X, Phone, RotateCcw, MapPin, ShieldCheck, Sparkles, Store, EyeOff
} from 'lucide-react';
import { API_URL } from '../utils/api';
import type { CoachingFeeMode } from '../features/month-coverage/types';

const DEFAULT_SUBJECTS = [
    'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Science',
    'English', 'Hindi', 'Social Science', 'Commerce', 'Accountancy',
    'Economics', 'Computer Science'
];

const DEFAULT_CLASSES = [
    'Class 8', 'Class 9', 'Class 10', 'Class 11', 'Class 12', 'Dropper / Repeaters'
];

interface ApiErrorResponse {
    error?: string;
}

interface InviteValidationResponse {
    valid: boolean;
    instituteName: string;
    teacherName?: string;
    phoneNumber?: string;
    email?: string;
    plan?: string;
    billingCycle?: string;
    city?: string;
    area?: string;
    subjectsOffered?: string[];
    googleMapsUrl?: string;
    isPubliclyListed?: boolean;
    tagline?: string;
    description?: string;
    config?: {
        requiresGrades?: boolean;
        allowedClasses?: string[];
        subjects?: string[];
    };
}

interface ResendSetupLinkResponse {
    message?: string;
}

interface SetupAccountResponse {
    success: boolean;
    adminId: string;
    token: string;
    refreshToken?: string;
    role?: string;
    isQuizOnly?: boolean;
    isPageOnly?: boolean;
    message?: string;
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

    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isInvalid, setIsInvalid] = useState(false);
    const [isDone, setIsDone] = useState(false);
    const [error, setError] = useState('');

    // Institute details from backend
    const [instituteName, setInstituteName] = useState('');
    const [teacherName, setTeacherName] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [plan, setPlan] = useState('');
    const [coachingFeeMode, setCoachingFeeMode] = useState<CoachingFeeMode>('CURRENT_DUE_BASED');

    // Academic / Teaching Configuration (Always Active)
    const [selectedSubjects, setSelectedSubjects] = useState<string[]>(['Mathematics', 'Science']);
    const [customSubjectInput, setCustomSubjectInput] = useState('');
    const [customSubjects, setCustomSubjects] = useState<string[]>([]);
    const [requiresGrades, setRequiresGrades] = useState(true);
    const [classList, setClassList] = useState<string[]>(DEFAULT_CLASSES);
    const [classInput, setClassInput] = useState('');

    // Directory Listing Configuration (Independent & Optional)
    const [isPubliclyListed, setIsPubliclyListed] = useState(true);
    const [city, setCity] = useState('Muzaffarnagar');
    const [area, setArea] = useState('');
    const [googleMapsUrl, setGoogleMapsUrl] = useState('');
    const [description, setDescription] = useState('');

    // Resend link state
    const [resendPhone, setResendPhone] = useState('');
    const [resendLoading, setResendLoading] = useState(false);
    const [resendResult, setResendResult] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        if (!token) {
            setIsInvalid(true);
            setError('Missing or invalid setup token.');
            setIsLoading(false);
            return;
        }

        const validateToken = async () => {
            try {
                const res = await axios.get<InviteValidationResponse>(`${API_URL}/invites/${token}`);
                const data = res.data;
                setInstituteName(data.instituteName || 'Your Institute');
                setTeacherName(data.teacherName || '');
                setPhoneNumber(data.phoneNumber || '');
                setPlan(data.plan || '');

                if (data.city) setCity(data.city);
                if (data.area) setArea(data.area);
                if (data.googleMapsUrl) setGoogleMapsUrl(data.googleMapsUrl);
                if (data.isPubliclyListed !== undefined) setIsPubliclyListed(data.isPubliclyListed);
                if (data.tagline) setDescription(data.tagline);
                else if (data.description) setDescription(data.description);

                if (data.subjectsOffered && data.subjectsOffered.length > 0) {
                    setSelectedSubjects(data.subjectsOffered);
                } else if (data.config?.subjects && data.config.subjects.length > 0) {
                    setSelectedSubjects(data.config.subjects);
                }

                if (data.config?.allowedClasses && data.config.allowedClasses.length > 0) {
                    setClassList(data.config.allowedClasses);
                }

                if (data.config?.requiresGrades !== undefined) {
                    setRequiresGrades(data.config.requiresGrades);
                }

                setIsLoading(false);
            } catch (err: unknown) {
                setError(getAxiosErrorMessage(err, 'This setup link is invalid or has already been used.'));
                setIsInvalid(true);
                setIsLoading(false);
            }
        };

        void validateToken();
    }, [token]);

    const toggleSubject = (sub: string) => {
        setSelectedSubjects(prev =>
            prev.includes(sub) ? prev.filter(s => s !== sub) : [...prev, sub]
        );
    };

    const addCustomSubject = () => {
        const trimmed = customSubjectInput.trim();
        if (!trimmed) return;
        if (![...DEFAULT_SUBJECTS, ...customSubjects].some(s => s.toLowerCase() === trimmed.toLowerCase())) {
            setCustomSubjects(prev => [...prev, trimmed]);
        }
        if (!selectedSubjects.includes(trimmed)) {
            setSelectedSubjects(prev => [...prev, trimmed]);
        }
        setCustomSubjectInput('');
    };

    const addClass = () => {
        const trimmed = classInput.trim();
        if (trimmed && !classList.includes(trimmed)) {
            setClassList(prev => [...prev, trimmed]);
        }
        setClassInput('');
    };

    const removeClass = (cls: string) => {
        setClassList(prev => prev.filter(c => c !== cls));
    };

    const handleResendLink = async () => {
        const clean = resendPhone.replace(/\D/g, '').slice(0, 10);
        if (clean.length < 10) return;
        setResendLoading(true);
        setResendResult(null);
        try {
            const res = await axios.post<ResendSetupLinkResponse>(`${API_URL}/onboarding/resend-setup-link`, { phone: clean });
            setResendResult({ type: 'success', text: res.data.message || 'Setup link resent! Check your WhatsApp.' });
        } catch (err: unknown) {
            setResendResult({
                type: 'error',
                text: getAxiosErrorMessage(err, 'Failed to resend link. Please check the phone number.')
            });
        } finally {
            setResendLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (selectedSubjects.length === 0) {
            setError('Please select or add at least one subject taught at your institute.');
            return;
        }
        if (requiresGrades && classList.length === 0) {
            setError('Please add at least one class/grade.');
            return;
        }

        setIsSubmitting(true);
        setError('');

        try {
            const res = await axios.post<SetupAccountResponse>(`${API_URL}/auth/setup-account`, {
                token,
                city: isPubliclyListed ? city.trim() : null,
                area: isPubliclyListed ? area.trim() : null,
                subjectsOffered: selectedSubjects,
                googleMapsUrl: isPubliclyListed ? googleMapsUrl.trim() : null,
                isPubliclyListed,
                tagline: isPubliclyListed ? description.trim() : null,
                description: isPubliclyListed ? description.trim() : null,
                requiresGrades,
                allowedClasses: classList,
                coachingFeeMode,
            });

            if (res.data.success) {
                localStorage.setItem('adminId', res.data.adminId);
                localStorage.setItem('token', res.data.token);
                if (res.data.refreshToken) {
                    localStorage.setItem('refreshToken', res.data.refreshToken);
                }
                localStorage.setItem('isQuizOnly', String(Boolean(res.data.isQuizOnly)));
                if (res.data.isPageOnly !== undefined) {
                    localStorage.setItem('isPageOnly', String(Boolean(res.data.isPageOnly)));
                }

                setIsDone(true);
                setTimeout(() => {
                    navigate('/dashboard');
                }, 1400);
            } else {
                setError(res.data.message || 'Setup failed. Please try again.');
                setIsSubmitting(false);
            }
        } catch (err: unknown) {
            setError(getAxiosErrorMessage(err, 'Setup failed. Please check your connection and try again.'));
            setIsSubmitting(false);
        }
    };

    // ── LOADING ──────────────────────────────────────────────────────────────
    if (isLoading) {
        return (
            <div className="min-h-screen bg-[#FAFAFA] flex flex-col items-center justify-center p-4">
                <Loader2 className="h-10 w-10 text-black animate-spin mb-4" />
                <p className="text-neutral-500 font-bold text-sm tracking-tight">Verifying your setup authorization...</p>
            </div>
        );
    }

    // ── INVALID / EXPIRED ────────────────────────────────────────────────────
    if (isInvalid) {
        return (
            <div className="min-h-screen bg-[#FAFAFA] flex flex-col items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white border-2 border-neutral-200 p-8 rounded-3xl max-w-md w-full text-center space-y-6"
                >
                    <div className="mx-auto bg-neutral-100 h-16 w-16 rounded-2xl flex items-center justify-center">
                        <AlertTriangle className="h-8 w-8 text-neutral-900" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-black tracking-tight text-neutral-900 mb-2">Setup Link Expired or Used</h2>
                        <p className="text-neutral-500 text-xs font-medium leading-relaxed">
                            {error || 'This setup link is invalid or your portal has already been configured.'}
                        </p>
                    </div>

                    <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-5 text-left space-y-3">
                        <div className="flex items-center gap-2">
                            <RotateCcw className="h-4 w-4 text-neutral-700" />
                            <p className="text-xs font-bold text-neutral-900">Resend Setup Link via WhatsApp</p>
                        </div>
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                                <input
                                    type="tel"
                                    value={resendPhone}
                                    onChange={e => { setResendPhone(e.target.value.replace(/\D/g, '').slice(0, 10)); setResendResult(null); }}
                                    className="w-full bg-white border border-neutral-200 rounded-xl pl-9 pr-3 py-2 text-xs font-bold outline-none focus:border-black"
                                    placeholder="10-digit mobile number"
                                />
                            </div>
                            <button
                                type="button"
                                disabled={resendPhone.length < 10 || resendLoading}
                                onClick={handleResendLink}
                                className="px-4 py-2 bg-black text-white rounded-xl font-bold text-xs hover:bg-neutral-800 disabled:opacity-40 cursor-pointer"
                            >
                                {resendLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Resend'}
                            </button>
                        </div>

                        {resendResult && (
                            <p className={`text-xs font-bold ${resendResult.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
                                {resendResult.text}
                            </p>
                        )}
                    </div>

                    <div className="flex gap-3 pt-2">
                        <Link
                            to="/login"
                            className="flex-1 py-3 px-4 bg-black text-white rounded-xl font-bold text-xs text-center hover:bg-neutral-800 transition-colors"
                        >
                            Go to Login
                        </Link>
                        <Link
                            to="/"
                            className="flex-1 py-3 px-4 bg-neutral-100 text-neutral-800 rounded-xl font-bold text-xs text-center hover:bg-neutral-200 transition-colors"
                        >
                            Home
                        </Link>
                    </div>
                </motion.div>
            </div>
        );
    }

    // ── CELEBRATION / SUCCESS ────────────────────────────────────────────────
    if (isDone) {
        return (
            <div className="min-h-screen bg-[#FAFAFA] flex flex-col items-center justify-center p-4">
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="text-center max-w-sm w-full space-y-4"
                >
                    <div className="mx-auto bg-black text-white h-20 w-20 rounded-3xl flex items-center justify-center shadow-xl">
                        <CheckCircle2 className="h-10 w-10 text-emerald-400" />
                    </div>
                    <h2 className="text-3xl font-black tracking-tight text-neutral-900">Coaching Portal Ready!</h2>
                    <p className="text-neutral-400 text-xs font-medium">Launching your MathLogs dashboard...</p>
                    <Loader2 className="h-5 w-5 animate-spin mx-auto text-neutral-400 mt-2" />
                </motion.div>
            </div>
        );
    }

    // ── MAIN ONBOARDING FORM (POST-PAYMENT) ──────────────────────────────────
    return (
        <div className="min-h-screen bg-[#FDFDFD] flex flex-col justify-between px-4 sm:px-8 py-8 text-neutral-900 font-sans selection:bg-black selection:text-white">
            {/* Top Bar */}
            <div className="w-full max-w-3xl mx-auto flex items-center justify-between gap-4 mb-8">
                <Link to="/" className="flex items-center gap-3">
                    <img src="/icon-512x512.png" alt="MathLogs" className="w-9 h-9 rounded-xl shadow-xs" />
                    <span className="text-xl font-black tracking-tighter">MathLogs</span>
                </Link>

                <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full text-xs font-bold">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                    Account Authorized · Setup Profile
                </div>
            </div>

            {/* Main Form Container */}
            <div className="w-full max-w-3xl mx-auto flex-1">
                <div className="mb-8">
                    <h1 className="text-3xl sm:text-4xl font-black tracking-tight mb-2">
                        Configure Your Coaching Center.
                    </h1>
                    <p className="text-sm text-neutral-400 font-medium">
                        Set up your academic subjects, batch structure &amp; directory listing for <span className="text-black font-bold">{instituteName}</span>.
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {error && (
                        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-xs text-red-600 font-semibold">
                            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                            <p>{error}</p>
                        </div>
                    )}

                    {/* SECTION 1: ACADEMIC & SUBJECT SETUP (ALWAYS VISIBLE & SEPARATE) */}
                    <div className="bg-white border-2 border-neutral-200 rounded-3xl p-6 sm:p-8 space-y-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-black text-white rounded-xl">
                                <BookOpen className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="text-base font-bold tracking-tight">Academic &amp; Subject Setup</h3>
                                <p className="text-xs text-neutral-400 font-medium">Core subjects &amp; batch levels used for your coaching ERP, tests &amp; quizzes.</p>
                            </div>
                        </div>

                        {/* Subjects Taught */}
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2">
                                Subjects Taught at Your Center *
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {[...DEFAULT_SUBJECTS, ...customSubjects].map(sub => {
                                    const isSelected = selectedSubjects.includes(sub);
                                    return (
                                        <button
                                            key={sub}
                                            type="button"
                                            onClick={() => toggleSubject(sub)}
                                            className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                                                isSelected
                                                    ? 'bg-black text-white shadow-xs'
                                                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                                            }`}
                                        >
                                            {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                                            <span>{sub}</span>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Add Custom Subject */}
                            <div className="flex items-center gap-2 mt-3.5 max-w-md">
                                <input
                                    type="text"
                                    value={customSubjectInput}
                                    onChange={e => setCustomSubjectInput(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCustomSubject())}
                                    placeholder="Add custom subject (e.g. Sanskrit, Coding)..."
                                    className="flex-1 px-3.5 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium outline-none focus:border-black"
                                />
                                <button
                                    type="button"
                                    onClick={addCustomSubject}
                                    className="flex items-center gap-1 px-4 py-2 rounded-xl bg-neutral-900 text-white text-xs font-bold hover:bg-neutral-800 transition-all cursor-pointer shrink-0"
                                >
                                    <Plus className="w-3.5 h-3.5" /> Add
                                </button>
                            </div>
                        </div>

                        {/* Class / Grade Structure */}
                        <div className="pt-4 border-t border-neutral-100 space-y-4">
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2">
                                    Organize batches by Class / Grade?
                                </label>
                                <div className="flex rounded-2xl overflow-hidden border-2 border-neutral-200 max-w-xs">
                                    <button
                                        type="button"
                                        onClick={() => setRequiresGrades(true)}
                                        className={`flex-1 py-2.5 text-xs font-bold transition-all ${
                                            requiresGrades ? 'bg-black text-white' : 'bg-white text-neutral-600 hover:bg-neutral-50'
                                        }`}
                                    >
                                        Yes (Classes &amp; Grades)
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setRequiresGrades(false)}
                                        className={`flex-1 py-2.5 text-xs font-bold transition-all ${
                                            !requiresGrades ? 'bg-black text-white' : 'bg-white text-neutral-600 hover:bg-neutral-50'
                                        }`}
                                    >
                                        No (Batches only)
                                    </button>
                                </div>
                            </div>

                            {requiresGrades && (
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2">
                                        Classes / Grades Handled
                                    </label>
                                    <div className="flex flex-wrap gap-2 mb-3">
                                        {classList.map(cls => (
                                            <span key={cls} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-neutral-100 text-neutral-900 rounded-xl text-xs font-bold">
                                                {cls}
                                                <button
                                                    type="button"
                                                    onClick={() => removeClass(cls)}
                                                    className="hover:text-red-600 cursor-pointer"
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                    <div className="flex gap-2 max-w-sm">
                                        <input
                                            type="text"
                                            value={classInput}
                                            onChange={e => setClassInput(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addClass())}
                                            placeholder="Add class (e.g. Class 7)..."
                                            className="flex-1 px-3.5 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium outline-none focus:border-black"
                                        />
                                        <button
                                            type="button"
                                            onClick={addClass}
                                            className="px-3.5 py-2 bg-black text-white rounded-xl text-xs font-bold hover:bg-neutral-800 cursor-pointer"
                                        >
                                            <Plus className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* SECTION 2: FEE PLANNING SYSTEM */}
                    <fieldset className="bg-white border-2 border-neutral-200 rounded-3xl p-6 sm:p-8 space-y-4">
                        <div>
                            <legend className="text-base font-bold tracking-tight">Fee planning system</legend>
                            <p className="mt-1 text-xs text-neutral-400 font-medium">
                                Choose once for this coaching. Both systems keep completely separate fee records.
                            </p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
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
                                        className={`rounded-2xl border-2 p-4 text-left transition-all ${selected ? 'border-black bg-neutral-50 shadow-sm' : 'border-neutral-200 bg-white hover:border-neutral-300'}`}
                                    >
                                        <span className="flex items-center justify-between gap-3">
                                            <span className="text-sm font-bold text-neutral-900">{option.title}</span>
                                            <span className={`h-4 w-4 rounded-full border-2 ${selected ? 'border-black bg-black ring-2 ring-neutral-200' : 'border-neutral-300'}`} />
                                        </span>
                                        <span className="mt-1 block text-xs leading-5 text-neutral-500">{option.copy}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </fieldset>

                    {/* SECTION 3: MARKETPLACE DIRECTORY PROFILE (INDEPENDENT & OPTIONAL) */}
                    <div className="bg-white border-2 border-neutral-200 rounded-3xl p-6 sm:p-8 space-y-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-black text-white rounded-xl">
                                <Store className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="text-base font-bold tracking-tight">Public Directory Listing (Optional)</h3>
                                <p className="text-xs text-neutral-400 font-medium">Get discovered by local students &amp; parents in your city looking for tuition.</p>
                            </div>
                        </div>

                        <label className="flex items-center gap-3 p-4 bg-neutral-50 border border-neutral-200 rounded-2xl cursor-pointer hover:bg-neutral-100/70 transition-colors">
                            <input
                                type="checkbox"
                                checked={isPubliclyListed}
                                onChange={e => setIsPubliclyListed(e.target.checked)}
                                className="w-4 h-4 accent-black rounded cursor-pointer shrink-0"
                            />
                            <div className="text-xs">
                                <span className="font-bold text-neutral-900 block">
                                    List my coaching center on MathLogs Public City Directory (Free Discovery)
                                </span>
                                <span className="text-neutral-500 font-normal">
                                    Students in your city can find your coaching center and contact you directly via WhatsApp.
                                </span>
                            </div>
                        </label>

                        {isPubliclyListed ? (
                            <div className="space-y-5 pt-1">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
                                            City *
                                        </label>
                                        <select
                                            value={city}
                                            onChange={e => setCity(e.target.value)}
                                            className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-bold outline-none focus:border-black cursor-pointer"
                                        >
                                            <option value="Muzaffarnagar">Muzaffarnagar</option>
                                            <option value="Meerut">Meerut</option>
                                            <option value="Saharanpur">Saharanpur</option>
                                            <option value="Delhi NCR">Delhi NCR</option>
                                            <option value="Pune">Pune</option>
                                            <option value="Other">Other City</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
                                            Area / Locality *
                                        </label>
                                        <input
                                            type="text"
                                            value={area}
                                            onChange={e => setArea(e.target.value)}
                                            placeholder="e.g. Civil Lines, Near Gandhi Smarak"
                                            className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-medium outline-none focus:border-black"
                                        />
                                    </div>
                                </div>

                                {/* Google Maps Link */}
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
                                        Google Maps Location Link <span className="text-neutral-300 font-normal">(Optional)</span>
                                    </label>
                                    <input
                                        type="url"
                                        value={googleMapsUrl}
                                        onChange={e => setGoogleMapsUrl(e.target.value)}
                                        placeholder="https://maps.app.goo.gl/..."
                                        className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-medium outline-none focus:border-black"
                                    />
                                </div>

                                {/* Bio / Tagline */}
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
                                        Short Bio / Highlight Tagline <span className="text-neutral-300 font-normal">(Optional)</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={description}
                                        onChange={e => setDescription(e.target.value)}
                                        placeholder="e.g. Leading IIT-JEE & Board coaching institute in Muzaffarnagar since 2016"
                                        className="w-full px-4 py-3 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-medium outline-none focus:border-black"
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-2xl flex items-start gap-3 text-xs text-neutral-600">
                                <EyeOff className="w-4 h-4 text-neutral-400 shrink-0 mt-0.5" />
                                <p>
                                    Your coaching center will remain <strong>private</strong> and will not appear on the public marketplace directory. Only enrolled students and staff can access your portal. You can change this anytime from Settings.
                                </p>
                            </div>
                        )}
                    </div>

                    {/* SECTION 3: PASSWORDLESS SECURITY NOTICE */}
                    <div className="bg-neutral-50 border border-neutral-200 rounded-3xl p-6 flex items-start gap-4">
                        <div className="p-2.5 bg-emerald-100 text-emerald-800 rounded-2xl shrink-0 mt-0.5">
                            <ShieldCheck className="w-6 h-6 text-emerald-700" />
                        </div>
                        <div className="space-y-1 text-xs">
                            <p className="font-bold text-neutral-900 text-sm">Instant Passwordless Login via WhatsApp OTP</p>
                            <p className="text-neutral-600 leading-relaxed">
                                Your account is bound to your verified phone number: <strong>{phoneNumber ? `+91 ${phoneNumber}` : 'your registered number'}</strong>.
                                You and your staff can log in anytime instantly with 6-digit WhatsApp OTPs. No passwords to remember or reset.
                            </p>
                        </div>
                    </div>

                    {/* SUBMIT BUTTON */}
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full bg-black text-white font-black py-6 sm:py-7 text-lg uppercase tracking-widest rounded-2xl relative overflow-hidden transition-all duration-300 disabled:bg-neutral-200 disabled:text-neutral-400 disabled:cursor-not-allowed hover:bg-neutral-900 active:scale-[0.98] flex items-center justify-center gap-3 shadow-xl cursor-pointer"
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="w-6 h-6 animate-spin" />
                                <span>Launching Dashboard...</span>
                            </>
                        ) : (
                            <>
                                <span>Complete Setup &amp; Launch Dashboard</span>
                                <ArrowRight className="w-5 h-5" />
                            </>
                        )}
                    </button>
                </form>
            </div>

            {/* Footer */}
            <div className="w-full max-w-3xl mx-auto text-center pt-8 border-t border-neutral-200 text-xs font-medium text-neutral-400 mt-8">
                MathLogs Center Setup Protocol • AES-256 Encrypted &amp; DPDP Compliant
            </div>
        </div>
    );
}
