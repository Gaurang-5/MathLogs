import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, AlertCircle, Eye } from 'lucide-react';
import { API_URL } from '../utils/api';

interface UpiVerification {
    id: string;
    amount: number;
    instituteId: string;
    studentId: string;
    student: {
        id: string;
        name: string;
        parentWhatsapp: string | null;
        batch?: { name: string };
    };
    installment?: { name: string };
    installmentId: string | null;
    storageKey?: string;
    screenshotPath?: string;
    paidByName: string | null;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    createdAt: string;
}

export default function UpiVerificationList() {
    const [verifications, setVerifications] = useState<UpiVerification[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [enlargedImage, setEnlargedImage] = useState<string | null>(null);
    const [confirmAction, setConfirmAction] = useState<{ id: string, action: 'approve' | 'reject' } | null>(null);
    const [rejectReason, setRejectReason] = useState<string>('');

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

    const executeAction = async () => {
        if (!confirmAction) return;
        const { id, action } = confirmAction;
        const reason = rejectReason;

        // Close modal immediately
        setConfirmAction(null);
        setRejectReason('');
        
        // Show loading on the card
        setActionLoading(id);
        try {
            const token = localStorage.getItem('token');
            await axios.post(`${API_URL}/fees/upi-verifications/${id}/${action}`, action === 'reject' ? { reason } : {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            // Remove card after brief visual feedback
            setTimeout(() => {
                setVerifications(prev => prev.filter(v => v.id !== id));
                setActionLoading(null);
            }, 600);
        } catch (err: any) {
            console.error(`UPI ${action} error:`, err);
            // If already processed (e.g., previous attempt succeeded), just remove the card
            if (err.response?.data?.alreadyProcessed) {
                setVerifications(prev => prev.filter(v => v.id !== id));
            } else {
                const detail = err.response?.data?.detail || '';
                const msg = err.response?.data?.error || err.message || `Failed to ${action} payment.`;
                alert(detail ? `${msg}\n\nDetail: ${detail}` : msg);
            }
            setActionLoading(null);
        }
    };

    if (loading) {
        return <div className="p-4 text-center text-sm text-app-text-tertiary">Loading pending verifications...</div>;
    }

    if (error) {
        return (
            <div className="p-4 bg-red-50 text-red-600 rounded-xl flex items-center justify-center gap-2 border border-red-100 text-sm">
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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 p-1">
            {verifications.map((v) => {
                const imgSrc = v.screenshotPath
                    ? `${API_URL}${v.screenshotPath}`
                    : `${API_URL}/public/payment-screenshot/${encodeURIComponent(btoa(v.storageKey || ''))}`;
                return (
                    <motion.div
                        key={v.id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, height: 0 }}
                        className="bg-white border border-neutral-100 shadow-[0_8px_30px_rgb(0,0,0,0.06)] rounded-[32px] overflow-hidden flex flex-col"
                    >
                        {/* Image Area */}
                        <div
                            className="w-full h-44 sm:h-52 bg-neutral-200/60 relative group cursor-pointer"
                            onClick={() => setEnlargedImage(imgSrc)}
                        >
                            <img
                                src={imgSrc}
                                alt="Payment Screenshot"
                                className="w-full h-full object-cover"
                                onError={(e) => { (e.target as HTMLImageElement).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="%23ccc" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>'; }}
                            />
                            {/* Always visible eye icon overlay for mobile afforadance */}
                            <div className="absolute inset-0 bg-neutral-900/10 transition-colors flex items-center justify-center">
                                <div className="bg-white/20 backdrop-blur-md w-14 h-14 rounded-full flex items-center justify-center border border-white/30 text-white transition-opacity">
                                    <Eye className="w-7 h-7" />
                                </div>
                            </div>
                        </div>

                        {/* Details Box */}
                        <div className="px-6 pt-5 pb-6">
                            <div className="flex justify-between items-start gap-3 mb-2">
                                <div>
                                    <h3 className="text-[22px] tracking-tight font-bold text-app-text">{v.student.name}</h3>
                                    <p className="text-[15px] font-medium text-app-text-tertiary mt-0.5">
                                        {v.student.batch?.name || 'Unknown Batch'}
                                    </p>
                                </div>
                                <span className="text-2xl font-bold text-[#059669] flex-shrink-0 flex items-center gap-1.5 mt-0.5">
                                    <span className="font-sans font-light text-xl">₹</span>
                                    {v.amount.toLocaleString()}
                                </span>
                            </div>

                            {v.paidByName && (
                                <p className="text-[13px] text-app-text-secondary mt-1.5">
                                    <span className="text-app-text-tertiary">Paid by:</span>{' '}
                                    <span className="font-semibold text-app-text">{v.paidByName}</span>
                                </p>
                            )}

                            {v.installment && (
                                <div className="mt-4">
                                    <span className="inline-block border border-neutral-200 text-neutral-600 font-medium bg-white rounded-xl px-4 py-2 text-sm shadow-sm">
                                        {v.installment.name}
                                    </span>
                                </div>
                            )}

                            <div className="flex gap-4 mt-6">
                                <button
                                    onClick={() => setConfirmAction({ id: v.id, action: 'reject' })}
                                    disabled={actionLoading === v.id}
                                    className="flex-1 bg-white border border-red-200 text-red-600 hover:border-red-400 hover:bg-red-50 font-semibold py-3.5 rounded-[16px] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    {actionLoading === v.id ? <div className="w-5 h-5 border-2 border-red-300 border-t-red-600 rounded-full animate-spin" /> : <X className="w-5 h-5 stroke-[2.5px]" />}
                                    Reject
                                </button>
                                <button
                                    onClick={() => setConfirmAction({ id: v.id, action: 'approve' })}
                                    disabled={actionLoading === v.id}
                                    className="flex-[1.2] bg-[#0F172A] hover:bg-black text-white font-semibold py-3.5 rounded-[16px] transition-all flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
                                >
                                    {actionLoading === v.id ? <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Check className="w-5 h-5 stroke-[2.5px]" />}
                                    Approve
                                </button>
                            </div>
                        </div>
                    </motion.div>
                );
            })}

            {/* Lightbox Modal */}
            {typeof document !== 'undefined' && createPortal(
                <AnimatePresence>
                    {enlargedImage && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4"
                            onClick={() => setEnlargedImage(null)}
                        >
                            <button
                                onClick={() => setEnlargedImage(null)}
                                className="absolute top-20 right-6 bg-white/20 hover:bg-white/30 text-white rounded-full p-2.5 transition-colors z-[10000]"
                            >
                                <X className="w-6 h-6" />
                            </button>
                            <motion.img
                                initial={{ scale: 0.95, y: 10 }}
                                animate={{ scale: 1, y: 0 }}
                                exit={{ scale: 0.95, y: 10 }}
                                src={enlargedImage}
                                alt="Enlarged screenshot"
                                className="max-w-full max-h-[90vh] object-contain rounded-[24px] shadow-2xl relative z-[9999]"
                                onClick={(e) => e.stopPropagation()}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}

            {/* Custom Action Confirmation Modal */}
            {typeof document !== 'undefined' && createPortal(
                <AnimatePresence>
                    {confirmAction && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4"
                            onClick={() => setConfirmAction(null)}
                        >
                            <motion.div
                                initial={{ scale: 0.95, opacity: 0, y: 10 }}
                                animate={{ scale: 1, opacity: 1, y: 0 }}
                                exit={{ scale: 0.95, opacity: 0, y: 10 }}
                                onClick={(e) => e.stopPropagation()}
                                className="bg-white rounded-[24px] p-6 max-w-[320px] w-full shadow-2xl flex flex-col items-center text-center border border-neutral-100 relative z-[10000]"
                            >
                                <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-4 ${confirmAction.action === 'approve' ? 'bg-[#059669]/10 text-[#059669]' : 'bg-red-100 text-red-600'}`}>
                                    {confirmAction.action === 'approve' ? <Check className="w-7 h-7 stroke-[2.5px]" /> : <X className="w-7 h-7 stroke-[2.5px]" />}
                                </div>
                            <h3 className="text-[20px] font-bold text-app-text mb-2">
                                {confirmAction.action === 'approve' ? 'Approve Payment?' : 'Reject Payment?'}
                            </h3>
                            <p className="text-app-text-tertiary text-[14px] leading-relaxed mb-5 px-2">
                                {confirmAction.action === 'approve'
                                    ? 'This will immediately mark the fee as paid and notify the student.'
                                    : 'This will decline the payment. Please provide a reason below.'}
                            </p>

                            {confirmAction.action === 'reject' && (
                                <textarea
                                    value={rejectReason}
                                    onChange={(e) => setRejectReason(e.target.value)}
                                    placeholder="e.g., Screenshot is blurry, Amount does not match"
                                    className="w-full bg-neutral-50/80 border border-neutral-200 rounded-xl p-3 text-[14px] mb-6 outline-none focus:border-red-300 focus:bg-white resize-none h-[72px] text-app-text transition-all placeholder:text-neutral-400"
                                />
                            )}

                            <div className="flex gap-3 w-full mt-2">
                                <button
                                    onClick={() => setConfirmAction(null)}
                                    className="flex-[0.8] py-3.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-600 font-semibold text-[15px] rounded-xl transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={executeAction}
                                    disabled={confirmAction.action === 'reject' && !rejectReason.trim()}
                                    className={`flex-1 py-3.5 text-white font-semibold text-[15px] rounded-xl transition-all ${confirmAction.action === 'approve'
                                            ? 'bg-[#059669] hover:bg-[#047857]'
                                            : !rejectReason.trim()
                                                ? 'bg-red-300 cursor-not-allowed'
                                                : 'bg-red-600 hover:bg-red-700'
                                        }`}
                                >
                                    {confirmAction.action === 'approve' ? 'Approve' : 'Reject'}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
                </AnimatePresence>,
                document.body
            )}
        </div>
    );
}
