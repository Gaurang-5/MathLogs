import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, Loader, IndianRupee, User, Wallet } from 'lucide-react';
import { api } from '../utils/api';
import toast from 'react-hot-toast';

interface QuickFeeModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface Student {
    id: string;
    name: string;
    humanId: string | null;
    batchName: string;
    balance: number;
}

export default function QuickFeeModal({ isOpen, onClose }: QuickFeeModalProps) {
    const [students, setStudents] = useState<Student[]>([]);
    const [search, setSearch] = useState('');
    const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
    const [amount, setAmount] = useState('');
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            // Reset state
            setSearch('');
            setSelectedStudent(null);
            setAmount('');

            // Focus search
            setTimeout(() => inputRef.current?.focus(), 100);

            // Fetch students if empty
            if (students.length === 0) {
                setLoading(true);
                api.get('/fees').then(data => {
                    setStudents(data);
                    setLoading(false);
                }).catch(() => {
                    toast.error('Failed to load students');
                    setLoading(false);
                });
            }
        }
    }, [isOpen]);

    const filteredStudents = search.trim()
        ? students.filter(s =>
            s.name.toLowerCase().includes(search.toLowerCase()) ||
            (s.humanId && s.humanId.toLowerCase().includes(search.toLowerCase()))
        ).slice(0, 5)
        : [];

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedStudent || !amount) return;

        setSubmitting(true);
        try {
            await api.post('/fees/pay', {
                studentId: selectedStudent.id,
                amount: amount
            });
            toast.success(`Collected ₹${amount} from ${selectedStudent.name}`);

            // Dispatch event to update other components
            window.dispatchEvent(new Event('fee-updated'));

            onClose();
        } catch (error) {
            toast.error('Failed to log fee');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm"
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[70] w-full max-w-md p-4"
                    >
                        <div className="bg-white rounded-[24px] shadow-2xl overflow-hidden">
                            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900">Log Fee Payment</h2>
                                    <p className="text-sm text-gray-500">Quickly record a payment</p>
                                </div>
                                <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                                    <X className="w-5 h-5 text-gray-500" />
                                </button>
                            </div>

                            <form onSubmit={handleSubmit} className="p-6 space-y-6">
                                {/* Student Selection */}
                                <div className="space-y-2 relative">
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 ml-1">Select Student</label>

                                    {!selectedStudent ? (
                                        <div className="relative">
                                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                            <input
                                                ref={inputRef}
                                                type="text"
                                                placeholder="Search by name or ID..."
                                                className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-xl pl-12 pr-4 py-3.5 outline-none transition-all font-medium"
                                                value={search}
                                                onChange={(e) => setSearch(e.target.value)}
                                            />
                                            {loading && (
                                                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                                    <Loader className="w-4 h-4 animate-spin text-blue-500" />
                                                </div>
                                            )}

                                            {/* Dropdown Results */}
                                            {search && filteredStudents.length > 0 && (
                                                <div className="absolute top-full mt-2 left-0 right-0 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-10">
                                                    {filteredStudents.map(student => (
                                                        <button
                                                            key={student.id}
                                                            type="button"
                                                            onClick={() => {
                                                                setSelectedStudent(student);
                                                                setSearch('');
                                                            }}
                                                            className="w-full text-left px-4 py-3 hover:bg-blue-50 flex items-center gap-3 transition-colors border-b border-gray-50 last:border-none"
                                                        >
                                                            <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs shrink-0">
                                                                {student.humanId?.slice(-3) || 'STU'}
                                                            </div>
                                                            <div>
                                                                <div className="font-bold text-gray-900">{student.name}</div>
                                                                <div className="text-xs text-gray-500">{student.batchName} • Due: ₹{student.balance}</div>
                                                            </div>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex items-center justify-between group">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                                                    <User className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <div className="font-bold text-gray-900">{selectedStudent.name}</div>
                                                    <div className="text-xs text-blue-600 font-medium">
                                                        {selectedStudent.batchName} • Total Due: ₹{selectedStudent.balance}
                                                    </div>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setSelectedStudent(null)}
                                                className="p-2 hover:bg-white rounded-lg text-blue-400 hover:text-red-500 transition-colors"
                                            >
                                                <X className="w-5 h-5" />
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Amount Input */}
                                <div className="space-y-2">
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 ml-1">Amount to Collect</label>
                                    <div className="relative">
                                        <IndianRupee className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                        <input
                                            type="number"
                                            inputMode="numeric"
                                            placeholder="0.00"
                                            className="w-full bg-gray-50 border border-gray-200 focus:border-green-500 focus:ring-4 focus:ring-green-500/10 rounded-xl pl-12 pr-4 py-3.5 outline-none transition-all font-bold text-lg text-gray-900 placeholder:font-normal"
                                            value={amount}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setAmount(val);
                                                if (selectedStudent && parseFloat(val) > selectedStudent.balance) {
                                                    setError(`Max amount allowed is ₹${selectedStudent.balance}`);
                                                } else {
                                                    setError('');
                                                }
                                            }}
                                            min="1"
                                        />
                                    </div>
                                    {selectedStudent && (
                                        <div className="flex flex-col gap-2 mt-2">
                                            {error && <p className="text-xs text-red-500 font-bold ml-1">{error}</p>}
                                            <div className="flex gap-2">
                                                <button type="button" onClick={() => { setAmount(selectedStudent.balance.toString()); setError(''); }} className="text-xs bg-gray-100 px-2 py-1 rounded-lg hover:bg-gray-200 font-medium text-gray-600">Full Due</button>
                                                <button type="button" onClick={() => { setAmount("500"); setError(500 > selectedStudent.balance ? `Max amount allowed is ₹${selectedStudent.balance}` : ''); }} className="text-xs bg-gray-100 px-2 py-1 rounded-lg hover:bg-gray-200 font-medium text-gray-600">₹500</button>
                                                <button type="button" onClick={() => { setAmount("1000"); setError(1000 > selectedStudent.balance ? `Max amount allowed is ₹${selectedStudent.balance}` : ''); }} className="text-xs bg-gray-100 px-2 py-1 rounded-lg hover:bg-gray-200 font-medium text-gray-600">₹1000</button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Submit */}
                                <button
                                    type="submit"
                                    disabled={!selectedStudent || !amount || submitting || !!error}
                                    className="w-full bg-gray-900 text-white font-bold py-4 rounded-xl hover:bg-black disabled:bg-gray-900 disabled:text-white/50 disabled:cursor-not-allowed disabled:shadow-none shadow-xl shadow-gray-200 transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                                >
                                    {submitting ? (
                                        <>
                                            <Loader className="w-5 h-5 animate-spin" /> Processing...
                                        </>
                                    ) : (
                                        <>
                                            <Wallet className="w-5 h-5" /> Log Payment
                                        </>
                                    )}
                                </button>
                            </form>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
