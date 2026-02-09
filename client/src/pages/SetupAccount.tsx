
import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Eye, EyeOff, Loader2, CheckCircle, AlertTriangle, Building2, GraduationCap, Plus, X } from 'lucide-react';

const API_URL = import.meta.env.PROD ? '/api' : (import.meta.env.VITE_API_URL || 'http://localhost:3001/api');

export default function SetupAccount() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const token = searchParams.get('token');

    const [isLoading, setIsLoading] = useState(true);
    const [isValid, setIsValid] = useState(false);
    const [instituteName, setInstituteName] = useState('');
    const [error, setError] = useState('');

    // Multi-step state
    const [step, setStep] = useState(1); // 1: credentials, 2: grade config

    // Form State - Step 1
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Form State - Step 2
    const [requiresGrades, setRequiresGrades] = useState<boolean | null>(null);
    const [grades, setGrades] = useState<string[]>(['Class 9', 'Class 10']);
    const [newGrade, setNewGrade] = useState('');

    useEffect(() => {
        if (!token) {
            setError('Missing invite token.');
            setIsLoading(false);
            return;
        }
        validateToken();
    }, [token]);

    const validateToken = async () => {
        try {
            const res = await axios.get(`${API_URL}/invites/${token}`);
            setInstituteName(res.data.instituteName);
            setIsValid(true);
        } catch (err: any) {
            console.error(err);
            setError(err.response?.data?.error || 'Invalid or expired invite link.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleStep1Submit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!username || !password) return;
        setStep(2);
    };

    const addGrade = () => {
        if (newGrade.trim() && !grades.includes(newGrade.trim())) {
            setGrades([...grades, newGrade.trim()]);
            setNewGrade('');
        }
    };

    const removeGrade = (grade: string) => {
        setGrades(grades.filter(g => g !== grade));
    };

    const handleFinalSubmit = async () => {
        setIsSubmitting(true);
        setError('');

        try {
            const res = await axios.post(`${API_URL}/auth/setup-account`, {
                token,
                username,
                password,
                requiresGrades,
                allowedClasses: requiresGrades ? grades : []
            });

            if (res.data.success) {
                localStorage.setItem('token', res.data.token);
                localStorage.setItem('adminId', res.data.adminId);
                navigate('/dashboard');
            }
        } catch (err: any) {
            setError(err.response?.data?.error || 'Setup failed. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
                <Loader2 className="h-10 w-10 text-black animate-spin mb-4" />
                <p className="text-gray-500 font-medium">Verifying invite...</p>
            </div>
        );
    }

    if (!isValid) {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
                <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 max-w-md w-full text-center">
                    <div className="mx-auto bg-red-50 h-16 w-16 rounded-full flex items-center justify-center mb-6">
                        <AlertTriangle className="h-8 w-8 text-red-500" />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Invite Invalid</h2>
                    <p className="text-gray-500 mb-6">{error}</p>
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

    return (
        <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-4 font-sans">
            <div className="bg-white p-8 md:p-10 rounded-3xl shadow-xl shadow-gray-100/50 border border-gray-100 max-w-md w-full relative overflow-hidden">

                {/* Background Decoration */}
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 to-purple-500"></div>

                {/* Progress Indicator */}
                <div className="flex items-center justify-center gap-2 mb-6">
                    <div className={`h-2 w-16 rounded-full transition-colors ${step >= 1 ? 'bg-blue-500' : 'bg-gray-200'}`}></div>
                    <div className={`h-2 w-16 rounded-full transition-colors ${step >= 2 ? 'bg-blue-500' : 'bg-gray-200'}`}></div>
                </div>

                <div className="text-center mb-8">
                    <div className="mx-auto bg-blue-50 h-16 w-16 rounded-2xl flex items-center justify-center mb-6 rotate-3">
                        {step === 1 ? <Building2 className="h-8 w-8 text-blue-600" /> : <GraduationCap className="h-8 w-8 text-blue-600" />}
                    </div>
                    <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
                        {step === 1 ? 'Welcome!' : 'Configure Classes'}
                    </h1>
                    <p className="text-gray-500 mt-2 text-lg">
                        {step === 1 ? (
                            <>
                                You have been invited to manage <br />
                                <span className="font-semibold text-gray-900">{instituteName}</span>
                            </>
                        ) : (
                            'Set up your coaching structure'
                        )}
                    </p>
                </div>

                {error && (
                    <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex items-start gap-3 text-sm text-red-600 mb-5">
                        <AlertTriangle className="h-5 w-5 shrink-0" />
                        <p>{error}</p>
                    </div>
                )}

                {/* Step 1: Credentials */}
                {step === 1 && (
                    <form onSubmit={handleStep1Submit} className="space-y-5">
                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-gray-700 ml-1">Choose Username</label>
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full px-5 py-3.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-medium"
                                placeholder="e.g. rahul_sir"
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-semibold text-gray-700 ml-1">Create Password</label>
                            <div className="relative">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
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

                        <button
                            type="submit"
                            className="w-full py-4 mt-6 bg-gray-900 hover:bg-black text-white rounded-xl font-bold text-lg shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2"
                        >
                            Continue
                            <CheckCircle className="h-5 w-5 opacity-80" />
                        </button>
                    </form>
                )}

                {/* Step 2: Grade Configuration */}
                {step === 2 && (
                    <div className="space-y-6">
                        <div className="space-y-4">
                            <label className="text-sm font-semibold text-gray-700">
                                Does your coaching center use class/grade levels?
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    type="button"
                                    onClick={() => setRequiresGrades(true)}
                                    className={`py-4 px-4 rounded-xl font-semibold transition-all border-2 ${requiresGrades === true
                                            ? 'bg-blue-50 border-blue-500 text-blue-700'
                                            : 'bg-gray-50 border-gray-200 text-gray-700 hover:border-gray-300'
                                        }`}
                                >
                                    Yes
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setRequiresGrades(false)}
                                    className={`py-4 px-4 rounded-xl font-semibold transition-all border-2 ${requiresGrades === false
                                            ? 'bg-blue-50 border-blue-500 text-blue-700'
                                            : 'bg-gray-50 border-gray-200 text-gray-700 hover:border-gray-300'
                                        }`}
                                >
                                    No
                                </button>
                            </div>
                        </div>

                        {requiresGrades === true && (
                            <div className="space-y-3 animate-in fade-in duration-300">
                                <label className="text-sm font-semibold text-gray-700">Configure Classes/Grades</label>

                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={newGrade}
                                        onChange={(e) => setNewGrade(e.target.value)}
                                        onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addGrade())}
                                        className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                        placeholder="e.g. Class 11, Grade 8"
                                    />
                                    <button
                                        type="button"
                                        onClick={addGrade}
                                        className="px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-semibold transition-colors flex items-center gap-2"
                                    >
                                        <Plus size={20} />
                                    </button>
                                </div>

                                <div className="flex flex-wrap gap-2 mt-3">
                                    {grades.map((grade) => (
                                        <div
                                            key={grade}
                                            className="flex items-center gap-2 bg-blue-50 text-blue-700 px-3 py-2 rounded-lg font-medium border border-blue-200"
                                        >
                                            <span>{grade}</span>
                                            <button
                                                type="button"
                                                onClick={() => removeGrade(grade)}
                                                className="hover:bg-blue-200 rounded-full p-0.5 transition-colors"
                                            >
                                                <X size={16} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {requiresGrades === false && (
                            <div className="p-4 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
                                <p className="font-semibold">✓ No class/grade configuration needed</p>
                                <p className="text-green-600 mt-1">You can create batches without specifying grades.</p>
                            </div>
                        )}

                        <div className="flex gap-3 pt-4">
                            <button
                                type="button"
                                onClick={() => setStep(1)}
                                className="flex-1 py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold transition-colors"
                            >
                                Back
                            </button>
                            <button
                                type="button"
                                onClick={handleFinalSubmit}
                                disabled={requiresGrades === null || isSubmitting || (requiresGrades && grades.length === 0)}
                                className="flex-1 py-3 px-4 bg-gray-900 hover:bg-black text-white rounded-xl font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="h-5 w-5 animate-spin" />
                                        Setting up...
                                    </>
                                ) : (
                                    <>
                                        Complete Setup
                                        <CheckCircle className="h-5 w-5" />
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                )}

                <p className="text-center text-xs text-gray-400 mt-8">
                    By continuing, you agree to our Terms of Service.
                </p>
            </div>
        </div>
    );
}
