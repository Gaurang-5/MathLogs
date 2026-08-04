import React from 'react';
import { Link } from 'react-router-dom';
import { Star, MapPin, Phone, CheckCircle2, BookOpen, MessageCircle, Sparkles } from 'lucide-react';

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

export const CoachingCard: React.FC<CoachingCardProps> = ({ coaching }) => {
  const whatsappUrl = coaching.whatsappPhone
    ? `https://wa.me/${coaching.whatsappPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
        `Hi ${coaching.teacherName}, I found your coaching "${coaching.name}" on MathLogs Marketplace and would like to inquire about admissions.`
      )}`
    : null;

  return (
    <div className={`relative flex flex-col bg-white rounded-2xl border transition-all duration-300 hover:shadow-xl hover:-translate-y-1 ${
      coaching.isExclusive ? 'border-amber-300 ring-2 ring-amber-400/20 shadow-amber-100/50 shadow-md' : 'border-gray-200 shadow-sm'
    }`}>
      {/* Top Banner & Badge Header */}
      <div className="p-5 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {coaching.logoUrl ? (
              <img
                src={coaching.logoUrl}
                alt={coaching.name}
                className="w-14 h-14 rounded-xl object-cover border border-gray-100 shadow-xs"
              />
            ) : (
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-xl shadow-xs">
                {coaching.name.substring(0, 2).toUpperCase()}
              </div>
            )}
            <div>
              <Link to={`/coaching/${coaching.slug}`} className="group">
                <h3 className="font-bold text-gray-900 text-lg group-hover:text-indigo-600 transition-colors line-clamp-1">
                  {coaching.name}
                </h3>
              </Link>
              <p className="text-sm font-medium text-gray-600 flex items-center gap-1.5 mt-0.5">
                <span>By {coaching.teacherName}</span>
                {coaching.isVerified && (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 fill-emerald-50 inline-block" />
                )}
              </p>
            </div>
          </div>

          {/* Exclusive Partner Gold Badge */}
          {coaching.isExclusive && (
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold text-xs shadow-xs animate-pulse">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Exclusive Partner</span>
            </div>
          )}
        </div>

        {/* Tagline */}
        {coaching.tagline && (
          <p className="text-xs text-gray-500 italic mt-3 line-clamp-2 bg-gray-50 p-2 rounded-lg border border-gray-100">
            "{coaching.tagline}"
          </p>
        )}

        {/* Location & Rating */}
        <div className="mt-4 flex items-center justify-between text-xs text-gray-600 border-t border-gray-100 pt-3">
          <div className="flex items-center gap-1 text-gray-500 font-medium line-clamp-1">
            <MapPin className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            <span>{coaching.area ? `${coaching.area}, ${coaching.city}` : coaching.city}</span>
          </div>

          <div className="flex items-center gap-1 font-semibold text-gray-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
            {coaching.googleRating ? (
              <span className="flex items-center gap-1">
                <span className="font-extrabold text-blue-600 text-[10px]">G</span>
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                <span>{coaching.googleRating}</span>
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                <span>{coaching.avgRating > 0 ? coaching.avgRating : 'New'}</span>
              </span>
            )}
            {coaching.reviewCount > 0 && (
              <span className="text-gray-400 font-normal text-[11px]">({coaching.reviewCount})</span>
            )}
          </div>
        </div>

        {/* Subjects Badges */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {coaching.subjectsOffered && coaching.subjectsOffered.length > 0 ? (
            coaching.subjectsOffered.slice(0, 4).map((sub, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100"
              >
                <BookOpen className="w-3 h-3 text-indigo-500" />
                {sub}
              </span>
            ))
          ) : (
            <span className="text-xs text-gray-400">All Core Subjects</span>
          )}
          {coaching.subjectsOffered && coaching.subjectsOffered.length > 4 && (
            <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-gray-100 text-gray-600">
              +{coaching.subjectsOffered.length - 4} more
            </span>
          )}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="mt-auto p-4 bg-gray-50 border-t border-gray-100 rounded-b-2xl flex items-center gap-2">
        <Link
          to={`/coaching/${coaching.slug}`}
          className="flex-1 text-center px-4 py-2 text-xs font-semibold text-indigo-600 bg-white border border-indigo-200 rounded-xl hover:bg-indigo-50 transition-colors shadow-2xs"
        >
          View Profile
        </Link>

        {whatsappUrl && (
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 rounded-xl transition-colors"
            title="Chat on WhatsApp"
          >
            <MessageCircle className="w-4 h-4 fill-emerald-600 text-emerald-100" />
            <span className="hidden sm:inline">WhatsApp</span>
          </a>
        )}

        {coaching.phone && (
          <a
            href={`tel:${coaching.phone}`}
            className="p-2 text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-100 transition-colors"
            title={`Call ${coaching.phone}`}
          >
            <Phone className="w-4 h-4 text-indigo-600" />
          </a>
        )}
      </div>
    </div>
  );
};

export default CoachingCard;
