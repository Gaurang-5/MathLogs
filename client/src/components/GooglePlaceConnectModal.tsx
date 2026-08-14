import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, MapPin, Star, CheckCircle, RefreshCw, X, ExternalLink, Globe } from 'lucide-react';

interface GooglePlaceSearchResult {
    placeId: string;
    name: string;
    formattedAddress: string;
    rating?: number;
    userRatingsTotal?: number;
}

interface GooglePlaceConnectModalProps {
    isOpen: boolean;
    onClose: () => void;
    instituteId: string;
    currentPlaceId?: string | null;
    currentRating?: number | null;
    currentReviewCount?: number | null;
    currentMapsUrl?: string | null;
    onSyncSuccess: (updatedData: any) => void;
}

export const GooglePlaceConnectModal: React.FC<GooglePlaceConnectModalProps> = ({
    isOpen,
    onClose,
    instituteId,
    currentPlaceId,
    currentRating,
    currentReviewCount,
    currentMapsUrl,
    onSyncSuccess
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [searchResults, setSearchResults] = useState<GooglePlaceSearchResult[]>([]);
    const [selectedPlace, setSelectedPlace] = useState<GooglePlaceSearchResult | null>(null);
    const [isSyncing, setIsSyncing] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    const token = localStorage.getItem('token');

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!searchQuery.trim()) return;

        setIsSearching(true);
        setErrorMsg(null);
        setSearchResults([]);

        try {
            const res = await fetch(`/api/marketplace/google-place/search?q=${encodeURIComponent(searchQuery.trim())}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const json = await res.json();
            if (json.success && Array.isArray(json.data)) {
                setSearchResults(json.data);
                if (json.data.length === 0) {
                    setErrorMsg('No Google Business Profile found for this query. Try adding city name.');
                }
            } else {
                setErrorMsg(json.message || 'Failed to search Google Places.');
            }
        } catch (err: any) {
            setErrorMsg('Network error searching Google Places.');
        } finally {
            setIsSearching(false);
        }
    };

    const handleSyncPlace = async (placeId: string) => {
        setIsSyncing(true);
        setErrorMsg(null);
        setSuccessMsg(null);

        try {
            const res = await fetch(`/api/marketplace/coaching/${instituteId}/sync-google-place`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ placeId })
            });

            const json = await res.json();
            if (json.success) {
                setSuccessMsg('Google Business Profile synced successfully!');
                onSyncSuccess(json.data);
                setTimeout(() => {
                    onClose();
                }, 1200);
            } else {
                setErrorMsg(json.message || 'Failed to sync Google Business Profile.');
            }
        } catch (err: any) {
            setErrorMsg('Network error syncing Google Profile.');
        } finally {
            setIsSyncing(false);
        }
    };

    const handleUnlink = async () => {
        if (!window.confirm('Are you sure you want to unlink Google Business Profile from your coaching page?')) return;

        setIsSyncing(true);
        try {
            const res = await fetch(`/api/marketplace/coaching/${instituteId}/unlink-google-place`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            const json = await res.json();
            if (json.success) {
                setSuccessMsg('Google Business Profile unlinked.');
                onSyncSuccess(json.data);
                setTimeout(() => onClose(), 1000);
            }
        } catch (err) {
            setErrorMsg('Failed to unlink.');
        } finally {
            setIsSyncing(false);
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="relative w-full max-w-xl overflow-hidden bg-white rounded-3xl shadow-2xl border border-slate-100 dark:bg-slate-900 dark:border-slate-800"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between p-6 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-blue-50/50 to-indigo-50/30 dark:from-slate-800/50 dark:to-slate-900">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg shadow-md shadow-blue-500/20">
                                G
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                                    Google Business Profile Sync
                                </h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    Link Google Maps reviews & star rating to your coaching page
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
                        {/* Currently Connected Badge */}
                        {currentPlaceId && (
                            <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                                    <div>
                                        <div className="text-sm font-semibold text-emerald-900 dark:text-emerald-200 flex items-center gap-2">
                                            Connected to Google Maps
                                            {currentRating && (
                                                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200 font-bold">
                                                    ⭐ {currentRating} ({currentReviewCount || 0} reviews)
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5">
                                            Verified reviews are live on your public coaching profile.
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={handleUnlink}
                                    disabled={isSyncing}
                                    className="text-xs text-red-600 dark:text-red-400 hover:underline font-medium px-2 py-1"
                                >
                                    Unlink
                                </button>
                            </div>
                        )}

                        {/* Search Input */}
                        <form onSubmit={handleSearch} className="space-y-3">
                            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                                Search Coaching on Google Maps
                            </label>
                            <div className="relative flex items-center">
                                <Search className="absolute left-4 w-5 h-5 text-slate-400" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="e.g. Apex Math Academy Sector 14 Gurgaon"
                                    className="w-full pl-12 pr-28 py-3.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition text-sm"
                                />
                                <button
                                    type="submit"
                                    disabled={isSearching || !searchQuery.trim()}
                                    className="absolute right-2.5 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium text-xs rounded-xl transition disabled:opacity-50 flex items-center gap-1.5 shadow-md shadow-blue-500/20"
                                >
                                    {isSearching ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Search'}
                                </button>
                            </div>
                        </form>

                        {/* Messages */}
                        {errorMsg && (
                            <div className="p-3 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 rounded-xl border border-red-200 dark:border-red-800">
                                {errorMsg}
                            </div>
                        )}
                        {successMsg && (
                            <div className="p-3 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800">
                                {successMsg}
                            </div>
                        )}

                        {/* Search Results */}
                        {searchResults.length > 0 && (
                            <div className="space-y-3">
                                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                    Google Maps Search Results ({searchResults.length})
                                </div>
                                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                                    {searchResults.map((result) => (
                                        <div
                                            key={result.placeId}
                                            onClick={() => setSelectedPlace(result)}
                                            className={`p-4 rounded-2xl border transition cursor-pointer flex items-start justify-between gap-3 ${
                                                selectedPlace?.placeId === result.placeId
                                                    ? 'bg-blue-50/80 dark:bg-blue-950/40 border-blue-500 ring-2 ring-blue-500/20'
                                                    : 'bg-white dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                                            }`}
                                        >
                                            <div className="space-y-1">
                                                <div className="font-semibold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                                                    {result.name}
                                                    {result.rating && (
                                                        <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">
                                                            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                                                            {result.rating} ({result.userRatingsTotal || 0})
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                                    <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" />
                                                    {result.formattedAddress}
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleSyncPlace(result.placeId);
                                                }}
                                                disabled={isSyncing}
                                                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs rounded-xl shadow-sm transition disabled:opacity-50 flex items-center gap-1 flex-shrink-0"
                                            >
                                                {isSyncing && selectedPlace?.placeId === result.placeId ? (
                                                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                                ) : (
                                                    'Connect & Sync'
                                                )}
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex justify-between items-center text-xs text-slate-500 dark:text-slate-400">
                        <span className="flex items-center gap-1">
                            <Globe className="w-3.5 h-3.5 text-blue-500" /> Powered by Google Cloud Places API
                        </span>
                        <button
                            onClick={onClose}
                            className="px-4 py-2 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium rounded-xl hover:bg-slate-300 dark:hover:bg-slate-700 transition"
                        >
                            Close
                        </button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};
