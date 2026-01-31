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
    // Subject is auto-set to Mathematics
    const [timeSlot, setTimeSlot] = useState('');
    // Fee is removed from creation
    const [className, setClassName] = useState('');

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
        fetchBatches();
    }, []);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        const toastId = toast.loading('Creating batch...');

        try {
            const payload = {
                batchNumber,
                subject: 'Mathematics',
                timeSlot,
                className,
                feeAmount: 0
            };

            await apiRequest('/batches', 'POST', payload);
            setShowForm(false);
            // Reset
            setBatchNumber(''); setTimeSlot(''); setClassName('');
            fetchBatches();
            toast.success('Batch created successfully!', { id: toastId });
        } catch (e: any) {
            console.error(e);
            toast.error(e.message || 'Failed to create batch', { id: toastId });
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
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden mb-8"
                    >
                        <div className="bg-app-surface border border-app-border p-5 md:p-8 rounded-[24px] shadow-xl">
                            <h3 className="font-semibold text-lg mb-8 text-app-text flex items-center">
                                <span className="w-8 h-8 rounded-full bg-accent-subtle flex items-center justify-center mr-3 text-accent text-sm font-bold">01</span>
                                Create New Batch
                            </h3>
                            <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <Dropdown
                                    label="Class / Grade"
                                    value={className}
                                    onChange={setClassName}
                                    options={[
                                        { value: 'Class 9', label: 'Class 9' },
                                        { value: 'Class 10', label: 'Class 10' }
                                    ]}
                                    placeholder="Select Class"
                                    required
                                />
                                <Dropdown
                                    label="Batch Number"
                                    value={batchNumber}
                                    onChange={setBatchNumber}
                                    options={
                                        className === 'Class 9'
                                            ? [
                                                { value: '1', label: 'Batch 1' },
                                                { value: '2', label: 'Batch 2' }
                                            ]
                                            : className === 'Class 10'
                                                ? [
                                                    { value: '1', label: 'Batch 1' },
                                                    { value: '2', label: 'Batch 2' },
                                                    { value: '3', label: 'Batch 3' }
                                                ]
                                                : []
                                    }
                                    placeholder="Select Number"
                                    disabled={!className}
                                    required
                                />
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
                    {['Class 10', 'Class 9'].map(cls => {
                        const classBatches = batches.filter(b => b.className === cls);

                        // If we have batches in this class, show them
                        if (classBatches.length === 0) return null;

                        return (
                            <div key={cls}>
                                <h2 className="text-xl font-bold text-app-text mb-5 pl-1 flex items-center gap-3">
                                    <span className="w-1.5 h-6 rounded-full bg-accent"></span>
                                    {cls} Batches
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
                    })}

                    {batches.some(b => b.className !== 'Class 10' && b.className !== 'Class 9') && (
                        <div>
                            <h2 className="text-xl font-bold text-gray-900  mb-5 pl-1 flex items-center gap-3">
                                <span className="w-1.5 h-6 rounded-full bg-neutral-400"></span>
                                Other Batches
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                                {batches.filter(b => b.className !== 'Class 10' && b.className !== 'Class 9').map((batch) => (
                                    <motion.div
                                        key={batch.id}
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
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
                    )}

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
