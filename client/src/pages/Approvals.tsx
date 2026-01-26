
import { useState, useEffect } from 'react';
import { apiRequest } from '../utils/api';
import Layout from '../components/Layout';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Clock, Smartphone, Mail, User, UserCheck } from 'lucide-react';
import toast from 'react-hot-toast';

interface Student {
    id: string;
    name: string;
    parentName: string;
    parentWhatsapp: string;
    parentEmail?: string;
    batch: { name: string };
    createdAt: string;
}

export default function Approvals() {
    const [students, setStudents] = useState<Student[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchPending = async () => {
        try {
            const data = await apiRequest('/students/pending');
            setStudents(data);
        } catch (e) {
            toast.error("Failed to fetch pending requests");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchPending(); }, []);

    const handleApprove = async (id: string, name: string) => {
        const promise = apiRequest(`/students/${id}/approve`, 'POST', {});

        toast.promise(promise, {
            loading: 'Approving student...',
            success: (data) => {
                setStudents(prev => prev.filter(s => s.id !== id));
                return `Approved ${name}! ID: ${data.humanId}`;
            },
            error: 'Failed to approve student',
        });
    };

    const handleReject = async (id: string, name: string) => {
        if (!confirm(`Reject ${name}?`)) return;

        const promise = apiRequest(`/students/${id}/reject`, 'POST', {});

        toast.promise(promise, {
            loading: 'Rejecting request...',
            success: () => {
                setStudents(prev => prev.filter(s => s.id !== id));
                return `Rejected ${name}`;
            },
            error: 'Failed to reject student',
        });
    }

    const container = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: { staggerChildren: 0.1 }
        }
    };

    const item = {
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0 }
    };

    return (
        <Layout title="Pending Approvals">
            {loading ? (
                <div className="text-slate-500 animate-pulse">Loading requests...</div>
            ) : (
                <motion.div
                    variants={container}
                    initial="hidden"
                    animate="show"
                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                >
                    <AnimatePresence>
                        {students.map(s => (
                            <motion.div
                                key={s.id}
                                variants={item}
                                layout
                                exit={{ opacity: 0, scale: 0.9 }}
                                className="bg-slate-900/50 backdrop-blur-md border border-slate-800 p-6 rounded-2xl shadow-xl hover:shadow-2xl hover:border-blue-500/30 transition-all group relative overflow-hidden"
                            >
                                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none"></div>

                                <div className="flex justify-between items-start mb-6 relative">
                                    <div>
                                        <h3 className="font-bold text-xl text-white group-hover:text-blue-400 transition-colors">{s.name}</h3>
                                        <div className="flex items-center text-xs text-slate-500 mt-1">
                                            <Clock className="w-3 h-3 mr-1" />
                                            {new Date(s.createdAt).toLocaleDateString()}
                                        </div>
                                    </div>
                                    <span className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 text-blue-300 text-xs px-3 py-1 rounded-full font-bold border border-blue-500/20 shadow-[0_0_10px_rgba(59,130,246,0.1)]">
                                        {s.batch?.name}
                                    </span>
                                </div>

                                <div className="space-y-4 mb-8 bg-slate-950/50 p-4 rounded-xl border border-slate-800/50 relative z-0">
                                    <div className="flex items-center">
                                        <User className="w-4 h-4 text-slate-500 mr-3" />
                                        <div>
                                            <p className="text-xs text-slate-500 uppercase tracking-wider font-bold">Parent</p>
                                            <p className="text-sm font-medium text-slate-300">{s.parentName}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center">
                                        <Smartphone className="w-4 h-4 text-slate-500 mr-3" />
                                        <div>
                                            <p className="text-xs text-slate-500 uppercase tracking-wider font-bold">Whatsapp</p>
                                            <p className="text-sm font-medium text-slate-300 font-mono tracking-wide">{s.parentWhatsapp}</p>
                                        </div>
                                    </div>
                                    {s.parentEmail && (
                                        <div className="flex items-center">
                                            <Mail className="w-4 h-4 text-slate-500 mr-3" />
                                            <div>
                                                <p className="text-xs text-slate-500 uppercase tracking-wider font-bold">Email</p>
                                                <p className="text-sm font-medium text-slate-300 truncate max-w-[150px]">{s.parentEmail}</p>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="flex gap-3 relative z-10">
                                    <button
                                        onClick={() => handleReject(s.id, s.name)}
                                        className="flex-1 bg-slate-800/50 hover:bg-red-900/20 text-slate-400 hover:text-red-400 border border-slate-700 hover:border-red-500/30 py-3 rounded-xl font-bold transition-all flex items-center justify-center group/btn"
                                    >
                                        <X className="w-4 h-4 mr-2 group-hover/btn:scale-110 transition-transform" />
                                        Reject
                                    </button>
                                    <button
                                        onClick={() => handleApprove(s.id, s.name)}
                                        className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white py-3 rounded-xl font-bold shadow-lg shadow-blue-900/20 hover:shadow-blue-600/40 transition-all flex items-center justify-center group/btn active:scale-95"
                                    >
                                        <Check className="w-4 h-4 mr-2 group-hover/btn:scale-110 transition-transform" />
                                        Approve
                                    </button>
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </motion.div>
            )}

            {!loading && students.length === 0 && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center justify-center py-32 text-center"
                >
                    <div className="w-24 h-24 bg-slate-800/50 rounded-full flex items-center justify-center mb-6 border border-slate-700">
                        <UserCheck className="w-12 h-12 text-slate-600" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">All Caught Up</h3>
                    <p className="text-slate-500 max-w-sm mx-auto">There are no pending student registration requests at the moment.</p>
                </motion.div>
            )}
        </Layout>
    );
}
