import { useState, useEffect } from 'react';
import { apiRequest } from '../utils/api';
import Layout from '../components/Layout';
import Dropdown from '../components/Dropdown';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Users, Plus, X, GraduationCap, Hash, BookOpen, Type, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';

interface Batch {
    id: string;
    name: string;
    subject: string;
    timeSlot: string;
    feeAmount: number;
    className: string;
    batchNumber: number;
    _count: { students: number };
}

interface InstituteConfig {
    requiresGrades?: boolean;
    allowedClasses?: string[];
    subjects?: string[];
}

interface InstituteResponse {
    config?: InstituteConfig;
}

interface CreateBatchPayload {
    batchNumber: string;
    customName: string;
    subject: string;
    timeSlot: string;
    feeAmount: number;
    className?: string;
}

interface ApiErrorLike {
    message?: string;
}

export default function BatchList() {
    const [batches, setBatches] = useState<Batch[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [loading, setLoading] = useState(true);

    // Form State
    const [batchNumber, setBatchNumber] = useState('');
    const [customName, setCustomName] = useState('');
    const [subject, setSubject] = useState('Mathematics');
    const [allowedSubjects, setAllowedSubjects] = useState<string[]>([]);
    const [timeSlot, setTimeSlot] = useState('');
    // Fee is removed from creation
    const [className, setClassName] = useState('');

    // Institute Config
    const [requiresGrades, setRequiresGrades] = useState(true);
    const [allowedClasses, setAllowedClasses] = useState<string[]>([]);

    const fetchBatches = async () => {
        try {
            const data = await apiRequest<Batch[]>('/batches');
            setBatches(data);
        } catch {
            toast.error('Failed to load batches');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const loadData = async () => {
            // Fetch Batches
            fetchBatches();

            // Fetch Institute Config for Subjects and Grades
            try {
                const institute = await apiRequest<InstituteResponse>('/institute/me');
                const config = institute?.config || {};

                // Set requiresGrades (default to true if not specified)
                setRequiresGrades(config.requiresGrades !== false);

                // Set allowed classes
                if (Array.isArray(config.allowedClasses)) {
                    setAllowedClasses(config.allowedClasses);
                }

                // Set allowed subjects
                if (config.subjects && Array.isArray(config.subjects)) {
                    setAllowedSubjects(config.subjects);
                    // Default to first subject if available
                    if (config.subjects.length > 0) {
                        setSubject(config.subjects[0]);
                    }
                }
            } catch (e) {
                console.error("Failed to load institute config", e);
            }
        };
        loadData();
    }, []);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        const toastId = toast.loading('Creating batch...');

        try {
            const payload: CreateBatchPayload = {
                batchNumber,
                customName,
                subject,
                timeSlot,
                feeAmount: 0
            };

            // Only include className if grades are required
            if (requiresGrades) {
                payload.className = className;
            }

            await apiRequest('/batches', 'POST', payload);
            setShowForm(false);
            // Reset
            setBatchNumber(''); setCustomName(''); setTimeSlot(''); setClassName('');
            fetchBatches();
            toast.success('Batch created successfully!', { id: toastId });
        } catch (error: unknown) {
            const apiError = error as ApiErrorLike;
            console.error('❌ Batch creation failed:', error);
            const errorMsg = apiError.message || 'Failed to create batch';
            toast.error(errorMsg, { id: toastId });
        }
    };

    return (
        <Layout title="Manage Batches">
            {/* Action Bar */}
            <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <p className="text-app-text-secondary font-medium text-sm">View and manage your coaching batches.</p>
                <button
                    onClick={() => setShowForm(!showForm)}
                    className="bg-black text-white hover:bg-neutral-800 px-6 py-3 rounded-2xl font-bold shadow-lg shadow-black/10 transition-all active:scale-95 flex items-center text-sm cursor-pointer"
                >
                    {showForm ? <X className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                    {showForm ? 'Cancel' : 'Create New Batch'}
                </button>
            </div>

            <AnimatePresence>
                {showForm && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
                        className="mb-8"
                    >
                        <div className="bg-app-surface-opaque border-[1.5px] border-black/5 p-6 sm:p-8 md:p-10 rounded-2xl sm:rounded-[32px] shadow-2xl shadow-black/5 relative overflow-hidden">
                            {/* Top accent bar */}
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-accent-primary to-blue-400" />

                            <div className="flex items-start justify-between mb-8">
                                <div>
                                    <h3 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-3">
                                        <span className="flex items-center justify-center w-8 h-8 rounded-full bg-black text-white text-sm font-bold">+</span>
                                        Create New Batch
                                    </h3>
                                    <p className="text-app-text-secondary mt-2 font-medium text-sm ml-11">Fill in the details to set up a new batch.</p>
                                </div>
                            </div>

                            <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                {requiresGrades && (
                                    <Dropdown
                                        label="Class / Grade"
                                        value={className}
                                        onChange={setClassName}
                                        options={allowedClasses.map(cls => ({ value: cls, label: cls }))}
                                        placeholder="Select Class"
                                        required
                                        icon={<GraduationCap className="w-5 h-5" />}
                                    />
                                )}

                                <div className="space-y-2 group">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">Batch Number</label>
                                    <div className="relative">
                                        <Hash className="absolute left-4 top-4 w-5 h-5 text-gray-400 group-focus-within:text-accent-primary transition-colors" />
                                        <input
                                            className="w-full bg-neutral-50/50 border-2 border-transparent focus:bg-white focus:border-accent-primary text-app-text pl-12 p-4 rounded-2xl outline-none transition-all placeholder:text-gray-400 font-semibold"
                                            type="number"
                                            min="1"
                                            placeholder="e.g. 1"
                                            value={batchNumber}
                                            onChange={e => setBatchNumber(e.target.value)}
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2 group">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">Batch Name (Optional)</label>
                                    <div className="relative">
                                        <Type className="absolute left-4 top-4 w-5 h-5 text-gray-400 group-focus-within:text-accent-primary transition-colors" />
                                        <input
                                            className="w-full bg-neutral-50/50 border-2 border-transparent focus:bg-white focus:border-accent-primary text-app-text pl-12 p-4 rounded-2xl outline-none transition-all placeholder:text-gray-400 font-semibold"
                                            type="text"
                                            placeholder="e.g. Target 2026 Batch"
                                            value={customName}
                                            onChange={e => setCustomName(e.target.value)}
                                        />
                                    </div>
                                </div>

                                {allowedSubjects.length > 0 ? (
                                    <Dropdown
                                        label="Subject"
                                        value={subject}
                                        onChange={setSubject}
                                        options={allowedSubjects.map(s => ({ value: s, label: s }))}
                                        placeholder="Select Subject"
                                        required
                                        icon={<BookOpen className="w-5 h-5" />}
                                    />
                                ) : (
                                    <div className="space-y-2 group">
                                        <label className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">Subject</label>
                                        <div className="relative">
                                            <BookOpen className="absolute left-4 top-4 w-5 h-5 text-gray-400 group-focus-within:text-accent-primary transition-colors" />
                                            <input
                                                className="w-full bg-neutral-50/50 border-2 border-transparent focus:bg-white focus:border-accent-primary text-app-text pl-12 p-4 rounded-2xl outline-none transition-all placeholder:text-gray-400 font-semibold"
                                                placeholder="e.g. Mathematics, Science"
                                                value={subject}
                                                onChange={e => setSubject(e.target.value)}
                                                required
                                            />
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-2 group">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">Time Slot</label>
                                    <div className="relative">
                                        <Clock className="absolute left-4 top-4 w-5 h-5 text-gray-400 group-focus-within:text-accent-primary transition-colors" />
                                        <input
                                            className="w-full bg-neutral-50/50 border-2 border-transparent focus:bg-white focus:border-accent-primary text-app-text pl-12 p-4 rounded-2xl outline-none transition-all placeholder:text-gray-400 font-semibold"
                                            placeholder="e.g. Mon-Wed-Fri 4 PM"
                                            value={timeSlot}
                                            onChange={e => setTimeSlot(e.target.value)}
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="sm:col-span-2 flex justify-end pt-4">
                                    <button
                                        type="submit"
                                        className="w-full sm:w-auto px-8 py-4 bg-black text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-neutral-800 transition-all active:scale-95 cursor-pointer shadow-lg shadow-black/10"
                                    >
                                        Save Batch
                                        <ChevronRight className="w-5 h-5" />
                                    </button>
                                </div>
                            </form>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="w-8 h-8 border-2 border-black border-t-transparent rounded-full animate-spin" />
                </div>
            ) : (
                <div className="space-y-10 pb-20">
                    {/* Dynamic Sections */}
                    {(() => {
                        let sections: string[] = [];
                        if (!requiresGrades) {
                            sections = ['Course Batches'];
                        } else {
                            // Combine allowedClasses with actual classes from existing batches to ensure nothing is hidden
                            const existingClasses = batches.map(b => b.className).filter(Boolean) as string[];
                            const allUnique = new Set([...allowedClasses, ...existingClasses]);
                            sections = Array.from(allUnique).sort();

                            // Fallback defaults if absolutely empty
                            if (sections.length === 0) {
                                sections = ['Class 9', 'Class 10', 'Class 11', 'Class 12'];
                            }
                        }

                        return sections.map(section => {
                            let classBatches;
                            if (!requiresGrades) {
                                classBatches = batches;
                            } else {
                                classBatches = batches.filter(b => b.className === section);
                            }

                            // If we have batches in this class, show them
                            if (classBatches.length === 0) return null;

                            return (
                                <div key={section}>
                                    {/* Section header */}
                                    <div className="mb-5 pl-1">
                                        <h2 className="text-lg sm:text-xl font-bold text-app-text tracking-tight flex items-center gap-3">
                                            <span className="flex items-center justify-center w-7 h-7 rounded-full bg-black text-white text-xs font-bold">{classBatches.length}</span>
                                            {section}
                                        </h2>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
                                        {classBatches.map((batch, index) => (
                                            <motion.div
                                                key={batch.id}
                                                initial={{ opacity: 0, y: 20 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: index * 0.06, duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
                                                onClick={() => window.location.href = `/batches/${batch.id}`}
                                                className="bg-app-surface-opaque border-[1.5px] border-black/5 p-5 sm:p-6 rounded-2xl sm:rounded-[28px] shadow-sm hover:shadow-2xl hover:shadow-black/10 transition-all duration-300 group flex flex-col relative overflow-hidden cursor-pointer hover:-translate-y-1"
                                            >
                                                {/* Hover gradient reveal */}
                                                <div className="absolute top-0 right-0 w-32 h-32 bg-accent-primary/5 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 -translate-y-1/2 translate-x-1/3" />

                                                <div className="flex justify-between items-start mb-5 relative z-10">
                                                    <div>
                                                        <h3 className="font-bold text-lg sm:text-xl text-app-text group-hover:text-black transition-colors tracking-tight">{batch.name}</h3>
                                                        <div className="flex items-center text-sm font-semibold text-app-text-secondary mt-1.5">
                                                            <GraduationCap className="w-4 h-4 mr-1.5 text-accent-primary" />
                                                            {batch.subject}
                                                        </div>
                                                    </div>
                                                    <span className="bg-black text-white text-xs px-3 py-1.5 rounded-full font-bold flex items-center shadow-sm">
                                                        <Users className="w-3 h-3 mr-1.5" />
                                                        {batch._count?.students || 0}
                                                    </span>
                                                </div>

                                                <div className="relative z-10 mt-auto">
                                                    <div className="flex items-center justify-between text-sm text-app-text-secondary bg-neutral-50/80 p-3.5 rounded-2xl border border-black/5">
                                                        <div className="flex items-center">
                                                            <Clock className="w-4 h-4 mr-2.5 text-app-text-tertiary" />
                                                            <span className="font-medium">{batch.timeSlot}</span>
                                                        </div>
                                                        <ChevronRight className="w-4 h-4 text-app-text-tertiary group-hover:text-black group-hover:translate-x-0.5 transition-all" />
                                                    </div>
                                                </div>
                                            </motion.div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })
                    })()}

                    {/* Empty State */}
                    {batches.length === 0 && !showForm && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="py-20 text-center flex flex-col items-center justify-center bg-app-surface-opaque border-[1.5px] border-dashed border-black/10 rounded-[32px]"
                        >
                            <div className="w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center mb-5">
                                <Users className="w-8 h-8 text-app-text-tertiary" strokeWidth={1.5} />
                            </div>
                            <h3 className="text-app-text font-bold text-xl tracking-tight">No Batches Yet</h3>
                            <p className="text-app-text-secondary mt-2 font-medium text-sm max-w-sm">Create your first batch to start adding students and managing your coaching center.</p>
                            <button
                                onClick={() => setShowForm(true)}
                                className="mt-6 bg-black text-white px-6 py-3 rounded-2xl font-bold text-sm flex items-center gap-2 hover:bg-neutral-800 transition-all active:scale-95 cursor-pointer shadow-lg shadow-black/10"
                            >
                                <Plus className="w-4 h-4" />
                                Create First Batch
                            </button>
                        </motion.div>
                    )}
                </div>
            )}
        </Layout>
    );
}
