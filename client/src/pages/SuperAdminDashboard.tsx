
import { useState, useEffect } from 'react';
import axios from 'axios';
import {
    Building2,
    Users,
    Plus,
    Copy,
    Check,
    Loader2,
    ShieldCheck,
    ArrowRight,
    School,
    LogOut,
    UserPlus,
    Calendar,
    Globe,
    FileText,
    Settings,
    X,
    CheckCircle,
    Database,
    Edit2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const API_URL = import.meta.env.PROD ? '/api' : (import.meta.env.VITE_API_URL || 'http://localhost:3001/api');

interface Institute {
    id: string;
    name: string;
    teacherName?: string;
    phoneNumber?: string;
    email?: string;
    createdAt: string;
    status: string; // ACTIVE or SUSPENDED
    suspensionReason?: string;
    config?: any;
    _count: {
        batches: number;
        students: number;
    };
    admins: { username: string }[];
}

export default function SuperAdminDashboard() {
    const navigate = useNavigate();

    // State
    const [institutes, setInstitutes] = useState<Institute[]>([]);
    const [analytics, setAnalytics] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Create Institute State
    const [showOnboardForm, setShowOnboardForm] = useState(false);
    const [newInstituteName, setNewInstituteName] = useState('');
    const [teacherName, setTeacherName] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [email, setEmail] = useState('');
    const [totalClasses, setTotalClasses] = useState('12');
    const [batchesPerClass, setBatchesPerClass] = useState('5');
    const [subjects, setSubjects] = useState('Math, Science, English');
    const [allowedClassesString, setAllowedClassesString] = useState('Class 9, Class 10');

    // Loading State
    const [isCreating, setIsCreating] = useState(false);

    // Edit Institute State
    const [editInstituteId, setEditInstituteId] = useState<string | null>(null);
    const [inviteLink, setInviteLink] = useState('');
    const [copied, setCopied] = useState(false);

    // Suspension State
    const [suspendModal, setSuspendModal] = useState<{ show: boolean, instituteId: string, instituteName: string } | null>(null);
    const [suspensionReason, setSuspensionReason] = useState('');
    const [isSuspending, setIsSuspending] = useState(false);

    // Delete State
    const [deleteModal, setDeleteModal] = useState<{ show: boolean, instituteId: string, instituteName: string } | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Profile Modal State
    const [selectedProfile, setSelectedProfile] = useState<any>(null);

    // Config Modal State
    const [selectedInstitute, setSelectedInstitute] = useState<Institute | null>(null);
    const [configJson, setConfigJson] = useState('');
    const [isSavingConfig, setIsSavingConfig] = useState(false);

    // Edit Details Modal State
    const [editDetailsModal, setEditDetailsModal] = useState<Institute | null>(null);
    const [editName, setEditName] = useState('');
    const [editTeacherName, setEditTeacherName] = useState('');
    const [editPhone, setEditPhone] = useState('');
    const [editEmail, setEditEmail] = useState('');
    const [isSavingDetails, setIsSavingDetails] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const token = localStorage.getItem('token');
            const headers = { Authorization: `Bearer ${token}` };

            const [institutesRes, analyticsRes] = await Promise.all([
                axios.get(`${API_URL}/institutes`, { headers }),
                axios.get(`${API_URL}/institutes/analytics`, { headers }).catch(() => null)
            ]);

            setInstitutes(institutesRes.data);
            if (analyticsRes) setAnalytics(analyticsRes.data);
        } catch (err) {
            console.error('Failed to fetch dashboard data');
            // If 403, might redirect, but for now just log
        } finally {
            setIsLoading(false);
        }
    };

    const handleViewProfile = async (id: string) => {
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get(`${API_URL}/institute/${id}/details`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setSelectedProfile(res.data);
        } catch (e) {
            const inst = institutes.find(i => i.id === id);
            setSelectedProfile(inst);
        }
    };

    const handleOpenConfig = (inst: Institute) => {
        setSelectedInstitute(inst);
        setConfigJson(JSON.stringify(inst.config || { classes: [] }, null, 2));
    };

    const handleSaveConfig = async () => {
        if (!selectedInstitute) return;
        setIsSavingConfig(true);
        try {
            const parsedConfig = JSON.parse(configJson);
            const token = localStorage.getItem('token');
            await axios.put(`${API_URL}/institutes/${selectedInstitute.id}/config`, {
                config: parsedConfig
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            fetchData();
            setSelectedInstitute(null);
        } catch (e) {
            alert('Invalid JSON or Save Failed');
        } finally {
            setIsSavingConfig(false);
        }
    };

    const handleOpenEditDetails = (inst: Institute) => {
        setEditDetailsModal(inst);
        setEditName(inst.name || '');
        setEditTeacherName(inst.teacherName || '');
        setEditPhone(inst.phoneNumber || '');
        setEditEmail(inst.email || '');
    };

    const handleSaveDetails = async () => {
        if (!editDetailsModal) return;
        setIsSavingDetails(true);
        try {
            const token = localStorage.getItem('token');
            await axios.put(`${API_URL}/institutes/${editDetailsModal.id}/details`, {
                name: editName,
                teacherName: editTeacherName,
                phoneNumber: editPhone,
                email: editEmail
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            fetchData();
            setEditDetailsModal(null);
        } catch (e) {
            alert('Failed to save details');
        } finally {
            setIsSavingDetails(false);
        }
    };

    const handleGenerateInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newInstituteName.trim()) return;

        setIsCreating(true);
        try {
            const token = localStorage.getItem('token');
            const res = await axios.post(`${API_URL}/invites`, {
                instituteName: newInstituteName,
                teacherName,
                phoneNumber,
                email,
                totalClasses,
                batchesPerClass,
                subjects,
                allowedClasses: allowedClassesString
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });

            setInviteLink(res.data.inviteLink);

            // Reset Form (Keeping defaults for limits)
            setNewInstituteName('');
            setTeacherName('');
            setPhoneNumber('');
            setEmail('');

            fetchData();
        } catch (err) {
            alert('Failed to generate invite');
        } finally {
            setIsCreating(false);
        }
    };

    const handleSuspendInstitute = async (action: 'SUSPEND' | 'ACTIVATE', instituteId?: string) => {
        const targetId = instituteId || suspendModal?.instituteId;
        if (!targetId) return;

        if (action === 'SUSPEND' && !suspensionReason.trim()) {
            alert('Please provide a reason for suspension');
            return;
        }

        setIsSuspending(true);
        try {
            const token = localStorage.getItem('token');
            await axios.put(`${API_URL}/institutes/${targetId}/suspend`, {
                action,
                reason: suspensionReason
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setSuspendModal(null);
            setSuspensionReason('');
            fetchData();
        } catch (err) {
            console.error(err);
            alert('Failed to update suspension status');
        } finally {
            setIsSuspending(false);
        }
    };

    const handleDeleteInstitute = async () => {
        if (!deleteModal) return;

        setIsDeleting(true);
        try {
            const token = localStorage.getItem('token');
            await axios.delete(`${API_URL}/institutes/${deleteModal.instituteId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setDeleteModal(null);
            fetchData();
        } catch (err: any) {
            console.error(err);
            alert(err.response?.data?.error || 'Failed to delete institute');
        } finally {
            setIsDeleting(false);
        }
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(inviteLink);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleLogout = () => {
        localStorage.clear();
        navigate('/login');
    };

    if (isLoading) return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
    );

    return (
        <div className="min-h-screen bg-[#F8FAFC] font-sans text-gray-900 relative">

            {/* Institute Profile Modal */}
            {selectedProfile && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <div>
                                <h3 className="text-xl font-bold text-gray-900">{selectedProfile.name}</h3>
                                <p className="text-sm text-gray-500">Institute ID: {selectedProfile.id}</p>
                            </div>
                            <button onClick={() => setSelectedProfile(null)} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                                <X className="w-5 h-5 text-gray-500" />
                            </button>
                        </div>

                        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="col-span-2">
                                <h4 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-3 flex items-center gap-2">
                                    <Database className="w-4 h-4" /> Database Usage
                                </h4>
                                <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                                    <div className="flex items-end gap-2 mb-2">
                                        <span className="text-3xl font-bold text-gray-900">{selectedProfile.stats?.dbUsageMB || '0.05'}</span>
                                        <span className="text-sm font-medium text-gray-500 mb-1.5">MB used</span>
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-2 mb-1">
                                        <div
                                            className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                                            style={{ width: `${Math.min(((selectedProfile.stats?.dbUsageMB || 0.1) / 500) * 100, 100)}%` }}
                                        />
                                    </div>
                                    <p className="text-xs text-gray-500">Plan Limit: 500 MB (Free Tier)</p>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="flex justify-between items-center p-3 bg-white border border-gray-100 rounded-lg">
                                    <span className="text-sm text-gray-600">Total Students</span>
                                    <span className="font-bold">{selectedProfile.stats?.recordCounts?.students || selectedProfile._count?.students || 0}</span>
                                </div>
                                <div className="flex justify-between items-center p-3 bg-white border border-gray-100 rounded-lg">
                                    <span className="text-sm text-gray-600">Batches Created</span>
                                    <span className="font-bold">{selectedProfile.stats?.recordCounts?.batches || selectedProfile._count?.batches || 0}</span>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="flex justify-between items-center p-3 bg-white border border-gray-100 rounded-lg">
                                    <span className="text-sm text-gray-600">Admin Account</span>
                                    <span className="font-bold text-blue-600 truncate max-w-[150px]">
                                        {selectedProfile.admins?.[0]?.username || 'Not Set'}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center p-3 bg-white border border-gray-100 rounded-lg">
                                    <span className="text-sm text-gray-600">Plan Status</span>
                                    <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-bold rounded">ACTIVE</span>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
                            <button
                                onClick={() => {
                                    handleOpenConfig(selectedProfile);
                                    setSelectedProfile(null);
                                }}
                                className="px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-white transition-colors"
                            >
                                Edit Config
                            </button>
                            <button
                                onClick={() => alert('Full report feature coming soon!')}
                                className="px-4 py-2 bg-black text-white font-medium rounded-lg hover:bg-gray-800 transition-colors"
                            >
                                View Full Report
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Config Modal */}
            {selectedInstitute && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                            <h3 className="text-lg font-bold">Configuration: {selectedInstitute.name}</h3>
                            <button onClick={() => setSelectedInstitute(null)}><X className="w-5 h-5 text-gray-400" /></button>
                        </div>
                        <div className="p-6">
                            <p className="text-sm text-gray-500 mb-2">Edit allowed classes and batch limits (JSON).</p>
                            <textarea
                                value={configJson}
                                onChange={(e) => setConfigJson(e.target.value)}
                                className="w-full h-64 font-mono text-sm bg-gray-50 border border-gray-200 rounded-lg p-4 focus:ring-2 focus:ring-black outline-none"
                            />
                        </div>
                        <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
                            <button onClick={() => setSelectedInstitute(null)} className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg">Cancel</button>
                            <button
                                onClick={handleSaveConfig}
                                disabled={isSavingConfig}
                                className="px-4 py-2 bg-black text-white font-bold rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
                            >
                                {isSavingConfig ? 'Saving...' : 'Save Configuration'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Details Modal */}
            {editDetailsModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <div>
                                <h3 className="text-xl font-bold text-gray-900">Edit Institute Details</h3>
                                <p className="text-sm text-gray-500">Update coaching center information</p>
                            </div>
                            <button onClick={() => setEditDetailsModal(null)} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                                <X className="w-5 h-5 text-gray-500" />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">Institute Name</label>
                                <input
                                    type="text"
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    placeholder="e.g. Apex Academy"
                                    className="w-full bg-gray-50 text-gray-900 border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-black focus:border-black outline-none transition-all placeholder:text-gray-400 font-medium"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">Teacher Name</label>
                                <input
                                    type="text"
                                    value={editTeacherName}
                                    onChange={(e) => setEditTeacherName(e.target.value)}
                                    placeholder="e.g. Rajesh Kumar"
                                    className="w-full bg-gray-50 text-gray-900 border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-black focus:border-black outline-none transition-all placeholder:text-gray-400 font-medium"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">Phone</label>
                                    <input
                                        type="tel"
                                        value={editPhone}
                                        onChange={(e) => setEditPhone(e.target.value)}
                                        placeholder="Phone Number"
                                        className="w-full bg-gray-50 text-gray-900 border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-black focus:border-black outline-none transition-all placeholder:text-gray-400 font-medium"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">Email</label>
                                    <input
                                        type="email"
                                        value={editEmail}
                                        onChange={(e) => setEditEmail(e.target.value)}
                                        placeholder="Email ID"
                                        className="w-full bg-gray-50 text-gray-900 border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-black focus:border-black outline-none transition-all placeholder:text-gray-400 font-medium"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
                            <button onClick={() => setEditDetailsModal(null)} className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-100 rounded-lg">Cancel</button>
                            <button
                                onClick={handleSaveDetails}
                                disabled={isSavingDetails}
                                className="px-4 py-2 bg-black text-white font-bold rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
                            >
                                {isSavingDetails ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <nav className="bg-white border-b border-gray-200 sticky top-0 z-10 px-6 py-4 flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <div className="bg-black text-white p-2 rounded-lg">
                        <ShieldCheck className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-white mb-1">Super Admin Dashboard <span className="text-sm font-normal opacity-50">v1.2</span></h1>
                        <p className="text-blue-100"> Manage institutes and oversee platform activity.</p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-green-50 text-green-700 rounded-full border border-green-100">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                        <span className="text-xs font-bold uppercase tracking-wide">System Online</span>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="text-sm font-medium text-gray-500 hover:text-red-600 flex items-center gap-2 transition-colors"
                    >
                        <LogOut size={16} />
                        Logout
                    </button>
                </div>
            </nav>

            <div className="max-w-6xl mx-auto px-6 py-10">
                {/* Analytics Section */}
                {analytics && (
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8 text-black">
                        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
                            <div className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-1">Total Institutes</div>
                            <div className="text-2xl font-bold flex items-center gap-2">
                                {analytics.totalInstitutes}
                                <School className="w-4 h-4 text-blue-500" />
                            </div>
                        </div>
                        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
                            <div className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-1">Active Students</div>
                            <div className="text-2xl font-bold flex items-center gap-2">
                                {analytics.totalStudents}
                                <Users className="w-4 h-4 text-green-500" />
                            </div>
                        </div>
                        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
                            <div className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-1">Total Batches</div>
                            <div className="text-2xl font-bold flex items-center gap-2">
                                {analytics.totalBatches}
                                <Building2 className="w-4 h-4 text-purple-500" />
                            </div>
                        </div>
                        <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
                            <div className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-1">Platform Revenue</div>
                            <div className="text-2xl font-bold flex items-center gap-2">
                                ₹{(analytics.totalRevenue || 0).toLocaleString()}
                                <span className="text-xs font-normal text-gray-400">Lifetime</span>
                            </div>
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 gap-8">
                    {/* Create Invite Section - Now hidden, moved to modal */}
                    {false && (
                        <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 h-fit lg:sticky lg:top-24">
                            <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-black">
                                <UserPlus className="w-5 h-5" />
                                Onboard Institute
                            </h2>
                            <p className="text-gray-500 text-sm mb-6">Create a secure invite link to onboard a new institute to the platform.</p>

                            <form onSubmit={handleGenerateInvite} className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">Institute Details</label>
                                    <input
                                        type="text"
                                        value={newInstituteName}
                                        onChange={(e) => setNewInstituteName(e.target.value)}
                                        placeholder="Institute Name (e.g. Apex Academy)"
                                        className="w-full bg-gray-50 text-gray-900 border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-black focus:border-black outline-none transition-all placeholder:text-gray-400 font-medium"
                                        required
                                    />
                                    <input
                                        type="text"
                                        value={teacherName}
                                        onChange={(e) => setTeacherName(e.target.value)}
                                        placeholder="Teacher Name (e.g. Rajesh Kumar)"
                                        className="w-full bg-gray-50 text-gray-900 border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-black focus:border-black outline-none transition-all placeholder:text-gray-400 font-medium"
                                        required
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">Contact</label>
                                        <input
                                            type="tel"
                                            value={phoneNumber}
                                            onChange={(e) => setPhoneNumber(e.target.value)}
                                            placeholder="Phone"
                                            className="w-full bg-gray-50 text-gray-900 border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-black focus:border-black outline-none transition-all placeholder:text-gray-400 font-medium"
                                            required
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1 invisible">Email</label>
                                        <input
                                            type="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            placeholder="Email ID"
                                            className="w-full bg-gray-50 text-gray-900 border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-black focus:border-black outline-none transition-all placeholder:text-gray-400 font-medium"
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">Configured Classes</label>
                                        <input
                                            type="text"
                                            value={allowedClassesString}
                                            onChange={(e) => setAllowedClassesString(e.target.value)}
                                            placeholder="e.g. Class 9, Class 10"
                                            className="w-full bg-gray-50 text-gray-900 border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-black focus:border-black outline-none transition-all placeholder:text-gray-400 font-medium"
                                        />
                                        <p className="text-[10px] text-gray-400 pl-1">Pre-set classes for teacher</p>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">Batches</label>
                                        <input
                                            type="number"
                                            inputMode="numeric"
                                            value={batchesPerClass}
                                            onChange={(e) => setBatchesPerClass(e.target.value)}
                                            placeholder="Batches/Class"
                                            className="w-full bg-gray-50 text-gray-900 border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-black focus:border-black outline-none transition-all placeholder:text-gray-400 font-medium"
                                        />
                                        <p className="text-[10px] text-gray-400 pl-1">Max Batches per Class</p>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">Subjects Offered</label>
                                    <input
                                        type="text"
                                        value={subjects}
                                        onChange={(e) => setSubjects(e.target.value)}
                                        placeholder="e.g. Math, Physics, Chemistry"
                                        className="w-full bg-gray-50 text-gray-900 border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-black focus:border-black outline-none transition-all placeholder:text-gray-400 font-medium"
                                    />
                                    <p className="text-[10px] text-gray-400 pl-1">Comma separated list</p>
                                </div>

                                <button
                                    type="submit"
                                    disabled={isCreating}
                                    className="w-full bg-black hover:bg-gray-800 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-black/5 hover:shadow-black/10 transition-all active:scale-[0.98] disabled:opacity-70 flex items-center justify-center gap-2"
                                >
                                    {isCreating ? (
                                        'Generating Link...'
                                    ) : (
                                        <>Generate Invite Link <ArrowRight className="w-4 h-4" /></>
                                    )}
                                </button>
                            </form>

                            {inviteLink && (
                                <div className="mt-6 p-4 bg-green-50 border border-green-100 rounded-2xl animate-in fade-in slide-in-from-top-2">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-bold text-green-700 uppercase tracking-wide">Invite Generated</span>
                                        {copied ? (
                                            <CheckCircle className="w-5 h-5 text-green-600" />
                                        ) : (
                                            <Copy
                                                className="w-5 h-5 text-green-600 cursor-pointer hover:scale-110 transition-transform"
                                                onClick={copyToClipboard}
                                            />
                                        )}
                                    </div>
                                    <code className="block w-full bg-white border border-green-200 p-3 rounded-xl text-xs text-green-800 break-all font-mono select-all">
                                        {inviteLink}
                                    </code>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Institute List */}
                    <div className="lg:col-span-2 space-y-6">
                        <div className="flex justify-between items-center">
                            <h2 className="text-xl font-bold flex items-center gap-2 text-black">
                                <School className="w-5 h-5" />
                                Active Institutes
                            </h2>
                            <button
                                onClick={() => setShowOnboardForm(true)}
                                className="bg-black hover:bg-gray-800 text-white font-bold px-5 py-2.5 rounded-xl shadow-lg shadow-black/5 hover:shadow-black/10 transition-all active:scale-[0.98] flex items-center gap-2"
                            >
                                <Plus className="w-4 h-4" />
                                Onboard Institute
                            </button>
                        </div>

                        <div className="grid gap-4">
                            {institutes.length === 0 ? (
                                <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-gray-200">
                                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <School className="w-8 h-8 text-gray-300" />
                                    </div>
                                    <p className="text-gray-500 font-medium">No institutes found</p>
                                    <p className="text-gray-400 text-sm mt-1">Generate an invite to onboard the first one.</p>
                                </div>
                            ) : (
                                institutes.map((inst) => (
                                    <div key={inst.id} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow group flex items-center justify-between">
                                        <div>
                                            <h3 className="font-bold text-lg text-gray-900 group-hover:text-blue-600 transition-colors">
                                                {inst.name}
                                            </h3>
                                            <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
                                                <span className="flex items-center gap-1.5 bg-gray-50 px-2 py-1 rounded-md border border-gray-100">
                                                    <Calendar className="w-3.5 h-3.5 text-gray-400" />
                                                    {new Date(inst.createdAt).toLocaleDateString()}
                                                </span>
                                                {inst.status === 'SUSPENDED' ? (
                                                    <span className="flex items-center gap-1.5 bg-red-50 px-2 py-1 rounded-md border border-red-200 text-red-600">
                                                        <X className="w-3.5 h-3.5" />
                                                        Suspended
                                                    </span>
                                                ) : (
                                                    <span className="flex items-center gap-1.5 bg-green-50 px-2 py-1 rounded-md border border-green-200 text-green-600">
                                                        <Globe className="w-3.5 h-3.5" />
                                                        Active
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleViewProfile(inst.id)}
                                                className="p-3 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-xl transition-all border border-gray-200 hover:border-gray-300 flex items-center gap-2 text-sm font-medium"
                                            >
                                                <FileText className="w-4 h-4" />
                                                Details
                                            </button>
                                            <button
                                                onClick={() => handleOpenEditDetails(inst)}
                                                className="p-3 bg-purple-50/50 hover:bg-purple-50 text-purple-600 hover:text-purple-700 rounded-xl transition-all border border-purple-100 hover:border-purple-200 font-medium text-sm flex items-center gap-2"
                                                title="Edit Institute Details"
                                            >
                                                <Edit2 className="w-4 h-4" />
                                                Edit
                                            </button>
                                            <button
                                                onClick={() => handleOpenConfig(inst)}
                                                className="p-3 bg-blue-50/50 hover:bg-blue-50 text-blue-600 hover:text-blue-700 rounded-xl transition-all border border-blue-100 hover:border-blue-200 font-medium text-sm flex items-center gap-2"
                                            >
                                                <Settings className="w-4 h-4" />
                                                Config
                                            </button>
                                            {inst.status === 'SUSPENDED' ? (
                                                <button
                                                    onClick={() => handleSuspendInstitute('ACTIVATE', inst.id)}
                                                    className="p-3 bg-green-50 hover:bg-green-100 text-green-600 rounded-xl transition-all border border-green-200 font-medium text-sm"
                                                    title="Reactivate Institute"
                                                >
                                                    ✓
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => setSuspendModal({ show: true, instituteId: inst.id, instituteName: inst.name })}
                                                    className="p-3 bg-orange-50 hover:bg-orange-100 text-orange-600 rounded-xl transition-all border border-orange-200 font-medium text-sm"
                                                    title="Suspend Institute"
                                                >
                                                    ⏸
                                                </button>
                                            )}
                                            <button
                                                onClick={() => setDeleteModal({ show: true, instituteId: inst.id, instituteName: inst.name })}
                                                className="p-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl transition-all border border-red-200 font-medium text-sm"
                                                title="Delete Institute"
                                            >
                                                🗑
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Suspension Modal */}
            {suspendModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl">
                        <h3 className="text-xl font-bold text-gray-900 mb-2">Suspend Institute</h3>
                        <p className="text-sm text-gray-500 mb-4">
                            Suspending <strong>{suspendModal.instituteName}</strong>. Teachers won't be able to log in.
                        </p>

                        <label className="block text-sm font-semibold text-gray-700 mb-2">Reason for Suspension *</label>
                        <textarea
                            value={suspensionReason}
                            onChange={(e) => setSuspensionReason(e.target.value)}
                            placeholder="e.g., Payment overdue, Terms violation..."
                            className="w-full border border-gray-300 rounded-xl p-3 mb-4 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none"
                            rows={3}
                            required
                        />

                        <div className="flex gap-3">
                            <button
                                onClick={() => {
                                    setSuspendModal(null);
                                    setSuspensionReason('');
                                }}
                                className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-colors"
                                disabled={isSuspending}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleSuspendInstitute('SUSPEND')}
                                className="flex-1 px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
                                disabled={isSuspending}
                            >
                                {isSuspending ? 'Suspending...' : 'Suspend'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteModal && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border-2 border-red-200">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center">
                                <span className="text-2xl">⚠️</span>
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-red-600">Permanent Deletion</h3>
                                <p className="text-sm text-gray-500">This action cannot be undone</p>
                            </div>
                        </div>

                        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
                            <p className="text-sm text-gray-700 mb-3">
                                You are about to permanently delete <strong className="text-red-700">{deleteModal.instituteName}</strong>.
                            </p>
                            <p className="text-sm font-semibold text-red-700 mb-2">This will remove ALL:</p>
                            <ul className="text-sm text-gray-700 space-y-1 ml-4">
                                <li>• All students and their records</li>
                                <li>• All batches and tests</li>
                                <li>• All fee payments and transactions</li>
                                <li>• All admin accounts</li>
                                <li>• All academic year data</li>
                            </ul>
                        </div>

                        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 mb-4">
                            <p className="text-xs text-yellow-800 font-medium">
                                💡 <strong>Tip:</strong> Consider using "Suspend" instead if you want to temporarily disable access without losing data.
                            </p>
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setDeleteModal(null)}
                                className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-colors"
                                disabled={isDeleting}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDeleteInstitute}
                                className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                disabled={isDeleting}
                            >
                                {isDeleting ? (
                                    <>
                                        <span className="animate-spin">⏳</span>
                                        Deleting...
                                    </>
                                ) : (
                                    <>
                                        🗑 Delete Permanently
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Onboard Institute Modal */}
            {showOnboardForm && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowOnboardForm(false)}>
                    <div className="bg-white p-8 rounded-3xl shadow-2xl border border-gray-100 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold flex items-center gap-2 text-black">
                                <UserPlus className="w-5 h-5" />
                                Onboard Institute
                            </h2>
                            <button onClick={() => setShowOnboardForm(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <p className="text-gray-500 text-sm mb-6">Create a secure invite link to onboard a new institute to the platform.</p>

                        <form onSubmit={handleGenerateInvite} className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">Institute Details</label>
                                <input
                                    type="text"
                                    value={newInstituteName}
                                    onChange={(e) => setNewInstituteName(e.target.value)}
                                    placeholder="Institute Name (e.g. Apex Academy)"
                                    className="w-full bg-gray-50 text-gray-900 border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-black focus:border-black outline-none transition-all placeholder:text-gray-400 font-medium"
                                    required
                                />
                                <input
                                    type="text"
                                    value={teacherName}
                                    onChange={(e) => setTeacherName(e.target.value)}
                                    placeholder="Teacher Name (e.g. Rajesh Kumar)"
                                    className="w-full bg-gray-50 text-gray-900 border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-black focus:border-black outline-none transition-all placeholder:text-gray-400 font-medium"
                                    required
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">Contact</label>
                                    <input
                                        type="tel"
                                        value={phoneNumber}
                                        onChange={(e) => setPhoneNumber(e.target.value)}
                                        placeholder="Phone"
                                        className="w-full bg-gray-50 text-gray-900 border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-black focus:border-black outline-none transition-all placeholder:text-gray-400 font-medium"
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1 invisible">Email</label>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="Email ID"
                                        className="w-full bg-gray-50 text-gray-900 border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-black focus:border-black outline-none transition-all placeholder:text-gray-400 font-medium"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">Config Limits</label>
                                    <input
                                        type="number"
                                        inputMode="numeric"
                                        value={totalClasses}
                                        onChange={(e) => setTotalClasses(e.target.value)}
                                        placeholder="Max Classes"
                                        className="w-full bg-gray-50 text-gray-900 border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-black focus:border-black outline-none transition-all placeholder:text-gray-400 font-medium"
                                    />
                                    <p className="text-[10px] text-gray-400 pl-1">Allowed Classes</p>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1 invisible">Batches</label>
                                    <input
                                        type="number"
                                        inputMode="numeric"
                                        value={batchesPerClass}
                                        onChange={(e) => setBatchesPerClass(e.target.value)}
                                        placeholder="Batches/Class"
                                        className="w-full bg-gray-50 text-gray-900 border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-black focus:border-black outline-none transition-all placeholder:text-gray-400 font-medium"
                                    />
                                    <p className="text-[10px] text-gray-400 pl-1">Max Batches per Class</p>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">Subjects Offered</label>
                                <input
                                    type="text"
                                    value={subjects}
                                    onChange={(e) => setSubjects(e.target.value)}
                                    placeholder="e.g. Math, Physics, Chemistry"
                                    className="w-full bg-gray-50 text-gray-900 border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-black focus:border-black outline-none transition-all placeholder:text-gray-400 font-medium"
                                />
                                <p className="text-[10px] text-gray-400 pl-1">Comma separated list</p>
                            </div>

                            <button
                                type="submit"
                                disabled={isCreating}
                                className="w-full bg-black hover:bg-gray-800 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-black/5 hover:shadow-black/10 transition-all active:scale-[0.98] disabled:opacity-70 flex items-center justify-center gap-2"
                            >
                                {isCreating ? (
                                    'Generating Link...'
                                ) : (
                                    <>Generate Invite Link <ArrowRight className="w-4 h-4" /></>
                                )}
                            </button>
                        </form>

                        {inviteLink && (
                            <div className="mt-6 p-4 bg-green-50 border border-green-100 rounded-2xl animate-in fade-in slide-in-from-top-2">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-bold text-green-700 uppercase tracking-wide">Invite Generated</span>
                                    {copied ? (
                                        <CheckCircle className="w-5 h-5 text-green-600" />
                                    ) : (
                                        <Copy
                                            className="w-5 h-5 text-green-600 cursor-pointer hover:scale-110 transition-transform"
                                            onClick={copyToClipboard}
                                        />
                                    )}
                                </div>
                                <code className="block w-full bg-white border border-green-200 p-3 rounded-xl text-xs text-green-800 break-all font-mono select-all">
                                    {inviteLink}
                                </code>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
