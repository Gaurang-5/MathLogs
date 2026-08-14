import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, Monitor, Copy, Share2, Pause, Play, Archive } from 'lucide-react';
import QRCode from 'react-qr-code';
import toast from 'react-hot-toast';
import { cn } from '../../utils/cn';
import { API_URL } from '../../utils/api';

export interface BatchQrModalProps {
    isOpen: boolean;
    batch: {
        id: string;
        name: string;
        isRegistrationOpen: boolean;
        isRegistrationEnded?: boolean;
    };
    onClose: () => void;
    onToggleRegistration: () => void;
    onEndRegistration: () => void;
}

export const BatchRegistrationQrModal: React.FC<BatchQrModalProps> = ({
    isOpen,
    batch,
    onClose,
    onToggleRegistration,
    onEndRegistration,
}) => {
    if (!isOpen || batch.isRegistrationEnded) return null;

    const registrationUrl = `${window.location.origin}/register/${batch.id}`;

    const handleDownloadQrPdf = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`${API_URL}/batches/${batch.id}/qr-pdf`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!response.ok) throw new Error('Failed to download');
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `QR-${batch.name.replace(/\s+/g, '-')}.pdf`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch {
            toast.error('Failed to download QR PDF');
        }
    };

    const handleShare = async () => {
        try {
            if (navigator.share) {
                await navigator.share({
                    title: 'Batch Registration',
                    text: `Register for ${batch.name}`,
                    url: registrationUrl
                });
            } else {
                navigator.clipboard.writeText(registrationUrl);
                toast.success('Link copied!');
            }
        } catch (err) {
            console.error('Share failed', err);
        }
    };

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
                {/* Backdrop */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-black/50 backdrop-blur-md"
                    onClick={onClose}
                />
                {/* Sheet / Card */}
                <motion.div
                    initial={{ opacity: 0, y: 40, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 40, scale: 0.97 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                    className="!bg-white border border-black/[0.06] rounded-t-[2rem] sm:rounded-[2rem] p-6 sm:p-8 w-full sm:max-w-sm shadow-2xl relative z-10 flex flex-col gap-5"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-app-text-tertiary mb-1">Registration</p>
                            <div className="flex items-center gap-2">
                                <h3 className="text-xl font-black text-black tracking-tight">{batch.name}</h3>
                                <div className={cn(
                                    "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-black border uppercase tracking-wider shrink-0",
                                    batch.isRegistrationOpen
                                        ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
                                        : 'bg-amber-50 text-amber-600 border-amber-200'
                                )}>
                                    <span className={cn(
                                        "w-1.5 h-1.5 rounded-full",
                                        batch.isRegistrationOpen ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                                    )} />
                                    {batch.isRegistrationOpen ? 'Live' : 'Paused'}
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-neutral-100 rounded-xl transition-colors text-app-text-tertiary hover:text-black shrink-0 ml-2"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* QR Code */}
                    <div className="flex flex-col items-center gap-4 py-4 bg-neutral-50 rounded-2xl border border-black/[0.06]">
                        <div className="bg-white p-4 rounded-2xl border border-black/[0.06] shadow-sm">
                            <QRCode value={registrationUrl} size={140} />
                        </div>
                        <button
                            onClick={handleDownloadQrPdf}
                            className="flex items-center gap-2 text-sm font-bold text-app-text-secondary hover:text-black bg-white px-5 py-2.5 rounded-xl border border-black/[0.06] hover:border-black/20 transition-all active:scale-[0.97] shadow-sm"
                        >
                            <Download className="w-4 h-4" /> Download QR PDF
                        </button>
                    </div>

                    {/* Quick Links */}
                    <div className="flex flex-col gap-2">
                        <p className="text-[10px] font-black text-app-text-tertiary uppercase tracking-widest px-1">Quick Links</p>
                        <button
                            onClick={() => window.open(`/kiosk/register/${batch.id}`, '_blank')}
                            className="flex items-center gap-3 py-3 px-4 rounded-xl bg-neutral-50 hover:bg-neutral-100 text-black border border-black/[0.06] text-sm font-semibold transition-all w-full active:scale-[0.98] text-left"
                        >
                            <Monitor className="w-4 h-4 text-app-text-tertiary shrink-0" />
                            <span>Fullscreen Kiosk Mode</span>
                        </button>
                        <button
                            onClick={() => { navigator.clipboard.writeText(registrationUrl); toast.success('Invite Link Copied'); }}
                            className="flex items-center gap-3 py-3 px-4 rounded-xl bg-neutral-50 hover:bg-neutral-100 text-black border border-black/[0.06] text-sm font-semibold transition-all w-full active:scale-[0.98] text-left"
                        >
                            <Copy className="w-4 h-4 text-app-text-tertiary shrink-0" />
                            <span>Copy Registration Link</span>
                        </button>
                        <button
                            onClick={handleShare}
                            className="flex items-center gap-3 py-3 px-4 rounded-xl bg-neutral-50 hover:bg-neutral-100 text-black border border-black/[0.06] text-sm font-semibold transition-all w-full active:scale-[0.98] text-left"
                        >
                            <Share2 className="w-4 h-4 text-app-text-tertiary shrink-0" />
                            <span>Share Link</span>
                        </button>
                    </div>

                    {/* Admin Controls */}
                    <div className="border-t border-black/[0.06] pt-4 flex flex-col gap-2">
                        <p className="text-[10px] font-black text-app-text-tertiary uppercase tracking-widest px-1 mb-1">Admin Controls</p>
                        <button
                            onClick={() => { onToggleRegistration(); onClose(); }}
                            className={cn(
                                "flex items-center gap-3 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all w-full text-left border",
                                batch.isRegistrationOpen
                                    ? "bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200"
                                    : "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200"
                            )}
                        >
                            {batch.isRegistrationOpen ? <Pause className="w-4 h-4 shrink-0" /> : <Play className="w-4 h-4 shrink-0" />}
                            <span>{batch.isRegistrationOpen ? 'Pause Registration Temporarily' : 'Resume Registration'}</span>
                        </button>
                        <button
                            onClick={() => { onEndRegistration(); onClose(); }}
                            className="flex items-center gap-3 py-2.5 px-4 rounded-xl text-sm font-semibold bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 transition-all w-full text-left"
                        >
                            <Archive className="w-4 h-4 shrink-0" />
                            <span>Close Registration Permanently</span>
                        </button>
                    </div>

                    {/* Safe area spacer for mobile bottom sheet */}
                    <div className="h-safe-area-inset-bottom sm:hidden" />
                </motion.div>
            </div>
        </AnimatePresence>
    );
};
