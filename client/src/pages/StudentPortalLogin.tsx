import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { Phone } from 'lucide-react';

export default function StudentPortalLogin() {
    const { instituteSlug } = useParams<{ instituteSlug: string }>();
    const navigate = useNavigate();

    const [mobileNumber, setMobileNumber] = useState('');
    const [loading, setLoading] = useState(false);

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

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black flex flex-col items-center justify-center p-5">
            {/* Logo / Brand area */}
            <motion.div
                initial={{ opacity: 0, y: -16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="text-center mb-8"
            >
                <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xl">
                    <span className="text-2xl font-black text-gray-900">S</span>
                </div>
                <h1 className="text-white text-2xl font-black tracking-tight">Student Portal</h1>
                <p className="text-gray-400 text-sm mt-1">Sign in to view your progress</p>
            </motion.div>

            {/* Card */}
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
                        className="w-full bg-black text-white py-4 rounded-2xl font-bold text-base hover:bg-gray-800 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
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
