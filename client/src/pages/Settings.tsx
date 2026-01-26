import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { api } from '../utils/api';
import { Calendar, Plus, Download, RefreshCcw, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Settings() {
    const [years, setYears] = useState<any[]>([]);
    const [currentYearId, setCurrentYearId] = useState<string | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [newYearName, setNewYearName] = useState('');

    const fetchYears = async () => {
        try {
            console.log('Fetching academic years...');
            const data = await api.get('/academic-years');
            console.log('Received academic years:', data);
            setYears(data.years);
            setCurrentYearId(data.currentAcademicYearId);
        } catch (e) {
            console.error('Fetch error:', e);
            toast.error('Failed to load academic years');
        }
    };

    useEffect(() => {
        fetchYears();
    }, []);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post('/academic-years', { name: newYearName });
            toast.success('Academic Year created');
            setNewYearName('');
            setIsCreating(false);
            fetchYears();
        } catch (e) {
            toast.error('Failed to create academic year');
        }
    };



    const handleBackup = async (id: string, name: string) => {
        try {
            // Trigger download
            const token = localStorage.getItem('token');
            const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/academic-years/${id}/backup`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Download failed');

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `backup-${name}.json`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            toast.success('Backup downloaded');
        } catch (e) {
            toast.error('Failed to download backup');
        }
    };

    const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; id: string | null; name: string } | null>({ isOpen: false, id: null, name: '' });
    const [switchModal, setSwitchModal] = useState<{ isOpen: boolean; id: string | null; name: string } | null>({ isOpen: false, id: null, name: '' });
    const [deletePassword, setDeletePassword] = useState('');

    const handleDeleteClick = (id: string, name: string) => {
        setDeleteModal({ isOpen: true, id, name });
        setDeletePassword('');
    };

    const handleSwitchClick = (id: string, name: string) => {
        setSwitchModal({ isOpen: true, id, name });
    };

    const confirmSwitch = async () => {
        if (!switchModal?.id) return;
        try {
            const res = await api.post('/academic-years/switch', { id: switchModal.id });
            setCurrentYearId(res.currentAcademicYearId);
            toast.success(`Switched to ${res.name}`);
            setSwitchModal({ isOpen: false, id: null, name: '' });
            // Force reload to clear client cache/state
            window.location.href = '/dashboard';
        } catch (e) {
            toast.error('Failed to switch academic year');
        }
    };

    const confirmDelete = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!deleteModal?.id) return;

        const toastId = toast.loading('Deleting academic year...');

        try {
            console.log('Attempting to delete year:', deleteModal.id, 'with password provided');
            await api.delete(`/academic-years/${deleteModal.id}`, { password: deletePassword });
            toast.success('Academic Year deleted successfully', { id: toastId });
            setDeleteModal({ isOpen: false, id: null, name: '' });
            setDeletePassword('');
            fetchYears();
        } catch (e: any) {
            console.error('Delete error:', e);
            const errorMessage = e.message || e.response?.data?.error || 'Failed to delete. Please check your password.';
            toast.error(errorMessage, { id: toastId });
        }
    };

    return (
        <Layout title="Settings">
            <div className="max-w-4xl mx-auto">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h2 className="text-xl font-bold text-app-text">Academic Years</h2>
                        <p className="text-app-text-secondary text-sm mt-1">Manage academic sessions and switch between them.</p>
                    </div>
                    <button
                        onClick={() => setIsCreating(true)}
                        className="flex items-center space-x-2 bg-app-text text-app-bg px-4 py-2.5 rounded-xl font-medium hover:opacity-90 transition-opacity"
                    >
                        <Plus size={18} />
                        <span>New Year</span>
                    </button>
                </div>

                {isCreating && (
                    <div className="mb-8 p-6 bg-app-surface-opaque border border-app-border rounded-[24px] animate-fadeIn">
                        <h3 className="text-lg font-bold mb-4">Create New Academic Year</h3>
                        <form onSubmit={handleCreate} className="flex gap-4 items-end">
                            <div className="flex-1">
                                <label className="block text-xs font-semibold uppercase text-app-text-tertiary mb-2">Year Name (e.g. 2025-26)</label>
                                <input
                                    type="text"
                                    value={newYearName}
                                    onChange={e => setNewYearName(e.target.value)}
                                    className="w-full bg-app-bg border border-app-border rounded-xl px-4 py-3 outline-none focus:border-app-text transition-colors"
                                    placeholder="2025-2026"
                                    required
                                />
                            </div>
                            <button type="submit" className="bg-black text-white px-6 py-3 rounded-xl font-bold hover:bg-gray-800 transition-colors">
                                Create
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsCreating(false)}
                                className="bg-gray-200 dark:bg-gray-800 text-app-text px-6 py-3 rounded-xl font-bold hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
                            >
                                Cancel
                            </button>
                        </form>
                    </div>
                )}

                {/* Debug Info */}
                {/* <pre className="hidden">{JSON.stringify(years, null, 2)}</pre> */}

                {years.length === 0 && !isCreating && (
                    <div className="col-span-full py-12 text-center text-app-text-tertiary">
                        <p>No academic years found. Create one to get started.</p>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {years.map(year => (
                        <div
                            key={year.id}
                            className={`relative p-6 rounded-[24px] border transition-all duration-300 flex flex-col justify-between ${year.id === currentYearId
                                ? 'bg-white border-black shadow-sm ring-1 ring-black'
                                : 'bg-app-surface-opaque border-app-border hover:border-gray-400 dark:hover:border-gray-600'
                                }`}
                        >
                            {/* Active Card Layout matches screenshot exactly */}
                            {year.id === currentYearId ? (
                                <>
                                    <div className="flex items-start justify-between mb-8">
                                        <Calendar className="w-8 h-8 text-black dark:text-white" strokeWidth={1.5} />
                                        <span className="bg-black dark:bg-white text-white dark:text-black text-[10px] font-bold px-3 py-1.5 rounded-full uppercase tracking-widest">
                                            Active
                                        </span>
                                    </div>

                                    <div className="mb-10">
                                        <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2 tracking-tight">{year.name}</h3>
                                        <p className="text-base text-gray-500 font-medium">
                                            {new Date(year.createdAt).toLocaleDateString()}
                                        </p>
                                    </div>

                                    <button
                                        onClick={() => handleBackup(year.id, year.name)}
                                        className="w-full flex items-center justify-center gap-3 bg-transparent border border-gray-800 dark:border-gray-200 py-3 rounded-2xl text-base font-semibold text-gray-900 dark:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-all active:scale-[0.98]"
                                    >
                                        <Download size={20} />
                                        <span>Backup</span>
                                    </button>
                                </>
                            ) : (
                                /* Inactive Card Layout (Standard) */
                                <>
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="p-3 bg-app-bg rounded-2xl">
                                            <Calendar className="w-6 h-6 text-app-text-secondary" />
                                        </div>
                                        <button
                                            onClick={() => handleDeleteClick(year.id, year.name)}
                                            className="p-2 text-app-text-tertiary hover:text-red-500 hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-colors"
                                            title="Delete Year"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>

                                    <h3 className="text-xl font-bold text-app-text mb-2">{year.name}</h3>
                                    <p className="text-sm text-app-text-tertiary mb-6">
                                        {new Date(year.createdAt).toLocaleDateString()}
                                    </p>

                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleSwitchClick(year.id, year.name)}
                                            className="flex-1 flex items-center justify-center gap-2 bg-app-bg border border-app-border py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
                                        >
                                            <RefreshCcw size={16} />
                                            <span>Switch</span>
                                        </button>
                                        <button
                                            onClick={() => handleBackup(year.id, year.name)}
                                            className="flex-1 flex items-center justify-center gap-2 bg-app-bg border border-app-border py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
                                            title="Download Backup"
                                        >
                                            <Download size={16} />
                                            <span>Backup</span>
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    ))}
                </div>

                {/* Delete Confirmation Modal */}
                {deleteModal?.isOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fadeIn">
                        <div className="bg-white dark:bg-gray-900 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-gray-100 dark:border-gray-800 transform transition-all scale-100">
                            <div className="p-8">
                                <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-2xl flex items-center justify-center mb-6 text-red-600 dark:text-red-400">
                                    <Trash2 size={24} />
                                </div>

                                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Delete Academic Year?</h3>
                                <p className="text-gray-500 dark:text-gray-400 mb-6 leading-relaxed">
                                    Are you sure you want to delete <span className="font-bold text-gray-900 dark:text-white">"{deleteModal.name}"</span>?
                                    This will unlink all students, batches, and data associated with it. This action cannot be undone.
                                </p>

                                <form onSubmit={confirmDelete}>
                                    <div className="mb-6">
                                        <label className="block text-xs font-bold uppercase text-gray-500 mb-2">Confirm Password</label>
                                        <input
                                            type="password"
                                            value={deletePassword}
                                            onChange={(e) => setDeletePassword(e.target.value)}
                                            className="w-full bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 outline-none focus:border-red-500 transition-colors font-medium text-gray-900 dark:text-white placeholder-gray-400"
                                            placeholder="Enter your password"
                                            autoFocus
                                            required
                                        />
                                    </div>

                                    <div className="flex gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setDeleteModal({ isOpen: false, id: null, name: '' })}
                                            className="flex-1 py-3.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            className="flex-1 py-3.5 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors shadow-lg shadow-red-500/30"
                                        >
                                            Delete Year
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                )}

                {/* Switch Confirmation Modal */}
                {switchModal?.isOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fadeIn">
                        <div className="bg-white dark:bg-gray-900 w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden border border-gray-100 dark:border-gray-800 transform transition-all scale-100">
                            <div className="p-8">
                                <div className="w-12 h-12 bg-app-bg rounded-2xl flex items-center justify-center mb-6 text-app-text">
                                    <RefreshCcw size={24} />
                                </div>

                                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Switch to {switchModal.name}?</h3>
                                <p className="text-gray-500 dark:text-gray-400 mb-8 leading-relaxed text-sm">
                                    The dashboard will update to show data for the selected academic year.
                                </p>

                                <div className="flex gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setSwitchModal({ isOpen: false, id: null, name: '' })}
                                        className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={confirmSwitch}
                                        className="flex-1 py-3 bg-black dark:bg-white text-white dark:text-black font-bold rounded-xl hover:opacity-90 transition-opacity"
                                    >
                                        Confirm
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </Layout>
    );
}
