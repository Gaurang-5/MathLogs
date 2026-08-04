import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Star, MapPin, Phone, MessageCircle, CheckCircle2, BookOpen, Clock, Calendar, Sparkles, ArrowLeft, Send, Loader2, Award, User, MessageSquarePlus } from 'lucide-react';
import toast from 'react-hot-toast';

interface Review {
  id: string;
  reviewerName: string;
  reviewerRole: string;
  rating: number;
  comment: string;
  source?: string;
  googleAuthorUrl?: string | null;
  createdAt: string;
}

interface Batch {
  id: string;
  name: string;
  subject?: string;
  className?: string;
  timeSlot?: string;
  feeAmount: number;
}

interface CoachingProfileData {
  id: string;
  name: string;
  slug: string;
  teacherName: string;
  phone?: string | null;
  whatsappPhone?: string | null;
  city: string;
  area?: string;
  address?: string;
  tagline?: string;
  aboutUs?: string;
  logoUrl?: string | null;
  googlePlaceId?: string | null;
  googleMapsUrl?: string | null;
  googleRating?: number | null;
  googleReviewCount?: number;
  subjectsOffered: string[];
  classesOffered: string[];
  isExclusive: boolean;
  isVerified: boolean;
  batches: Batch[];
  avgRating: number;
  reviewCount: number;
  ratingBreakdown: Record<number, number>;
  reviews: Review[];
}

