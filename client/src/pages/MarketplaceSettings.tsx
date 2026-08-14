import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { Store, Sparkles, MapPin, Phone, MessageCircle, Save, Loader2, Globe, CheckCircle2, User, Building2, BookOpen, ExternalLink, GraduationCap, ArrowRight, Plus, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { GooglePlaceConnectModal } from '../components/GooglePlaceConnectModal';

interface MarketplaceProfileData {
  id: string;
  name: string;
  slug: string;
  teacherName: string;
  phoneNumber?: string;
  publicPhone?: string;
  whatsappPhone?: string;
  city?: string;
  area?: string;
  address?: string;
  tagline?: string;
  aboutUs?: string;
  logoUrl?: string;
  googleMapsUrl?: string;
  subjectsOffered?: string[];
  classesOffered?: string[];
  isPubliclyListed: boolean;
  isExclusive: boolean;
  plan: string;
}

interface LeadInquiry {
  id: string;
  studentName: string;
  phone: string;
  subject?: string;
  classGrade?: string;
  message?: string;
  status: string;
  createdAt: string;
}

const SUBJECT_OPTIONS = [
  'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Science',
  'English', 'Hindi', 'Social Science', 'Commerce', 'Accountancy',
  'Economics', 'Computer Science', 'Spoken English'
];

const CLASS_OPTIONS = [
  'Class 1-5', 'Class 6-8', 'Class 9', 'Class 10',
  'Class 11', 'Class 12', 'JEE/NEET', 'Competitive Exams', 'Graduation'
];

export default function MarketplaceSettings() {
  const [profile, setProfile] = useState<MarketplaceProfileData | null>(null);
  const [leads, setLeads] = useState<LeadInquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'profile' | 'leads'>('profile');
  const [showGoogleModal, setShowGoogleModal] = useState(false);

  // Form Fields
  const [name, setName] = useState('');
  const [teacherName, setTeacherName] = useState('');
  const [publicPhone, setPublicPhone] = useState('');
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [city, setCity] = useState('Muzaffarnagar');
  const [area, setArea] = useState('');
  const [address, setAddress] = useState('');
  const [googleMapsUrl, setGoogleMapsUrl] = useState('');
  const [tagline, setTagline] = useState('');
  const [aboutUs, setAboutUs] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [isPubliclyListed, setIsPubliclyListed] = useState(true);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [customSubjectInput, setCustomSubjectInput] = useState('');
  const [customSubjects, setCustomSubjects] = useState<string[]>([]);

  const isPageOnly = localStorage.getItem('isPageOnly') === 'true';

  useEffect(() => {
    fetchProfileAndLeads();
  }, []);

  const fetchProfileAndLeads = async () => {
    setLoading(true);
    const token = localStorage.getItem('token');
    try {
      // Fetch profile
      const profRes = await fetch('/api/marketplace/admin/profile', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const profData = await profRes.json();

      if (profData.success && profData.data) {
        const p = profData.data;
        setProfile(p);
        setName(p.name || '');
        setTeacherName(p.teacherName || '');
        setPublicPhone(p.publicPhone || p.phoneNumber || '');
        setWhatsappPhone(p.whatsappPhone || p.phoneNumber || '');
        setCity(p.city || '');
        setArea(p.area || '');
        setAddress(p.address || '');
        setGoogleMapsUrl(p.googleMapsUrl || '');
        setTagline(p.tagline || '');
        setAboutUs(p.aboutUs || '');
        setLogoUrl(p.logoUrl || '');
        setIsPubliclyListed(p.isPubliclyListed ?? true);
        setSelectedSubjects(Array.isArray(p.subjectsOffered) ? p.subjectsOffered : []);
        setSelectedClasses(Array.isArray(p.classesOffered) ? p.classesOffered : []);
      }

      // Fetch leads
      const leadsRes = await fetch('/api/marketplace/admin/leads', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const leadsData = await leadsRes.json();
      if (leadsData.success) {
        setLeads(leadsData.data || []);
      }
    } catch (err) {
      console.error('Error fetching marketplace profile & leads:', err);
      toast.error('Failed to load marketplace settings');
    } finally {
      setLoading(false);
    }
  };

  const toggleSubject = (sub: string) => {
    setSelectedSubjects(prev =>
      prev.includes(sub) ? prev.filter(s => s !== sub) : [...prev, sub]
    );
  };

  const addCustomSubject = () => {
    const trimmed = customSubjectInput.trim();
    if (!trimmed) return;
    if ([...SUBJECT_OPTIONS, ...customSubjects].some(s => s.toLowerCase() === trimmed.toLowerCase())) {
      setCustomSubjectInput('');
      return;
    }
    setCustomSubjects(prev => [...prev, trimmed]);
    setSelectedSubjects(prev => [...prev, trimmed]);
    setCustomSubjectInput('');
  };

  const toggleClass = (cls: string) => {
    setSelectedClasses(prev =>
      prev.includes(cls) ? prev.filter(c => c !== cls) : [...prev, cls]
    );
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const token = localStorage.getItem('token');
    try {
      const res = await fetch('/api/marketplace/admin/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name,
          teacherName,
          publicPhone,
          whatsappPhone,
          city,
          area,
          address,
          googleMapsUrl,
          tagline,
          aboutUs,
          logoUrl,
          subjectsOffered: selectedSubjects,
          classesOffered: selectedClasses,
          isPubliclyListed
        })
      });

      const data = await res.json();
      if (data.success) {
        toast.success('Marketplace profile saved successfully!');
        setProfile(data.data);
      } else {
        toast.error(data.message || 'Failed to update profile');
      }
    } catch (err) {
      toast.error('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Layout title="Marketplace Listing">
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-neutral-400">
          <Loader2 className="w-8 h-8 animate-spin text-neutral-900 mb-3" />
          <p className="text-sm font-semibold">Loading marketplace profile...</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Marketplace Listing">
      <div className="max-w-5xl mx-auto space-y-8 pb-12 font-sans text-neutral-900">
        
        {/* Banner for Page-Only / Free Listings */}
        {isPageOnly && (
          <div className="bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 text-white rounded-3xl p-6 sm:p-8 shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden">
            <div className="space-y-1.5 relative z-10 max-w-xl">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30 text-xs font-bold mb-1">
                <Sparkles className="w-3.5 h-3.5 fill-amber-400" />
                <span>Free Coaching Listing Account</span>
              </div>
              <h2 className="text-2xl font-extrabold tracking-tight">Upgrade to MathLogs ERP</h2>
              <p className="text-xs text-neutral-300 font-medium leading-relaxed">
                Unlock complete coaching management: student tracking, digital attendance, online quizzes, fee collection & automated WhatsApp parent notifications.
              </p>
            </div>

            <Link
              to="/billing"
              className="relative z-10 px-6 py-3 bg-amber-400 hover:bg-amber-300 text-neutral-900 font-bold text-xs rounded-full transition-transform hover:scale-105 shadow-md flex items-center gap-2 shrink-0"
            >
              <span>Explore MathLogs Plans</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}

        {/* Top Header Card */}
        <div className="bg-white rounded-3xl border border-neutral-200/80 p-6 sm:p-8 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-neutral-900 text-white flex items-center justify-center font-extrabold text-xl shadow-xs">
              <Store className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-extrabold text-[#1A1F36] tracking-tight">Marketplace Page & Leads</h1>
              </div>
              <p className="text-xs text-neutral-500 font-medium mt-0.5">
                Manage your public coaching profile, subjects offered, and view student inquiries.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <button
              type="button"
              onClick={() => setShowGoogleModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-bold rounded-full transition-colors border border-amber-200 shadow-2xs"
            >
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
              <span>Connect Google Reviews</span>
            </button>

            {profile?.slug && (
              <Link
                to={`/coaching/${profile.slug}`}
                target="_blank"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 text-xs font-bold rounded-full transition-colors border border-neutral-200/80"
              >
                <span>View Public Page</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-3 border-b border-neutral-200/80 pb-3">
          <button
            onClick={() => setActiveTab('profile')}
            className={`px-5 py-2.5 rounded-full text-xs font-bold transition-all ${
              activeTab === 'profile'
                ? 'bg-neutral-900 text-white shadow-xs'
                : 'bg-white text-neutral-600 hover:bg-neutral-100 border border-neutral-200/80'
            }`}
          >
            Coaching Profile Settings
          </button>

          <button
            onClick={() => setActiveTab('leads')}
            className={`px-5 py-2.5 rounded-full text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'leads'
                ? 'bg-neutral-900 text-white shadow-xs'
                : 'bg-white text-neutral-600 hover:bg-neutral-100 border border-neutral-200/80'
            }`}
          >
            <span>Student Inquiries & Leads</span>
            {leads.length > 0 && (
              <span className={`px-2 py-0.5 text-[10px] rounded-full font-extrabold ${
                activeTab === 'leads' ? 'bg-amber-400 text-neutral-900' : 'bg-neutral-900 text-white'
              }`}>
                {leads.length}
              </span>
            )}
          </button>
        </div>

        {/* TAB 1: Profile Settings Form */}
        {activeTab === 'profile' && (
          <form onSubmit={handleSaveProfile} className="space-y-6">
            {/* Visibility Toggle */}
            <div className="bg-white rounded-3xl p-6 border border-neutral-200/80 shadow-xs flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Globe className="w-5 h-5 text-neutral-700" />
                <div>
                  <h3 className="font-bold text-neutral-900 text-sm">Public Listing Status</h3>
                  <p className="text-xs text-neutral-500 font-medium">When active, your coaching appears in MathLogs city search.</p>
                </div>
              </div>

              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPubliclyListed}
                  onChange={(e) => setIsPubliclyListed(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
            </div>

            {/* Basic Info */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-neutral-200/80 shadow-xs space-y-5">
              <h3 className="text-lg font-extrabold text-[#1A1F36] flex items-center gap-2">
                <Building2 className="w-5 h-5 text-neutral-900" />
                <span>Basic Coaching Information</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1.5">Coaching / Institute Name *</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium text-neutral-900 outline-none focus:bg-white focus:ring-2 focus:ring-neutral-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1.5">Teacher / Faculty Name *</label>
                  <input
                    type="text"
                    required
                    value={teacherName}
                    onChange={(e) => setTeacherName(e.target.value)}
                    className="w-full px-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium text-neutral-900 outline-none focus:bg-white focus:ring-2 focus:ring-neutral-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1.5">Public Phone Number</label>
                  <input
                    type="tel"
                    value={publicPhone}
                    onChange={(e) => setPublicPhone(e.target.value)}
                    placeholder="Displayed on card & profile for phone calls"
                    className="w-full px-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium text-neutral-900 outline-none focus:bg-white focus:ring-2 focus:ring-neutral-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1.5">WhatsApp Number</label>
                  <input
                    type="tel"
                    value={whatsappPhone}
                    onChange={(e) => setWhatsappPhone(e.target.value)}
                    placeholder="Used for direct student WhatsApp chat button"
                    className="w-full px-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium text-neutral-900 outline-none focus:bg-white focus:ring-2 focus:ring-neutral-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1.5">Tagline</label>
                <input
                  type="text"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  placeholder="e.g. 15+ years of excellence in Board & JEE preparation"
                  className="w-full px-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium text-neutral-900 outline-none focus:bg-white focus:ring-2 focus:ring-neutral-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1.5">About Us / Detailed Description</label>
                <textarea
                  rows={4}
                  value={aboutUs}
                  onChange={(e) => setAboutUs(e.target.value)}
                  placeholder="Share details about teaching methodology, achievements, infrastructure..."
                  className="w-full px-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium text-neutral-900 outline-none focus:bg-white focus:ring-2 focus:ring-neutral-900 resize-none"
                />
              </div>
            </div>

            {/* Location Details */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-neutral-200/80 shadow-xs space-y-5">
              <h3 className="text-lg font-extrabold text-[#1A1F36] flex items-center gap-2">
                <MapPin className="w-5 h-5 text-neutral-900" />
                <span>Location & Google Maps</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1.5">City *</label>
                  <select
                    value={city || 'Muzaffarnagar'}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full px-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-bold text-neutral-900 outline-none focus:bg-white focus:ring-2 focus:ring-neutral-900 cursor-pointer"
                  >
                    <option value="Muzaffarnagar">Muzaffarnagar</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1.5">Area / Locality</label>
                  <input
                    type="text"
                    value={area}
                    onChange={(e) => setArea(e.target.value)}
                    placeholder="e.g. Gandhi Nagar"
                    className="w-full px-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium text-neutral-900 outline-none focus:bg-white focus:ring-2 focus:ring-neutral-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1.5">Full Street Address</label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Street address for student directions"
                  className="w-full px-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium text-neutral-900 outline-none focus:bg-white focus:ring-2 focus:ring-neutral-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1.5">Google Business / Maps Review Link</label>
                <input
                  type="url"
                  value={googleMapsUrl}
                  onChange={(e) => setGoogleMapsUrl(e.target.value)}
                  placeholder="https://maps.google.com/?cid=..."
                  className="w-full px-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium text-neutral-900 outline-none focus:bg-white focus:ring-2 focus:ring-neutral-900"
                />
              </div>
            </div>

            {/* Subjects & Classes Selection */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-neutral-200/80 shadow-xs space-y-6">
              <h3 className="text-lg font-extrabold text-[#1A1F36] flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-neutral-900" />
                <span>Subjects & Classes Offered</span>
              </h3>

              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-2">Select Subjects Taught</label>
                <div className="flex flex-wrap gap-2">
                  {[...SUBJECT_OPTIONS, ...customSubjects].map((sub) => {
                    const active = selectedSubjects.includes(sub);
                    return (
                      <button
                        key={sub}
                        type="button"
                        onClick={() => toggleSubject(sub)}
                        className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                          active
                            ? 'bg-neutral-900 text-white border-neutral-900 shadow-2xs'
                            : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-100'
                        }`}
                      >
                        {active && <CheckCircle2 className="w-3 h-3 inline mr-1" />}
                        {sub}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="text"
                    value={customSubjectInput}
                    onChange={e => setCustomSubjectInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCustomSubject())}
                    placeholder="Add a subject not listed above..."
                    className="flex-1 px-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium outline-none focus:border-black transition-all"
                  />
                  <button
                    type="button"
                    onClick={addCustomSubject}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-neutral-900 text-white text-xs font-bold hover:bg-neutral-700 transition-all"
                  >
                    <Plus className="w-3 h-3" /> Add
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-2">Select Classes & Grades</label>
                <div className="flex flex-wrap gap-2">
                  {CLASS_OPTIONS.map((cls) => {
                    const active = selectedClasses.includes(cls);
                    return (
                      <button
                        key={cls}
                        type="button"
                        onClick={() => toggleClass(cls)}
                        className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                          active
                            ? 'bg-purple-900 text-white border-purple-900 shadow-2xs'
                            : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-100'
                        }`}
                      >
                        {active && <CheckCircle2 className="w-3 h-3 inline mr-1" />}
                        {cls}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={saving}
                className="px-8 py-3.5 bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs rounded-full transition-all hover:shadow-md active:scale-95 flex items-center gap-2"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Save Marketplace Profile</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* TAB 2: Student Lead Inquiries */}
        {activeTab === 'leads' && (
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-neutral-200/80 shadow-xs space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-extrabold text-[#1A1F36]">Student Lead Inquiries</h3>
                <p className="text-xs text-neutral-500 font-medium mt-0.5">
                  Direct student contact requests received from your MathLogs Marketplace profile.
                </p>
              </div>
              <span className="text-xs font-bold text-neutral-700 bg-neutral-100 px-3 py-1 rounded-full border border-neutral-200">
                {leads.length} Total Leads
              </span>
            </div>

            {leads.length === 0 ? (
              <div className="text-center py-16 bg-neutral-50 rounded-2xl border border-neutral-200/60 p-6">
                <GraduationCap className="w-10 h-10 text-neutral-300 mx-auto mb-2" />
                <p className="text-sm font-bold text-neutral-800">No Student Inquiries Yet</p>
                <p className="text-xs text-neutral-500 mt-1 max-w-sm mx-auto">
                  When students or parents submit an inquiry on your public profile, their details will appear here for instant follow-up.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {leads.map((lead) => {
                  const whatsappUrl = `https://wa.me/${lead.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                    `Hi ${lead.studentName}, I received your inquiry for ${profile?.name || 'coaching'} on MathLogs.`
                  )}`;

                  return (
                    <div key={lead.id} className="p-5 bg-neutral-50 rounded-2xl border border-neutral-200/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-neutral-900 text-sm">{lead.studentName}</h4>
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">New Lead</span>
                        </div>
                        <p className="text-xs text-neutral-600 font-semibold flex items-center gap-3">
                          <span>Phone: {lead.phone}</span>
                          {lead.subject && <span>Subject: {lead.subject}</span>}
                          {lead.classGrade && <span>Class: {lead.classGrade}</span>}
                        </p>
                        {lead.message && (
                          <p className="text-xs text-neutral-500 italic mt-1 bg-white p-2 rounded-xl border border-neutral-200/60">
                            "{lead.message}"
                          </p>
                        )}
                        <p className="text-[10px] text-neutral-400 font-medium">
                          Submitted on {new Date(lead.createdAt).toLocaleDateString()}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <a
                          href={whatsappUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-4 py-2 bg-[#16a34a] hover:bg-[#15803d] text-white font-bold text-xs rounded-full shadow-2xs transition-colors flex items-center gap-1.5"
                        >
                          <MessageCircle className="w-3.5 h-3.5 fill-white text-[#16a34a]" />
                          <span>WhatsApp</span>
                        </a>

                        <a
                          href={`tel:${lead.phone}`}
                          className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs rounded-full transition-colors flex items-center gap-1.5"
                        >
                          <Phone className="w-3.5 h-3.5" />
                          <span>Call</span>
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {profile && (
        <GooglePlaceConnectModal
          isOpen={showGoogleModal}
          onClose={() => setShowGoogleModal(false)}
          instituteId={profile.id}
          onSyncSuccess={() => {
            fetchProfileAndLeads();
          }}
        />
      )}
    </Layout>
  );
}
