import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { motion } from 'framer-motion';
import { Upload, CheckCircle, AlertCircle, Loader, User, Calendar, IndianRupee } from 'lucide-react';

const API_URL = import.meta.env.PROD ? '/api' : (import.meta.env.VITE_API_URL || 'http://localhost:3001/api');

export default function StudentPaymentPortal() {
    const { slug } = useParams<{ slug: string }>();
    const [searchParams] = useSearchParams();
    const phoneParam = searchParams.get('phone');

    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    
    const [data, setData] = useState<any>(null);
    const [selectedStudent, setSelectedStudent] = useState<any>(null);
    const [amount, setAmount] = useState('');
    const [file, setFile] = useState<File | null>(null);

    const [manualPhone, setManualPhone] = useState('');
    const [needsPhone, setNeedsPhone] = useState(false);

    useEffect(() => {
        if (!slug) {
            setError('Invalid institute link.');
            setLoading(false);
            return;
        }

        if (!phoneParam) {
            setNeedsPhone(true);
            setLoading(false);
            return;
        }

        fetchStudentFees(phoneParam);
    }, [slug, phoneParam]);

    const fetchStudentFees = (phone: string) => {
        setLoading(true);
        axios.get(`${API_URL}/public/i/${slug}/student-fees?phone=${phone}`)
            .then(res => {
                setData(res.data);
                if (res.data.students.length === 1) {
                    setSelectedStudent(res.data.students[0]);
                }
                setNeedsPhone(false);
            })
            .catch(err => {
                setError(err.response?.data?.error || 'Failed to load details. Your link or number might be incorrect.');
            })
            .finally(() => setLoading(false));
    };

    const handleManualPhoneSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (manualPhone.length >= 10) {
            fetchStudentFees(manualPhone);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedStudent || !amount || !file) {
            setError('Please complete all fields and upload a screenshot.');
            return;
        }

        setSubmitting(true);
        setError('');

        const formData = new FormData();
        formData.append('studentId', selectedStudent.id);
        formData.append('amount', amount);
        formData.append('screenshot', file);

        try {
            await axios.post(`${API_URL}/public/i/${slug}/submit-upi`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setSuccess('Thank you! Your payment screenshot has been uploaded. We will verify it shortly.');
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to submit the payment verification.');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex h-screen w-screen items-center justify-center bg-gray-50">
                <Loader className="h-8 w-8 animate-spin text-indigo-600" />
            </div>
        );
    }

    if (needsPhone) {
        return (
            <div className="flex h-screen w-screen items-center justify-center bg-gray-50 p-6">
                <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center space-y-6">
                    <h2 className="text-2xl font-bold text-gray-900">Enter Mobile Number</h2>
                    <p className="text-gray-600">Please provide the WhatsApp number where you received the fee alert.</p>
                    <form onSubmit={handleManualPhoneSubmit} className="space-y-4">
                        <input 
                            type="tel"
                            value={manualPhone}
                            onChange={(e) => setManualPhone(e.target.value)}
                            placeholder="e.g. 9876543210"
                            className="w-full px-4 py-3 text-lg border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition"
                            required
                        />
                        <button 
                            type="submit" 
                            className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition"
                        >
                            View Pending Dues
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    if (error && !data) {
        return (
            <div className="flex h-screen w-screen items-center justify-center bg-gray-50 p-6">
                <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center space-y-4">
                    <div className="bg-red-100 p-4 rounded-full w-20 h-20 mx-auto flex items-center justify-center">
                        <AlertCircle className="w-10 h-10 text-red-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900">Oops!</h2>
                    <p className="text-gray-600">{error}</p>
                </div>
            </div>
        );
    }

    if (success) {
        return (
            <div className="flex h-screen w-screen items-center justify-center bg-gray-50 p-6">
                <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-10 text-center space-y-6 flex flex-col items-center"
                >
                    <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center">
                        <CheckCircle className="w-12 h-12 text-green-600" />
                    </div>
                    <div>
                        <h2 className="text-3xl font-black text-gray-900 tracking-tight">Payment Sent</h2>
                        <p className="mt-3 text-gray-600 leading-relaxed">{success}</p>
                    </div>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-4 md:p-8 flex items-center justify-center">
            <div className="max-w-xl w-full bg-white rounded-[2rem] shadow-2xl overflow-hidden border border-gray-100/50">
                
                {/* Header Section */}
                <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-8 py-10 text-white text-center relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-5 rounded-full blur-3xl -mr-20 -mt-20"></div>
                    <div className="absolute bottom-0 left-0 w-64 h-64 bg-white opacity-5 rounded-full blur-3xl -ml-20 -mb-20"></div>
                    
                    <div className="relative z-10 flex flex-col items-center">
                        {data?.institute.logoUrl && (
                            <img 
                                src={data.institute.logoUrl} 
                                alt="Institute Logo" 
                                className="w-20 h-20 rounded-2xl bg-white p-1 mb-4 shadow-xl object-contain object-center"
                            />
                        )}
                        <h1 className="text-3xl font-black tracking-tight">{data?.institute.name}</h1>
                        <p className="text-indigo-100 mt-2 font-medium">UPI Payment Verification</p>
                    </div>
                </div>

                <div className="p-8 space-y-8">
                    {/* Student Selection (if multiple students on same phone number) */}
                    {data?.students.length > 1 && !selectedStudent && (
                        <div className="space-y-4">
                            <h3 className="font-bold text-gray-900 border-b pb-2">Select Student Profile</h3>
                            <div className="grid gap-3">
                                {data.students.map((sts: any) => (
                                    <button 
                                        key={sts.id} 
                                        onClick={() => setSelectedStudent(sts)}
                                        className="flex items-center justify-between p-4 rounded-xl border border-gray-200 hover:border-indigo-600 hover:bg-indigo-50/50 transition-all text-left"
                                    >
                                        <div className="flex items-center space-x-3">
                                            <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold">
                                                {sts.name[0]}
                                            </div>
                                            <div>
                                                <p className="font-semibold text-gray-900">{sts.name}</p>
                                                <p className="text-sm text-gray-500">{sts.batch?.name || 'No Batch'}</p>
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {selectedStudent && (
                        <motion.form 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="space-y-8" 
                            onSubmit={handleSubmit}
                        >
                            {/* Selected Student Block */}
                            {data?.students.length > 1 && (
                                <div className="flex items-center justify-between bg-gray-50 p-4 rounded-2xl border border-gray-100">
                                    <div className="flex items-center space-x-3">
                                        <div className="w-12 h-12 bg-white rounded-xl shadow-sm border border-gray-100 flex items-center justify-center">
                                            <User className="text-indigo-600 w-6 h-6" />
                                        </div>
                                        <div>
                                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Paying For</p>
                                            <p className="font-bold text-gray-900">{selectedStudent.name}</p>
                                        </div>
                                    </div>
                                    <button 
                                        type="button" 
                                        onClick={() => setSelectedStudent(null)}
                                        className="text-sm text-indigo-600 font-medium hover:underline"
                                    >
                                        Change
                                    </button>
                                </div>
                            )}

                            {error && (
                                <div className="bg-red-50 text-red-700 p-4 rounded-xl text-sm flex items-start">
                                    <AlertCircle className="w-5 h-5 mr-2 flex-shrink-0 mt-0.5" />
                                    <span>{error}</span>
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">
                                    Amount Paid
                                </label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                        <IndianRupee className="h-5 w-5 text-gray-400" />
                                    </div>
                                    <input 
                                        type="number"
                                        placeholder="0.00" 
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                        className="w-full pl-11 pr-4 py-4 text-xl font-medium bg-gray-50 border border-gray-200 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 focus:bg-white transition-all shadow-sm"
                                        required
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">
                                    Upload Receipt / Screenshot
                                </label>
                                <label className={`
                                    flex flex-col items-center justify-center w-full h-48 
                                    border-2 border-dashed rounded-2xl cursor-pointer 
                                    transition-all duration-200
                                    ${file ? 'border-indigo-500 bg-indigo-50/50' : 'border-gray-300 hover:border-indigo-400 hover:bg-gray-50'}
                                `}>
                                    <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center px-4">
                                        {file ? (
                                            <CheckCircle className="w-10 h-10 text-indigo-600 mb-3" />
                                        ) : (
                                            <Upload className="w-10 h-10 text-gray-400 mb-3" />
                                        )}
                                        
                                        <p className="text-sm font-semibold text-gray-700">
                                            {file ? file.name : 'Tap to select screenshot'}
                                        </p>
                                        <p className="text-xs text-gray-500 mt-1">
                                            {file ? 'Click to replace file' : 'PNG, JPG or JPEG (Max 5MB)'}
                                        </p>
                                    </div>
                                    <input 
                                        type="file" 
                                        className="hidden" 
                                        accept="image/jpeg, image/png, image/jpg" 
                                        onChange={(e) => {
                                            if (e.target.files && e.target.files.length > 0) {
                                                setFile(e.target.files[0]);
                                            }
                                        }}
                                        required
                                    />
                                </label>
                            </div>

                            <button 
                                type="submit" 
                                disabled={submitting || !file || !amount}
                                className={`
                                    w-full py-4 px-6 rounded-xl font-bold text-lg 
                                    shadow-lg transition-all
                                    flex items-center justify-center space-x-2
                                    ${(submitting || !file || !amount) 
                                        ? 'bg-gray-200 text-gray-400 shadow-none cursor-not-allowed' 
                                        : 'bg-indigo-600 hover:bg-indigo-700 hover:shadow-indigo-500/30 hover:-translate-y-0.5 text-white'
                                    }
                                `}
                            >
                                {submitting ? (
                                    <>
                                        <Loader className="w-5 h-5 animate-spin" />
                                        <span>Uploading...</span>
                                    </>
                                ) : (
                                    <span>Submit Verification</span>
                                )}
                            </button>
                        </motion.form>
                    )}
                </div>
            </div>
            
            <p className="fixed bottom-6 text-center w-full text-xs text-gray-400 font-medium z-0">
                Powered by MathLogs Secure Payments
            </p>
        </div>
    );
}
