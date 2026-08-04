import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GraduationCap, User, Phone, MapPin, BookOpen, Lock, Loader2, CheckCircle2, Sparkles, ArrowRight, ArrowLeft, Building2 } from 'lucide-react';
import toast from 'react-hot-toast';

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
  const [city, setCity] = useState('');
  const [area, setArea] = useState('');
  const [address, setAddress] = useState('');
  const [tagline, setTagline] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [selectedClasses, setSelectedClasses] = useState<string[]>([]);

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  const toggleSubject = (sub: string) => {
    setSelectedSubjects(prev =>
      prev.includes(sub) ? prev.filter(s => s !== sub) : [...prev, sub]
    );
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
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Navbar */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/coaching" className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-indigo-600">
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Marketplace</span>
          </Link>

          <Link to="/" className="font-extrabold text-lg text-slate-900">
            MathLogs
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center py-8 px-4 sm:px-6">
        {/* Header Banner */}
        <div className="text-center max-w-xl mb-8">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold mb-4">
            <GraduationCap className="w-4 h-4" />
            <span>Free Teacher Registration</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            List Your Coaching on MathLogs Marketplace
          </h1>
          <p className="mt-2 text-sm text-slate-500 max-w-md mx-auto">
            Get discovered by students in your city. Receive direct leads, reviews, and WhatsApp inquiries — completely free.
          </p>
        </div>

        {/* Step Progress Indicator */}
        <div className="flex items-center gap-3 mb-8">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                step > s ? 'bg-emerald-500 text-white' :
                step === s ? 'bg-indigo-600 text-white scale-110 shadow-md' :
                'bg-slate-200 text-slate-500'
              }`}>
                {step > s ? <CheckCircle2 className="w-4 h-4" /> : s}
              </div>
              {s < 3 && <div className={`w-12 h-0.5 rounded-full ${step > s ? 'bg-emerald-400' : 'bg-slate-200'}`} />}
            </div>
          ))}
        </div>

        {/* Form Card */}
        <form onSubmit={handleSubmit} className="w-full max-w-lg bg-white rounded-3xl border border-slate-200 shadow-lg p-6 sm:p-8">

          {/* Step 1: Basic Info */}
          {step === 1 && (
            <div className="space-y-5">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-indigo-600" />
                Coaching Details
              </h2>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Coaching / Institute Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sharma Maths Academy"
                  value={coachingName}
                  onChange={(e) => setCoachingName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Teacher / Faculty Name *</label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    placeholder="e.g. Prof. Rajesh Sharma"
                    value={teacherName}
                    onChange={(e) => setTeacherName(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Phone / WhatsApp Number *</label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    required
                    placeholder="10-digit mobile number"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Tagline (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. 15+ years of excellence in Board exam preparation"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!coachingName.trim() || !teacherName.trim() || !phoneNumber.trim()) {
                    toast.error('Please fill all required fields');
                    return;
                  }
                  setStep(2);
                }}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <span>Next: Location & Subjects</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Step 2: Location & Subjects */}
          {step === 2 && (
            <div className="space-y-5">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-indigo-600" />
                Location & Subjects
              </h2>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">City *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Jaipur"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Area / Locality</label>
                  <input
                    type="text"
                    placeholder="e.g. Malviya Nagar"
                    value={area}
                    onChange={(e) => setArea(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Full Address (Optional)</label>
                <input
                  type="text"
                  placeholder="Street address for Google Maps navigation"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Subjects Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">Subjects You Teach *</label>
                <div className="flex flex-wrap gap-2">
                  {SUBJECT_OPTIONS.map((sub) => {
                    const active = selectedSubjects.includes(sub);
                    return (
                      <button
                        key={sub}
                        type="button"
                        onClick={() => toggleSubject(sub)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                          active
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50'
                        }`}
                      >
                        {active && <CheckCircle2 className="w-3 h-3 inline mr-1" />}
                        {sub}
                      </button>
                    );
                  })}
                </div>
                {selectedSubjects.length === 0 && (
                  <p className="text-[10px] text-red-500 mt-1 font-medium">Select at least one subject</p>
                )}
              </div>

              {/* Classes Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">Classes / Grades You Teach</label>
                <div className="flex flex-wrap gap-2">
                  {CLASS_OPTIONS.map((cls) => {
                    const active = selectedClasses.includes(cls);
                    return (
                      <button
                        key={cls}
                        type="button"
                        onClick={() => toggleClass(cls)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                          active
                            ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-purple-300 hover:bg-purple-50'
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
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm rounded-xl transition-colors flex items-center justify-center gap-2"
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
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl transition-colors flex items-center justify-center gap-2"
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
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Lock className="w-5 h-5 text-indigo-600" />
                Create Your Login
              </h2>
              <p className="text-xs text-slate-500">
                Use these credentials to manage your listing, view leads, and respond to student inquiries.
              </p>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Username *</label>
                <input
                  type="text"
                  required
                  placeholder="Choose a unique username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Password *</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    placeholder="At least 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Summary Preview */}
              <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100 text-xs text-slate-700 space-y-1.5">
                <h4 className="font-bold text-indigo-800 text-sm mb-2">Listing Summary</h4>
                <p><span className="font-semibold text-slate-500">Coaching:</span> {coachingName}</p>
                <p><span className="font-semibold text-slate-500">Teacher:</span> {teacherName}</p>
                <p><span className="font-semibold text-slate-500">Phone:</span> {phoneNumber}</p>
                <p><span className="font-semibold text-slate-500">City:</span> {city}{area ? `, ${area}` : ''}</p>
                <p><span className="font-semibold text-slate-500">Subjects:</span> {selectedSubjects.join(', ')}</p>
                {selectedClasses.length > 0 && (
                  <p><span className="font-semibold text-slate-500">Classes:</span> {selectedClasses.join(', ')}</p>
                )}
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm rounded-xl transition-colors flex items-center justify-center gap-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>

                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl transition-colors flex items-center justify-center gap-2 shadow-md"
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
        <div className="mt-8 max-w-lg w-full bg-gradient-to-r from-indigo-900 to-purple-900 text-white rounded-2xl p-6 text-center">
          <Sparkles className="w-6 h-6 text-amber-400 mx-auto mb-2" />
          <h3 className="text-base font-bold">Want Exclusive Partner Status?</h3>
          <p className="text-xs text-indigo-200 mt-1 max-w-sm mx-auto">
            Upgrade to MathLogs ERP to unlock top search priority, verified badge, attendance management, fee tracking, WhatsApp messaging, and more.
          </p>
          <Link
            to="/onboarding"
            className="inline-flex items-center gap-2 mt-4 px-5 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-900 font-bold text-xs rounded-xl transition-transform hover:scale-105"
          >
            <span>Explore MathLogs ERP Plans</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </main>
    </div>
  );
}
