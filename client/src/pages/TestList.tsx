
import { useState, useEffect } from 'react';
import { apiRequest } from '../utils/api';
import Layout from '../components/Layout';
import { useNavigate } from 'react-router-dom';
import { Plus, Calendar, FileText, CheckCircle, X, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Dropdown from '../components/Dropdown';

interface Test {
    id: string;
    name: string;
    subject: string;
    date: string;
    maxMarks: number;
    className?: string;
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
    const [selectedBatchId, setSelectedBatchId] = useState('');
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
        const batch = batches.find(b => b.id === selectedBatchId);
        const subject = batch?.subject || 'General';
        const className = batch?.className;

        try {
            const res = await apiRequest<CreateTestResponse>('/tests', 'POST', {
                name,
                subject,
                date,
                maxMarks: parseFloat(maxMarks), // Convert to number
                className
            });
            // Navigate to Dashboard immediately
            navigate(`/tests/${res.id}`);
        } catch {
            alert('Failed to create test');
        }
    };

    const class10Tests = tests.filter(t => t.className === 'Class 10');
    const class9Tests = tests.filter(t => t.className === 'Class 9');
    const otherTests = tests.filter(t => t.className !== 'Class 10' && t.className !== 'Class 9');

    const TestCard = ({ test }: { test: Test }) => (
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

            <h3 className="text-xl font-bold text-app-text mb-1 truncate">{test.name}</h3>
            <p className="text-app-text-secondary text-sm font-medium mb-4">{test.className ? `${test.className} • ` : ''}{test.subject}</p>

            <div className="mt-4 pt-4 border-t border-black/5 flex items-center text-xs font-bold text-app-text-tertiary tracking-wide uppercase">
                <Calendar className="w-4 h-4 mr-2" />
                {new Date(test.date).toLocaleDateString()}
            </div>
        </div>
    );

    return (
        <Layout title="Manage Tests">
            <div className="mb-8 flex justify-between items-center">
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
                                    <Dropdown
                                        label="Batch"
                                        value={selectedBatchId}
                                        onChange={setSelectedBatchId}
                                        placeholder="Select a batch"
                                        required={true}
                                        options={batches.map(batch => ({
                                            value: batch.id,
                                            label: `${batch.name} ${batch.className ? `(${batch.className})` : ''} - ${batch.subject || 'Maths'}`
                                        }))}
                                    />
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
                    {/* Class 10 Section */}
                    {class10Tests.length > 0 && (
                        <section>
                            <h3 className="text-lg font-bold text-app-text mb-6">Class 10 Tests</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {class10Tests.map(test => <TestCard key={test.id} test={test} />)}
                            </div>
                        </section>
                    )}

                    {/* Class 9 Section */}
                    {class9Tests.length > 0 && (
                        <section>
                            <h3 className="text-lg font-bold text-app-text mb-6">Class 9 Tests</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {class9Tests.map(test => <TestCard key={test.id} test={test} />)}
                            </div>
                        </section>
                    )}

                    {/* Other Section */}
                    {otherTests.length > 0 && (
                        <section>
                            <h3 className="text-lg font-bold text-app-text mb-6">Other Tests</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {otherTests.map(test => <TestCard key={test.id} test={test} />)}
                            </div>
                        </section>
                    )}

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
