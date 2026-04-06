import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { api } from '../utils/api';
import { motion } from 'framer-motion';
import { Activity, Receipt, MessageSquare, CheckCircle, XCircle, Clock } from 'lucide-react';

interface SystemLog {
    id: string;
    action: string;
    entityName: string;
    details: any;
    createdAt: string;
}

interface CommunicationLog {
    id: string;
    phone: string;
    type: string;
    status: string;
    context: any;
    error: string | null;
    createdAt: string;
}

export default function Logs() {
    const [activeTab, setActiveTab] = useState<'STUDENT' | 'FEE' | 'COMMUNICATION'>('STUDENT');
    const [systemLogs, setSystemLogs] = useState<SystemLog[]>([]);
    const [commLogs, setCommLogs] = useState<CommunicationLog[]>([]);
    const [loading, setLoading] = useState(true);

    // Filters
    const [statusFilter, setStatusFilter] = useState<string>('');

    useEffect(() => {
        if (activeTab === 'STUDENT' || activeTab === 'FEE') {
            fetchSystemLogs();
        } else {
            fetchCommLogs();
        }
    }, [activeTab, statusFilter]);

    const fetchSystemLogs = async () => {
        setLoading(true);
        try {
            const res = await api.get(`/logs/system?type=${activeTab}`);
            setSystemLogs((res as any) || []);
        } catch (e) {
            console.error(e);
        }
        setLoading(false);
    };

    const fetchCommLogs = async () => {
        setLoading(true);
        try {
            const url = statusFilter ? `/logs/communications?status=${statusFilter}` : `/logs/communications`;
            const res = await api.get(url);
            setCommLogs((res as any) || []);
        } catch (e) {
            console.error(e);
        }
        setLoading(false);
    };

    const StatusBadge = ({ status }: { status: string }) => {
        switch (status) {
            case 'COMPLETED': return <span className="flex items-center text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full"><CheckCircle className="w-3 h-3 mr-1" /> Sent</span>;
            case 'FAILED': return <span className="flex items-center text-xs font-semibold text-red-600 bg-red-50 px-2 py-1 rounded-full"><XCircle className="w-3 h-3 mr-1" /> Failed</span>;
            default: return <span className="flex items-center text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-1 rounded-full"><Clock className="w-3 h-3 mr-1" /> {status}</span>;
        }
    };

    const ActionIcon = ({ action }: { action: string }) => {
        switch (action) {
            case 'STUDENT_JOIN': return <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 font-bold">+</div>;
            case 'STUDENT_LEAVE': return <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center text-red-600 font-bold">-</div>;
            case 'FEE_COLLECTED': return <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600"><Receipt className="w-4 h-4" /></div>;
            default: return <Activity className="w-4 h-4 text-gray-500" />;
        }
    };

    return (
        <Layout title="Activity Logs">
            <div className="bg-app-surface rounded-[24px] border border-app-border p-6 shadow-sm overflow-hidden">
                {/* Tabs */}
                <div className="flex gap-4 mb-6 border-b border-app-border pb-4 overflow-x-auto scrollbar-hide">
                    <button 
                        onClick={() => setActiveTab('STUDENT')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all whitespace-nowrap ${activeTab === 'STUDENT' ? 'bg-accent text-white shadow-md' : 'text-app-text-secondary hover:bg-black/5'}`}
                    >
                        <Activity className="w-4 h-4" />
                        Student Activity
                    </button>
                    <button 
                        onClick={() => setActiveTab('FEE')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all whitespace-nowrap ${activeTab === 'FEE' ? 'bg-accent text-white shadow-md' : 'text-app-text-secondary hover:bg-black/5'}`}
                    >
                        <Receipt className="w-4 h-4" />
                        Fee Logs
                    </button>
                    <button 
                        onClick={() => setActiveTab('COMMUNICATION')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all whitespace-nowrap ${activeTab === 'COMMUNICATION' ? 'bg-accent text-white shadow-md' : 'text-app-text-secondary hover:bg-black/5'}`}
                    >
                        <MessageSquare className="w-4 h-4" />
                        Communications
                    </button>
                </div>

                {/* Filters */}
                {activeTab === 'COMMUNICATION' && (
                    <div className="flex gap-3 mb-6">
                        <select 
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="bg-app-bg border border-app-border rounded-xl px-4 py-2 text-sm text-app-text outline-none focus:border-accent transition-colors"
                        >
                            <option value="">All Statuses</option>
                            <option value="COMPLETED">Completed</option>
                            <option value="FAILED">Failed</option>
                            <option value="PENDING">Pending</option>
                        </select>
                    </div>
                )}

                {/* Content */}
                {loading ? (
                    <div className="flex justify-center p-12"><div className="w-8 h-8 border-4 border-accent border-t-transparent rounded-full animate-spin"></div></div>
                ) : (
                    <div className="space-y-4">
                        {(activeTab === 'STUDENT' || activeTab === 'FEE') ? (
                            systemLogs.length === 0 ? (
                                <div className="text-center py-12 text-app-text-tertiary">No logs found.</div>
                            ) : (
                                systemLogs.map((log) => (
                                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} key={log.id} className="flex items-start gap-4 p-4 rounded-2xl bg-app-bg border border-app-border hover:border-accent/40 transition-colors">
                                        <ActionIcon action={log.action} />
                                        <div className="flex-1">
                                            <div className="flex items-center justify-between">
                                                <h4 className="font-semibold text-app-text">
                                                    {log.action === 'STUDENT_JOIN' && 'Student Joined'}
                                                    {log.action === 'STUDENT_LEAVE' && 'Student Left'}
                                                    {log.action === 'FEE_COLLECTED' && 'Fee Collected'}
                                                </h4>
                                                <span className="text-xs text-app-text-tertiary">{new Date(log.createdAt).toLocaleString()}</span>
                                            </div>
                                            <p className="text-sm text-app-text-secondary mt-1">
                                                <span className="font-medium text-app-text">{log.entityName}</span>
                                                {log.details?.batchName && ` • Batch: ${log.details.batchName}`}
                                                {log.details?.amount && ` • Amount: ₹${log.details.amount}`}
                                                {log.details?.installmentName && ` (${log.details.installmentName})`}
                                            </p>
                                        </div>
                                    </motion.div>
                                ))
                            )
                        ) : (
                            commLogs.length === 0 ? (
                                <div className="text-center py-12 text-app-text-tertiary">No communication logs found.</div>
                            ) : (
                                commLogs.map((log) => (
                                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} key={log.id} className="flex items-start gap-4 p-4 rounded-2xl bg-app-bg border border-app-border hover:border-accent/40 transition-colors">
                                        <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-600">
                                            <MessageSquare className="w-4 h-4" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between mb-1">
                                                <h4 className="font-semibold text-app-text truncate mr-2">{log.type.replace(/_/g, ' ')}</h4>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <StatusBadge status={log.status} />
                                                    <span className="text-xs text-app-text-tertiary ml-2">{new Date(log.createdAt).toLocaleString()}</span>
                                                </div>
                                            </div>
                                            <p className="text-sm text-app-text-secondary">To: <span className="font-medium">{log.phone}</span></p>
                                            {log.error && (
                                                <p className="text-xs text-red-500 mt-2 bg-red-50 p-2 rounded-lg border border-red-100">{log.error}</p>
                                            )}
                                        </div>
                                    </motion.div>
                                ))
                            )
                        )}
                    </div>
                )}
            </div>
        </Layout>
    );
}
