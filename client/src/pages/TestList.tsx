
import { useState, useEffect } from 'react';
import { API_URL, apiRequest } from '../utils/api';
import Layout from '../components/Layout';
import { useNavigate } from 'react-router-dom';
import { Plus, Calendar, FileText, CheckCircle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Test {
    id: string;
    name: string;
    subject: string;
    date: string;
    maxMarks: number;
    className?: string;
    batchId?: string;
    batch?: { id: string; name: string; className?: string };
    batches?: { id: string; name: string; className?: string }[];
    _count: { marks: number };
}

interface Batch {
    id: string;
    name: string;
    className: string;
    subject: string;
}



interface CreateTestResponse {
    id: string;
}

export default function TestList() {
    const [tests, setTests] = useState<Test[]>([]);
    const [batches, setBatches] = useState<Batch[]>([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    // Form State
    const [showForm, setShowForm] = useState(false);
    const [name, setName] = useState('');
    const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([]);
    const [date, setDate] = useState('');
    const [maxMarks, setMaxMarks] = useState('');

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [testsData, batchesData] = await Promise.all([
                    apiRequest<Test[]>('/tests'),
                    apiRequest<Batch[]>('/batches')
                ]);
                setTests(testsData);
                setBatches(batchesData);
            } catch (error) {
                console.error(error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (selectedBatchIds.length === 0) {
            alert('Please select at least one batch');
            return;
        }

        const batch = batches.find(b => b.id === selectedBatchIds[0]);
        const subject = batch?.subject || 'General';
        const className = batch?.className;

        try {
            const res = await apiRequest<CreateTestResponse>('/tests', 'POST', {
                name,
                subject,
                date,
                maxMarks: parseFloat(maxMarks), // Convert to number
                className,
                batchIds: selectedBatchIds
            });
            // Navigate to Dashboard immediately
            navigate(`/tests/${res.id}`);
        } catch {
            alert('Failed to create test');
        }
    };

    // Group tests by Month & Year to prevent visual duplication of multi-batch tests
    const groupedByMonth = tests.reduce((acc: Record<string, { label: string, tests: Test[] }>, test) => {
        const dateObj = new Date(test.date);
        // Create a sortable key like "2026-03" (YYYY-MM)
        const monthKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
        const label = dateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); // e.g. "April 2026"

        if (!acc[monthKey]) {
            acc[monthKey] = {
                label,
                tests: []
            };
        }
        acc[monthKey].tests.push(test);
        return acc;
    }, {});

    // Sort the month groups so newest months appear first
    const sortedGroups = Object.entries(groupedByMonth).sort(([keyA], [keyB]) => keyB.localeCompare(keyA));

    const TestCard = ({ test }: { test: Test }) => {
        const batchString = (test.batches && test.batches.length > 0) 
            ? test.batches.map(b => b.name).join(', ')
            : (test.batch?.name ? test.batch.name : (test.className || ''));
            
        return (
            <div
                onClick={() => navigate(`/tests/${test.id}`)}
                className="bg-app-surface border-[1.5px] border-black/5 rounded-[32px] p-6 hover:shadow-lg transition-all cursor-pointer group hover:border-app-text/20 relative overflow-hidden"
            >
                <div className="flex justify-between items-start mb-4">
                    <div className="p-3 bg-app-bg border border-app-border rounded-xl group-hover:bg-app-surface-hover transition-colors">
                        <FileText className="w-6 h-6 text-app-text" />
                    </div>
                    <div className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 text-xs font-bold border border-blue-100 flex items-center">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        {test._count.marks} Results
                    </div>
                </div>

                <h3 className="text-xl font-bold text-app-text mb-1 truncate" title={test.name}>{test.name}</h3>
                <p className="text-app-text-secondary text-sm font-medium mb-4 truncate" title={`${batchString} • ${test.subject}`}>
                    {batchString ? `${batchString} • ` : ''}{test.subject}
                </p>

                <div className="mt-4 pt-4 border-t border-black/5 flex items-center text-xs font-bold text-app-text-tertiary tracking-wide uppercase">
                    <Calendar className="w-4 h-4 mr-2" />
                    {new Date(test.date).toLocaleDateString()}
                </div>
            </div>
        );
    };

    return (
        <Layout title="Manage Tests">
            <div className="mb-8 flex justify-between items-center gap-3">
                <p className="text-app-text-secondary">View and manage your tests and results.</p>
                <button
                    onClick={() => setShowForm(!showForm)}
                    className="bg-black text-white hover:bg-neutral-800 border-[1.5px] border-black/5 px-6 py-3 rounded-2xl font-bold shadow-lg shadow-black/10 transition-all active:scale-95 flex items-center text-sm"
                >
                    {showForm ? <X className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                    {showForm ? 'Cancel' : 'Create New Test'}
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
                        <div className="bg-white border-[1.5px] border-black/5 p-6 md:p-8 rounded-[32px] shadow-sm">
                            <h3 className="font-semibold text-lg mb-8 text-app-text flex items-center">
                                <span className="w-8 h-8 rounded-full bg-accent-subtle flex items-center justify-center mr-3 text-accent text-sm font-bold">01</span>
                                Create New Test
                            </h3>
                            <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-semibold text-app-text-secondary uppercase tracking-wider mb-2">Test Name</label>
                                    <input
                                        className="w-full !bg-neutral-50 border-[1.5px] border-black/5 text-app-text p-4 rounded-xl focus:ring-2 focus:ring-accent/10 focus:border-accent outline-none transition-all placeholder:text-app-text-secondary/50"
                                        placeholder="e.g. Unit Test 1"
                                        value={name}
                                        onChange={e => setName(e.target.value)}
                                        required
                                    />
                                </div>

                                <div className="mt-[-8px]">
                                    <label className="block text-xs font-semibold text-app-text-secondary uppercase tracking-wider mb-2">Select Batches</label>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 bg-neutral-50 border-[1.5px] border-black/5 rounded-xl">
                                        {batches.map(batch => (
                                            <label key={batch.id} className="flex items-center space-x-3 p-3 bg-white border border-black/5 rounded-xl cursor-pointer hover:bg-neutral-50 transition-colors">
                                                <input 
                                                    type="checkbox" 
                                                    className="w-4 h-4 text-accent rounded border-gray-300 focus:ring-accent"
                                                    checked={selectedBatchIds.includes(batch.id)}
                                                    onChange={() => {
                                                        setSelectedBatchIds(prev => prev.includes(batch.id) ? prev.filter(id => id !== batch.id) : [...prev, batch.id])
                                                    }}
                                                />
                                                <span className="text-sm font-medium text-app-text">{batch.name} {batch.className ? `(${batch.className})` : ''} - {batch.subject || 'Maths'}</span>
                                            </label>
                                        ))}
                                    </div>
                                    {selectedBatchIds.length === 0 && <p className="text-xs text-red-500 mt-2">Please select at least one batch.</p>}
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-app-text-secondary uppercase tracking-wider mb-2">Date</label>
                                    <input
                                        type="date"
                                        className="w-full !bg-neutral-50 border-[1.5px] border-black/5 text-app-text p-4 rounded-xl focus:ring-2 focus:ring-accent/10 focus:border-accent outline-none transition-all placeholder:text-app-text-tertiary/50"
                                        value={date}
                                        onChange={e => setDate(e.target.value)}
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-app-text-secondary uppercase tracking-wider mb-2">Max Marks</label>
                                    <input
                                        type="number"
                                    inputMode="numeric"
                                        className="w-full !bg-neutral-50 border-[1.5px] border-black/5 text-app-text p-4 rounded-xl focus:ring-2 focus:ring-accent/10 focus:border-accent outline-none transition-all placeholder:text-app-text-tertiary/50"
                                        placeholder="e.g. 50"
                                        value={maxMarks}
                                        onChange={e => setMaxMarks(e.target.value)}
                                        required
                                    />
                                </div>

                                <div className="md:col-span-2 flex justify-end pt-4">
                                    <button type="submit" className="bg-neutral-900 hover:bg-black  text-white px-8 py-3.5 rounded-xl font-bold shadow-lg shadow-neutral-500/10 transition-all hover:scale-[1.02] active:scale-95 w-full md:w-auto">
                                        Create & Start
                                    </button>
                                </div>
                            </form>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {loading ? (
                <div className="text-center py-20 animate-pulse text-app-text-secondary">Loading tests...</div>
            ) : (
                <div className="space-y-12 pb-20">


                    {sortedGroups.map(([monthKey, group]) => (
                        <section key={monthKey}>
                            <h3 className="text-lg font-bold text-app-text mb-6 flex items-center">
                                <Calendar className="w-5 h-5 mr-2 text-app-text-tertiary" />
                                {group.label} Tests
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {group.tests.map(test => <TestCard key={test.id} test={test} />)}
                            </div>
                        </section>
                    ))}

                    {tests.length === 0 && (
                        <div className="col-span-full py-20 text-center border-2 border-dashed border-app-border rounded-[24px]">
                            <p className="text-app-text-secondary font-medium">No tests created yet.</p>
                            <button onClick={() => setShowForm(true)} className="mt-4 text-accent font-bold hover:underline">
                                Create your first test
                            </button>
                        </div>
                    )}
                </div>
            )}


        </Layout>
    );
}
