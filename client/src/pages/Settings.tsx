import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { api } from '../utils/api';
import { Lock, ImagePlus, Loader2, Plus, X, Trash2, ArrowUp, ArrowDown, GripVertical, Pencil, Check } from 'lucide-react';
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


function TagInput({ label, hint, tags, setTags, placeholder }: { label: string, hint: string, tags: string[], setTags: (t: string[]) => void, placeholder: string }) {
    const [inputValue, setInputValue] = useState('');

    const addTag = () => {
        const val = inputValue.trim();
        if (val && !tags.includes(val)) {
            setTags([...tags, val]);
        }
        setInputValue('');
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addTag();
        }
    };

    const removeTag = (tagToRemove: string) => {
        setTags(tags.filter(t => t !== tagToRemove));
    };

    return (
        <div>
            <label className="block text-xs font-bold uppercase text-app-text-tertiary mb-2 pl-1">{label}</label>
            <p className="text-xs text-gray-500 mb-2 pl-1">{hint}</p>
            
            <div className="flex flex-wrap gap-2 mb-3">
                {tags.map(tag => (
                    <span key={tag} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-800 rounded-xl text-sm font-medium border border-gray-200">
                        {tag}
                        <button type="button" onClick={() => removeTag(tag)} className="text-gray-400 hover:text-gray-800 transition-colors cursor-pointer">
                            <X size={14} />
                        </button>
                    </span>
                ))}
            </div>

            <div className="flex items-center gap-2">
                <input
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-black focus:border-black outline-none font-medium placeholder:text-gray-400"
                    placeholder={placeholder}
                />
                <button
                    type="button"
                    onClick={addTag}
                    className="flex items-center justify-center p-3.5 bg-black text-white rounded-xl hover:bg-gray-800 transition-colors"
                >
                    <Plus size={20} />
                </button>
            </div>
        </div>
    );
}

