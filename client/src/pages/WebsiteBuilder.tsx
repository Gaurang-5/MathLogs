import { useState, useEffect } from 'react';
import axios from 'axios';
import { 
    Save, Eye, ArrowLeft, Plus, Trash2, GripVertical, ChevronDown, ChevronUp,
    Image, Type, BookOpen, Trophy, ShoppingBag, MessageSquare, Camera, Phone, 
    HelpCircle, Link2, Palette, Layout, Sparkles, X, ExternalLink, Copy, CheckCircle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const API_URL = import.meta.env.PROD ? '/api' : (import.meta.env.VITE_API_URL || 'http://localhost:3001/api');

// ==================== TYPES ====================
interface WebsiteSection {
    id: string;
    type: string;
    enabled: boolean;
    data: any;
}

interface WebsiteConfig {
    theme: {
        primaryColor: string;
        layout: string;
        darkMode: boolean;
        showFees: boolean;
        font: string;
    };
    logo: string;
    sections: WebsiteSection[];
}

// ==================== TEMPLATES ====================
const SECTION_TYPES = [
    { type: 'hero', label: 'Hero Banner', icon: Image, description: 'Big banner with headline and call-to-action' },
    { type: 'about', label: 'About Us', icon: Type, description: 'Tell parents about your institute' },
    { type: 'batches', label: 'Batches', icon: BookOpen, description: 'Auto-populated from your batch data' },
    { type: 'results', label: 'Past Results', icon: Trophy, description: 'Showcase your past year achievements' },
    { type: 'courses', label: 'Courses', icon: ShoppingBag, description: 'List custom courses or packages for sale' },
    { type: 'testimonials', label: 'Testimonials', icon: MessageSquare, description: 'Student and parent testimonials' },
    { type: 'gallery', label: 'Photo Gallery', icon: Camera, description: 'Show photos of your institute' },
    { type: 'contact', label: 'Contact Info', icon: Phone, description: 'Phone, email, address, social links' },
    { type: 'faq', label: 'FAQ', icon: HelpCircle, description: 'Frequently asked questions' },
    { type: 'links', label: 'Custom Links', icon: Link2, description: 'Add WhatsApp, YouTube, Instagram links' },
];

const defaultSectionData: Record<string, () => any> = {
    hero: () => ({ headline: 'Welcome to Our Institute', subheadline: 'Empowering students to achieve their best.', ctaText: 'Enroll Now', backgroundImage: '' }),
    about: () => ({ title: 'About Us', description: 'We are dedicated to providing quality education and helping students excel in their academic journey.', image: '' }),
    batches: () => ({ title: 'Our Batches', subtitle: 'Choose the right batch for you' }),
    results: () => ({ title: 'Our Results', subtitle: 'Proven track record of excellence', items: [{ year: '2025', stat: '95% students scored above 85%', highlight: '12 students in Top 100' }, { year: '2024', stat: '92% students scored above 80%', highlight: '8 students in Top 100' }] }),
    courses: () => ({ title: 'Our Courses', subtitle: 'Special courses and crash programs', items: [{ name: 'JEE Crash Course', price: '₹5,000', duration: '3 Months', description: 'Intensive preparation for JEE Mains', features: ['Daily 3-hour sessions', 'Weekly mock tests', 'Doubt clearing'] }] }),
    testimonials: () => ({ title: 'What Parents Say', items: [{ name: 'Rahul\'s Parent', text: 'My child\'s marks improved significantly after joining. The teaching quality is excellent!', rating: 5 }] }),
    gallery: () => ({ title: 'Our Institute', images: [] }),
    contact: () => ({ title: 'Contact Us', phone: '', email: '', address: '', whatsapp: '', instagram: '', youtube: '', maps: '' }),
    faq: () => ({ title: 'Frequently Asked Questions', items: [{ q: 'What are the batch timings?', a: 'We offer flexible timings — morning, afternoon, and evening batches.' }, { q: 'Is there a trial class?', a: 'Yes! We offer a free demo class before you enroll.' }] }),
    links: () => ({ title: 'Quick Links', items: [{ label: 'WhatsApp Us', url: '', icon: 'whatsapp' }, { label: 'Watch on YouTube', url: '', icon: 'youtube' }] }),
};

const PREBUILT_TEMPLATES: Record<string, { name: string; desc: string; sections: string[] }> = {
    academy: { name: '🏫 Modern Academy', desc: 'Hero, About, Batches, Results, Testimonials, Contact', sections: ['hero', 'about', 'batches', 'results', 'testimonials', 'contact'] },
    seller: { name: '🛒 Course Seller', desc: 'Hero, Courses, Results, Testimonials, FAQ, Contact', sections: ['hero', 'courses', 'results', 'testimonials', 'faq', 'contact'] },
    minimal: { name: '✨ Minimal', desc: 'Hero, Batches, Contact', sections: ['hero', 'batches', 'contact'] },
    full: { name: '🚀 Everything', desc: 'All sections included', sections: ['hero', 'about', 'batches', 'results', 'courses', 'testimonials', 'gallery', 'faq', 'links', 'contact'] },
};

const COLORS = ['#4F46E5', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#000000', '#6366F1', '#14B8A6'];

// ==================== SECTION EDITORS ====================
function HeroEditor({ data, onChange }: { data: any; onChange: (d: any) => void }) {
    return (
        <div className="space-y-3">
            <input value={data.headline} onChange={e => onChange({ ...data, headline: e.target.value })} placeholder="Headline" className="w-full border border-gray-200 rounded-xl px-4 py-2.5 font-bold focus:outline-none focus:ring-2 focus:ring-black" />
            <input value={data.subheadline} onChange={e => onChange({ ...data, subheadline: e.target.value })} placeholder="Subheadline" className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black" />
            <input value={data.ctaText} onChange={e => onChange({ ...data, ctaText: e.target.value })} placeholder="Button Text (e.g. Enroll Now)" className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black" />
        </div>
    );
}

function AboutEditor({ data, onChange }: { data: any; onChange: (d: any) => void }) {
    return (
        <div className="space-y-3">
            <input value={data.title} onChange={e => onChange({ ...data, title: e.target.value })} placeholder="Section Title" className="w-full border border-gray-200 rounded-xl px-4 py-2.5 font-bold focus:outline-none focus:ring-2 focus:ring-black" />
            <textarea value={data.description} onChange={e => onChange({ ...data, description: e.target.value })} rows={3} placeholder="Describe your institute..." className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black" />
        </div>
    );
}

function BatchesEditor({ data, onChange }: { data: any; onChange: (d: any) => void }) {
    return (
        <div className="space-y-3">
            <input value={data.title} onChange={e => onChange({ ...data, title: e.target.value })} placeholder="Section Title" className="w-full border border-gray-200 rounded-xl px-4 py-2.5 font-bold focus:outline-none focus:ring-2 focus:ring-black" />
            <input value={data.subtitle || ''} onChange={e => onChange({ ...data, subtitle: e.target.value })} placeholder="Subtitle" className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black" />
            <p className="text-xs text-gray-400 italic">Batches are auto-populated from your real batch data.</p>
        </div>
    );
}

function ListItemEditor({ items, onChange, fields }: { items: any[]; onChange: (items: any[]) => void; fields: { key: string; label: string; multiline?: boolean }[] }) {
    const addItem = () => {
        const blank: any = {};
        fields.forEach(f => blank[f.key] = '');
        onChange([...items, blank]);
    };
    const removeItem = (i: number) => onChange(items.filter((_, idx) => idx !== i));
    const updateItem = (i: number, key: string, val: string) => {
        const copy = [...items];
        copy[i] = { ...copy[i], [key]: val };
        onChange(copy);
    };

    return (
        <div className="space-y-3">
            {items.map((item, i) => (
                <div key={i} className="bg-gray-50 p-3 rounded-xl border border-gray-200 space-y-2 relative">
                    <button onClick={() => removeItem(i)} className="absolute top-2 right-2 p-1 text-red-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                    {fields.map(f => f.multiline ? (
                        <textarea key={f.key} value={item[f.key] || ''} onChange={e => updateItem(i, f.key, e.target.value)} placeholder={f.label} rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-black" />
                    ) : (
                        <input key={f.key} value={item[f.key] || ''} onChange={e => updateItem(i, f.key, e.target.value)} placeholder={f.label} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-black" />
                    ))}
                </div>
            ))}
            <button onClick={addItem} className="text-sm text-indigo-600 font-bold flex items-center gap-1 hover:underline"><Plus className="w-3.5 h-3.5" /> Add Item</button>
        </div>
    );
}

