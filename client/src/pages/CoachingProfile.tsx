import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Star, MapPin, Phone, MessageCircle, CheckCircle2, BookOpen, Clock, Sparkles, ArrowLeft, Send, Loader2, MessageSquarePlus } from 'lucide-react';
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

  // Inquiry Form state
  const [studentName, setStudentName] = useState('');
  const [inquiryPhone, setInquiryPhone] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  const [inquiryMessage, setInquiryMessage] = useState('');
  const [submittingInquiry, setSubmittingInquiry] = useState(false);

  // Review Modal state
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewerName, setReviewerName] = useState('');
  const [reviewerRole, setReviewerRole] = useState('Student');
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  const fetchProfile = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/marketplace/coaching/${slug}`);
      const data = await res.json();
      if (data.success) {
        setProfile(data.data);
      } else {
        toast.error('Coaching profile not found');
      }
    } catch (err) {
      console.error('Error loading coaching profile:', err);
      toast.error('Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleInquirySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !studentName.trim() || !inquiryPhone.trim()) {
      toast.error('Please enter your name and phone number');
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
          subject: selectedSubject,
          classGrade: selectedClass,
          message: inquiryMessage
        })
      });

      const data = await res.json();
      if (data.success) {
        toast.success(data.message || 'Inquiry sent successfully!');
        setStudentName('');
        setInquiryPhone('');
        setInquiryMessage('');
      } else {
        toast.error(data.message || 'Failed to submit inquiry');
      }
    } catch (err) {
      toast.error('Network error. Please try again.');
    } finally {
      setSubmittingInquiry(false);
    }
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !reviewerName.trim() || !reviewComment.trim()) {
      toast.error('Please fill in your name and comment');
      return;
    }

    setSubmittingReview(true);
    try {
      const res = await fetch(`/api/marketplace/coaching/${profile.id}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewerName,
          reviewerRole,
          rating: reviewRating,
          comment: reviewComment
        })
      });

      const data = await res.json();
      if (data.success) {
        toast.success('Thank you! Your review has been submitted.');
        setShowReviewModal(false);
        setReviewerName('');
        setReviewComment('');
        fetchProfile();
      } else {
        toast.error(data.message || 'Failed to submit review');
      }
    } catch (err) {
      toast.error('Network error. Please try again.');
    } finally {
      setSubmittingReview(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-neutral-900 mx-auto mb-3" />
          <p className="text-sm font-semibold text-neutral-500">Loading coaching profile...</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-neutral-50 flex flex-col items-center justify-center p-6 text-center">
        <h2 className="text-2xl font-bold text-neutral-900 mb-2">Coaching Profile Not Found</h2>
        <p className="text-sm text-neutral-500 mb-6">The coaching profile you are looking for does not exist or has been unlisted.</p>
        <Link to="/coaching" className="px-6 py-2.5 bg-neutral-900 text-white font-bold text-xs rounded-full">
          Back to Marketplace
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
    <div className="min-h-screen bg-neutral-50 flex flex-col font-sans pb-16 text-neutral-900 selection:bg-neutral-900 selection:text-white">
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

      {/* Profile Header Banner */}
      <section className="bg-white border-b border-neutral-200/80 py-10 px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            {profile.logoUrl ? (
              <img
                src={profile.logoUrl}
                alt={profile.name}
                className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl object-cover border border-neutral-200 shadow-xs"
              />
            ) : (
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-neutral-900 text-white flex items-center justify-center font-extrabold text-3xl shadow-sm">
                {profile.name.substring(0, 2).toUpperCase()}
              </div>
            )}

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl sm:text-4xl font-extrabold text-[#1A1F36] tracking-tight">{profile.name}</h1>
                {profile.isExclusive && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold shadow-2xs">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500 fill-amber-400" />
                    <span>Exclusive MathLogs Partner</span>
                  </span>
                )}
              </div>

              <p className="mt-1 text-sm font-semibold text-neutral-600 flex items-center gap-2">
                <span>Faculty / Teacher: <strong className="text-neutral-900">{profile.teacherName}</strong></span>
                {profile.isVerified && (
                  <span className="inline-flex items-center gap-1 text-blue-600 text-xs font-bold">
                    <CheckCircle2 className="w-4 h-4 fill-blue-600 text-white" />
                    <span>Verified</span>
                  </span>
                )}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-4 text-xs font-medium text-neutral-500">
                <span className="flex items-center gap-1">
                  <MapPin className="w-4 h-4 text-neutral-400" />
                  <span>{profile.area ? `${profile.area}, ${profile.city}` : profile.city}</span>
                </span>

                <span className="flex items-center gap-1 font-bold text-neutral-800 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                  <span>{profile.avgRating > 0 ? profile.avgRating : 'New'}</span>
                  {profile.reviewCount > 0 && (
                    <span className="text-neutral-400 font-normal">({profile.reviewCount} reviews)</span>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Action CTAs */}
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto pt-2 md:pt-0 border-t md:border-t-0 border-neutral-100">
            {whatsappUrl && (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 md:flex-initial inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#16a34a] hover:bg-[#15803d] text-white font-bold text-xs rounded-full shadow-xs transition-transform hover:scale-105"
              >
                <MessageCircle className="w-4 h-4 fill-white text-[#16a34a]" />
                <span>Chat on WhatsApp</span>
              </a>
            )}

            {profile.phone && (
              <a
                href={`tel:${profile.phone}`}
                className="flex-1 md:flex-initial inline-flex items-center justify-center gap-2 px-6 py-3 bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs rounded-full shadow-xs transition-colors"
              >
                <Phone className="w-4 h-4" />
                <span>Call Teacher</span>
              </a>
            )}
          </div>
        </div>
      </section>

      {/* Main Content Details Grid */}
      <main className="max-w-7xl mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-3 gap-8 w-full">
        {/* Left 2 Cols: Details & Reviews */}
        <div className="lg:col-span-2 space-y-8">
          {/* Tagline & About */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-neutral-200/80 shadow-xs">
            <h2 className="text-xl font-extrabold text-[#1A1F36] mb-4">About Coaching</h2>
            {profile.tagline && (
              <blockquote className="p-4 bg-neutral-50 border-l-4 border-neutral-900 rounded-r-2xl text-sm font-semibold text-neutral-700 italic mb-4">
                "{profile.tagline}"
              </blockquote>
            )}

            <p className="text-sm text-neutral-600 leading-relaxed font-medium">
              {profile.aboutUs || `${profile.name} is a premier coaching center in ${profile.city} directed by ${profile.teacherName}, offering expert guidance for students across subjects.`}
            </p>

            {/* Subjects & Classes Tags */}
            <div className="mt-6 pt-6 border-t border-neutral-100 space-y-4">
              <div>
                <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Subjects Taught</h4>
                <div className="flex flex-wrap gap-2">
                  {profile.subjectsOffered && profile.subjectsOffered.length > 0 ? (
                    profile.subjectsOffered.map((s, i) => (
                      <span key={i} className="px-3.5 py-1 rounded-full text-xs font-semibold bg-neutral-100 text-neutral-800 border border-neutral-200/80">
                        {s}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-neutral-400">All Subjects</span>
                  )}
                </div>
              </div>

              {profile.classesOffered && profile.classesOffered.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-2">Classes & Grades Covered</h4>
                  <div className="flex flex-wrap gap-2">
                    {profile.classesOffered.map((c, i) => (
                      <span key={i} className="px-3.5 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-900 border border-purple-200/80">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Location & Maps Link */}
            {profile.address && (
              <div className="mt-6 pt-6 border-t border-neutral-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <MapPin className="w-5 h-5 text-neutral-500 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-neutral-900">Coaching Address</h4>
                    <p className="text-xs text-neutral-600 font-medium mt-0.5">{profile.address}, {profile.city}</p>
                  </div>
                </div>

                {mapsUrl && (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-bold text-neutral-900 hover:text-black bg-neutral-100 hover:bg-neutral-200 px-4 py-2 rounded-full border border-neutral-200 transition-colors shrink-0"
                  >
                    View on Google Maps →
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Available Batches Section */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-neutral-200/80 shadow-xs">
            <h2 className="text-xl font-extrabold text-[#1A1F36] mb-4 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-neutral-900" />
              <span>Available Batches</span>
            </h2>

            {profile.batches && profile.batches.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {profile.batches.map((batch) => (
                  <div key={batch.id} className="p-5 bg-neutral-50 rounded-2xl border border-neutral-200/60">
                    <h3 className="font-bold text-neutral-900 text-sm">{batch.name}</h3>
                    <div className="mt-2 space-y-1 text-xs text-neutral-600 font-medium">
                      {batch.subject && <p><span className="text-neutral-400">Subject:</span> {batch.subject}</p>}
                      {batch.className && <p><span className="text-neutral-400">Class:</span> {batch.className}</p>}
                      {batch.timeSlot && (
                        <p className="flex items-center gap-1 text-neutral-900 font-bold mt-1">
                          <Clock className="w-3.5 h-3.5 text-neutral-500" />
                          <span>{batch.timeSlot}</span>
                        </p>
                      )}
                      {batch.feeAmount > 0 && (
                        <p className="font-extrabold text-emerald-600 text-sm pt-1">
                          ₹{batch.feeAmount} <span className="text-neutral-400 text-xs font-normal">/ batch fee</span>
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-neutral-500 text-sm italic font-medium">
                No active public batch list currently published. Please contact teacher directly for upcoming batch timings.
              </p>
            )}
          </div>

          {/* Reviews & Ratings Section */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-neutral-200/80 shadow-xs">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-extrabold text-[#1A1F36] flex items-center gap-2">
                <Star className="w-5 h-5 text-amber-500 fill-amber-400" />
                <span>Reviews & Ratings</span>
              </h2>

              <button
                onClick={() => setShowReviewModal(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-neutral-900 bg-neutral-100 hover:bg-neutral-200 rounded-full transition-colors"
              >
                <MessageSquarePlus className="w-4 h-4" />
                <span>Write a Review</span>
              </button>
            </div>

            {/* Google Business Profile Reviews Badge */}
            {profile.googleMapsUrl && (
              <div className="p-5 bg-gradient-to-r from-blue-50/50 via-white to-blue-50/50 rounded-2xl border border-blue-200/80 mb-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-white border border-neutral-200 flex items-center justify-center font-extrabold text-blue-600 text-lg shadow-2xs">
                    G
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h4 className="font-bold text-neutral-900 text-sm">Google Business Profile</h4>
                      <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded-full">Verified</span>
                    </div>
                    <p className="text-xs text-neutral-600 font-medium mt-0.5">
                      {profile.googleRating ? `${profile.googleRating} ★ Rating` : 'Verified Google Maps Listing'} 
                      {profile.googleReviewCount ? ` (${profile.googleReviewCount}+ Google Reviews)` : ''}
                    </p>
                  </div>
                </div>

                <a
                  href={profile.googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-full shadow-2xs transition-colors flex items-center gap-1.5 shrink-0"
                >
                  <span>Read Reviews on Google Maps</span>
                  <span>↗</span>
                </a>
              </div>
            )}

            {/* Rating Summary Bar */}
            <div className="p-6 bg-amber-50/60 rounded-2xl border border-amber-200/60 mb-6 flex flex-col sm:flex-row items-center gap-6">
              <div className="text-center sm:text-left">
                <div className="text-4xl font-extrabold text-neutral-900">{profile.avgRating > 0 ? profile.avgRating : 'N/A'}</div>
                <div className="flex items-center justify-center sm:justify-start gap-1 text-amber-400 my-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`w-4 h-4 ${star <= Math.round(profile.avgRating) ? 'fill-amber-400 text-amber-400' : 'text-neutral-300'}`}
                    />
                  ))}
                </div>
                <div className="text-xs text-neutral-500 font-semibold">Based on {profile.reviewCount} reviews</div>
              </div>

              {/* 5 Star Breakdown */}
              <div className="flex-1 w-full space-y-1.5 text-xs font-semibold text-neutral-600">
                {[5, 4, 3, 2, 1].map((star) => {
                  const count = profile.ratingBreakdown?.[star] || 0;
                  const pct = profile.reviewCount > 0 ? Math.round((count / profile.reviewCount) * 100) : 0;
                  return (
                    <div key={star} className="flex items-center gap-2">
                      <span className="w-6 text-right text-neutral-500 font-bold">{star} ★</span>
                      <div className="flex-1 h-2.5 bg-white rounded-full overflow-hidden border border-amber-200/60">
                        <div className="h-full bg-amber-400 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-8 text-neutral-400 font-normal text-[11px]">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Review List */}
            {profile.reviews && profile.reviews.length > 0 ? (
              <div className="space-y-4">
                {profile.reviews.map((rev) => (
                  <div key={rev.id} className={`p-5 rounded-2xl border ${rev.source === 'GOOGLE' ? 'bg-blue-50/40 border-blue-200/60' : 'bg-neutral-50 border-neutral-200/60'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-full font-bold text-xs flex items-center justify-center ${rev.source === 'GOOGLE' ? 'bg-blue-100 text-blue-700' : 'bg-neutral-900 text-white'}`}>
                          {rev.source === 'GOOGLE' ? 'G' : rev.reviewerName.substring(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <h4 className="font-bold text-neutral-900 text-sm">{rev.reviewerName}</h4>
                            {rev.source === 'GOOGLE' && (
                              <span className="text-[9px] bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded-full">Google</span>
                            )}
                          </div>
                          <span className="text-[10px] font-semibold text-neutral-400">{rev.reviewerRole}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star
                            key={s}
                            className={`w-3.5 h-3.5 ${s <= rev.rating ? 'fill-amber-400 text-amber-400' : 'text-neutral-300'}`}
                          />
                        ))}
                      </div>
                    </div>

                    <p className="text-xs text-neutral-700 italic leading-relaxed font-medium">"{rev.comment}"</p>
                    <span className="text-[10px] text-neutral-400 font-medium mt-2 block">
                      {new Date(rev.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-neutral-500 text-sm text-center py-6 font-medium">
                No reviews yet. Be the first student or parent to share your feedback!
              </p>
            )}
          </div>
        </div>

        {/* Right 1 Col: Lead Inquiry Card */}
        <div className="space-y-6">
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-neutral-200/80 shadow-md sticky top-24">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-neutral-100 border border-neutral-200 text-neutral-700 text-xs font-bold mb-3">
              <Sparkles className="w-3.5 h-3.5 text-amber-500 fill-amber-400" />
              <span>Direct Coaching Inquiry</span>
            </div>

            <h3 className="text-xl font-extrabold text-[#1A1F36]">Interested in Joining?</h3>
            <p className="text-xs text-neutral-500 font-medium mt-1 mb-6">
              Send your contact details to get callback & batch information directly from teacher.
            </p>

            <form onSubmit={handleInquirySubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">Student / Parent Name *</label>
                <input
                  type="text"
                  required
                  placeholder="Your full name"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium text-neutral-900 outline-none focus:bg-white focus:ring-2 focus:ring-neutral-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">Phone Number *</label>
                <input
                  type="tel"
                  required
                  placeholder="10-digit mobile number"
                  value={inquiryPhone}
                  onChange={(e) => setInquiryPhone(e.target.value)}
                  className="w-full px-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium text-neutral-900 outline-none focus:bg-white focus:ring-2 focus:ring-neutral-900"
                />
              </div>

              {profile.subjectsOffered && profile.subjectsOffered.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1">Interested Subject</label>
                  <select
                    value={selectedSubject}
                    onChange={(e) => setSelectedSubject(e.target.value)}
                    className="w-full px-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-semibold text-neutral-800 outline-none"
                  >
                    <option value="">Select subject (Optional)</option>
                    {profile.subjectsOffered.map((sub, i) => (
                      <option key={i} value={sub}>{sub}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">Class / Grade</label>
                <input
                  type="text"
                  placeholder="e.g. Class 10 / JEE"
                  value={selectedClass}
                  onChange={(e) => setSelectedClass(e.target.value)}
                  className="w-full px-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium text-neutral-900 outline-none focus:bg-white focus:ring-2 focus:ring-neutral-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">Message (Optional)</label>
                <textarea
                  rows={3}
                  placeholder="Any questions about timings or fees..."
                  value={inquiryMessage}
                  onChange={(e) => setInquiryMessage(e.target.value)}
                  className="w-full px-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium text-neutral-900 outline-none focus:bg-white focus:ring-2 focus:ring-neutral-900 resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={submittingInquiry}
                className="w-full py-3 bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs rounded-full transition-all hover:shadow-md active:scale-95 flex items-center justify-center gap-2"
              >
                {submittingInquiry ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Send Inquiry to Teacher</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </main>

      {/* Write Review Modal */}
      {showReviewModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-neutral-200">
            <h3 className="text-xl font-extrabold text-[#1A1F36] mb-1">Write a Review</h3>
            <p className="text-xs text-neutral-500 font-medium mb-6">Share your learning experience with {profile.name}.</p>

            <form onSubmit={handleReviewSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">Your Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rahul Sharma"
                  value={reviewerName}
                  onChange={(e) => setReviewerName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium text-neutral-900 outline-none focus:ring-2 focus:ring-neutral-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">I am a *</label>
                <select
                  value={reviewerRole}
                  onChange={(e) => setReviewerRole(e.target.value)}
                  className="w-full px-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-semibold text-neutral-800 outline-none"
                >
                  <option value="Student">Student</option>
                  <option value="Parent">Parent</option>
                  <option value="Alumni">Alumni</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-2">Rating *</label>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setReviewRating(star)}
                      className="p-1.5 focus:outline-none transition-transform hover:scale-110"
                    >
                      <Star
                        className={`w-7 h-7 ${star <= reviewRating ? 'fill-amber-400 text-amber-400' : 'text-neutral-300'}`}
                      />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">Your Feedback *</label>
                <textarea
                  rows={4}
                  required
                  placeholder="Share details about teaching quality, results, environment..."
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  className="w-full px-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium text-neutral-900 outline-none focus:ring-2 focus:ring-neutral-900 resize-none"
                />
              </div>

              <div className="flex items-center gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowReviewModal(false)}
                  className="flex-1 py-3 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-bold text-xs rounded-full transition-colors"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={submittingReview}
                  className="flex-1 py-3 bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs rounded-full transition-colors flex items-center justify-center"
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