function CoachingConfigSection() {
    const [config, setConfig] = useState<any>(null);
    const [subjects, setSubjects] = useState<string[]>([]);
    const [classes, setClasses] = useState<string[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        api.get('/institute/me')
            .then((res: any) => {
                const currentConfig = res.config || {};
                setConfig(currentConfig);
                setSubjects(currentConfig.subjects || []);
                setClasses(currentConfig.allowedClasses || []);
            })
            .catch(console.error)
            .finally(() => setIsLoading(false));
    }, []);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        
        try {
            await api.put('/institute/me/config', { subjects, allowedClasses: classes });
            toast.success('Coaching configuration updated successfully');
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to update configuration'));
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) return (
        <div className="max-w-4xl mx-auto mb-12">
            <h2 className="text-xl font-bold text-app-text mb-1 flex items-center gap-2">Coaching Configuration</h2>
            <div className="animate-pulse bg-white border border-gray-100 shadow-sm h-[200px] rounded-3xl mt-6" />
        </div>
    );

    return (
        <div className="max-w-4xl mx-auto mb-12">
            <h2 className="text-xl font-bold text-app-text mb-1 flex items-center gap-2">
                Coaching Configuration
            </h2>
            <p className="text-app-text-secondary text-sm mb-6">Update the subjects and classes your institute offers.</p>

            <div className="bg-white border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-8 rounded-3xl relative overflow-hidden">
                <form onSubmit={handleSave} className="space-y-8 relative z-10">
                    <TagInput 
                        label="Subjects Offered"
                        hint="Type a subject and press Enter or click +"
                        placeholder="Mathematics, Science, English..."
                        tags={subjects}
                        setTags={setSubjects}
                    />

                    <TagInput 
                        label="Classes / Grades"
                        hint="Type a class and press Enter or click +"
                        placeholder="9th, 10th, 11th, 12th..."
                        tags={classes}
                        setTags={setClasses}
                    />

                    <div className="flex justify-end pt-4">
                        <button
                            type="submit"
                            disabled={isSaving}
                            className="flex items-center justify-center gap-2 bg-black text-white px-8 py-3.5 rounded-xl font-bold hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-black/10 active:scale-[0.98]"
                        >
                            {isSaving ? 'Saving...' : 'Save Configuration'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

const DEFAULT_FORM_FIELDS = [
    { id: 'studentName', label: 'Student Name', type: 'text', required: true, system: true },
    { id: 'parentName', label: 'Parent / Guardian Name', type: 'text', required: true, system: true },
    { id: 'parentWhatsapp', label: 'WhatsApp Number', type: 'tel', required: true, system: true },
    { id: 'schoolName', label: 'School Name', type: 'text', required: false, system: true },
    { id: 'parentEmail', label: 'Parent Email (Optional)', type: 'email', required: false, system: true }
];

function RegistrationFormBuilder() {
    const [fields, setFields] = useState<any[]>(DEFAULT_FORM_FIELDS);
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isDirty, setIsDirty] = useState(false);

    const [showAddField, setShowAddField] = useState(false);
    const [newFieldLabel, setNewFieldLabel] = useState('');
    const [newFieldType, setNewFieldType] = useState('text');
    const [newFieldRequired, setNewFieldRequired] = useState(false);

    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
    const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
    const [editingFieldLabel, setEditingFieldLabel] = useState<string>('');
    const [editingFieldType, setEditingFieldType] = useState<string>('text');
    const [editingFieldRequired, setEditingFieldRequired] = useState<boolean>(false);

    useEffect(() => {
        api.get('/institute/me')
            .then((res: any) => {
                const currentConfig = res.config || {};
                const savedFields = currentConfig.registrationForm?.fields;
                setFields(savedFields && savedFields.length > 0 ? savedFields : DEFAULT_FORM_FIELDS);
            })
            .catch(console.error)
            .finally(() => setIsLoading(false));
    }, []);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const res: any = await api.get('/institute/me');
            const currentConfig = res.config || {};
            await api.put('/institute/me/config', { 
                ...currentConfig,
                registrationForm: { fields } 
            });
            setIsDirty(false);
            toast.success('Registration form updated successfully');
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to update form config'));
        } finally {
            setIsSaving(false);
        }
    };

    const handleAddField = (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedLabel = newFieldLabel.trim();
        if (!trimmedLabel) return;

        // Check for duplicate label (case-insensitive)
        const isDuplicate = fields.some(
            f => f.label.toLowerCase().trim() === trimmedLabel.toLowerCase()
        );
        if (isDuplicate) {
            toast.error(`A field with label "${trimmedLabel}" already exists.`);
            return;
        }

        const cleanSlug = trimmedLabel.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
        const id = (cleanSlug || 'field') + '_' + Date.now();
        const newField = {
            id,
            label: trimmedLabel,
            type: newFieldType,
            required: newFieldRequired,
            system: false
        };

        setFields([...fields, newField]);
        setIsDirty(true);
        setNewFieldLabel('');
        setNewFieldType('text');
        setNewFieldRequired(false);
        setShowAddField(false);
        toast.success('Field added! Click "Save Form" to publish changes.');
    };

    const removeField = (id: string) => {
        setFields(fields.filter(f => f.id !== id));
        setIsDirty(true);
    };

    const toggleFieldRequired = (id: string) => {
        setFields(fields.map(f => {
            if (f.id === id) {
                // Keep critical system fields mandatory
                if (['studentName', 'parentName', 'parentWhatsapp'].includes(f.id)) {
                    return f;
                }
                return { ...f, required: !f.required };
            }
            return f;
        }));
        setIsDirty(true);
    };

    const moveFieldUp = (index: number) => {
        if (index === 0) return;
        const newFields = [...fields];
        [newFields[index - 1], newFields[index]] = [newFields[index], newFields[index - 1]];
        setFields(newFields);
        setIsDirty(true);
    };

    const moveFieldDown = (index: number) => {
        if (index === fields.length - 1) return;
        const newFields = [...fields];
        [newFields[index + 1], newFields[index]] = [newFields[index], newFields[index + 1]];
        setFields(newFields);
        setIsDirty(true);
    };

    const handleDragStart = (e: React.DragEvent, index: number) => {
        setDraggedIndex(index);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', index.toString());
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        if (draggedIndex === null || draggedIndex === index) return;
        
        const newFields = [...fields];
        const draggedItem = newFields[draggedIndex];
        newFields.splice(draggedIndex, 1);
        newFields.splice(index, 0, draggedItem);
        
        setFields(newFields);
        setDraggedIndex(index);
        setIsDirty(true);
    };

    const handleDragEnd = () => {
        setDraggedIndex(null);
    };

    const handleEditStart = (field: any) => {
        setEditingFieldId(field.id);
        setEditingFieldLabel(field.label);
        setEditingFieldType(field.type || 'text');
        setEditingFieldRequired(!!field.required);
    };

    const handleEditSave = () => {
        if (!editingFieldId || !editingFieldLabel.trim()) {
            setEditingFieldId(null);
            return;
        }

        const trimmed = editingFieldLabel.trim();
        // Duplicate check excluding self
        const isDuplicate = fields.some(
            f => f.id !== editingFieldId && f.label.toLowerCase().trim() === trimmed.toLowerCase()
        );
        if (isDuplicate) {
            toast.error(`Another field with label "${trimmed}" already exists.`);
            return;
        }

        setFields(fields.map(f => {
            if (f.id === editingFieldId) {
                const isCriticalSystem = ['studentName', 'parentName', 'parentWhatsapp'].includes(f.id);
                return {
                    ...f,
                    label: trimmed,
                    type: f.system ? f.type : editingFieldType,
                    required: isCriticalSystem ? true : editingFieldRequired
                };
            }
            return f;
        }));
        setIsDirty(true);
        setEditingFieldId(null);
        toast.success('Field updated!');
    };

    if (isLoading) return (
        <div className="max-w-4xl mx-auto mb-12">
            <h2 className="text-xl font-bold text-app-text mb-1 flex items-center gap-2">Student Onboarding Form</h2>
            <div className="animate-pulse bg-white border border-gray-100 shadow-sm h-[200px] rounded-3xl mt-6" />
        </div>
    );

    return (
        <div className="max-w-4xl mx-auto mb-12">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-xl font-bold text-app-text mb-1 flex items-center gap-2">
                        Student Onboarding Form
                        {isDirty && (
                            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 animate-pulse">
                                Unsaved Changes
                            </span>
                        )}
                    </h2>
                    <p className="text-app-text-secondary text-sm">Configure the information you collect when students register.</p>
                </div>
            </div>

            <div className="bg-white border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] p-8 rounded-3xl relative overflow-hidden">
                <div className="space-y-4 relative z-10">
                    
                    <div className="space-y-3">
                        {fields.map((field, index) => {
                            const isCriticalSystem = ['studentName', 'parentName', 'parentWhatsapp'].includes(field.id);
                            return (
                                <div 
                                    key={field.id} 
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, index)}
                                    onDragOver={(e) => handleDragOver(e, index)}
                                    onDragEnd={handleDragEnd}
                                    className={`bg-gray-50 border border-gray-200 p-4 rounded-xl transition-all ${draggedIndex === index ? 'opacity-40 border-gray-400' : ''}`}
                                >
                                    {editingFieldId === field.id ? (
                                        <div className="space-y-3 p-2 bg-white rounded-lg border border-black/10 shadow-sm">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                <div>
                                                    <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Field Label</label>
                                                    <input
                                                        type="text"
                                                        value={editingFieldLabel}
                                                        onChange={(e) => setEditingFieldLabel(e.target.value)}
                                                        onKeyDown={(e) => e.key === 'Enter' && handleEditSave()}
                                                        autoFocus
                                                        className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-black"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold uppercase text-gray-500 mb-1">Input Type</label>
                                                    <select
                                                        value={editingFieldType}
                                                        onChange={(e) => setEditingFieldType(e.target.value)}
                                                        disabled={field.system}
                                                        className="w-full bg-gray-50 border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black disabled:opacity-50"
                                                    >
                                                        <option value="text">Short Text</option>
                                                        <option value="tel">Phone Number</option>
                                                        <option value="email">Email</option>
                                                        <option value="number">Number</option>
                                                    </select>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between pt-1">
                                                <label className="flex items-center gap-2 text-sm text-app-text font-medium cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={isCriticalSystem ? true : editingFieldRequired}
                                                        disabled={isCriticalSystem}
                                                        onChange={(e) => setEditingFieldRequired(e.target.checked)}
                                                        className="w-4 h-4 text-black focus:ring-black rounded disabled:opacity-50"
                                                    />
                                                    <span>Make this field required {isCriticalSystem && '(Mandatory for registration)'}</span>
                                                </label>
                                                <div className="flex items-center gap-2">
                                                    <button onClick={handleEditSave} className="flex items-center gap-1 bg-black text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-gray-800 transition-colors">
                                                        <Check size={14} /> Save
                                                    </button>
                                                    <button onClick={() => setEditingFieldId(null)} className="text-gray-500 hover:bg-gray-100 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors">
                                                        Cancel
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3 flex-1">
                                                <div className="text-gray-400 cursor-grab active:cursor-grabbing">
                                                    <GripVertical size={20} />
                                                </div>
                                                <div className="flex-1">
                                                    <p className="font-semibold text-app-text text-sm flex items-center gap-2">
                                                        {field.label} {field.required && <span className="text-red-500">*</span>}
                                                        <button onClick={() => handleEditStart(field)} className="text-gray-400 hover:text-black transition-colors" title="Edit Field">
                                                            <Pencil size={14} />
                                                        </button>
                                                    </p>
                                                    <p className="text-xs text-app-text-tertiary mt-0.5 capitalize">
                                                        Type: {field.type} {field.system ? '• System Field' : '• Custom Field'} {!field.required && '• Optional'}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {!isCriticalSystem && (
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleFieldRequired(field.id)}
                                                        className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors ${field.required ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100' : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'}`}
                                                        title="Toggle Required/Optional"
                                                    >
                                                        {field.required ? 'Required' : 'Optional'}
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => moveFieldUp(index)}
                                                    disabled={index === 0}
                                                    className="text-gray-400 hover:text-black hover:bg-gray-200 p-2 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400"
                                                    title="Move Up"
                                                >
                                                    <ArrowUp size={16} />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => moveFieldDown(index)}
                                                    disabled={index === fields.length - 1}
                                                    className="text-gray-400 hover:text-black hover:bg-gray-200 p-2 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-gray-400"
                                                    title="Move Down"
                                                >
                                                    <ArrowDown size={16} />
                                                </button>
                                                {!field.system && (
                                                    <button
                                                        type="button"
                                                        onClick={() => removeField(field.id)}
                                                        className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors ml-1"
                                                        title="Remove Field"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {!showAddField ? (
                        <button
                            onClick={() => setShowAddField(true)}
                            className="flex items-center gap-2 text-sm font-semibold text-black hover:text-gray-700 transition-colors py-2"
                        >
                            <Plus size={18} /> Add Custom Field
                        </button>
                    ) : (
                        <form onSubmit={handleAddField} className="bg-gray-50 border border-gray-200 p-5 rounded-xl space-y-4 mt-4">
                            <h4 className="font-semibold text-sm text-app-text">New Custom Field</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold uppercase text-gray-500 mb-1.5 ml-1 tracking-wider">Field Label</label>
                                    <input
                                        type="text"
                                        value={newFieldLabel}
                                        onChange={(e) => setNewFieldLabel(e.target.value)}
                                        className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-black outline-none text-sm"
                                        placeholder="e.g., Father's Name"
                                        autoFocus
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase text-gray-500 mb-1.5 ml-1 tracking-wider">Input Type</label>
                                    <select
                                        value={newFieldType}
                                        onChange={(e) => setNewFieldType(e.target.value)}
                                        className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-black outline-none text-sm"
                                    >
                                        <option value="text">Short Text</option>
                                        <option value="tel">Phone Number</option>
                                        <option value="email">Email</option>
                                        <option value="number">Number</option>
                                    </select>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="reqCheck"
                                    checked={newFieldRequired}
                                    onChange={(e) => setNewFieldRequired(e.target.checked)}
                                    className="w-4 h-4 text-black focus:ring-black rounded"
                                />
                                <label htmlFor="reqCheck" className="text-sm text-app-text font-medium cursor-pointer">Make this field required</label>
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button
                                    type="submit"
                                    className="bg-black text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-gray-800 transition-colors"
                                >
                                    Add Field
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowAddField(false)}
                                    className="text-gray-500 hover:bg-gray-200 px-5 py-2 rounded-lg text-sm font-semibold transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    )}

                    <div className="flex justify-end pt-6 border-t border-gray-100 mt-6">
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="flex items-center justify-center gap-2 bg-black text-white px-8 py-3.5 rounded-xl font-bold hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-black/10 active:scale-[0.98]"
                        >
                            {isSaving ? 'Saving...' : 'Save Form'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function Settings() {
    const isQuizOnly = localStorage.getItem('isQuizOnly') === 'true';

    return (
        <Layout title="Settings">
            <div className="max-w-4xl mx-auto">
                <ProfileSection />
                
                {!isQuizOnly && (
                    <>
                        <CoachingConfigSection />
                        <RegistrationFormBuilder />
                    </>
                )}

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