function ResultsEditor({ data, onChange }: { data: any; onChange: (d: any) => void }) {
    return (
        <div className="space-y-3">
            <input value={data.title} onChange={e => onChange({ ...data, title: e.target.value })} placeholder="Section Title" className="w-full border border-gray-200 rounded-xl px-4 py-2.5 font-bold focus:outline-none focus:ring-2 focus:ring-black" />
            <ListItemEditor items={data.items || []} onChange={items => onChange({ ...data, items })} fields={[{ key: 'year', label: 'Year (e.g. 2025)' }, { key: 'stat', label: 'Achievement (e.g. 95% scored above 90%)' }, { key: 'highlight', label: 'Highlight (e.g. 12 in Top 100)' }]} />
        </div>
    );
}

function CoursesEditor({ data, onChange }: { data: any; onChange: (d: any) => void }) {
    return (
        <div className="space-y-3">
            <input value={data.title} onChange={e => onChange({ ...data, title: e.target.value })} placeholder="Section Title" className="w-full border border-gray-200 rounded-xl px-4 py-2.5 font-bold focus:outline-none focus:ring-2 focus:ring-black" />
            <ListItemEditor items={data.items || []} onChange={items => onChange({ ...data, items })} fields={[{ key: 'name', label: 'Course Name' }, { key: 'price', label: 'Price (e.g. ₹5,000)' }, { key: 'duration', label: 'Duration (e.g. 3 Months)' }, { key: 'description', label: 'Description', multiline: true }]} />
        </div>
    );
}

