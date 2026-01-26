
import { useState } from 'react';
import { apiRequest } from '../utils/api';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';


interface Batch {
    id: string;
    name: string;
    className: string;
    subject: string;
}

export default function CreateTest() {
    const navigate = useNavigate();
    const [name, setName] = useState('');
    const [selectedBatchId, setSelectedBatchId] = useState('');
    const [batches, setBatches] = useState<Batch[]>([]);
    const [date, setDate] = useState('');
    const [maxMarks, setMaxMarks] = useState('');
    const [loading, setLoading] = useState(true);

    useState(() => {
        const fetchBatches = async () => {
            try {
                const data = await apiRequest('/batches');
                setBatches(data);
                if (data.length > 0) setSelectedBatchId(data[0].id);
            } catch (e) {
                console.error('Failed to load batches');
            } finally {
                setLoading(false);
            }
        };
        fetchBatches();
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const batch = batches.find(b => b.id === selectedBatchId);
        const subject = batch?.subject || 'General';
        const className = batch?.className;

        try {
            const res = await apiRequest('/tests', 'POST', { name, subject, date, maxMarks, className });
            alert('Test Created Successfully!');
            navigate(`/tests/${res.id}`);
        } catch (e) {
            alert('Failed to create test');
        }
    };

    return (
        <Layout title="Create Test">
            <div className="max-w-2xl mx-auto">
                <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-2">Test Name</label>
                                <input
                                    className="w-full border border-slate-300 p-3 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition"
                                    placeholder="e.g. Unit Test 1"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-2">Select Batch</label>
                                <select
                                    className="w-full border border-slate-300 p-3 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition bg-white"
                                    value={selectedBatchId}
                                    onChange={e => setSelectedBatchId(e.target.value)}
                                    required
                                >
                                    <option value="" disabled>Select a batch</option>
                                    {batches.map(batch => (
                                        <option key={batch.id} value={batch.id}>
                                            {batch.name} {batch.className ? `(${batch.className})` : ''} - {batch.subject || 'Maths'}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-2">Date</label>
                                <input
                                    type="date"
                                    className="w-full border border-slate-300 p-3 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition"
                                    value={date}
                                    onChange={e => setDate(e.target.value)}
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-2">Max Marks</label>
                                <input
                                    type="number"
                                    className="w-full border border-slate-300 p-3 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition"
                                    placeholder="e.g. 50"
                                    value={maxMarks}
                                    onChange={e => setMaxMarks(e.target.value)}
                                    required
                                />
                            </div>
                        </div>

                        <div className="pt-4">
                            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-md transition-all active:scale-95 flex items-center justify-center">
                                <span className="mr-2">🚀</span> Create & Start Scanning
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </Layout>
    );
}
