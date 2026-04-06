import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { School, Phone, Mail, MapPin, UserPlus, CheckCircle, X, Star, ExternalLink, Trophy, ShoppingBag, HelpCircle, ChevronDown, Instagram, Youtube } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const API_URL = import.meta.env.PROD ? '/api' : (import.meta.env.VITE_API_URL || 'http://localhost:3001/api');

interface PublicBatch { id: string; name: string; subject: string | null; className: string | null; feeAmount: number | null; timeSlot: string | null; }
interface PublicInstitute { id: string; name: string; aboutUs: string; showFees: boolean; batches: PublicBatch[]; websiteConfig: any; }

export default function PublicInstituteProfile() {
    const { slug } = useParams();
    const [institute, setInstitute] = useState<PublicInstitute | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isEnrollOpen, setIsEnrollOpen] = useState(false);
    const [selectedBatchId, setSelectedBatchId] = useState('');
    const [studentName, setStudentName] = useState('');
    const [parentName, setParentName] = useState('');
    const [parentPhone, setParentPhone] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [openFaq, setOpenFaq] = useState<number | null>(null);

    useEffect(() => {
        const fetchProfile = async () => {
            try { const res = await axios.get(`${API_URL}/public/i/${slug}`); setInstitute(res.data); } catch (err: any) { setError(err.response?.status === 404 ? 'Page Not Found.' : 'Failed to load.'); } finally { setIsLoading(false); }
        };
        fetchProfile();
    }, [slug]);

    const handleEnroll = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!studentName || !parentName || !parentPhone) return;
        setIsSubmitting(true);
        try {
            await axios.post(`${API_URL}/public/i/${slug}/lead`, { studentName, parentName, parentPhone, batchInterestId: selectedBatchId || undefined });
            setSuccessMsg('Inquiry submitted! We will contact you soon.');
            setTimeout(() => { setIsEnrollOpen(false); setSuccessMsg(null); setStudentName(''); setParentName(''); setParentPhone(''); }, 3000);
        } catch (err: any) { alert(err.response?.data?.error || 'Failed'); } finally { setIsSubmitting(false); }
    };

    if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><School className="w-12 h-12 text-gray-300 animate-pulse" /></div>;
    if (error || !institute) return <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6"><div className="bg-white p-8 rounded-3xl shadow-sm border max-w-md w-full text-center"><X className="w-8 h-8 text-red-500 mx-auto mb-3" /><h2 className="text-xl font-bold">{error}</h2></div></div>;

    const wc = institute.websiteConfig;
    const sections = wc?.sections?.filter((s: any) => s.enabled) || [];
    const theme = wc?.theme || { primaryColor: '#4F46E5', darkMode: false };
    const pc = theme.primaryColor || '#4F46E5';
    const dark = theme.darkMode;
    const bgBase = dark ? 'bg-gray-950 text-white' : 'bg-[#F8FAFC] text-gray-900';
    const cardBg = dark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-100';

    // Fallback to simple layout if no websiteConfig
    if (!wc || sections.length === 0) {
        return (
            <>
                {renderFallback(institute, pc, () => setIsEnrollOpen(true))}
                {/* Enroll Modal reused from main component */}
                <AnimatePresence>
                    {isEnrollOpen && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex flex-col justify-end md:justify-center items-center p-0 md:p-4">
                            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className="bg-white w-full max-w-lg rounded-t-3xl md:rounded-3xl shadow-2xl overflow-hidden text-gray-900">
                                <div className="p-6 border-b border-gray-100 flex justify-between items-center" style={{ backgroundColor: `${pc}08` }}>
                                    <div><h3 className="text-xl font-bold">Request Admission</h3></div>
                                    <button onClick={() => setIsEnrollOpen(false)} className="p-2 hover:bg-gray-200 rounded-full"><X className="w-5 h-5 text-gray-500" /></button>
                                </div>
                                <div className="p-6">
                                    {successMsg ? (
                                        <div className="py-12 text-center"><CheckCircle className="w-16 h-16 mx-auto mb-4" style={{ color: pc }} /><h3 className="text-xl font-bold">Success!</h3><p className="text-gray-500 mt-2">{successMsg}</p></div>
                                    ) : (
                                        <form onSubmit={handleEnroll} className="space-y-4">
                                            <div className="space-y-1"><label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Student Name</label><input required type="text" value={studentName} onChange={e => setStudentName(e.target.value)} placeholder="e.g. Rahul Sharma" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black font-medium" /></div>
                                            <div className="space-y-1"><label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Parent Name</label><input required type="text" value={parentName} onChange={e => setParentName(e.target.value)} placeholder="e.g. Ramesh Sharma" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black font-medium" /></div>
                                            <div className="space-y-1"><label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Parent WhatsApp</label><input required type="tel" value={parentPhone} onChange={e => setParentPhone(e.target.value)} placeholder="9876543210" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-black font-medium" /></div>
                                            <button type="submit" disabled={isSubmitting} className="w-full mt-4 py-3.5 text-white font-bold rounded-xl shadow-lg disabled:opacity-50" style={{ backgroundColor: pc }}>{isSubmitting ? 'Submitting...' : 'Submit Inquiry'}</button>
                                        </form>
                                    )}
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </>
        );
    }

    return (
        <div className={`min-h-screen font-sans ${bgBase}`} style={{ '--pc': pc } as any}>
            {sections.map((section: any) => {
                const d = section.data;
                switch (section.type) {
                    case 'hero': return (
                        <header key={section.id} className="relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${pc}, ${pc}dd)` }}>
                            <div className="max-w-5xl mx-auto px-6 py-20 md:py-28 text-center text-white relative z-10">
                                <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-4 drop-shadow-md">{d.headline || institute.name}</h1>
                                <p className="text-lg md:text-xl opacity-90 max-w-2xl mx-auto mb-8">{d.subheadline || ''}</p>
                                <button onClick={() => setIsEnrollOpen(true)} className="bg-white text-gray-900 px-8 py-4 rounded-full font-bold text-lg shadow-xl hover:shadow-2xl transition-all active:scale-95 inline-flex items-center gap-2">
                                    <UserPlus className="w-5 h-5" /> {d.ctaText || 'Enroll Now'}
                                </button>
                            </div>
                            <div className="absolute inset-0 opacity-10"><div className="absolute -top-1/2 -right-1/4 w-[800px] h-[800px] rounded-full bg-white"></div><div className="absolute -bottom-1/2 -left-1/4 w-[600px] h-[600px] rounded-full bg-white"></div></div>
                        </header>
                    );
                    case 'about': return (
                        <section key={section.id} className="py-16 px-6"><div className="max-w-3xl mx-auto text-center">
                            <h2 className="text-3xl font-bold mb-6">{d.title}</h2>
                            <p className={`text-lg leading-relaxed ${dark ? 'text-gray-400' : 'text-gray-600'}`}>{d.description}</p>
                        </div></section>
                    );
                    case 'batches': return (
                        <section key={section.id} className={`py-16 px-6 ${dark ? 'bg-gray-900' : 'bg-gray-50'}`}><div className="max-w-5xl mx-auto">
                            <h2 className="text-3xl font-bold text-center mb-3">{d.title}</h2>
                            {d.subtitle && <p className={`text-center mb-10 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>{d.subtitle}</p>}
                            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {institute.batches.map(batch => (
                                    <div key={batch.id} className={`${cardBg} rounded-2xl p-6 border shadow-sm hover:shadow-md transition-shadow`}>
                                        <h3 className="text-xl font-bold mb-3">{batch.name}</h3>
                                        {batch.subject && <p className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-600'}`}>{batch.subject}</p>}
                                        {batch.className && <p className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-600'}`}>Class {batch.className}</p>}
                                        {batch.timeSlot && <p className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-600'}`}>{batch.timeSlot}</p>}
                                        {institute.showFees && batch.feeAmount !== null && <p className="text-lg font-bold mt-3" style={{ color: pc }}>₹{batch.feeAmount.toLocaleString('en-IN')}</p>}
                                        <button onClick={() => { setSelectedBatchId(batch.id); setIsEnrollOpen(true); }} className="mt-4 w-full py-2.5 rounded-xl font-bold text-sm transition-colors" style={{ backgroundColor: `${pc}15`, color: pc }}>Select Batch</button>
                                    </div>
                                ))}
                            </div>
                        </div></section>
                    );
                    case 'results': return (
                        <section key={section.id} className="py-16 px-6"><div className="max-w-4xl mx-auto text-center">
                            <Trophy className="w-10 h-10 mx-auto mb-4" style={{ color: pc }} />
                            <h2 className="text-3xl font-bold mb-3">{d.title}</h2>
                            {d.subtitle && <p className={`mb-10 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>{d.subtitle}</p>}
                            <div className="grid md:grid-cols-2 gap-6">
                                {(d.items || []).map((item: any, i: number) => (
                                    <div key={i} className={`${cardBg} rounded-2xl p-6 border shadow-sm`}>
                                        <p className="text-sm font-bold uppercase tracking-widest mb-2" style={{ color: pc }}>{item.year}</p>
                                        <p className="text-xl font-bold mb-2">{item.stat}</p>
                                        {item.highlight && <p className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>{item.highlight}</p>}
                                    </div>
                                ))}
                            </div>
                        </div></section>
                    );
                    case 'courses': return (
                        <section key={section.id} className={`py-16 px-6 ${dark ? 'bg-gray-900' : 'bg-gray-50'}`}><div className="max-w-5xl mx-auto">
                            <ShoppingBag className="w-10 h-10 mx-auto mb-4" style={{ color: pc }} />
                            <h2 className="text-3xl font-bold text-center mb-3">{d.title}</h2>
                            {d.subtitle && <p className={`text-center mb-10 ${dark ? 'text-gray-400' : 'text-gray-500'}`}>{d.subtitle}</p>}
                            <div className="grid md:grid-cols-2 gap-6">
                                {(d.items || []).map((course: any, i: number) => (
                                    <div key={i} className={`${cardBg} rounded-2xl p-6 border shadow-sm`}>
                                        <h3 className="text-xl font-bold mb-2">{course.name}</h3>
                                        <div className="flex items-center gap-3 mb-3">
                                            {course.price && <span className="text-lg font-bold" style={{ color: pc }}>{course.price}</span>}
                                            {course.duration && <span className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>• {course.duration}</span>}
                                        </div>
                                        {course.description && <p className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-600'}`}>{course.description}</p>}
                                        <button onClick={() => setIsEnrollOpen(true)} className="mt-4 w-full py-2.5 rounded-xl font-bold text-sm text-white" style={{ backgroundColor: pc }}>Inquire Now</button>
                                    </div>
                                ))}
                            </div>
                        </div></section>
                    );
                    case 'testimonials': return (
                        <section key={section.id} className="py-16 px-6"><div className="max-w-4xl mx-auto text-center">
                            <h2 className="text-3xl font-bold mb-10">{d.title}</h2>
                            <div className="grid md:grid-cols-2 gap-6">
                                {(d.items || []).map((t: any, i: number) => (
                                    <div key={i} className={`${cardBg} rounded-2xl p-6 border shadow-sm text-left`}>
                                        <div className="flex gap-1 mb-3">{[1,2,3,4,5].map(s => <Star key={s} className="w-4 h-4" fill={s <= (t.rating || 5) ? '#FBBF24' : 'none'} stroke={s <= (t.rating || 5) ? '#FBBF24' : '#D1D5DB'} />)}</div>
                                        <p className={`text-sm italic mb-4 ${dark ? 'text-gray-300' : 'text-gray-600'}`}>"{t.text}"</p>
                                        <p className="font-bold text-sm">{t.name}</p>
                                    </div>
                                ))}
                            </div>
                        </div></section>
                    );
                    case 'gallery': return (
                        <section key={section.id} className={`py-16 px-6 ${dark ? 'bg-gray-900' : 'bg-gray-50'}`}><div className="max-w-5xl mx-auto">
                            <h2 className="text-3xl font-bold text-center mb-10">{d.title}</h2>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                {(d.images || []).map((img: any, i: number) => (
                                    <div key={i} className="rounded-2xl overflow-hidden aspect-video bg-gray-200">
                                        {img.url && <img src={img.url} alt={img.caption || ''} className="w-full h-full object-cover" />}
                                    </div>
                                ))}
                            </div>
                        </div></section>
                    );
                    case 'contact': return (
                        <section key={section.id} className="py-16 px-6"><div className="max-w-3xl mx-auto text-center">
                            <h2 className="text-3xl font-bold mb-8">{d.title}</h2>
                            <div className={`${cardBg} rounded-2xl p-8 border shadow-sm space-y-4`}>
                                {d.phone && <div className="flex items-center justify-center gap-3"><Phone className="w-5 h-5" style={{ color: pc }} /><a href={`tel:${d.phone}`} className="font-medium">{d.phone}</a></div>}
                                {d.email && <div className="flex items-center justify-center gap-3"><Mail className="w-5 h-5" style={{ color: pc }} /><a href={`mailto:${d.email}`} className="font-medium">{d.email}</a></div>}
                                {d.address && <div className="flex items-center justify-center gap-3"><MapPin className="w-5 h-5" style={{ color: pc }} /><span className="font-medium">{d.address}</span></div>}
                                {(d.whatsapp || d.instagram || d.youtube || d.maps) && (
                                    <div className="flex items-center justify-center gap-4 pt-4 border-t border-gray-200">
                                        {d.whatsapp && <a href={d.whatsapp} target="_blank" rel="noopener noreferrer" className="p-3 rounded-full hover:opacity-80 transition-opacity" style={{ backgroundColor: `${pc}15`, color: pc }}><Phone className="w-5 h-5" /></a>}
                                        {d.instagram && <a href={d.instagram} target="_blank" rel="noopener noreferrer" className="p-3 rounded-full hover:opacity-80 transition-opacity" style={{ backgroundColor: `${pc}15`, color: pc }}><Instagram className="w-5 h-5" /></a>}
                                        {d.youtube && <a href={d.youtube} target="_blank" rel="noopener noreferrer" className="p-3 rounded-full hover:opacity-80 transition-opacity" style={{ backgroundColor: `${pc}15`, color: pc }}><Youtube className="w-5 h-5" /></a>}
                                        {d.maps && <a href={d.maps} target="_blank" rel="noopener noreferrer" className="p-3 rounded-full hover:opacity-80 transition-opacity" style={{ backgroundColor: `${pc}15`, color: pc }}><MapPin className="w-5 h-5" /></a>}
                                    </div>
                                )}
                            </div>
                        </div></section>
                    );
                    case 'faq': return (
                        <section key={section.id} className={`py-16 px-6 ${dark ? 'bg-gray-900' : 'bg-gray-50'}`}><div className="max-w-3xl mx-auto">
                            <HelpCircle className="w-10 h-10 mx-auto mb-4" style={{ color: pc }} />
                            <h2 className="text-3xl font-bold text-center mb-8">{d.title}</h2>
                            <div className="space-y-3">
                                {(d.items || []).map((item: any, i: number) => (
                                    <div key={i} className={`${cardBg} rounded-xl border overflow-hidden`}>
                                        <button onClick={() => setOpenFaq(openFaq === i ? null : i)} className="w-full flex items-center justify-between px-6 py-4 text-left font-bold text-sm">
                                            {item.q}
                                            <ChevronDown className={`w-4 h-4 transition-transform ${openFaq === i ? 'rotate-180' : ''}`} />
                                        </button>
                                        <AnimatePresence>
                                            {openFaq === i && (
                                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="px-6 pb-4">
                                                    <p className={`text-sm ${dark ? 'text-gray-400' : 'text-gray-600'}`}>{item.a}</p>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                ))}
                            </div>
                        </div></section>
                    );
                    case 'links': return (
                        <section key={section.id} className="py-16 px-6"><div className="max-w-md mx-auto text-center">
                            <h2 className="text-3xl font-bold mb-8">{d.title}</h2>
                            <div className="space-y-3">
                                {(d.items || []).map((link: any, i: number) => (
                                    <a key={i} href={link.url} target="_blank" rel="noopener noreferrer" className={`${cardBg} w-full block py-4 px-6 rounded-xl border font-bold text-sm hover:shadow-md transition-shadow flex items-center justify-between`}>
                                        {link.label} <ExternalLink className="w-4 h-4 opacity-50" />
                                    </a>
                                ))}
                            </div>
                        </div></section>
                    );
                    default: return null;
                }
            })}

            {/* Floating CTA */}
            <div className="fixed bottom-6 right-6 z-40">
                <button onClick={() => setIsEnrollOpen(true)} className="px-6 py-3 rounded-full font-bold text-white shadow-xl hover:shadow-2xl transition-all active:scale-95 flex items-center gap-2" style={{ backgroundColor: pc }}>
                    <UserPlus className="w-5 h-5" /> Enroll Now
                </button>
            </div>

            {/* Enroll Modal */}
            <AnimatePresence>
                {isEnrollOpen && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex flex-col justify-end md:justify-center items-center p-0 md:p-4">
                        <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className="bg-white w-full max-w-lg rounded-t-3xl md:rounded-3xl shadow-2xl overflow-hidden text-gray-900">
                            <div className="p-6 border-b border-gray-100 flex justify-between items-center" style={{ backgroundColor: `${pc}08` }}>
                                <div><h3 className="text-xl font-bold">Request Admission</h3><p className="text-xs text-gray-500 uppercase tracking-widest mt-1 font-bold">Get Started Today</p></div>
                                <button onClick={() => setIsEnrollOpen(false)} className="p-2 hover:bg-gray-200 rounded-full"><X className="w-5 h-5 text-gray-500" /></button>
                            </div>
                            <div className="p-6">
                                {successMsg ? (
                                    <div className="py-12 text-center"><CheckCircle className="w-16 h-16 mx-auto mb-4" style={{ color: pc }} /><h3 className="text-xl font-bold">Success!</h3><p className="text-gray-500 mt-2">{successMsg}</p></div>
                                ) : (
                                    <form onSubmit={handleEnroll} className="space-y-4">
                                        <div className="space-y-1"><label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Student Name</label><input required type="text" value={studentName} onChange={e => setStudentName(e.target.value)} placeholder="e.g. Rahul Sharma" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:bg-white focus:outline-none focus:ring-2 focus:ring-black font-medium" /></div>
                                        <div className="space-y-1"><label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Parent Name</label><input required type="text" value={parentName} onChange={e => setParentName(e.target.value)} placeholder="e.g. Ramesh Sharma" className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:bg-white focus:outline-none focus:ring-2 focus:ring-black font-medium" /></div>
                                        <div className="space-y-1"><label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Parent WhatsApp</label><div className="flex bg-gray-50 border border-gray-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-black"><div className="px-4 py-3 bg-gray-100 border-r border-gray-200 text-gray-500 font-bold flex items-center gap-2"><Phone className="w-4 h-4" /> +91</div><input required type="tel" value={parentPhone} onChange={e => setParentPhone(e.target.value)} placeholder="9876543210" className="w-full bg-transparent px-4 py-3 focus:outline-none font-medium" /></div></div>
                                        {institute.batches.length > 0 && (
                                            <div className="space-y-1"><label className="text-xs font-bold text-gray-500 uppercase tracking-widest">Interested Batch (Optional)</label><select value={selectedBatchId} onChange={e => setSelectedBatchId(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 focus:bg-white focus:outline-none focus:ring-2 focus:ring-black text-sm font-medium"><option value="">-- Not sure yet --</option>{institute.batches.map(b => <option key={b.id} value={b.id}>{b.name} {b.subject ? `(${b.subject})` : ''}</option>)}</select></div>
                                        )}
                                        <button type="submit" disabled={isSubmitting} className="w-full mt-4 py-3.5 text-white font-bold rounded-xl shadow-lg active:scale-95 transition-transform disabled:opacity-50 flex justify-center items-center gap-2" style={{ backgroundColor: pc }}>{isSubmitting ? 'Submitting...' : 'Submit Inquiry'}</button>
                                    </form>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ==================== FALLBACK (no websiteConfig) ====================
function renderFallback(institute: PublicInstitute, pc: string, openEnroll: () => void) {
    return (
        <div className="min-h-screen bg-[#F8FAFC] font-sans pb-20">
            <header style={{ background: `linear-gradient(135deg, ${pc}, ${pc}dd)` }}>
                <div className="max-w-4xl mx-auto px-6 py-16 text-center text-white">
                    <School className="w-16 h-16 mx-auto mb-4 opacity-80" />
                    <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4">{institute.name}</h1>
                    <p className="text-lg opacity-90 max-w-2xl mx-auto">{institute.aboutUs}</p>
                    <button onClick={openEnroll} className="mt-8 bg-white text-gray-900 px-8 py-3.5 rounded-full font-bold shadow-lg hover:shadow-2xl transition-all active:scale-95 inline-flex items-center gap-2"><UserPlus className="w-5 h-5" /> Request Admission</button>
                </div>
            </header>
            <main className="max-w-4xl mx-auto px-6 py-12">
                <h2 className="text-2xl font-bold mb-6">Available Batches</h2>
                <div className="grid md:grid-cols-2 gap-6">
                    {institute.batches.map(batch => (
                        <div key={batch.id} className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
                            <h3 className="text-xl font-bold mb-2">{batch.name}</h3>
                            {batch.subject && <p className="text-gray-600 text-sm">{batch.subject}</p>}
                            {institute.showFees && batch.feeAmount !== null && <p className="text-lg font-bold mt-3" style={{ color: pc }}>₹{batch.feeAmount.toLocaleString('en-IN')}</p>}
                            <button onClick={openEnroll} className="mt-4 w-full py-2.5 rounded-xl font-bold text-sm" style={{ backgroundColor: `${pc}15`, color: pc }}>Select</button>
                        </div>
                    ))}
                </div>
            </main>
        </div>
    );
}