export default function CoachingProfile() {
  const { slug } = useParams<{ slug: string }>();
  const [profile, setProfile] = useState<CoachingProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  // Review modal state
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewerName, setReviewerName] = useState('');
  const [reviewerRole, setReviewerRole] = useState('Student');
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  // Inquiry form state
  const [studentName, setStudentName] = useState('');
  const [inquiryPhone, setInquiryPhone] = useState('');
  const [inquirySubject, setInquirySubject] = useState('');
  const [inquiryGrade, setInquiryGrade] = useState('');
  const [inquiryMessage, setInquiryMessage] = useState('');
  const [submittingInquiry, setSubmittingInquiry] = useState(false);

  const fetchProfile = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/marketplace/coaching/${slug}`);
      const data = await res.json();
      if (data.success) {
        setProfile(data.data);
      } else {
        toast.error(data.message || 'Coaching profile not found');
      }
    } catch (err) {
      console.error('Failed to fetch coaching profile:', err);
      toast.error('Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    if (!reviewerName.trim() || !comment.trim()) {
      toast.error('Name and comment are required');
      return;
    }

    setSubmittingReview(true);
    try {
      const res = await fetch(`/api/marketplace/coaching/${profile.id}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewerName, reviewerRole, rating, comment })
      });
      const data = await res.json();

      if (data.success) {
        toast.success('Thank you! Review submitted successfully.');
        setShowReviewModal(false);
        setReviewerName('');
        setComment('');
        fetchProfile();
      } else {
        toast.error(data.message || 'Failed to submit review');
      }
    } catch (err) {
      toast.error('Network error submitting review');
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleInquirySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    if (!studentName.trim() || !inquiryPhone.trim()) {
      toast.error('Student name and phone number are required');
      return;
    }

    setSubmittingInquiry(true);
    try {
      const res = await fetch(`/api/marketplace/coaching/${profile.id}/inquire`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentName,
          phone: inquiryPhone,
          subject: inquirySubject,
          classGrade: inquiryGrade,
          message: inquiryMessage
        })
      });
      const data = await res.json();

      if (data.success) {
        toast.success(data.message || 'Inquiry sent! The teacher will contact you.');
        setStudentName('');
        setInquiryPhone('');
        setInquirySubject('');
        setInquiryGrade('');
        setInquiryMessage('');
      } else {
        toast.error(data.message || 'Failed to send inquiry');
      }
    } catch (err) {
      toast.error('Network error sending inquiry');
    } finally {
      setSubmittingInquiry(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <h2 className="text-xl font-bold text-slate-800">Coaching Not Found</h2>
        <Link to="/coaching" className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-xl font-semibold text-sm">
          Return to Marketplace
        </Link>
      </div>
    );
  }

  const whatsappUrl = profile.whatsappPhone
    ? `https://wa.me/${profile.whatsappPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
        `Hi ${profile.teacherName}, I found your coaching "${profile.name}" on MathLogs Marketplace and would like to inquire about admissions.`
      )}`
    : null;

  const mapsUrl = profile.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${profile.name}, ${profile.address}, ${profile.city}`)}`
    : null;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans pb-16">
      {/* Header Bar */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/coaching" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-indigo-600 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Marketplace</span>
          </Link>

          <Link to="/" className="font-extrabold text-lg text-slate-900">
            MathLogs <span className="text-indigo-600 font-bold">Marketplace</span>
          </Link>
        </div>
      </header>

      {/* Profile Header Banner */}
      <section className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white py-12 px-4 sm:px-6 lg:px-8 shadow-md">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            {profile.logoUrl ? (
              <img
                src={profile.logoUrl}
                alt={profile.name}
                className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl object-cover border-2 border-white/20 shadow-lg"
              />
            ) : (
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-extrabold text-3xl shadow-lg border-2 border-white/20">
                {profile.name.substring(0, 2).toUpperCase()}
              </div>
            )}

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white">{profile.name}</h1>
                {profile.isExclusive && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-gradient-to-r from-amber-400 to-orange-400 text-slate-900 font-extrabold text-xs shadow-md">
                    <Sparkles className="w-3.5 h-3.5 fill-slate-900" />
                    Exclusive Partner
                  </span>
                )}
              </div>

              <p className="text-indigo-200 font-medium text-base mt-1 flex items-center gap-1.5">
                <span>By {profile.teacherName}</span>
                {profile.isVerified && (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 fill-emerald-950 inline-block" />
                )}
              </p>

              {profile.tagline && (
                <p className="text-slate-300 text-xs sm:text-sm italic mt-2">"{profile.tagline}"</p>
              )}

              <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-slate-300">
                <div className="flex items-center gap-1 text-amber-300 font-bold bg-white/10 px-2.5 py-1 rounded-lg">
                  <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                  <span>{profile.avgRating > 0 ? profile.avgRating : 'New'}</span>
                  <span className="text-slate-400 font-normal">({profile.reviewCount} reviews)</span>
                </div>

                <div className="flex items-center gap-1">
                  <MapPin className="w-4 h-4 text-indigo-400" />
                  <span>{profile.area ? `${profile.area}, ${profile.city}` : profile.city}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Contact Buttons Header */}
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            {whatsappUrl && (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 md:flex-initial inline-flex items-center justify-center gap-2 px-5 py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm rounded-xl shadow-lg transition-transform hover:scale-105"
              >
                <MessageCircle className="w-5 h-5 fill-white text-emerald-600" />
                <span>Chat on WhatsApp</span>
              </a>
            )}

            {profile.phone && (
              <a
                href={`tel:${profile.phone}`}
                className="flex-1 md:flex-initial inline-flex items-center justify-center gap-2 px-5 py-3 bg-white text-slate-900 hover:bg-slate-100 font-bold text-sm rounded-xl shadow-lg transition-transform hover:scale-105"
              >
                <Phone className="w-4 h-4 text-indigo-600" />
                <span>Call Teacher</span>
              </a>
            )}
          </div>
        </div>
      </section>

      {/* Main Grid: Profile Info & Inquiry Form */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex-1 w-full grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left 2 Columns: Overview, Batches, Reviews */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Overview / About Card */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xs">
            <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Award className="w-5 h-5 text-indigo-600" />
              <span>About Coaching & Faculty</span>
            </h2>

            {profile.aboutUs ? (
              <p className="text-slate-600 text-sm leading-relaxed whitespace-pre-line">{profile.aboutUs}</p>
            ) : (
              <p className="text-slate-500 text-sm italic">
                Welcome to {profile.name}! Led by {profile.teacherName}, we specialize in quality education and concept-based learning.
              </p>
            )}

            {/* Subjects & Classes Offered Grid */}
            <div className="mt-6 pt-6 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Subjects Taught</h4>
                <div className="flex flex-wrap gap-1.5">
                  {profile.subjectsOffered && profile.subjectsOffered.length > 0 ? (
                    profile.subjectsOffered.map((s, i) => (
                      <span key={i} className="px-3 py-1 bg-indigo-50 text-indigo-700 font-semibold text-xs rounded-lg border border-indigo-100">
                        {s}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-slate-400">Core Subjects</span>
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Classes & Grades</h4>
                <div className="flex flex-wrap gap-1.5">
                  {profile.classesOffered && profile.classesOffered.length > 0 ? (
                    profile.classesOffered.map((c, i) => (
                      <span key={i} className="px-3 py-1 bg-purple-50 text-purple-700 font-semibold text-xs rounded-lg border border-purple-100">
                        {c}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-slate-400">Class 9, 10, 11, 12</span>
                  )}
                </div>
              </div>
            </div>

            {/* Location & Maps Button */}
            {profile.address && (
              <div className="mt-6 pt-6 border-t border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-start gap-2">
                  <MapPin className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">Coaching Address</h4>
                    <p className="text-xs text-slate-600 mt-0.5">{profile.address}, {profile.city}</p>
                  </div>
                </div>

                {mapsUrl && (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-3 py-2 rounded-xl border border-indigo-100 transition-colors"
                  >
                    View on Google Maps →
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Active Batches Section */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xs">
            <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-indigo-600" />
              <span>Available Batches</span>
            </h2>

            {profile.batches && profile.batches.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {profile.batches.map((batch) => (
                  <div key={batch.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                    <h3 className="font-bold text-slate-900 text-sm">{batch.name}</h3>
                    <div className="mt-2 space-y-1 text-xs text-slate-600">
                      {batch.subject && <p><span className="font-medium text-slate-500">Subject:</span> {batch.subject}</p>}
                      {batch.className && <p><span className="font-medium text-slate-500">Class:</span> {batch.className}</p>}
                      {batch.timeSlot && (
                        <p className="flex items-center gap-1 text-indigo-600 font-medium">
                          <Clock className="w-3 h-3" />
                          <span>{batch.timeSlot}</span>
                        </p>
                      )}
                      {batch.feeAmount > 0 && (
                        <p className="font-extrabold text-emerald-600 text-sm pt-1">
                          ₹{batch.feeAmount} <span className="text-slate-400 text-xs font-normal">/ batch fee</span>
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-500 text-sm italic">
                No active public batch list currently published. Please contact teacher directly for upcoming batch timings.
              </p>
            )}
          </div>

          {/* Reviews & Ratings Section */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <Star className="w-5 h-5 text-amber-500 fill-amber-400" />
                <span>Reviews & Ratings</span>
              </h2>

              <button
                onClick={() => setShowReviewModal(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors"
              >
                <MessageSquarePlus className="w-4 h-4" />
                <span>Write a Review</span>
              </button>
            </div>

            {/* Google Business Profile Reviews Badge */}
            {profile.googleMapsUrl && (
              <div className="p-4 bg-gradient-to-r from-blue-50 via-white to-blue-50 rounded-2xl border border-blue-200 mb-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center font-extrabold text-blue-600 text-lg shadow-2xs">
                    G
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h4 className="font-bold text-slate-900 text-sm">Google Business Profile</h4>
                      <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded-full">Verified</span>
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5">
                      {profile.googleRating ? `${profile.googleRating} ★ Rating` : 'Verified Google Maps Listing'} 
                      {profile.googleReviewCount ? ` (${profile.googleReviewCount}+ Google Reviews)` : ''}
                    </p>
                  </div>
                </div>

                <a
                  href={profile.googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 shrink-0"
                >
                  <span>Read Reviews on Google Maps</span>
                  <span>↗</span>
                </a>
              </div>
            )}

            {/* Rating Summary Bar */}
            <div className="p-6 bg-amber-50/50 rounded-2xl border border-amber-200/60 mb-6 flex flex-col sm:flex-row items-center gap-6">
              <div className="text-center sm:text-left">
                <div className="text-4xl font-extrabold text-slate-900">{profile.avgRating > 0 ? profile.avgRating : 'N/A'}</div>
                <div className="flex items-center justify-center sm:justify-start gap-1 text-amber-400 my-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`w-4 h-4 ${star <= Math.round(profile.avgRating) ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`}
                    />
                  ))}
                </div>
                <div className="text-xs text-slate-500 font-medium">Based on {profile.reviewCount} reviews</div>
              </div>

              {/* 5 Star Breakdown */}
              <div className="flex-1 w-full space-y-1.5 text-xs text-slate-600">
                {[5, 4, 3, 2, 1].map((star) => {
                  const count = profile.ratingBreakdown?.[star] || 0;
                  const pct = profile.reviewCount > 0 ? Math.round((count / profile.reviewCount) * 100) : 0;
                  return (
                    <div key={star} className="flex items-center gap-2">
                      <span className="w-3 font-semibold text-right">{star}</span>
                      <Star className="w-3 h-3 fill-amber-400 text-amber-400 shrink-0" />
                      <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-400 rounded-full" style={{ width: `${pct}%` }}></div>
                      </div>
                      <span className="w-8 text-right text-slate-400 font-medium">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Review List */}
            {profile.reviews && profile.reviews.length > 0 ? (
              <div className="space-y-4">
                {profile.reviews.map((rev) => (
                  <div key={rev.id} className={`p-4 rounded-2xl border ${rev.source === 'GOOGLE' ? 'bg-blue-50/40 border-blue-200/60' : 'bg-slate-50 border-slate-100'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-full font-bold text-xs flex items-center justify-center ${rev.source === 'GOOGLE' ? 'bg-blue-100 text-blue-700' : 'bg-indigo-100 text-indigo-700'}`}>
                          {rev.source === 'GOOGLE' ? 'G' : rev.reviewerName.substring(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <h4 className="font-bold text-slate-900 text-sm">{rev.reviewerName}</h4>
                            {rev.source === 'GOOGLE' && (
                              <span className="text-[9px] bg-blue-100 text-blue-700 font-bold px-1.5 py-0.5 rounded-full">Google</span>
                            )}
                          </div>
                          <span className="text-[10px] font-medium text-slate-400">{rev.reviewerRole}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star
                            key={s}
                            className={`w-3 h-3 ${s <= rev.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`}
                          />
                        ))}
                      </div>
                    </div>

                    <p className="text-xs text-slate-700 italic leading-relaxed">"{rev.comment}"</p>
                    <span className="text-[10px] text-slate-400 mt-2 block">
                      {new Date(rev.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-500 text-sm text-center py-6">
                No reviews yet. Be the first student or parent to share your experience!
              </p>
            )}
          </div>
        </div>

        {/* Right 1 Column: Student Lead Inquiry Form */}
        <div className="lg:col-span-1">
          <div className="sticky top-24 bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-lg">
            <h3 className="text-lg font-bold text-slate-900 mb-1 flex items-center gap-2">
              <Send className="w-5 h-5 text-indigo-600" />
              <span>Inquire & Join Coaching</span>
            </h3>
            <p className="text-xs text-slate-500 mb-6">
              Fill out this quick form to express interest. Teacher {profile.teacherName} will contact you directly.
            </p>

            <form onSubmit={handleInquirySubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Student Name *</label>
                <input
                  type="text"
                  required
                  placeholder="Enter student full name"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Phone / WhatsApp Number *</label>
                <input
                  type="tel"
                  required
                  placeholder="10-digit mobile number"
                  value={inquiryPhone}
                  onChange={(e) => setInquiryPhone(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Subject</label>
                  <input
                    type="text"
                    placeholder="e.g. Mathematics"
                    value={inquirySubject}
                    onChange={(e) => setInquirySubject(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Class / Grade</label>
                  <input
                    type="text"
                    placeholder="e.g. Class 10"
                    value={inquiryGrade}
                    onChange={(e) => setInquiryGrade(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Message (Optional)</label>
                <textarea
                  rows={3}
                  placeholder="Any specific requirement or questions..."
                  value={inquiryMessage}
                  onChange={(e) => setInquiryMessage(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                ></textarea>
              </div>

              <button
                type="submit"
                disabled={submittingInquiry}
                className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl transition-colors shadow-md flex items-center justify-center gap-2"
              >
                {submittingInquiry ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Send Admission Inquiry</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </main>

      {/* Review Submission Modal */}
      {showReviewModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl relative">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Write a Review for {profile.name}</h3>

            <form onSubmit={handleReviewSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Your Name *</label>
                <input
                  type="text"
                  required
                  placeholder="Enter your name"
                  value={reviewerName}
                  onChange={(e) => setReviewerName(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">You Are A</label>
                <select
                  value={reviewerRole}
                  onChange={(e) => setReviewerRole(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 outline-none cursor-pointer"
                >
                  <option value="Student">Student</option>
                  <option value="Parent">Parent</option>
                  <option value="Alumni">Alumni</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Rating *</label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      className="p-1 focus:outline-none"
                    >
                      <Star
                        className={`w-6 h-6 ${star <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`}
                      />
                    </button>
                  ))}
                  <span className="text-xs font-bold text-slate-600 ml-2">{rating} Stars</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Review Feedback *</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Describe your teaching experience, faculty guidance, and results..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                ></textarea>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowReviewModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={submittingReview}
                  className="px-5 py-2 bg-indigo-600 text-white font-bold text-xs rounded-xl hover:bg-indigo-700 transition-colors"
                >
                  {submittingReview ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Submit Review'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
