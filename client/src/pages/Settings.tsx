import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { api } from '../utils/api';
import { Lock, ImagePlus, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface ChangePasswordResponse {
    token?: string;
    refreshToken?: string;
}

interface Profile {
    username: string;
    email?: string;
    phone?: string;
    planName?: string;
    maxStudents?: number;
    logo?: string | null;
}

const getErrorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

function ChangePasswordForm() {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (newPassword !== confirmPassword) {
            toast.error('New passwords do not match');
            return;
        }

        if (newPassword.length < 6) {
            toast.error('Password must be at least 6 characters');
            return;
        }

        setLoading(true);
        try {
            const res = await api.post<ChangePasswordResponse>('/auth/change-password', {
                currentPassword,
                newPassword
            });

            if (res.token) {
                localStorage.setItem('token', res.token);
            }
            if (res.refreshToken) {
                localStorage.setItem('refreshToken', res.refreshToken);
            }

            toast.success('Password changed successfully');
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (error: unknown) {
            console.error(error);
            toast.error(getErrorMessage(error, 'Failed to change password'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div>
                <label className="block text-xs font-bold uppercase text-gray-500 mb-1.5 ml-1 tracking-wider">Current Password</label>
                <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-black focus:border-black outline-none font-medium placeholder:text-gray-400"
                    placeholder="Enter current password"
                    required
                />
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-bold uppercase text-gray-500 mb-1.5 ml-1 tracking-wider">New Password</label>
                    <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-black focus:border-black outline-none font-medium placeholder:text-gray-400"
                        placeholder="Min 6 chars"
                        required
                    />
                </div>
                <div>
                    <label className="block text-xs font-bold uppercase text-gray-500 mb-1.5 ml-1 tracking-wider">Confirm New</label>
                    <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-black focus:border-black outline-none font-medium placeholder:text-gray-400"
                        placeholder="Re-enter new"
                        required
                    />
                </div>
            </div>

            <div className="flex justify-end pt-4">
                <button
                    type="submit"
                    disabled={loading}
                    className="flex items-center justify-center gap-2 bg-black text-white px-8 py-3.5 rounded-xl font-bold hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-black/10 active:scale-[0.98]"
                >
                    {loading ? 'Updating...' : (
                        <>
                            <Lock size={16} />
                            <span>Update Password</span>
                        </>
                    )}
                </button>
            </div>
        </form>
    );
}


function ProfileSection() {
    const [profile, setProfile] = useState<Profile | null>(null);
    const [isUploading, setIsUploading] = useState(false);

    useEffect(() => {
        api.get<Profile>('/auth/me').then(setProfile).catch(console.error);
    }, []);

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.type !== 'image/png') {
            toast.error('Please upload a valid PNG image');
            return;
        }

        if (file.size > 2 * 1024 * 1024) {
            toast.error('Image must be less than 2MB');
            return;
        }

        setIsUploading(true);
        const loadingToast = toast.loading('Uploading logo...');

        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = async () => {
            const base64String = reader.result as string;
            try {
                const res = await api.put<{ success: boolean; logo: string }>('/institute/me/logo', { logo: base64String });
                setProfile(prev => prev ? { ...prev, logo: res.logo } : null);
                toast.success('Logo updated successfully', { id: loadingToast });
            } catch (error) {
                console.error('Failed to upload logo:', error);
                toast.error('Failed to upload logo', { id: loadingToast });
            } finally {
                setIsUploading(false);
            }
        };
        reader.onerror = () => {
            toast.error('Failed to read image', { id: loadingToast });
            setIsUploading(false);
        };
    };

    if (!profile) return (
        <div className="max-w-4xl mx-auto mb-12">
            <h2 className="text-xl font-bold text-app-text mb-1 flex items-center gap-2">Profile</h2>
            <div className="animate-pulse bg-white border border-gray-100 shadow-sm h-[320px] rounded-3xl mt-6" />
        </div>
    );

    return (
        <div className="max-w-4xl mx-auto mb-12">
            <h2 className="text-xl font-bold text-app-text mb-1 flex items-center gap-2">
                Profile
            </h2>
            <p className="text-app-text-secondary text-sm mb-6">Your personal contact details and plan info.</p>

            <div className="bg-white border border-gray-100 rounded-3xl p-8 grid grid-cols-1 md:grid-cols-2 gap-8 relative overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                {/* Decorative background */}
                <div className="absolute top-0 right-0 w-80 h-80 bg-accent/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/4 pointer-events-none" />

                <div className="relative z-10 md:col-span-2 mb-2 flex items-center gap-6">
                    <div className="relative group shrink-0">
                        <div className="w-24 h-24 rounded-2xl border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden relative transition-all group-hover:border-black group-hover:bg-gray-50 shadow-sm">
                            {profile.logo ? (
                                <img src={profile.logo} alt="Institute Logo" className="w-full h-full object-contain p-2" />
                            ) : (
                                <ImagePlus className="text-gray-400 group-hover:text-black transition-colors" size={28} />
                            )}

                            {isUploading && (
                                <div className="absolute inset-0 bg-white/80 flex items-center justify-center backdrop-blur-sm">
                                    <Loader2 className="animate-spin text-black" size={24} />
                                </div>
                            )}

                            <input
                                type="file"
                                accept="image/png"
                                onChange={handleLogoUpload}
                                disabled={isUploading}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                            />
                        </div>
                    </div>
                    <div>
                        <h3 className="font-bold text-app-text text-lg mb-1">Institute Logo</h3>
                        <p className="text-sm text-app-text-secondary mb-2 border-b border-app-border pb-2 inline-block">This logo will be displayed on your student registration page.</p>
                        <p className="text-xs text-app-text-tertiary">Recommended: Square, transparent PNG under 2MB.</p>
                    </div>
                </div>

                <div className="relative z-10">
                    <label className="block text-xs font-bold uppercase text-app-text-tertiary mb-2 pl-1">Teacher Name</label>
                    <div className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 text-app-text font-semibold shadow-sm">
                        {profile.username}
                    </div>
                </div>
                <div className="relative z-10">
                    <label className="block text-xs font-bold uppercase text-app-text-tertiary mb-2 pl-1">Email</label>
                    <div className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 text-app-text font-medium shadow-sm">
                        {profile.email}
                    </div>
                </div>
                <div className="relative z-10">
                    <label className="block text-xs font-bold uppercase text-app-text-tertiary mb-2 pl-1">Phone</label>
                    <div className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-5 py-4 text-app-text font-medium shadow-sm">
                        {profile.phone}
                    </div>
                </div>
                <div className="relative z-10">
                    <label className="block text-xs font-bold uppercase text-app-text-tertiary mb-2 pl-1">Current Plan</label>
                    <div className="w-full bg-black dark:bg-white text-white dark:text-black border border-black dark:border-white rounded-xl px-4 py-3.5 font-bold flex justify-between items-center shadow-lg">
                        <span className="flex items-center gap-2">
                            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                            {profile.planName || 'Basic'} Plan
                        </span>
                        <span className="text-sm border opacity-80 border-white/20 px-2 py-0.5 rounded-full">Max {profile.maxStudents || 100} students</span>
                    </div>
                </div>
            </div>
        </div>
    );
}


export default function Settings() {
    return (
        <Layout title="Settings">
            <div className="max-w-4xl mx-auto">
                <ProfileSection />

                {/* Security Section */}
                <div className="max-w-2xl mb-12 mt-12">
                    <div className="mb-6">
                        <h2 className="text-xl font-bold text-app-text">Security</h2>
                        <p className="text-app-text-secondary text-sm mt-1">Update your login credentials securely.</p>
                    </div>

                    <div className="bg-white border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-8 rounded-3xl">
                        <ChangePasswordForm />
                    </div>
                </div>
            </div>
        </Layout>
    );
}
