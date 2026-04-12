import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';
import { Check, X, AlertCircle } from 'lucide-react';

const API_URL = import.meta.env.PROD ? '/api' : (import.meta.env.VITE_API_URL || 'http://localhost:3001/api');

interface UpiVerification {
    id: string;
    amount: number;
    instituteId: string;
    studentId: string;
    student: {
        id: string;
        name: string;
        parentWhatsapp: string | null;
        batchId: string;
    };
    installmentId: string | null;
    storageKey: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    createdAt: string;
}

export default function UpiVerificationList() {
    const [verifications, setVerifications] = useState<UpiVerification[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const fetchVerifications = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get(`${API_URL}/fees/upi-verifications`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setVerifications(res.data);
            setError(null);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to fetch pending UPI verifications.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchVerifications();
        // Setup polling every 30 seconds
        const handle = setInterval(fetchVerifications, 30000);
        return () => clearInterval(handle);
    }, []);

    const handleAction = async (id: string, action: 'approve' | 'reject') => {
        if (!window.confirm(`Are you sure you want to ${action} this payment?`)) return;
        
        setActionLoading(id);
        try {
            const token = localStorage.getItem('token');
            await axios.post(`${API_URL}/fees/upi-verifications/${id}/${action}`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            // Remove from list
            setVerifications(prev => prev.filter(v => v.id !== id));
        } catch (err: any) {
            alert(err.response?.data?.error || `Failed to ${action} payment.`);
        } finally {
            setActionLoading(null);
        }
    };

    if (loading) {
        return <div className="p-4 text-center text-sm text-app-text-tertiary">Loading pending verifications...</div>;
    }

    if (error) {
        return (
            <div className="p-4 bg-danger/5 text-danger rounded-xl flex items-center justify-center gap-2 border border-danger/10 text-sm">
                <AlertCircle className="w-4 h-4" />
                {error}
            </div>
        );
    }

    if (verifications.length === 0) {
        return (
            <div className="p-8 text-center border-2 border-dashed border-neutral-200/50 rounded-2xl bg-neutral-50/30">
                <p className="text-sm font-medium text-app-text-secondary">No Pending Verifications</p>
                <p className="text-xs text-app-text-tertiary mt-1">When students upload UPI payment screenshots, they will appear here.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {verifications.map((v) => (
                <motion.div 
                    key={v.id} 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex flex-col sm:flex-row bg-white border border-neutral-200 shadow-sm rounded-xl overflow-hidden"
                >
                    <div className="w-full sm:w-48 h-40 shrink-0 bg-neutral-100 flex items-center justify-center border-b sm:border-b-0 sm:border-r border-neutral-200">
                        <img 
                            src={`${API_URL}/public/payment-screenshot/${encodeURIComponent(btoa(v.storageKey))}`} 
                            alt="Payment Screenshot" 
                            className="w-full h-full object-contain"
                            onError={(e) => { (e.target as HTMLImageElement).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="%23ccc" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>'; }}
                        />
                    </div>
                    <div className="p-4 flex flex-col justify-between w-full">
                        <div>
                            <div className="flex justify-between items-start mb-1">
                                <div>
                                    <h3 className="font-semibold text-app-text">{v.student.name}</h3>
                                    <p className="text-xs text-app-text-tertiary">Batch: {v.student.batchId.substring(0, 8)}...</p>
                                </div>
                                <span className="bg-warning/10 text-warning px-2.5 py-0.5 rounded-full text-xs font-semibold border border-warning/20">
                                    PENDING
                                </span>
                            </div>
                            <div className="mt-3">
                                <span className="text-xl font-bold font-mono tracking-tight text-app-text">₹{v.amount.toLocaleString()}</span>
                                <p className="text-xs text-app-text-tertiary mt-0.5">Submitted: {new Date(v.createdAt).toLocaleString()}</p>
                            </div>
                        </div>
                        
                        <div className="flex gap-2 mt-4 pt-4 border-t border-neutral-100">
                            <button
                                onClick={() => handleAction(v.id, 'approve')}
                                disabled={actionLoading === v.id}
                                className="flex-1 bg-success hover:bg-success/90 text-white font-medium py-2 rounded-lg text-sm transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                            >
                                {actionLoading === v.id ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
                                Approve
                            </button>
                            <button
                                onClick={() => handleAction(v.id, 'reject')}
                                disabled={actionLoading === v.id}
                                className="flex-1 bg-danger/10 hover:bg-danger/20 text-danger font-medium py-2 rounded-lg text-sm transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                            >
                                {actionLoading === v.id ? <div className="w-4 h-4 border-2 border-danger/40 border-t-danger rounded-full animate-spin" /> : <X className="w-4 h-4" />}
                                Reject
                            </button>
                        </div>
                    </div>
                </motion.div>
            ))}
        </div>
    );
}
