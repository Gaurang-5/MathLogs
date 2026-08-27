import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GraduationCap, User, Phone, MapPin, Lock, Loader2, CheckCircle2, Sparkles, ArrowRight, ArrowLeft, Building2, Plus, MessageCircle, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { MARKETPLACE_CITY, MARKETPLACE_CITY_OPTIONS } from '../features/marketplace/location';

const SUBJECT_OPTIONS = [
  'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Science',
  'English', 'Hindi', 'Social Science', 'Commerce', 'Accountancy',
  'Economics', 'Computer Science', 'Spoken English', 'Music', 'Drawing'
];

const CLASS_OPTIONS = [
  'Class 1-5', 'Class 6-8', 'Class 9', 'Class 10',
  'Class 11', 'Class 12', 'JEE/NEET', 'Competitive Exams', 'Graduation'
];

export default function TeacherRegistration() {
  const navigate = useNavigate();

  // Form state
  const [coachingName, setCoachingName] = useState('');
  const [teacherName, setTeacherName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [city, setCity] = useState<string>(MARKETPLACE_CITY);
  const [area, setArea] = useState('');
  const [address, setAddress] = useState('');
  const [googleMapsUrl, setGoogleMapsUrl] = useState('');
  const [tagline, setTagline] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);
  const [customSubjectInput, setCustomSubjectInput] = useState('');
  const [customSubjects, setCustomSubjects] = useState<string[]>([]);

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // Phone OTP state
  const [phoneOtpSent, setPhoneOtpSent] = useState(false);
  const [phoneOtpCode, setPhoneOtpCode] = useState('');
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [otpResendTimer, setOtpResendTimer] = useState(0);
  const otpTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  const cleanPhone = phoneNumber.trim().replace(/\D/g, '').slice(0, 10);

  const startResendTimer = () => {
    setOtpResendTimer(30);
    if (otpTimerRef.current) clearInterval(otpTimerRef.current);
    otpTimerRef.current = setInterval(() => {
      setOtpResendTimer(prev => { if (prev <= 1) { clearInterval(otpTimerRef.current!); return 0; } return prev - 1; });
    }, 1000);
  };

  const handleSendPhoneOtp = async () => {
    if (cleanPhone.length < 10) { setOtpError('Please enter a valid 10-digit mobile number first.'); return; }
    setOtpError('');
    setOtpSending(true);
    try {
      const res = await fetch('/api/auth/send-signup-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: cleanPhone }) });
      const data = await res.json();
      if (data.success) { setPhoneOtpSent(true); setPhoneOtpCode(''); startResendTimer(); toast.success('OTP sent to your WhatsApp!'); }
      else { setOtpError(data.error || 'Failed to send OTP.'); }
    } catch { setOtpError('Failed to send OTP.'); }
    finally { setOtpSending(false); }
  };

  const handleVerifyPhoneOtp = async () => {
    if (phoneOtpCode.length !== 6) { setOtpError('Please enter the 6-digit OTP.'); return; }
    setOtpError('');
    setOtpVerifying(true);
    try {
      const res = await fetch('/api/auth/verify-signup-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: cleanPhone, otp: phoneOtpCode }) });
      const data = await res.json();
      if (data.success) { setIsPhoneVerified(true); setPhoneOtpSent(false); toast.success('Mobile number verified!'); }
      else { setOtpError(data.error || 'Invalid OTP.'); }
    } catch { setOtpError('Failed to verify OTP.'); }
    finally { setOtpVerifying(false); }
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!coachingName.trim() || !teacherName.trim() || !phoneNumber.trim() || !city.trim() || !username.trim() || !password.trim()) {
      toast.error('Please fill all required fields');
      return;
    }

    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    if (selectedSubjects.length === 0) {
      toast.error('Please select at least one subject');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/marketplace/register-teacher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coachingName,
          teacherName,
          username,
          password,
          phoneNumber,
          city,
          area,
          address,
          googleMapsUrl,
          tagline,
          subjectsOffered: selectedSubjects,
          classesOffered: selectedClasses
        })
      });

      const data = await res.json();

      if (data.success) {
        toast.success('🎉 Your coaching is now listed on MathLogs Marketplace!');

        // Save token and redirect to dashboard
        if (data.token) {
          localStorage.setItem('token', data.token);
        }

        navigate(`/coaching/${data.institute?.slug || ''}`);
      } else {
        toast.error(data.message || 'Failed to register. Please try again.');
      }
    } catch (err) {
      toast.error('Network error. Please check your connection.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col font-sans text-neutral-900 selection:bg-neutral-900 selection:text-white">
      {/* Header Bar */}
      <header className="bg-white/90 backdrop-blur-xl border-b border-neutral-200/80 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-18 flex items-center justify-between">
          <Link to="/coaching" className="inline-flex items-center gap-2 text-sm font-bold text-neutral-700 hover:text-neutral-900 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Marketplace</span>
          </Link>

          <Link to="/" className="flex items-center gap-2">
            <img src="/logo-64.webp" alt="MathLogs Logo" width={32} height={32} className="w-8 h-8 rounded-lg shadow-sm border border-neutral-100" />
            <span className="font-extrabold text-lg text-neutral-900 tracking-tight">MathLogs</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center py-12 px-6">
        {/* Header Banner */}
        <div className="text-center max-w-xl mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold mb-4 shadow-2xs">
            <Sparkles className="w-4 h-4 text-emerald-600 fill-emerald-400" />
            <span>⚡ Limited Time Offer: 100% Free Listing</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold text-[#1A1F36] tracking-tight">
            List Your Coaching on MathLogs Marketplace
          </h1>
          <p className="mt-2 text-sm text-neutral-500 font-medium max-w-md mx-auto">
            Get discovered by students in your city. Receive direct leads, reviews, and WhatsApp inquiries — completely free during our limited time offer.
          </p>
        </div>

        {/* Step Progress Indicator */}
        <div className="flex items-center gap-3 mb-8">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                step > s ? 'bg-emerald-500 text-white' :
                step === s ? 'bg-neutral-900 text-white scale-110 shadow-md' :
                'bg-neutral-200 text-neutral-500'
              }`}>
                {step > s ? <CheckCircle2 className="w-4 h-4" /> : s}
              </div>
              {s < 3 && <div className={`w-12 h-0.5 rounded-full ${step > s ? 'bg-emerald-400' : 'bg-neutral-200'}`} />}
            </div>
          ))}
        </div>

        {/* Form Card */}
        <form onSubmit={handleSubmit} className="w-full max-w-lg bg-white rounded-3xl border border-neutral-200/80 shadow-lg p-6 sm:p-8">

          {/* Step 1: Basic Info */}
          {step === 1 && (
            <div className="space-y-5">
              <h2 className="text-xl font-extrabold text-[#1A1F36] flex items-center gap-2">
                <Building2 className="w-5 h-5 text-neutral-900" />
                <span>Coaching Details</span>
              </h2>

              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1.5">Coaching / Institute Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sharma Maths Academy"
                  value={coachingName}
                  onChange={(e) => setCoachingName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium text-neutral-900 outline-none focus:bg-white focus:ring-2 focus:ring-neutral-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1.5">Teacher / Faculty Name *</label>
                <div className="relative">
                  <User className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    placeholder="e.g. Prof. Rajesh Sharma"
                    value={teacherName}
                    onChange={(e) => setTeacherName(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium text-neutral-900 outline-none focus:bg-white focus:ring-2 focus:ring-neutral-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1.5">Phone / WhatsApp Number *</label>
                <div className={`relative flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 transition-all ${isPhoneVerified ? 'border-green-500 bg-green-50' : 'border-neutral-200 bg-neutral-50 focus-within:bg-white focus-within:ring-2 focus-within:ring-neutral-900'}`}>
                  <Phone className="w-4 h-4 text-neutral-400 shrink-0" />
                  <input
                    type="tel"
                    required
                    placeholder="10-digit mobile number"
                    value={phoneNumber}
                    onChange={(e) => {
                      setPhoneNumber(e.target.value);
                      setIsPhoneVerified(false);
                      setPhoneOtpSent(false);
                      setOtpError('');
                    }}
                    disabled={isPhoneVerified}
                    className="flex-1 bg-transparent text-xs font-medium text-neutral-900 outline-none disabled:opacity-70"
                  />
                  {isPhoneVerified ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                      <button type="button" onClick={() => { setIsPhoneVerified(false); setPhoneOtpSent(false); setOtpError(''); }} className="text-[11px] text-neutral-400 hover:text-neutral-700 font-semibold underline">Change</button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={cleanPhone.length < 10 || otpSending}
                      onClick={handleSendPhoneOtp}
                      className="shrink-0 flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-neutral-200 disabled:text-neutral-400 text-white text-[11px] font-bold rounded-full transition-all"
                    >
                      {otpSending ? <Loader2 className="w-3 h-3 animate-spin" /> : <MessageCircle className="w-3 h-3" />}
                      {phoneOtpSent ? 'Resend' : 'Verify OTP'}
                    </button>
                  )}
                </div>

                {phoneOtpSent && !isPhoneVerified && (
                  <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-xl">
                    <p className="text-[11px] text-green-700 font-semibold mb-2 flex items-center gap-1">
                      <MessageCircle className="w-3.5 h-3.5" />
                      Enter the 6-digit OTP sent to your WhatsApp
                    </p>
                    <div className="flex gap-2 items-center">
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={phoneOtpCode}
                        onChange={e => setPhoneOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="------"
                        className="flex-1 bg-white border border-green-200 focus:border-green-500 rounded-lg px-3 py-2 text-center text-lg font-black tracking-[0.3em] outline-none transition-all"
                      />
                      <button type="button" disabled={phoneOtpCode.length !== 6 || otpVerifying} onClick={handleVerifyPhoneOtp}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-neutral-200 disabled:text-neutral-400 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1.5"
                      >
                        {otpVerifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Verify'}
                      </button>
                    </div>
                    {otpResendTimer > 0 ? (
                      <p className="text-[11px] text-neutral-400 mt-1.5">Resend in {otpResendTimer}s</p>
                    ) : (
                      <button type="button" onClick={handleSendPhoneOtp} className="text-[11px] text-green-600 hover:underline mt-1.5 font-semibold">Resend OTP</button>
                    )}
                  </div>
                )}

                {otpError && (
                  <p className="mt-1.5 text-[11px] font-semibold text-red-600 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {otpError}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1.5">Tagline (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. 15+ years of excellence in Board exam preparation"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  className="w-full px-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium text-neutral-900 outline-none focus:bg-white focus:ring-2 focus:ring-neutral-900"
                />
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!coachingName.trim() || !teacherName.trim() || !phoneNumber.trim()) {
                    toast.error('Please fill all required fields');
                    return;
                  }
                  if (!isPhoneVerified) {
                    toast.error('Please verify your mobile number via WhatsApp OTP first.');
                    return;
                  }
                  setStep(2);
                }}
                className="w-full py-3 bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs rounded-full transition-all hover:shadow-md active:scale-95 flex items-center justify-center gap-2"
              >
                <span>Next: Location & Subjects</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Step 2: Location & Subjects */}
          {step === 2 && (
            <div className="space-y-5">
              <h2 className="text-xl font-extrabold text-[#1A1F36] flex items-center gap-2">
                <MapPin className="w-5 h-5 text-neutral-900" />
                <span>Location & Subjects</span>
              </h2>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1.5">City *</label>
                  <select
                    name="marketplace-city"
                    value={city}
                    onChange={() => setCity(MARKETPLACE_CITY)}
                    className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-bold text-neutral-900 outline-none focus:bg-white focus:ring-2 focus:ring-neutral-900 cursor-pointer"
                  >
                    {MARKETPLACE_CITY_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1.5">Area / Locality</label>
                  <input
                    type="text"
                    placeholder="e.g. Malviya Nagar"
                    value={area}
                    onChange={(e) => setArea(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium text-neutral-900 outline-none focus:bg-white focus:ring-2 focus:ring-neutral-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1.5">Full Address (Optional)</label>
                <input
                  type="text"
                  placeholder="Street address for Google Maps navigation"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium text-neutral-900 outline-none focus:bg-white focus:ring-2 focus:ring-neutral-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1.5">Google Business / Maps Review Link (Optional)</label>
                <input
                  type="url"
                  placeholder="https://maps.google.com/?cid=..."
                  value={googleMapsUrl}
                  onChange={(e) => setGoogleMapsUrl(e.target.value)}
                  className="w-full px-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium text-neutral-900 outline-none focus:bg-white focus:ring-2 focus:ring-neutral-900"
                />
              </div>

              {/* Subjects Selection */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-2">Subjects You Teach *</label>
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
                {selectedSubjects.length === 0 && (
                  <p className="text-[10px] text-red-500 mt-1 font-semibold">Select at least one subject</p>
                )}
              </div>

              {/* Classes Selection */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-2">Classes / Grades You Teach</label>
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

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex-1 py-3 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold text-xs rounded-full transition-colors flex items-center justify-center gap-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (!city.trim()) {
                      toast.error('City is required');
                      return;
                    }
                    if (selectedSubjects.length === 0) {
                      toast.error('Select at least one subject');
                      return;
                    }
                    setStep(3);
                  }}
                  className="flex-1 py-3 bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs rounded-full transition-all hover:shadow-md active:scale-95 flex items-center justify-center gap-2"
                >
                  <span>Next: Account Setup</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Account Credentials */}
          {step === 3 && (
            <div className="space-y-5">
              <h2 className="text-xl font-extrabold text-[#1A1F36] flex items-center gap-2">
                <Lock className="w-5 h-5 text-neutral-900" />
                <span>Create Your Login</span>
              </h2>
              <p className="text-xs text-neutral-500 font-medium">
                Use these credentials to manage your listing, view leads, and respond to student inquiries.
              </p>

              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1.5">Username *</label>
                <input
                  type="text"
                  required
                  placeholder="Choose a unique username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium text-neutral-900 outline-none focus:bg-white focus:ring-2 focus:ring-neutral-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1.5">Password *</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    placeholder="At least 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium text-neutral-900 outline-none focus:bg-white focus:ring-2 focus:ring-neutral-900"
                  />
                </div>
              </div>

              {/* Summary Preview */}
              <div className="p-5 bg-neutral-50 rounded-2xl border border-neutral-200/80 text-xs text-neutral-700 space-y-1.5 font-medium">
                <h4 className="font-extrabold text-neutral-900 text-sm mb-2">Listing Summary</h4>
                <p><span className="font-semibold text-neutral-400">Coaching:</span> {coachingName}</p>
                <p><span className="font-semibold text-neutral-400">Teacher:</span> {teacherName}</p>
                <p><span className="font-semibold text-neutral-400">Phone:</span> {phoneNumber}</p>
                <p><span className="font-semibold text-neutral-400">City:</span> {city}{area ? `, ${area}` : ''}</p>
                <p><span className="font-semibold text-neutral-400">Subjects:</span> {selectedSubjects.join(', ')}</p>
                {selectedClasses.length > 0 && (
                  <p><span className="font-semibold text-neutral-400">Classes:</span> {selectedClasses.join(', ')}</p>
                )}
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="flex-1 py-3 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold text-xs rounded-full transition-colors flex items-center justify-center gap-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>

                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-full transition-all hover:shadow-md active:scale-95 flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>List My Coaching Free</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </form>

        {/* Upgrade CTA */}
        <div className="mt-8 max-w-lg w-full bg-neutral-900 text-white rounded-3xl p-6 text-center shadow-lg">
          <Sparkles className="w-6 h-6 text-amber-400 mx-auto mb-2" />
          <h3 className="text-base font-extrabold">Need Complete Coaching Management Software?</h3>
          <p className="text-xs text-neutral-400 font-medium mt-1 max-w-sm mx-auto">
            Upgrade to MathLogs ERP for digital student attendance, automated fee tracking, WhatsApp messaging, test series, and more.
          </p>
          <Link
            to="/onboarding"
            className="inline-flex items-center gap-2 mt-4 px-6 py-2.5 bg-amber-400 hover:bg-amber-300 text-neutral-900 font-bold text-xs rounded-full transition-transform hover:scale-105"
          >
            <span>Explore MathLogs ERP Plans</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </main>
    </div>
  );
}