function TestimonialsEditor({ data, onChange }: { data: any; onChange: (d: any) => void }) {
    return (
        <div className="space-y-3">
            <input value={data.title} onChange={e => onChange({ ...data, title: e.target.value })} placeholder="Section Title" className="w-full border border-gray-200 rounded-xl px-4 py-2.5 font-bold focus:outline-none focus:ring-2 focus:ring-black" />
            <ListItemEditor items={data.items || []} onChange={items => onChange({ ...data, items })} fields={[{ key: 'name', label: 'Name (e.g. Rahul\'s Parent)' }, { key: 'text', label: 'Testimonial', multiline: true }]} />
        </div>
    );
}

function ContactEditor({ data, onChange }: { data: any; onChange: (d: any) => void }) {
    return (
        <div className="space-y-3">
            <input value={data.phone || ''} onChange={e => onChange({ ...data, phone: e.target.value })} placeholder="Phone Number" className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black" />
            <input value={data.email || ''} onChange={e => onChange({ ...data, email: e.target.value })} placeholder="Email Address" className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black" />
            <input value={data.address || ''} onChange={e => onChange({ ...data, address: e.target.value })} placeholder="Address" className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-black" />
            <div className="border-t pt-3 mt-3">
                <p className="text-xs font-bold text-gray-500 uppercase mb-2">Social Links</p>
                <input value={data.whatsapp || ''} onChange={e => onChange({ ...data, whatsapp: e.target.value })} placeholder="WhatsApp Link" className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm mb-2 focus:outline-none focus:ring-1 focus:ring-black" />
                <input value={data.instagram || ''} onChange={e => onChange({ ...data, instagram: e.target.value })} placeholder="Instagram Link" className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm mb-2 focus:outline-none focus:ring-1 focus:ring-black" />
                <input value={data.youtube || ''} onChange={e => onChange({ ...data, youtube: e.target.value })} placeholder="YouTube Link" className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm mb-2 focus:outline-none focus:ring-1 focus:ring-black" />
                <input value={data.maps || ''} onChange={e => onChange({ ...data, maps: e.target.value })} placeholder="Google Maps Link" className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-black" />
            </div>
        </div>
    );
}

function FAQEditor({ data, onChange }: { data: any; onChange: (d: any) => void }) {
    return (
        <div className="space-y-3">
            <input value={data.title} onChange={e => onChange({ ...data, title: e.target.value })} placeholder="Section Title" className="w-full border border-gray-200 rounded-xl px-4 py-2.5 font-bold focus:outline-none focus:ring-2 focus:ring-black" />
            <ListItemEditor items={data.items || []} onChange={items => onChange({ ...data, items })} fields={[{ key: 'q', label: 'Question' }, { key: 'a', label: 'Answer', multiline: true }]} />
        </div>
    );
}

