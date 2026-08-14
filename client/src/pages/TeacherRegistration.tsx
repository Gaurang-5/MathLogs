import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { GraduationCap, User, Phone, MapPin, Lock, Loader2, CheckCircle2, Sparkles, ArrowRight, ArrowLeft, Building2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { appleSpringDefault, appleSpringSnappy } from '../utils/appleDesign';

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
  const [googleMapsUrl, setGoogleMapsUrl] = useState('');
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
      {/* Translucent Header Bar */}
      <header className="bg-white/70 backdrop-blur-2xl saturate-180 border-b border-white/40 sticky top-0 z-40 shadow-xs">
        <div className="max-w-7xl mx-auto px-6 h-18 flex items-center justify-between">
          <Link to="/coaching" className="inline-flex items-center gap-2 text-sm font-bold text-neutral-700 hover:text-neutral-900 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Marketplace</span>
          </Link>

          <Link to="/" className="flex items-center gap-2">
            <img src="/logo-64.webp" alt="MathLogs Logo" width={32} height={32} className="w-8 h-8 rounded-lg shadow-sm border border-neutral-100" />
            <span className="font-extrabold text-lg text-neutral-900 tracking-[-0.02em]">MathLogs</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center py-12 px-6">
        {/* Header Banner */}
        <div className="text-center max-w-xl mb-8">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/80 backdrop-blur-md border border-neutral-200 text-neutral-700 text-xs font-bold mb-4 shadow-2xs">
            <GraduationCap className="w-4 h-4 text-neutral-900" />
            <span>Free Teacher Self-Registration</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold text-[#1A1F36] tracking-[-0.025em]">
            List Your Coaching on MathLogs Marketplace
          </h1>
          <p className="mt-2 text-sm text-neutral-500 font-medium max-w-md mx-auto">
            Get discovered by students in your city. Receive direct leads, reviews, and WhatsApp inquiries — completely free.
          </p>
        </div>

        {/* Step Progress Indicator with Motion */}
        <div className="flex items-center gap-3 mb-8">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <motion.div
                animate={{
                  scale: step === s ? 1.1 : 1,
                }}
                transition={appleSpringSnappy}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  step > s ? 'bg-emerald-500 text-white' :
                  step === s ? 'bg-neutral-900 text-white shadow-md' :
                  'bg-neutral-200 text-neutral-500'
                }`}
              >
                {step > s ? <CheckCircle2 className="w-4 h-4" /> : s}
              </motion.div>
              {s < 3 && <div className={`w-12 h-0.5 rounded-full transition-colors duration-300 ${step > s ? 'bg-emerald-400' : 'bg-neutral-200'}`} />}
            </div>
          ))}
        </div>

        {/* Form Card */}
        <form onSubmit={handleSubmit} className="w-full max-w-lg bg-white/80 backdrop-blur-xl rounded-3xl border border-neutral-200/80 shadow-lg p-6 sm:p-8 relative overflow-hidden">
          <AnimatePresence mode="wait">
            {/* Step 1: Basic Info */}
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={appleSpringDefault}
                className="space-y-5"
              >
                <h2 className="text-xl font-extrabold text-[#1A1F36] tracking-[-0.015em] flex items-center gap-2">
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
                    className="w-full px-4 py-2.5 bg-neutral-50/80 border border-neutral-200 rounded-xl text-xs font-medium text-neutral-900 outline-none focus:bg-white focus:ring-2 focus:ring-neutral-900 transition-all"
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
                      className="w-full pl-10 pr-4 py-2.5 bg-neutral-50/80 border border-neutral-200 rounded-xl text-xs font-medium text-neutral-900 outline-none focus:bg-white focus:ring-2 focus:ring-neutral-900 transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1.5">Phone / WhatsApp Number *</label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="tel"
                      required
                      placeholder="10-digit mobile number"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-neutral-50/80 border border-neutral-200 rounded-xl text-xs font-medium text-neutral-900 outline-none focus:bg-white focus:ring-2 focus:ring-neutral-900 transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1.5">Tagline (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. 15+ years of excellence in Board exam preparation"
                    value={tagline}
                    onChange={(e) => setTagline(e.target.value)}
                    className="w-full px-4 py-2.5 bg-neutral-50/80 border border-neutral-200 rounded-xl text-xs font-medium text-neutral-900 outline-none focus:bg-white focus:ring-2 focus:ring-neutral-900 transition-all"
                  />
                </div>

                <motion.button
                  type="button"
                  whileTap={{ scale: 0.95 }}
                  transition={appleSpringSnappy}
                  onClick={() => {
                    if (!coachingName.trim() || !teacherName.trim() || !phoneNumber.trim()) {
                      toast.error('Please fill all required fields');
                      return;
                    }
                    setStep(2);
                  }}
                  className="w-full py-3 bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs rounded-full transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Next: Location & Subjects</span>
                  <ArrowRight className="w-4 h-4" />
                </motion.button>
              </motion.div>
            )}

            {/* Step 2: Location & Subjects */}
            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={appleSpringDefault}
                className="space-y-5"
              >
                <h2 className="text-xl font-extrabold text-[#1A1F36] tracking-[-0.015em] flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-neutral-900" />
                  <span>Location & Subjects</span>
                </h2>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-neutral-700 mb-1.5">City *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Jaipur"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-neutral-50/80 border border-neutral-200 rounded-xl text-xs font-medium text-neutral-900 outline-none focus:bg-white focus:ring-2 focus:ring-neutral-900 transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-neutral-700 mb-1.5">Area / Locality</label>
                    <input
                      type="text"
                      placeholder="e.g. Malviya Nagar"
                      value={area}
                      onChange={(e) => setArea(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-neutral-50/80 border border-neutral-200 rounded-xl text-xs font-medium text-neutral-900 outline-none focus:bg-white focus:ring-2 focus:ring-neutral-900 transition-all"
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
                    className="w-full px-4 py-2.5 bg-neutral-50/80 border border-neutral-200 rounded-xl text-xs font-medium text-neutral-900 outline-none focus:bg-white focus:ring-2 focus:ring-neutral-900 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1.5">Google Business / Maps Review Link (Optional)</label>
                  <input
                    type="url"
                    placeholder="https://maps.google.com/?cid=..."
                    value={googleMapsUrl}
                    onChange={(e) => setGoogleMapsUrl(e.target.value)}
                    className="w-full px-4 py-2.5 bg-neutral-50/80 border border-neutral-200 rounded-xl text-xs font-medium text-neutral-900 outline-none focus:bg-white focus:ring-2 focus:ring-neutral-900 transition-all"
                  />
                </div>

                {/* Subjects Selection */}
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-2">Subjects You Teach *</label>
                  <div className="flex flex-wrap gap-2">
                    {SUBJECT_OPTIONS.map((sub) => {
                      const active = selectedSubjects.includes(sub);
                      return (
                        <motion.button
                          key={sub}
                          type="button"
                          whileTap={{ scale: 0.94 }}
                          transition={appleSpringSnappy}
                          onClick={() => toggleSubject(sub)}
                          className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors border cursor-pointer ${
                            active
                              ? 'bg-neutral-900 text-white border-neutral-900 shadow-2xs'
                              : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-100'
                          }`}
                        >
                          {active && <CheckCircle2 className="w-3 h-3 inline mr-1" />}
                          {sub}
                        </motion.button>
                      );
                    })}
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
                        <motion.button
                          key={cls}
                          type="button"
                          whileTap={{ scale: 0.94 }}
                          transition={appleSpringSnappy}
                          onClick={() => toggleClass(cls)}
                          className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors border cursor-pointer ${
                            active
                              ? 'bg-purple-900 text-white border-purple-900 shadow-2xs'
                              : 'bg-white text-neutral-700 border-neutral-200 hover:bg-neutral-100'
                          }`}
                        >
                          {active && <CheckCircle2 className="w-3 h-3 inline mr-1" />}
                          {cls}
                        </motion.button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setStep(1)}
                    className="flex-1 py-3 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold text-xs rounded-full transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back</span>
                  </motion.button>

                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.95 }}
                    transition={appleSpringSnappy}
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
                    className="flex-1 py-3 bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs rounded-full transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>Next: Account Setup</span>
                    <ArrowRight className="w-4 h-4" />
                  </motion.button>
                </div>
              </motion.div>
            )}

            {/* Step 3: Account Credentials */}
            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={appleSpringDefault}
                className="space-y-5"
              >
                <h2 className="text-xl font-extrabold text-[#1A1F36] tracking-[-0.015em] flex items-center gap-2">
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
                    className="w-full px-4 py-2.5 bg-neutral-50/80 border border-neutral-200 rounded-xl text-xs font-medium text-neutral-900 outline-none focus:bg-white focus:ring-2 focus:ring-neutral-900 transition-all"
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
                      className="w-full pl-10 pr-4 py-2.5 bg-neutral-50/80 border border-neutral-200 rounded-xl text-xs font-medium text-neutral-900 outline-none focus:bg-white focus:ring-2 focus:ring-neutral-900 transition-all"
                    />
                  </div>
                </div>

                {/* Summary Preview */}
                <div className="p-5 bg-neutral-50/80 rounded-2xl border border-neutral-200/80 text-xs text-neutral-700 space-y-1.5 font-medium">
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
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setStep(2)}
                    className="flex-1 py-3 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold text-xs rounded-full transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back</span>
                  </motion.button>

                  <motion.button
                    type="submit"
                    disabled={submitting}
                    whileTap={{ scale: 0.95 }}
                    transition={appleSpringSnappy}
                    className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-full transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {submitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>List My Coaching Free</span>
                      </>
                    )}
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </form>

        {/* Upgrade CTA with Apple Physics */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...appleSpringDefault, delay: 0.2 }}
          className="mt-8 max-w-lg w-full bg-neutral-900 text-white rounded-3xl p-6 text-center shadow-lg"
        >
          <Sparkles className="w-6 h-6 text-amber-400 mx-auto mb-2" />
          <h3 className="text-base font-extrabold tracking-[-0.015em]">Want Exclusive Partner Status?</h3>
          <p className="text-xs text-neutral-400 font-medium mt-1 max-w-sm mx-auto">
            Upgrade to MathLogs ERP to unlock top search priority, verified badge, attendance management, fee tracking, WhatsApp messaging, and more.
          </p>
          <Link to="/onboarding">
            <motion.button
              whileTap={{ scale: 0.95 }}
              whileHover={{ scale: 1.03 }}
              transition={appleSpringSnappy}
              className="inline-flex items-center gap-2 mt-4 px-6 py-2.5 bg-amber-400 hover:bg-amber-300 text-neutral-900 font-bold text-xs rounded-full cursor-pointer"
            >
              <span>Explore MathLogs ERP Plans</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </motion.button>
          </Link>
        </motion.div>
      </main>
    </div>
  );
}
