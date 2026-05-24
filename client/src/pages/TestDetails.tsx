
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiRequest, API_URL } from '../utils/api';
import Layout from '../components/Layout';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Users, ScanLine, ArrowLeft, Trash2, Pencil, X, AlertTriangle, Download, Plus, Save, Mail, Send, Search, User } from 'lucide-react';
import toast from 'react-hot-toast';
import Dropdown from '../components/Dropdown';

interface StudentSummary {
    id: string;
    name: string;
    batchName?: string | null;
    humanId?: string | null;
    parentWhatsapp?: string | null;
}

interface TestMark {
    id: string;
    score: number;
    studentId: string;
    student?: {
        name?: string;
    };
}

interface TestDetailsResponse {
    id: string;
    name: string;
    subject: string;
    className?: string | null;
    batch?: { name: string, className?: string | null } | null;
    batches?: { id: string, name: string, className?: string | null }[] | null;
    date: string;
    maxMarks: number;
    marks: TestMark[];
}

interface MessageResponse {
    message?: string;
}

const getErrorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

export default function TestDetails() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [test, setTest] = useState<TestDetailsResponse | null>(null);
    const [loading, setLoading] = useState(true);

    // Edit State
    const [showEdit, setShowEdit] = useState(false);
    const [editName, setEditName] = useState('');
    const [editMaxMarks, setEditMaxMarks] = useState('');
    const [editDate, setEditDate] = useState('');

    // Delete State
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    // Edit Mark State
    const [editingMarkId, setEditingMarkId] = useState<string | null>(null);
    const [editScore, setEditScore] = useState('');

    // Add Result State
    const [showAddResult, setShowAddResult] = useState(false);
    const [eligibleStudents, setEligibleStudents] = useState<StudentSummary[]>([]);
    const [selectedStudentId, setSelectedStudentId] = useState('');
    const [studentSearch, setStudentSearch] = useState('');
    const [newScore, setNewScore] = useState('');
    const [loadingStudents, setLoadingStudents] = useState(false);
    const [sendingResults, setSendingResults] = useState(false);
    const [showEmailConfirm, setShowEmailConfirm] = useState(false);

    useEffect(() => {
        if (!id) {
            setLoading(false);
            return;
        }

        const loadTest = async () => {
            try {
                const data = await apiRequest<TestDetailsResponse>(`/tests/${id}`);
                setTest(data);
            } catch (error) {
                console.error(error);
                toast.error('Failed to load test details');
            } finally {
                setLoading(false);
            }
        };

        void loadTest();
    }, [id]);

    const refreshTest = async () => {
        if (!id) return;

        try {
            const data = await apiRequest<TestDetailsResponse>(`/tests/${id}`);
            setTest(data);
        } catch (error) {
            console.error(error);
            toast.error('Failed to load test details');
        } finally {
            setLoading(false);
        }
    };

    const handleOpenEdit = () => {
        if (!test) return;
        setEditName(test.name);
        setEditMaxMarks(test.maxMarks.toString());
        setEditDate(new Date(test.date).toISOString().split('T')[0]);
        setShowEdit(true);
    };

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await apiRequest(`/tests/${id}`, 'PUT', {
                name: editName,
                maxMarks: parseFloat(editMaxMarks as string),
                date: editDate
            });
            toast.success('Test updated successfully');
            setShowEdit(false);
            refreshTest();
        } catch {
            toast.error('Failed to update test');
        }
    };

    const handleDeleteClick = () => {
        setShowDeleteConfirm(true);
    };

    const confirmDelete = async () => {
        try {
            await apiRequest(`/tests/${id}`, 'DELETE');
            toast.success('Test deleted successfully');
            navigate('/tests');
        } catch (error: unknown) {
            // Show the actual backend error message
            const errorMsg = getErrorMessage(error, 'Failed to delete test');
            toast.error(errorMsg);
            console.error('Delete test error:', error);
        }
    };

    const handleDownloadReport = () => {
        const token = localStorage.getItem('token');
        const toastId = toast.loading('Generating report...');
        fetch(`${API_URL}/tests/${id}/download`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })
            .then(res => {
                if (!res.ok) throw new Error("Download failed");
                return res.blob();
            })
            .then(blob => {
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${test?.name || 'Test'}_Report.pdf`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                toast.success('Report downloaded', { id: toastId });
            })
            .catch(() => toast.error("Failed to download report", { id: toastId }));
    };

    const handleSendResults = () => {
        setShowEmailConfirm(true);
    };

    const executeSendEmails = async () => {
        const toastId = toast.loading('Sending emails...');
        setSendingResults(true);
        try {
            const res = await apiRequest<MessageResponse>(`/tests/${id}/send-results`, 'POST');
            if (res.message) {
                toast.success(res.message, { id: toastId });
            } else {
                toast.success('Emails queued successfully', { id: toastId });
            }
            setShowEmailConfirm(false);
        } catch (error: unknown) {
            toast.error(getErrorMessage(error, 'Failed to send emails'), { id: toastId });
        } finally {
            setSendingResults(false);
        }
    };

    // --- Mark Editing Logic ---
    const handleEditClick = (mark: TestMark) => {
        setEditingMarkId(mark.id);
        setEditScore(mark.score.toString());
    };

    const handleCancelEdit = () => {
        setEditingMarkId(null);
        setEditScore('');
    };

    const handleSaveMark = async (studentId: string) => {
        try {
            await apiRequest('/marks', 'POST', {
                testId: id,
                studentId,
                score: editScore
            });
            toast.success('Mark updated');
            setEditingMarkId(null);
            refreshTest();
        } catch (error: unknown) {
            toast.error(getErrorMessage(error, 'Failed to update mark'));
        }
    };

    // --- Add Result Logic ---
    const handleOpenAddResult = async () => {
        setShowAddResult(true);
        setLoadingStudents(true);
        try {
            const students = await apiRequest<StudentSummary[]>(`/tests/${id}/eligible-students`);
            setEligibleStudents(students);
        } catch {
            toast.error('Failed to load students');
        } finally {
            setLoadingStudents(false);
        }
    };

    const handleSubmitNewResult = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedStudentId) {
            toast.error('Please select a student');
            return;
        }

        try {
            await apiRequest('/marks', 'POST', {
                testId: id,
                studentId: selectedStudentId,
                score: newScore
            });
            toast.success('Result added successfully');
            setShowAddResult(false);
            setSelectedStudentId('');
            setNewScore('');
            refreshTest();
        } catch (error: unknown) {
            toast.error(getErrorMessage(error, 'Failed to add result'));
        }
    };

    if (loading) {
        return (
            <Layout title="Loading..." hideMobileNav>
                <div className="flex items-center justify-center min-h-[50vh]">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-app-text"></div>
                </div>
            </Layout>
        );
    }

    if (!test) return <Layout title="Error" hideMobileNav>Test not found</Layout>;

    const filteredEligibleStudents = studentSearch.trim()
        ? eligibleStudents.filter(s =>
            s.name.toLowerCase().includes(studentSearch.toLowerCase()) ||
            (s.humanId && s.humanId.toLowerCase().includes(studentSearch.toLowerCase())) ||
            (s.parentWhatsapp && s.parentWhatsapp.includes(studentSearch.trim()))
        ).slice(0, 5)
        : [];

    const averageScore = test.marks.length > 0
        ? (test.marks.reduce((total, mark) => total + mark.score, 0) / test.marks.length).toFixed(1)
        : '-';

    const highestScore = test.marks.length > 0
        ? Math.max(...test.marks.map((mark) => mark.score))
        : '-';

    return (
        <Layout title="Test Dashboard" hideMobileNav>
            <div className="space-y-8 max-w-5xl mx-auto">
                <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
                    <div className="flex items-start gap-4">
                        <button onClick={() => navigate(-1)} className="p-2 hover:bg-black/5 rounded-full transition-colors shrink-0 mt-1">
                            <ArrowLeft className="w-5 h-5 text-app-text-secondary" />
                        </button>
                        <div className="min-w-0">
                            <h1 className="text-2xl md:text-3xl font-bold text-app-text break-words mb-2">{test.name}</h1>
                            <div className="flex flex-wrap items-center gap-2 text-app-text-secondary">
                                <span className="bg-neutral-100 text-app-text border border-neutral-200 px-2.5 py-0.5 rounded-lg text-xs font-bold uppercase tracking-wider whitespace-nowrap">{test.subject}</span>
                                {test.className && !test.batch && (!test.batches || test.batches.length === 0) && <span className="bg-neutral-100 text-app-text border border-neutral-200 px-2.5 py-0.5 rounded-lg text-xs font-bold uppercase tracking-wider whitespace-nowrap">{test.className}</span>}
                                {test.batch && (!test.batches || test.batches.length === 0) && <span className="bg-neutral-100 text-app-text border border-neutral-200 px-2.5 py-0.5 rounded-lg text-xs font-bold uppercase tracking-wider whitespace-nowrap">{test.batch.name}</span>}
                                {test.batches && test.batches.length > 0 && test.batches.map(b => (
                                    <span key={b.id} className="bg-neutral-100 text-app-text border border-neutral-200 px-2.5 py-0.5 rounded-lg text-xs font-bold uppercase tracking-wider whitespace-nowrap">{b.name}</span>
                                ))}
                                <span className="hidden md:inline">•</span>
                                <span className="text-sm whitespace-nowrap">{new Date(test.date).toLocaleDateString()}</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex gap-2 self-end md:self-auto shrink-0">
                        <button
                            onClick={handleDownloadReport}
                            className="p-2 text-app-text hover:bg-black/5 rounded-lg transition-colors border-[1.5px] border-black/5 bg-white shadow-sm"
                            title="Download Report"
                        >
                            <Download className="w-4 h-4" />
                        </button>
                        <button
                            onClick={handleSendResults}
                            disabled={sendingResults}
                            className="p-2 text-app-text hover:bg-black/5 rounded-lg transition-colors border-[1.5px] border-black/5 bg-white shadow-sm disabled:opacity-50"
                            title="Send Results via Email"
                        >
                            <Mail className="w-4 h-4" />
                        </button>
                        <button
                            onClick={handleOpenEdit}
                            className="p-2 text-app-text hover:bg-black/5 rounded-lg transition-colors border-[1.5px] border-black/5 bg-white shadow-sm"
                            title="Edit Test"
                        >
                            <Pencil className="w-4 h-4" />
                        </button>
                        <button
                            onClick={handleDeleteClick}
                            className="p-2 text-danger hover:bg-red-50 rounded-lg transition-colors border border-red-100 bg-white shadow-sm"
                            title="Delete Test"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-neutral-100 text-app-text rounded-xl"><Users className="w-4 h-4" /></div>
                            <span className="text-xs font-bold uppercase text-slate-400 tracking-wider">Students</span>
                        </div>
                        <div className="text-2xl font-bold text-slate-800">{test.marks.length}</div>
                    </div>
                    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-neutral-100 text-app-text rounded-xl"><Trophy className="w-4 h-4" /></div>
                            <span className="text-xs font-bold uppercase text-slate-400 tracking-wider">Avg. Score</span>
                        </div>
                        <div className="text-2xl font-bold text-slate-800">{averageScore} <span className="text-sm text-slate-400 font-medium">/ {test.maxMarks}</span></div>
                    </div>
                    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-neutral-100 text-app-text rounded-xl"><Trophy className="w-4 h-4" /></div>
                            <span className="text-xs font-bold uppercase text-slate-400 tracking-wider">Highest</span>
                        </div>
                        <div className="text-2xl font-bold text-slate-800">{highestScore}</div>
                    </div>
                    <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-center items-start">
                        <button
                            onClick={() => navigate(`/scan?testId=${test.id}`)}
                            className="w-full bg-neutral-900 text-white px-4 py-3 rounded-xl font-bold flex items-center justify-center shadow-lg active:scale-95 transition-all hover:bg-neutral-800"
                        >
                            <ScanLine className="w-4 h-4 mr-2" /> Scan Sheets
                        </button>
                    </div>
                </div>

                {/* Results List */}
                <div className="bg-white rounded-[24px] border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                        <h3 className="font-bold text-lg text-slate-800">Student Results</h3>
                        <div className="flex items-center gap-3">
                            <span className="text-xs font-bold uppercase text-slate-400 tracking-wider">{test.marks.length} Records</span>
                            <button
                                onClick={handleOpenAddResult}
                                className="p-2 text-app-text hover:bg-black/5 rounded-lg transition-colors border-[1.5px] border-black/5 bg-neutral-50 hover:bg-neutral-100 flex items-center gap-2 text-sm font-bold"
                            >
                                <Plus className="w-4 h-4" /> Add Manual
                            </button>
                        </div>
                    </div>

                    {test.marks.length === 0 ? (
                        <div className="p-10 text-center text-slate-400">
                            No marks recorded yet. Start scanning to add results.
                        </div>
                    ) : (
                        <table className="w-full text-left">
                            <thead className="bg-slate-50 border-b border-slate-100">
                                <tr>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Student</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Score</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Percentage</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {test.marks.map((mark) => (
                                    <tr key={mark.id} className="hover:bg-slate-50/50 transition-colors group">
                                        <td className="px-6 py-4 font-medium text-slate-800">{mark.student?.name || 'Unknown Student'}</td>
                                        <td className="px-6 py-4 font-bold text-slate-800">
                                            {editingMarkId === mark.id ? (
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="number"
                                                        value={editScore}
                                                        onChange={(e) => setEditScore(e.target.value)}
                                                        className="w-20 p-1 border border-blue-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                        autoFocus
                                                    />
                                                    <button onClick={() => handleSaveMark(mark.studentId)} className="p-1 text-black hover:bg-slate-100 rounded">
                                                        <Save className="w-4 h-4" />
                                                    </button>
                                                    <button onClick={handleCancelEdit} className="p-1 text-red-600 hover:bg-red-50 rounded">
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-2">
                                                    {mark.score}
                                                    <button
                                                        onClick={() => handleEditClick(mark)}
                                                        className="md:opacity-0 md:group-hover:opacity-100 p-1 text-slate-400 hover:text-slate-600 transition-all"
                                                        title="Edit mark"
                                                    >
                                                        <Pencil className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right font-mono text-slate-600">
                                            {((mark.score / test.maxMarks) * 100).toFixed(1)}%
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* Edit Modal */}
            <AnimatePresence>
                {showEdit && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pt-[calc(5.5rem+env(safe-area-inset-top))]">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                            onClick={() => setShowEdit(false)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            className="bg-white rounded-2xl shadow-xl w-full max-w-md relative z-10 overflow-hidden"
                        >
                            <div className="px-6 py-4 border-b border-black/5 flex justify-between items-center bg-gray-50/50">
                                <h3 className="font-bold text-lg text-gray-800">Edit Test</h3>
                                <button onClick={() => setShowEdit(false)} className="p-1 hover:bg-gray-100 rounded-full transition-colors">
                                    <X className="w-5 h-5 text-gray-500" />
                                </button>
                            </div>

                            <form onSubmit={handleUpdate} className="p-6 space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Test Name</label>
                                    <input
                                        type="text"
                                        value={editName}
                                        onChange={(e) => setEditName(e.target.value)}
                                        className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-medium"
                                        required
                                    />
                                </div>
                                {/* Form fields ... */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Max Marks</label>
                                        <input
                                            type="number"
                                            inputMode="numeric"
                                            value={editMaxMarks}
                                            onChange={(e) => setEditMaxMarks(e.target.value)}
                                            className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-medium"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Date</label>
                                        <input
                                            type="date"
                                            value={editDate}
                                            onChange={(e) => setEditDate(e.target.value)}
                                            className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-medium"
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="pt-2 flex gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setShowEdit(false)}
                                        className="flex-1 py-3 rounded-xl font-bold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="flex-1 py-3 rounded-xl font-bold bg-gray-900 text-white hover:bg-black shadow-lg shadow-gray-200 transition-all active:scale-[0.98]"
                                    >
                                        Save Changes
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Delete Confirmation Modal */}
            <AnimatePresence>
                {showDeleteConfirm && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pt-[calc(5.5rem+env(safe-area-inset-top))]">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                            onClick={() => setShowDeleteConfirm(false)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white rounded-[24px] shadow-2xl w-full max-w-sm relative z-10 overflow-hidden text-center p-8"
                        >
                            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                                <AlertTriangle className="w-8 h-8" />
                            </div>

                            <h3 className="text-xl font-bold text-app-text mb-2">Delete Test?</h3>
                            <p className="text-app-text-secondary mb-8">
                                Are you sure you want to delete this test? All marks will be lost.
                            </p>

                            <div className="flex flex-col gap-3">
                                <button
                                    onClick={confirmDelete}
                                    className="w-full py-3.5 rounded-xl font-bold bg-red-500/10 text-red-600 border border-red-200/50 backdrop-blur-md hover:bg-red-500/20 transition-all active:scale-[0.98]"
                                >
                                    Delete
                                </button>
                                <button
                                    onClick={() => setShowDeleteConfirm(false)}
                                    className="w-full py-3.5 rounded-xl font-bold bg-transparent text-app-text-secondary hover:bg-black/5 transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )
                }
            </AnimatePresence>

            {/* Add Result Modal */}
            <AnimatePresence>
                {showAddResult && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pt-[calc(5.5rem+env(safe-area-inset-top))]">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                            onClick={() => setShowAddResult(false)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 10 }}
                            className="bg-white rounded-2xl shadow-xl w-full max-w-md relative z-10 overflow-visible"
                        >
                            <div className="px-6 py-4 border-b border-black/5 flex justify-between items-center bg-gray-50/50 rounded-t-2xl">
                                <h3 className="font-bold text-lg text-gray-800">Add Manual Result</h3>
                                <button onClick={() => setShowAddResult(false)} className="p-1 hover:bg-gray-100 rounded-full transition-colors">
                                    <X className="w-5 h-5 text-gray-500" />
                                </button>
                            </div>

                            <form onSubmit={handleSubmitNewResult} className="p-6 space-y-4">
                                <div className="space-y-2 relative">
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 ml-1">Select Student</label>
                                    {loadingStudents ? (
                                        <div className="text-sm text-gray-400 ml-1">Loading students...</div>
                                    ) : eligibleStudents.length === 0 ? (
                                        <div className="text-sm text-orange-500 bg-orange-50 p-3 rounded-lg border border-orange-100">
                                            No eligible students found. All students in this batch might already have marks.
                                        </div>
                                    ) : !selectedStudentId ? (
                                        <div className="relative">
                                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                                            <input
                                                type="text"
                                                placeholder="Search by name, ID, or phone..."
                                                className="w-full bg-gray-50 border border-gray-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 rounded-xl pl-12 pr-4 py-3.5 outline-none transition-all font-medium"
                                                value={studentSearch}
                                                onChange={(e) => setStudentSearch(e.target.value)}
                                            />
                                            {/* Dropdown Results */}
                                            {studentSearch && filteredEligibleStudents.length > 0 && (
                                                <div className="absolute top-full mt-2 left-0 right-0 bg-white rounded-xl shadow-xl border border-gray-100 overflow-y-auto max-h-56 z-50">
                                                    {filteredEligibleStudents.map(student => (
                                                        <button
                                                            key={student.id}
                                                            type="button"
                                                            onClick={() => {
                                                                setSelectedStudentId(student.id);
                                                                setStudentSearch('');
                                                            }}
                                                            className="w-full text-left px-4 py-3 hover:bg-blue-50 flex items-center gap-3 transition-colors border-b border-gray-50 last:border-none"
                                                        >
                                                            <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs shrink-0">
                                                                {student.humanId?.slice(-3) || 'STU'}
                                                            </div>
                                                            <div>
                                                                <div className="font-bold text-gray-900">{student.name}</div>
                                                                <div className="text-xs text-gray-500">{student.batchName ? student.batchName.split('(')[0].trim() : 'No Batch'}</div>
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
                                                    <div className="font-bold text-gray-900">{eligibleStudents.find(s => s.id === selectedStudentId)?.name}</div>
                                                    <div className="text-xs text-blue-600 font-medium">
                                                        {eligibleStudents.find(s => s.id === selectedStudentId)?.batchName?.split('(')[0].trim() || 'No Batch'}
                                                    </div>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setSelectedStudentId('')}
                                                className="p-2 hover:bg-white rounded-lg text-blue-400 hover:text-red-500 transition-colors"
                                            >
                                                <X className="w-5 h-5" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Score</label>
                                    <input
                                        type="number"
                                        inputMode="decimal"
                                        value={newScore}
                                        onChange={(e) => setNewScore(e.target.value)}
                                        className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all font-medium"
                                        required
                                        placeholder={`Max: ${test.maxMarks}`}
                                        min="0"
                                        max={test.maxMarks}
                                        step="0.5"
                                    />
                                </div>

                                <div className="pt-2 flex gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setShowAddResult(false)}
                                        className="flex-1 py-3 rounded-xl font-bold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={!selectedStudentId || !newScore}
                                        className="flex-1 py-3 rounded-xl font-bold bg-gray-900 text-white hover:bg-black shadow-lg shadow-gray-200 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        Add Result
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Email Confirmation Modal */}
            <AnimatePresence>
                {showEmailConfirm && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pt-[calc(5.5rem+env(safe-area-inset-top))]">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                            onClick={() => !sendingResults && setShowEmailConfirm(false)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white rounded-[24px] shadow-2xl w-full max-w-sm relative z-10 overflow-hidden text-center p-8"
                        >
                            <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
                                <Send className="w-8 h-8 ml-1" />
                            </div>

                            <h3 className="text-xl font-bold text-app-text mb-2">Send Results?</h3>
                            <p className="text-app-text-secondary mb-8">
                                This will send Email and WhatsApp reports to all parents of students in this batch.
                            </p>

                            <div className="flex flex-col gap-3">
                                <button
                                    onClick={executeSendEmails}
                                    disabled={sendingResults}
                                    className="w-full py-3.5 rounded-xl font-bold bg-blue-600 text-white shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {sendingResults ? (
                                        <>
                                            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                                            Sending...
                                        </>
                                    ) : (
                                        'Yes, Send Reports'
                                    )}
                                </button>
                                <button
                                    onClick={() => setShowEmailConfirm(false)}
                                    disabled={sendingResults}
                                    className="w-full py-3.5 rounded-xl font-bold bg-transparent text-app-text-secondary hover:bg-black/5 transition-colors disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

        </Layout >
    )
}