function LinksEditor({ data, onChange }: { data: any; onChange: (d: any) => void }) {
    return (
        <div className="space-y-3">
            <input value={data.title} onChange={e => onChange({ ...data, title: e.target.value })} placeholder="Section Title" className="w-full border border-gray-200 rounded-xl px-4 py-2.5 font-bold focus:outline-none focus:ring-2 focus:ring-black" />
            <ListItemEditor items={data.items || []} onChange={items => onChange({ ...data, items })} fields={[{ key: 'label', label: 'Button Label' }, { key: 'url', label: 'URL' }]} />
        </div>
    );
}

function GalleryEditor({ data, onChange }: { data: any; onChange: (d: any) => void }) {
    return (
        <div className="space-y-3">
            <input value={data.title} onChange={e => onChange({ ...data, title: e.target.value })} placeholder="Section Title" className="w-full border border-gray-200 rounded-xl px-4 py-2.5 font-bold focus:outline-none focus:ring-2 focus:ring-black" />
            <p className="text-xs text-gray-400 italic">Image upload coming soon. For now, paste image URLs.</p>
            <ListItemEditor items={data.images || []} onChange={images => onChange({ ...data, images })} fields={[{ key: 'url', label: 'Image URL' }, { key: 'caption', label: 'Caption (optional)' }]} />
        </div>
    );
}

const EDITORS: Record<string, any> = {
    hero: HeroEditor, about: AboutEditor, batches: BatchesEditor, results: ResultsEditor,
    courses: CoursesEditor, testimonials: TestimonialsEditor, gallery: GalleryEditor,
    contact: ContactEditor, faq: FAQEditor, links: LinksEditor,
};

