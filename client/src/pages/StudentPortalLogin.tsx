import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../utils/api';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';

export default function StudentPortalLogin() {
    const { instituteSlug } = useParams<{ instituteSlug: string }>();
    const navigate = useNavigate();
    
    const [mobileNumber, setMobileNumber] = useState('');
    const [loading, setLoading] = useState(false);
    const [instituteName, setInstituteName] = useState('Institute');

    useEffect(() => {
        // We could fetch the institute name here if we want to display it
        // Or fetch it together with the login.
        if (!instituteSlug) {
            toast.error('Invalid link');
            navigate('/');
        }
    }, [instituteSlug, navigate]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (!mobileNumber || mobileNumber.length < 10) {
            toast.error('Please enter a valid mobile number');
            return;
        }

        setLoading(true);
        try {
            const response = await api.post<{ token: string, student: any }>('/student-portal/login', {
                instituteSlug,
                mobileNumber
            });

            localStorage.setItem(`student_token_${instituteSlug}`, response.token);
            toast.success(`Welcome, ${response.student.name}!`);
            navigate(`/${instituteSlug}/student/dashboard`);
        } catch (error: any) {
            console.error('Login failed:', error);
            toast.error(error.response?.data?.error || 'Failed to login. Please check your mobile number.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-md bg-white rounded-[24px] shadow-xl border border-gray-100 p-8"
            >
                <div className="text-center mb-8">
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">Student Portal</h1>
                    <p className="text-gray-500">Enter your registered mobile number to continue</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-6">
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                            Mobile Number
                        </label>
                        <input
                            type="tel"
                            value={mobileNumber}
                            onChange={(e) => setMobileNumber(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-black focus:border-black outline-none transition-all"
                            placeholder="e.g. 9876543210"
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-black text-white py-3 rounded-xl font-bold hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                    >
                        {loading ? (
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                            'Login to Dashboard'
                        )}
                    </button>
                </form>
            </motion.div>
        </div>
    );
}
