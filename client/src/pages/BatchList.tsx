import { useState, useEffect } from 'react';
import { apiRequest } from '../utils/api';
import Layout from '../components/Layout';
import Dropdown from '../components/Dropdown';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Users, Plus, X, GraduationCap } from 'lucide-react';
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

export default function BatchList() {
    const [batches, setBatches] = useState<Batch[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [loading, setLoading] = useState(true);

    // Form State
    const [batchNumber, setBatchNumber] = useState('');
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
            const data = await apiRequest('/batches');
            setBatches(data);
        } catch (e) {
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
                const institute = await apiRequest('/institute/me');
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
            const payload: any = {
                batchNumber,
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
            setBatchNumber(''); setTimeSlot(''); setClassName('');
            fetchBatches();
            toast.success('Batch created successfully!', { id: toastId });
        } catch (e: any) {
            console.error('❌ Batch creation failed:', e);
            const errorMsg = e.response?.data?.error || e.message || 'Failed to create batch';
            toast.error(errorMsg, { id: toastId });
        }
    };

    return (
        <Layout title="Manage Batches">
            {/* Action Bar */}
            <div className="mb-8 flex justify-between items-center">
                <p className="text-app-text-secondary">View and manage your coaching batches.</p>
                <button
                    onClick={() => setShowForm(!showForm)}
                    className="bg-app-text text-app-bg hover:bg-app-text/90 border border-black  px-5 py-2.5 rounded-full font-semibold shadow-lg transition-all active:scale-95 flex items-center text-sm"
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
                        className="mb-8"
                    >
                        <div className="bg-app-surface-opaque border border-app-border p-8 rounded-[24px] shadow-sm">
                            <h3 className="font-semibold text-lg mb-8 text-app-text flex items-center">
                                <span className="w-8 h-8 rounded-full bg-accent-subtle flex items-center justify-center mr-3 text-accent text-sm font-bold">01</span>
                                Create New Batch
                            </h3>
                            <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {requiresGrades && (
                                    <Dropdown
                                        label="Class / Grade"
                                        value={className}
                                        onChange={setClassName}
                                        options={allowedClasses.map(cls => ({ value: cls, label: cls }))}
                                        placeholder="Select Class"
                                        required
                                    />
                                )}

                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Batch Number</label>
                                    <input
                                        className="w-full !bg-neutral-50 border border-app-border text-app-text p-3.5 rounded-xl focus:ring-1 focus:ring-accent focus:border-accent outline-none transition-all placeholder:text-app-text-secondary/50"
                                        type="number"
                                        min="1"
                                        placeholder="e.g. 1"
                                        value={batchNumber}
                                        onChange={e => setBatchNumber(e.target.value)}
                                        required
                                    />
                                </div>

                                {allowedSubjects.length > 0 ? (
                                    <Dropdown
                                        label="Subject"
                                        value={subject}
                                        onChange={setSubject}
                                        options={allowedSubjects.map(s => ({ value: s, label: s }))}
                                        placeholder="Select Subject"
                                        required
                                    />
                                ) : (
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Subject</label>
                                        <input
                                            className="w-full !bg-neutral-50 border border-app-border text-app-text  p-3.5 rounded-xl focus:ring-1 focus:ring-accent focus:border-accent outline-none transition-all placeholder:text-app-text-secondary/50"
                                            placeholder="e.g. Mathematics, Science"
                                            value={subject}
                                            onChange={e => setSubject(e.target.value)}
                                            required
                                        />
                                    </div>
                                )}
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Time Slot</label>
                                    <input
                                        className="w-full !bg-neutral-50 border border-app-border text-app-text  p-3.5 rounded-xl focus:ring-1 focus:ring-accent focus:border-accent outline-none transition-all placeholder:text-app-text-secondary/50"
                                        placeholder="e.g. Mon-Wed-Fri 4 PM"
                                        value={timeSlot}
                                        onChange={e => setTimeSlot(e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="md:col-span-2 flex justify-end pt-4">
                                    <button type="submit" className="bg-neutral-900 hover:bg-black  text-white px-8 py-3.5 rounded-xl font-bold shadow-lg shadow-neutral-500/10 transition-all hover:scale-[1.02] active:scale-95 w-full md:w-auto">Save Batch</button>
                                </div>
                            </form>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {loading ? (
                <div className="text-center text-app-text-secondary py-20 animate-pulse">Loading batches...</div>
            ) : (
                <div className="space-y-12 pb-20">
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
                                    <h2 className="text-xl font-bold text-app-text mb-5 pl-1 flex items-center gap-3">
                                        <span className="w-1.5 h-6 rounded-full bg-accent"></span>
                                        {section}
                                    </h2>
                                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                                        {classBatches.map((batch, index) => (
                                            <motion.div
                                                key={batch.id}
                                                initial={{ opacity: 0, y: 20 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: index * 0.05 }}
                                                onClick={() => window.location.href = `/batches/${batch.id}`}
                                                className="bg-app-surface-opaque hover:bg-app-surface border border-app-border p-6 rounded-[24px] shadow-sm hover:shadow-xl transition-all group flex flex-col relative overflow-hidden cursor-pointer hover:-translate-y-1"
                                            >
                                                <div className="flex justify-between items-start mb-6 relative z-10">
                                                    <div>
                                                        <h3 className="font-semibold text-xl text-app-text group-hover:text-accent transition-colors">{batch.name}</h3>
                                                        <div className="flex items-center text-sm font-medium text-app-text-secondary mt-1">
                                                            <GraduationCap className="w-4 h-4 mr-1.5 text-accent" />
                                                            {batch.subject}
                                                        </div>
                                                    </div>
                                                    <span className="bg-app-surface text-app-text-secondary text-xs px-3 py-1.5 rounded-full font-bold border border-app-border flex items-center">
                                                        <Users className="w-3 h-3 mr-1.5" />
                                                        {batch._count?.students || 0}
                                                    </span>
                                                </div>

                                                <div className="relative z-10 mt-auto">
                                                    <div className="flex items-center text-sm text-app-text-secondary bg-app-bg p-3 rounded-xl border border-app-border/50">
                                                        <Clock className="w-4 h-4 mr-3 text-app-text-tertiary" />
                                                        {batch.timeSlot}
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
                        <div className="col-span-full py-20 text-center flex flex-col items-center justify-center bg-app-surface border border-dashed border-app-border rounded-[24px]">
                            <div className="w-16 h-16 bg-neutral-100 dark:bg-neutral-800 rounded-full flex items-center justify-center mb-4 text-app-text-secondary">
                                <Users className="w-8 h-8" strokeWidth={1.5} />
                            </div>
                            <h3 className="text-app-text font-bold text-lg">No Batches Found</h3>
                            <p className="text-app-text-secondary mt-1">Create your first batch to start adding students.</p>
                        </div>
                    )}
                </div>
            )}
        </Layout>
    );
}
