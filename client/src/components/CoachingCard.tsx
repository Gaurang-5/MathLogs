import React from 'react';
import { Link } from 'react-router-dom';
import { Star, MapPin, Phone, CheckCircle2, MessageCircle, ChevronRight } from 'lucide-react';

export interface CoachingItem {
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
  googleMapsUrl?: string | null;
  googleRating?: number | null;
  googleReviewCount?: number;
  subjectsOffered: string[];
  classesOffered: string[];
  isExclusive: boolean;
  isVerified: boolean;
  avgRating: number;
  reviewCount: number;
}

interface CoachingCardProps {
  coaching: CoachingItem;
}

const SUBJECT_COLORS: Record<string, string> = {
  Mathematics: 'bg-blue-50 text-blue-700 border-blue-200',
  Physics: 'bg-violet-50 text-violet-700 border-violet-200',
  Chemistry: 'bg-rose-50 text-rose-700 border-rose-200',
  Biology: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Science: 'bg-teal-50 text-teal-700 border-teal-200',
  English: 'bg-amber-50 text-amber-700 border-amber-200',
  Commerce: 'bg-orange-50 text-orange-700 border-orange-200',
};

const getSubjectColor = (sub: string) =>
  SUBJECT_COLORS[sub] || 'bg-neutral-100 text-neutral-700 border-neutral-200/80';

export const CoachingCard: React.FC<CoachingCardProps> = ({ coaching }) => {
  const whatsappUrl = coaching.whatsappPhone
    ? `https://wa.me/${coaching.whatsappPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
        `Hi ${coaching.teacherName}, I saw your listing on MathLogs Marketplace and would like to inquire about coaching classes.`
      )}`
    : null;

  const rating = coaching.googleRating ?? (coaching.avgRating > 0 ? coaching.avgRating : null);
  const reviewCount = coaching.googleReviewCount ?? coaching.reviewCount;
  const isGoogle = !!coaching.googleRating;
  const locationStr = coaching.area ? `${coaching.area}, ${coaching.city}` : coaching.city;

  return (
    <div className="group bg-white rounded-2xl border border-neutral-200/80 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 flex flex-col overflow-hidden relative">
      {/* Exclusive Badge */}
      {coaching.isExclusive && (
        <div className="absolute top-3.5 right-3.5 z-10 bg-gradient-to-r from-amber-500 to-orange-400 text-white text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full shadow-sm">
          ⭐ Featured
        </div>
      )}

      {/* Card Header / Hero */}
      <div className="p-5 pb-0 flex items-start gap-3.5">
        {/* Logo / Avatar */}
        <div className="shrink-0">
          {coaching.logoUrl ? (
            <img
              src={coaching.logoUrl}
              alt={coaching.name}
              className="w-14 h-14 rounded-2xl object-cover border border-neutral-100 shadow-sm"
            />
          ) : (
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-neutral-900 to-neutral-700 flex items-center justify-center text-white font-black text-xl shadow-sm">
              {coaching.name.substring(0, 2).toUpperCase()}
            </div>
          )}
        </div>

        {/* Name & Teacher */}
        <div className="flex-1 min-w-0 pt-0.5">
          <Link to={`/coaching/${coaching.slug}`} className="block">
            <h3 className="font-extrabold text-[#1A1F36] text-[15px] leading-snug line-clamp-1 group-hover:text-neutral-600 transition-colors">
              {coaching.name}
            </h3>
          </Link>
          <p className="text-xs text-neutral-500 font-medium flex items-center gap-1.5 mt-0.5">
            <span className="truncate">By {coaching.teacherName}</span>
            {coaching.isVerified && (
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-500 shrink-0" title="Verified Teacher" />
            )}
          </p>

          {/* Location */}
          <div className="flex items-center gap-1 mt-1.5 text-neutral-400">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <span className="text-[12px] font-medium line-clamp-1">{locationStr}</span>
          </div>
        </div>

        {/* Rating Pill */}
        {rating !== null && (
          <div className={`shrink-0 flex flex-col items-center justify-center rounded-xl px-2.5 py-1.5 min-w-[52px] border ${
            isGoogle 
              ? 'bg-gradient-to-b from-blue-50 to-white border-blue-200/90 shadow-2xs' 
              : 'bg-amber-50 border-amber-200/80'
          }`}>
            {isGoogle ? (
              <div className="flex items-center gap-1">
                <span className="w-3.5 h-3.5 rounded-full bg-blue-600 text-white font-extrabold text-[8px] flex items-center justify-center">G</span>
                <span className="text-[10px] font-extrabold text-blue-700">VERIFIED</span>
              </div>
            ) : null}
            <div className="flex items-center gap-0.5 mt-0.5">
              <Star className="w-3 h-3 fill-amber-400 text-amber-500" />
              <span className="text-xs font-black text-neutral-800">{typeof rating === 'number' ? rating.toFixed(1) : rating}</span>
            </div>
            {reviewCount > 0 && (
              <span className="text-[10px] text-neutral-400 font-medium leading-none mt-0.5">{reviewCount} rev</span>
            )}
          </div>
        )}
      </div>

      {/* Tagline */}
      {coaching.tagline && (
        <p className="mx-5 mt-3 text-xs text-neutral-500 italic line-clamp-2 bg-neutral-50 px-3 py-2 rounded-xl border border-neutral-100">
          "{coaching.tagline}"
        </p>
      )}

      {/* Subjects */}
      <div className="px-5 mt-3 flex flex-wrap gap-1.5">
        {coaching.subjectsOffered && coaching.subjectsOffered.length > 0 ? (
          <>
            {coaching.subjectsOffered.slice(0, 3).map((sub, i) => (
              <span
                key={i}
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${getSubjectColor(sub)}`}
              >
                {sub}
              </span>
            ))}
            {coaching.subjectsOffered.length > 3 && (
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-neutral-100 text-neutral-500 border border-neutral-200/80">
                +{coaching.subjectsOffered.length - 3} more
              </span>
            )}
          </>
        ) : (
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-neutral-100 text-neutral-500 border border-neutral-200/80">
            General Coaching
          </span>
        )}
      </div>

      {/* Action Footer */}
      <div className="mt-4 px-5 pb-5 flex items-center gap-2">
        <Link
          to={`/coaching/${coaching.slug}`}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold text-white bg-neutral-900 hover:bg-neutral-700 rounded-xl transition-all active:scale-95 min-h-[44px]"
        >
          <span>View Profile</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>

        {whatsappUrl && (
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Chat on WhatsApp"
            className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 text-xs font-bold text-[#16a34a] bg-[#f0fdf4] hover:bg-[#dcfce7] border border-[#bbf7d0] rounded-xl transition-colors active:scale-95 min-h-[44px] min-w-[44px]"
          >
            <MessageCircle className="w-4 h-4 fill-[#16a34a] text-white" />
            <span className="hidden sm:inline">WhatsApp</span>
          </a>
        )}

        {coaching.phone && (
          <a
            href={`tel:${coaching.phone}`}
            title={`Call ${coaching.phone}`}
            className="flex items-center justify-center p-2.5 text-neutral-700 bg-white border border-neutral-200/80 rounded-xl hover:bg-neutral-100 transition-colors active:scale-95 min-h-[44px] min-w-[44px]"
          >
            <Phone className="w-4 h-4 text-neutral-700" />
          </a>
        )}
      </div>
    </div>
  );
};

export default CoachingCard;
