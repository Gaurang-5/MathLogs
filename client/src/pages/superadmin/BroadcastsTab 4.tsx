import { useState, useEffect } from 'react';
import axios from 'axios';
import { Megaphone, Trash2, Plus, X, AlertTriangle, CheckCircle, Info } from 'lucide-react';

const API_URL = import.meta.env.PROD ? '/api' : (import.meta.env.VITE_API_URL || 'http://localhost:3001/api');

export interface SystemAlert {
    id: string;
    title: string;
    message: string;
    type: string;
    isActive: boolean;
    createdAt: string;
}

export default function BroadcastsTab() {
    const [alerts, setAlerts] = useState<SystemAlert[]>([]);
    const [isCreating, setIsCreating] = useState(false);
    
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [type, setType] = useState('INFO');
    const [expiresDays, setExpiresDays] = useState('7');
    
    const [isSubmitting, setIsSubmitting] = useState(false);

    const fetchAlerts = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get(`${API_URL}/alerts`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setAlerts(res.data);
        } catch (error) {
            console.error('Failed to fetch alerts', error);
        }
    };

    useEffect(() => {
        fetchAlerts();
    }, []);

    const handleCreate = async () => {
        if (!title.trim() || !message.trim()) return;
        setIsSubmitting(true);
        try {
            const token = localStorage.getItem('token');
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + parseInt(expiresDays));
            
            await axios.post(`${API_URL}/alerts`, {
                title,
                message,
                type,
                expiresAt: expiresAt.toISOString()
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            setIsCreating(false);
            setTitle('');
            setMessage('');
            setType('INFO');
            fetchAlerts();
        } catch (error) {
            console.error(error);
            alert('Failed to send broadcast');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDismiss = async (id: string) => {
        if (!window.confirm("Are you sure you want to stop this broadcast? It will be removed from all tenant dashboards immediately.")) return;
        try {
            const token = localStorage.getItem('token');
            await axios.put(`${API_URL}/alerts/${id}/dismiss`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            fetchAlerts();
        } catch (error) {
            console.error(error);
            alert('Failed to dismiss broadcast');
        }
    };

    const getTypeIcon = (t: string) => {
        switch(t) {
            case 'WARNING': return <AlertTriangle className="w-5 h-5 text-orange-500" />;
            case 'ERROR': return <AlertTriangle className="w-5 h-5 text-red-500" />;
            case 'SUCCESS': return <CheckCircle className="w-5 h-5 text-green-500" />;
            default: return <Info className="w-5 h-5 text-blue-500" />;
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                <div>
                    <h2 className="text-xl font-bold flex items-center gap-2 text-gray-900">
                        <Megaphone className="w-5 h-5 text-purple-600" />
                        Global Broadcasts
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">Push announcements to all tenant dashboards simultaneously.</p>
                </div>
                <button 
                    onClick={() => setIsCreating(true)}
                    className="flex items-center gap-2 bg-black text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-md hover:bg-gray-800 transition-colors"
                >
                    <Plus className="w-4 h-4" /> New Broadcast
                </button>
            </div>

            <div className="grid gap-4">
                {alerts.length === 0 ? (
                    <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-gray-200">
                        <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Megaphone className="w-8 h-8 text-gray-300" />
                        </div>
                        <p className="text-gray-500 font-medium">No active broadcasts</p>
                    </div>
                ) : (
                    alerts.map(alert => (
                        <div key={alert.id} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-start justify-between">
                            <div className="flex items-start gap-4">
                                <div className="p-2 bg-gray-50 rounded-xl">
                                    {getTypeIcon(alert.type)}
                                </div>
                                <div>
                                    <h3 className="font-bold text-gray-900">{alert.title}</h3>
                                    <p className="text-gray-600 mt-1 text-sm">{alert.message}</p>
                                    <div className="text-xs text-gray-400 mt-3 font-medium">
                                        Broadcasted: {new Date(alert.createdAt).toLocaleString()}
                                    </div>
                                </div>
                            </div>
                            <button 
                                onClick={() => handleDismiss(alert.id)}
                                className="p-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-colors flex items-center gap-2 text-sm font-bold"
                            >
                                <Trash2 className="w-4 h-4"/> Stop
                            </button>
                        </div>
                    ))
                )}
            </div>

            {isCreating && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <h3 className="text-xl font-bold text-gray-900">New Broadcast</h3>
                            <button onClick={() => setIsCreating(false)} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                                <X className="w-5 h-5 text-gray-500" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Headline</label>
                                <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Scheduled Maintenance" className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black font-medium" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Message Payload</label>
                                <textarea value={message} onChange={e => setMessage(e.target.value)} rows={3} placeholder="Provide details..." className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black text-sm" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Alert Type</label>
                                    <select value={type} onChange={e => setType(e.target.value)} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black text-sm font-medium">
                                        <option value="INFO">Information (Blue)</option>
                                        <option value="WARNING">Warning (Orange)</option>
                                        <option value="ERROR">Critical (Red)</option>
                                        <option value="SUCCESS">Success (Green)</option>
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Duration</label>
                                    <select value={expiresDays} onChange={e => setExpiresDays(e.target.value)} className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black text-sm font-medium">
                                        <option value="1">1 Day</option>
                                        <option value="3">3 Days</option>
                                        <option value="7">7 Days</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
                            <button onClick={() => setIsCreating(false)} className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg">Cancel</button>
                            <button onClick={handleCreate} disabled={isSubmitting} className="px-6 py-2 bg-purple-600 text-white font-bold rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2">
                                <Megaphone className="w-4 h-4"/> {isSubmitting ? 'Sending...' : 'Broadcast Now'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