// ==================== MAIN BUILDER ====================
export default function WebsiteBuilder() {
    const navigate = useNavigate();
    const [config, setConfig] = useState<WebsiteConfig>({
        theme: { primaryColor: '#4F46E5', layout: 'modern', darkMode: false, showFees: true, font: 'Inter' },
        logo: '',
        sections: []
    });
    const [slug, setSlug] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [expandedSection, setExpandedSection] = useState<string | null>(null);
    const [showAddPanel, setShowAddPanel] = useState(false);
    const [showTemplates, setShowTemplates] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const token = localStorage.getItem('token');
                const res = await axios.get(`${API_URL}/institute/slug`, { headers: { Authorization: `Bearer ${token}` } });
                setSlug(res.data.slug || '');
                if (res.data.websiteConfig) {
                    setConfig(res.data.websiteConfig);
                }
            } catch (err) {
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchConfig();
    }, []);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const token = localStorage.getItem('token');
            await axios.put(`${API_URL}/institute/slug`, { websiteConfig: config }, { headers: { Authorization: `Bearer ${token}` } });
            alert('Website saved successfully!');
        } catch (err) {
            alert('Failed to save.');
        } finally {
            setIsSaving(false);
        }
    };

    const addSection = (type: string) => {
        const newSection: WebsiteSection = {
            id: `${type}-${Date.now()}`,
            type,
            enabled: true,
            data: defaultSectionData[type]()
        };
        setConfig(prev => ({ ...prev, sections: [...prev.sections, newSection] }));
        setShowAddPanel(false);
        setExpandedSection(newSection.id);
    };

    const removeSection = (id: string) => {
        setConfig(prev => ({ ...prev, sections: prev.sections.filter(s => s.id !== id) }));
    };

    const updateSectionData = (id: string, data: any) => {
        setConfig(prev => ({
            ...prev,
            sections: prev.sections.map(s => s.id === id ? { ...s, data } : s)
        }));
    };

    const toggleSection = (id: string) => {
        setConfig(prev => ({
            ...prev,
            sections: prev.sections.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s)
        }));
    };

    const moveSection = (id: string, dir: 'up' | 'down') => {
        setConfig(prev => {
            const idx = prev.sections.findIndex(s => s.id === id);
            if ((dir === 'up' && idx === 0) || (dir === 'down' && idx === prev.sections.length - 1)) return prev;
            const newSections = [...prev.sections];
            const swap = dir === 'up' ? idx - 1 : idx + 1;
            [newSections[idx], newSections[swap]] = [newSections[swap], newSections[idx]];
            return { ...prev, sections: newSections };
        });
    };

    const applyTemplate = (key: string) => {
        const template = PREBUILT_TEMPLATES[key];
        const sections = template.sections.map(type => ({
            id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            type,
            enabled: true,
            data: defaultSectionData[type]()
        }));
        setConfig(prev => ({ ...prev, sections }));
        setShowTemplates(false);
    };

    const publicUrl = `${window.location.origin}/i/${slug}`;
    const handleCopy = () => { navigator.clipboard.writeText(publicUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); };

    if (isLoading) {
        return <div className="flex items-center justify-center min-h-screen"><div className="w-8 h-8 border-4 border-gray-200 border-t-black rounded-full animate-spin"></div></div>;
    }

    return (
        <div className="min-h-screen bg-[#F8FAFC] font-sans">
            {/* Top Bar */}
            <header className="sticky top-0 z-30 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/leads')} className="p-2 hover:bg-gray-100 rounded-lg"><ArrowLeft className="w-5 h-5 text-gray-600" /></button>
                    <div>
                        <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2"><Layout className="w-5 h-5 text-indigo-600" /> Website Builder</h1>
                        <p className="text-xs text-gray-500">Customize your public institute page</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {slug && (
                        <div className="hidden md:flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-1.5 border border-gray-200">
                            <code className="text-xs text-gray-600 font-mono truncate max-w-[200px]">{publicUrl}</code>
                            <button onClick={handleCopy} className="p-1 hover:bg-gray-200 rounded">{copied ? <CheckCircle className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5 text-gray-400" />}</button>
                            <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="p-1 hover:bg-gray-200 rounded"><ExternalLink className="w-3.5 h-3.5 text-gray-400" /></a>
                        </div>
                    )}
                    <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-bold hover:bg-gray-200"><Eye className="w-4 h-4" /> Preview</a>
                    <button onClick={handleSave} disabled={isSaving} className="flex items-center gap-2 px-5 py-2 bg-black text-white rounded-xl text-sm font-bold hover:bg-gray-800 disabled:opacity-50"><Save className="w-4 h-4" /> {isSaving ? 'Saving...' : 'Save'}</button>
                </div>
            </header>

            <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
                {/* Theme Controls */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                    <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2"><Palette className="w-5 h-5 text-indigo-600" /> Theme & Style</h3>
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 block">Primary Color</label>
                            <div className="flex gap-2 flex-wrap">
                                {COLORS.map(c => (
                                    <button key={c} onClick={() => setConfig(prev => ({ ...prev, theme: { ...prev.theme, primaryColor: c } }))} className={`w-9 h-9 rounded-full border-2 transition-transform ${config.theme.primaryColor === c ? 'border-black scale-110 shadow-lg' : 'border-gray-200'}`} style={{ backgroundColor: c }} />
                                ))}
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200 cursor-pointer">
                                <input type="checkbox" checked={config.theme.showFees} onChange={e => setConfig(prev => ({ ...prev, theme: { ...prev.theme, showFees: e.target.checked } }))} className="w-4 h-4 rounded" />
                                <span className="text-sm font-medium text-gray-700">Show Fees on Website</span>
                            </label>
                            <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200 cursor-pointer">
                                <input type="checkbox" checked={config.theme.darkMode} onChange={e => setConfig(prev => ({ ...prev, theme: { ...prev.theme, darkMode: e.target.checked } }))} className="w-4 h-4 rounded" />
                                <span className="text-sm font-medium text-gray-700">Dark Mode</span>
                            </label>
                        </div>
                    </div>
                </div>

                {/* Template Selector */}
                {config.sections.length === 0 && (
                    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl border border-indigo-100 p-8 text-center">
                        <Sparkles className="w-10 h-10 text-indigo-400 mx-auto mb-3" />
                        <h3 className="text-xl font-bold text-gray-900">Start with a Template</h3>
                        <p className="text-gray-500 mt-1 mb-6 text-sm">Pick a pre-built layout or build from scratch.</p>
                        <div className="grid md:grid-cols-2 gap-3 max-w-xl mx-auto">
                            {Object.entries(PREBUILT_TEMPLATES).map(([key, tmpl]) => (
                                <button key={key} onClick={() => applyTemplate(key)} className="bg-white p-4 rounded-xl border border-gray-200 text-left hover:border-indigo-300 hover:shadow-md transition-all">
                                    <p className="font-bold text-gray-900">{tmpl.name}</p>
                                    <p className="text-xs text-gray-500 mt-1">{tmpl.desc}</p>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {config.sections.length > 0 && !showTemplates && (
                    <button onClick={() => setShowTemplates(true)} className="text-sm text-indigo-600 font-bold hover:underline flex items-center gap-1"><Sparkles className="w-3.5 h-3.5" /> Switch Template (replaces all sections)</button>
                )}

                {showTemplates && (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-gray-900">Choose Template</h3>
                            <button onClick={() => setShowTemplates(false)} className="p-1 hover:bg-gray-100 rounded"><X className="w-4 h-4" /></button>
                        </div>
                        <div className="grid md:grid-cols-2 gap-3">
                            {Object.entries(PREBUILT_TEMPLATES).map(([key, tmpl]) => (
                                <button key={key} onClick={() => applyTemplate(key)} className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-left hover:border-indigo-300 hover:shadow-md transition-all">
                                    <p className="font-bold text-gray-900">{tmpl.name}</p>
                                    <p className="text-xs text-gray-500 mt-1">{tmpl.desc}</p>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Sections */}
                <div className="space-y-3">
                    {config.sections.map((section, idx) => {
                        const meta = SECTION_TYPES.find(t => t.type === section.type);
                        const Icon = meta?.icon || Type;
                        const EditorComponent = EDITORS[section.type];
                        const isExpanded = expandedSection === section.id;

                        return (
                            <div key={section.id} className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${section.enabled ? 'border-gray-100' : 'border-gray-200 opacity-60'}`}>
                                <div className="flex items-center gap-3 px-5 py-4 cursor-pointer" onClick={() => setExpandedSection(isExpanded ? null : section.id)}>
                                    <GripVertical className="w-4 h-4 text-gray-300 flex-shrink-0" />
                                    <Icon className="w-5 h-5 text-indigo-600 flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-gray-900 text-sm">{meta?.label || section.type}</p>
                                        {!isExpanded && <p className="text-xs text-gray-400 truncate">{meta?.description}</p>}
                                    </div>
                                    <div className="flex items-center gap-1 flex-shrink-0" onClick={e => e.stopPropagation()}>
                                        <button onClick={() => moveSection(section.id, 'up')} disabled={idx === 0} className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-30"><ChevronUp className="w-4 h-4" /></button>
                                        <button onClick={() => moveSection(section.id, 'down')} disabled={idx === config.sections.length - 1} className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-30"><ChevronDown className="w-4 h-4" /></button>
                                        <label className="relative inline-flex items-center cursor-pointer ml-2">
                                            <input type="checkbox" checked={section.enabled} onChange={() => toggleSection(section.id)} className="sr-only peer" />
                                            <div className="w-9 h-5 bg-gray-200 peer-checked:bg-green-500 rounded-full transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full"></div>
                                        </label>
                                        <button onClick={() => removeSection(section.id)} className="p-1.5 hover:bg-red-50 text-red-400 hover:text-red-600 rounded ml-1"><Trash2 className="w-4 h-4" /></button>
                                    </div>
                                </div>
                                {isExpanded && EditorComponent && (
                                    <div className="px-5 pb-5 border-t border-gray-100 pt-4">
                                        <EditorComponent data={section.data} onChange={(d: any) => updateSectionData(section.id, d)} />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Add Section */}
                {!showAddPanel ? (
                    <button onClick={() => setShowAddPanel(true)} className="w-full py-4 border-2 border-dashed border-gray-300 rounded-2xl text-gray-500 font-bold text-sm hover:border-indigo-400 hover:text-indigo-600 transition-colors flex items-center justify-center gap-2">
                        <Plus className="w-5 h-5" /> Add Section
                    </button>
                ) : (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-gray-900">Add Section</h3>
                            <button onClick={() => setShowAddPanel(false)} className="p-1 hover:bg-gray-100 rounded"><X className="w-4 h-4" /></button>
                        </div>
                        <div className="grid md:grid-cols-2 gap-3">
                            {SECTION_TYPES.map(st => {
                                const Icon = st.icon;
                                const alreadyAdded = config.sections.some(s => s.type === st.type);
                                return (
                                    <button key={st.type} onClick={() => !alreadyAdded && addSection(st.type)} disabled={alreadyAdded} className={`flex items-start gap-3 p-4 rounded-xl border text-left transition-all ${alreadyAdded ? 'opacity-40 cursor-not-allowed border-gray-200 bg-gray-50' : 'border-gray-200 hover:border-indigo-300 hover:shadow-md bg-white'}`}>
                                        <Icon className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
                                        <div>
                                            <p className="font-bold text-gray-900 text-sm">{st.label}</p>
                                            <p className="text-xs text-gray-500 mt-0.5">{st.description}</p>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
