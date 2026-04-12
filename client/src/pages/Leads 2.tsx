import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { UserPlus, Phone, CheckCircle, XCircle, Clock, ArrowRight, Copy, ExternalLink, Edit3, Save, X, Link2, Layout } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const API_URL = import.meta.env.PROD ? '/api' : (import.meta.env.VITE_API_URL || 'http://localhost:3001/api');

interface Lead {
    id: string;
    studentName: string;
    parentName: string;
    parentPhone: string;
    status: string;
    createdAt: string;
    batch: { id: string; name: string; subject: string | null } | null;
}

interface Batch {
    id: string;
    name: string;
    subject: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
    NEW: { label: 'New', color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200', icon: Clock },
    CONTACTED: { label: 'Contacted', color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200', icon: Phone },
    CONVERTED: { label: 'Converted', color: 'text-green-700', bg: 'bg-green-50 border-green-200', icon: CheckCircle },
    LOST: { label: 'Lost', color: 'text-red-700', bg: 'bg-red-50 border-red-200', icon: XCircle },
};

export default function Leads() {
    const navigate = useNavigate();
    const [leads, setLeads] = useState<Lead[]>([]);
    const [batches, setBatches] = useState<Batch[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [filter, setFilter] = useState('ALL');
    
    const [slug, setSlug] = useState('');
    const [aboutUs, setAboutUs] = useState('');
    const [isEditingSlug, setIsEditingSlug] = useState(false);
    const [editSlug, setEditSlug] = useState('');
    const [editAbout, setEditAbout] = useState('');
    const [copied, setCopied] = useState(false);
    
    const [convertModal, setConvertModal] = useState<Lead | null>(null);
    const [convertBatchId, setConvertBatchId] = useState('');
    const [isConverting, setIsConverting] = useState(false);

    const fetchLeads = async () => {
        try {
            const token = localStorage.getItem('token');
            const headers = { Authorization: `Bearer ${token}` };
            const [leadsRes, batchesRes, slugRes] = await Promise.all([
                axios.get(`${API_URL}/leads`, { headers }),
                axios.get(`${API_URL}/batches`, { headers }),
                axios.get(`${API_URL}/institute/slug`, { headers })
            ]);
            setLeads(leadsRes.data);
            setBatches(batchesRes.data);
            setSlug(slugRes.data.slug || '');
            setAboutUs(slugRes.data.aboutUs || '');
        } catch (error) {
            console.error('Failed to fetch leads', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { fetchLeads(); }, []);

    const handleStatusChange = async (leadId: string, status: string) => {
        try {
            const token = localStorage.getItem('token');
            await axios.put(`${API_URL}/leads/${leadId}/status`, { status }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            fetchLeads();
        } catch (error) {
            console.error(error);
            alert('Failed to update status.');
        }
    };

    const handleConvert = async () => {
        if (!convertModal || !convertBatchId) return;
        setIsConverting(true);
        try {
            const token = localStorage.getItem('token');
            await axios.post(`${API_URL}/leads/${convertModal.id}/convert`, { batchId: convertBatchId }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setConvertModal(null);
            setConvertBatchId('');
            fetchLeads();
        } catch (error: any) {
            alert(error.response?.data?.error || 'Failed to convert lead');
        } finally {
            setIsConverting(false);
        }
    };

    const handleSaveSlug = async () => {
        try {
            const token = localStorage.getItem('token');
            await axios.put(`${API_URL}/institute/slug`, { slug: editSlug, aboutUs: editAbout }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setSlug(editSlug);
            setAboutUs(editAbout);
            setIsEditingSlug(false);
        } catch (error: any) {
            alert(error.response?.data?.error || 'Failed to save changes');
        }
    };

    const publicUrl = `${window.location.origin}/i/${slug}`;

    const handleCopy = () => {
        navigator.clipboard.writeText(publicUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const filtered = filter === 'ALL' ? leads : leads.filter(l => l.status === filter);
    const counts = {
        ALL: leads.length,
        NEW: leads.filter(l => l.status === 'NEW').length,
        CONTACTED: leads.filter(l => l.status === 'CONTACTED').length,
        CONVERTED: leads.filter(l => l.status === 'CONVERTED').length,
        LOST: leads.filter(l => l.status === 'LOST').length,
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-4 border-gray-200 border-t-black rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-5xl mx-auto px-4 py-6">
            {/* Website Link Card */}
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
                <div className="flex items-start justify-between">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                            <Link2 className="w-5 h-5 text-indigo-600" /> Your Public Website
                        </h2>
                        <p className="text-sm text-gray-500 mt-1">Share this link with parents for new admissions.</p>
                    </div>
                    <button onClick={() => { setEditSlug(slug); setEditAbout(aboutUs); setIsEditingSlug(true); }} className="text-sm text-gray-600 font-bold hover:underline flex items-center gap-1">
                        <Edit3 className="w-3.5 h-3.5"/> Edit URL
                    </button>
                    <button onClick={() => navigate('/website-builder')} className="text-sm text-white bg-indigo-600 font-bold px-4 py-2 rounded-xl hover:bg-indigo-700 flex items-center gap-1 transition-colors">
                        <Layout className="w-3.5 h-3.5"/> Customize Website
                    </button>
                </div>
                {slug && (
                    <div className="mt-4 flex items-center gap-3 bg-gray-50 rounded-xl p-3 border border-gray-200">
                        <code className="text-sm font-mono text-gray-700 truncate flex-1">{publicUrl}</code>
                        <button onClick={handleCopy} className="p-2 bg-white rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors" title="Copy Link">
                            {copied ? <CheckCircle className="w-4 h-4 text-green-600"/> : <Copy className="w-4 h-4 text-gray-500"/>}
                        </button>
                        <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="p-2 bg-white rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors" title="Preview">
                            <ExternalLink className="w-4 h-4 text-gray-500"/>
                        </a>
                    </div>
                )}
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {(['ALL', 'NEW', 'CONTACTED', 'CONVERTED', 'LOST'] as const).map(key => (
                    <button 
                        key={key} 
                        onClick={() => setFilter(key)}
                        className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-colors border ${filter === key ? 'bg-black text-white border-black' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                    >
                        {key === 'ALL' ? 'All' : STATUS_CONFIG[key].label} ({counts[key]})
                    </button>
                ))}
            </div>

            {/* Leads List */}
            <div className="space-y-3">
                {filtered.length === 0 ? (
                    <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-gray-200">
                        <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-4">
                            <UserPlus className="w-8 h-8 text-indigo-300" />
                        </div>
                        <p className="text-gray-500 font-medium">No leads yet</p>
                        <p className="text-gray-400 text-sm mt-1">Share your public link to start receiving inquiries.</p>
                    </div>
                ) : (
                    filtered.map(lead => {
                        const cfg = STATUS_CONFIG[lead.status] || STATUS_CONFIG.NEW;
                        const Icon = cfg.icon;
                        return (
                            <motion.div 
                                key={lead.id}
                                layout
                                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                                className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-3 mb-1">
                                        <h3 className="text-base font-bold text-gray-900 truncate">{lead.studentName}</h3>
                                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color} flex items-center gap-1`}>
                                            <Icon className="w-3 h-3"/> {cfg.label}
                                        </span>
                                    </div>
                                    <p className="text-sm text-gray-500">
                                        Parent: <span className="font-medium text-gray-700">{lead.parentName}</span> &middot; <span className="font-medium text-gray-700">{lead.parentPhone}</span>
                                    </p>
                                    {lead.batch && (
                                        <p className="text-xs text-indigo-600 font-semibold mt-1">Interested in: {lead.batch.name}</p>
                                    )}
                                    <p className="text-xs text-gray-400 mt-1">{new Date(lead.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                                </div>

                                {lead.status !== 'CONVERTED' && lead.status !== 'LOST' && (
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        {lead.status === 'NEW' && (
                                            <button onClick={() => handleStatusChange(lead.id, 'CONTACTED')} className="px-3 py-2 text-sm font-bold bg-orange-50 text-orange-700 rounded-xl hover:bg-orange-100 transition-colors border border-orange-200 flex items-center gap-1">
                                                <Phone className="w-3.5 h-3.5"/> Contacted
                                            </button>
                                        )}
                                        <button onClick={() => { setConvertModal(lead); setConvertBatchId(lead.batch?.id || ''); }} className="px-3 py-2 text-sm font-bold bg-green-50 text-green-700 rounded-xl hover:bg-green-100 transition-colors border border-green-200 flex items-center gap-1">
                                            <ArrowRight className="w-3.5 h-3.5"/> Convert
                                        </button>
                                        <button onClick={() => handleStatusChange(lead.id, 'LOST')} className="px-3 py-2 text-sm font-bold bg-red-50 text-red-700 rounded-xl hover:bg-red-100 transition-colors border border-red-200 flex items-center gap-1">
                                            <XCircle className="w-3.5 h-3.5"/> Lost
                                        </button>
                                    </div>
                                )}
                            </motion.div>
                        );
                    })
                )}
            </div>

            {/* Convert Modal */}
            <AnimatePresence>
                {convertModal && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
                            <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                                <h3 className="text-lg font-bold text-gray-900">Convert Lead to Student</h3>
                                <button onClick={() => setConvertModal(null)} className="p-2 hover:bg-gray-200 rounded-full"><X className="w-5 h-5 text-gray-500"/></button>
                            </div>
                            <div className="p-6 space-y-4">
                                <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
                                    <p className="font-bold text-gray-900">{convertModal.studentName}</p>
                                    <p className="text-sm text-gray-600">{convertModal.parentName} &middot; {convertModal.parentPhone}</p>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Assign to Batch</label>
                                    <select value={convertBatchId} onChange={e => setConvertBatchId(e.target.value)} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black text-sm font-medium">
                                        <option value="">-- Select a batch --</option>
                                        {batches.map(b => (
                                            <option key={b.id} value={b.id}>{b.name} {b.subject ? `(${b.subject})` : ''}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
                                <button onClick={() => setConvertModal(null)} className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg">Cancel</button>
                                <button onClick={handleConvert} disabled={!convertBatchId || isConverting} className="px-6 py-2 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2">
                                    <CheckCircle className="w-4 h-4"/> {isConverting ? 'Converting...' : 'Convert to Student'}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Edit Slug Modal */}
            <AnimatePresence>
                {isEditingSlug && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
                            <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                                <h3 className="text-lg font-bold text-gray-900">Customize Your Website</h3>
                                <button onClick={() => setIsEditingSlug(false)} className="p-2 hover:bg-gray-200 rounded-full"><X className="w-5 h-5 text-gray-500"/></button>
                            </div>
                            <div className="p-6 space-y-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Your URL Slug</label>
                                    <div className="flex items-center bg-gray-50 border border-gray-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-black">
                                        <span className="px-3 text-sm text-gray-400 font-mono">/i/</span>
                                        <input type="text" value={editSlug} onChange={e => setEditSlug(e.target.value)} className="w-full bg-transparent px-2 py-3 focus:outline-none font-mono text-sm" placeholder="my-classes"/>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">About Us (shown on your public page)</label>
                                    <textarea value={editAbout} onChange={e => setEditAbout(e.target.value)} rows={3} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black text-sm" placeholder="Tell parents about your institute..."/>
                                </div>
                            </div>
                            <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
                                <button onClick={() => setIsEditingSlug(false)} className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg">Cancel</button>
                                <button onClick={handleSaveSlug} className="px-6 py-2 bg-black text-white font-bold rounded-lg hover:bg-gray-800 flex items-center gap-2">
                                    <Save className="w-4 h-4"/> Save Changes
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
