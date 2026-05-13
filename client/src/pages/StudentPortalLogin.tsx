import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { Phone } from 'lucide-react';

interface Branding {
    name: string;
    logoUrl: string | null;
    primaryColor: string | null;
}

// Derive a dark gradient from a hex color
function hexToGradient(hex: string): string {
    // Darken the color for the gradient end
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const dark = `rgb(${Math.floor(r * 0.3)}, ${Math.floor(g * 0.3)}, ${Math.floor(b * 0.3)})`;
    const mid = `rgb(${Math.floor(r * 0.5)}, ${Math.floor(g * 0.5)}, ${Math.floor(b * 0.5)})`;
    return `linear-gradient(135deg, ${mid} 0%, ${dark} 100%)`;
}

export default function StudentPortalLogin() {
    const { instituteSlug } = useParams<{ instituteSlug: string }>();
    const navigate = useNavigate();

    const [mobileNumber, setMobileNumber] = useState('');
    const [loading, setLoading] = useState(false);
    const [branding, setBranding] = useState<Branding | null>(null);

    useEffect(() => {
        axios.get(`/api/student-portal/branding/${instituteSlug}`)
            .then(res => setBranding(res.data))
            .catch(() => setBranding({ name: 'Student Portal', logoUrl: null, primaryColor: null }));
    }, [instituteSlug]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (mobileNumber.replace(/\D/g, '').length < 10) {
            toast.error('Enter a valid 10-digit mobile number');
            return;
        }
        setLoading(true);
        try {
            const response = await axios.post<{ token: string; student: any }>(
                '/api/student-portal/login',
                { instituteSlug, mobileNumber: mobileNumber.replace(/\D/g, '') }
            );
            localStorage.setItem(`student_token_${instituteSlug}`, response.data.token);
            toast.success(`Welcome, ${response.data.student.name}!`);
            navigate(`/${instituteSlug}/student/dashboard`);
        } catch (error: any) {
            toast.error(error?.response?.data?.error || 'Mobile number not found. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const primaryColor = branding?.primaryColor;
    const bgStyle = primaryColor && /^#[0-9A-Fa-f]{6}$/.test(primaryColor)
        ? { background: hexToGradient(primaryColor) }
        : undefined;

    const buttonStyle = primaryColor && /^#[0-9A-Fa-f]{6}$/.test(primaryColor)
        ? { backgroundColor: primaryColor }
        : undefined;

    return (
        <div
            className="min-h-screen flex flex-col items-center justify-center p-5 transition-all duration-500"
            style={bgStyle ?? { background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)' }}
        >
            {/* Brand area */}
            <motion.div
                initial={{ opacity: 0, y: -16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="text-center mb-8"
            >
                {/* Logo or fallback initial */}
                <div className="w-20 h-20 rounded-2xl bg-white flex items-center justify-center mx-auto mb-4 shadow-xl overflow-hidden">
                    {branding?.logoUrl ? (
                        <img
                            src={branding.logoUrl}
                            alt={branding.name}
                            className="w-full h-full object-contain p-1"
                            onError={e => {
                                (e.target as HTMLImageElement).style.display = 'none';
                            }}
                        />
                    ) : (
                        <span className="text-3xl font-black text-gray-900">
                            {branding?.name?.charAt(0)?.toUpperCase() ?? 'S'}
                        </span>
                    )}
                </div>

                <h1 className="text-white text-2xl font-black tracking-tight drop-shadow">
                    {branding?.name ?? 'Student Portal'}
                </h1>
                <p className="text-white/60 text-sm mt-1">Sign in to view your progress</p>
            </motion.div>

            {/* Login card */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 }}
                className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6"
            >
                <form onSubmit={handleLogin} className="space-y-5">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
                            Registered Mobile Number
                        </label>
                        <div className="relative">
                            <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="tel"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={mobileNumber}
                                onChange={e => setMobileNumber(e.target.value)}
                                className="w-full pl-11 pr-4 py-4 rounded-2xl border-2 border-gray-100 bg-gray-50 focus:border-black focus:bg-white outline-none transition-all text-lg font-semibold"
                                placeholder="98765 43210"
                                required
                                autoComplete="tel"
                            />
                        </div>
                        <p className="text-xs text-gray-400 mt-2">
                            Use the mobile number registered at your institute.
                        </p>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full text-white py-4 rounded-2xl font-bold text-base active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-lg"
                        style={buttonStyle ?? { backgroundColor: '#111827' }}
                    >
                        {loading ? (
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                            'View My Dashboard →'
                        )}
                    </button>
                </form>
            </motion.div>
        </div>
    );
}
