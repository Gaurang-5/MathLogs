import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Star, MapPin, Phone, CheckCircle2, MessageCircle, Sparkles } from 'lucide-react';
import { appleSpringDefault, appleSpringSnappy } from '../utils/appleDesign';

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
        `Hi ${coaching.teacherName}, I saw your listing on MathLogs Marketplace and would like to inquire about coaching classes.`
      )}`
    : null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      whileHover={{ y: -3, scale: 1.012 }}
      transition={appleSpringDefault}
      className="bg-white/80 backdrop-blur-md rounded-3xl border border-neutral-200/80 p-6 shadow-xs hover:shadow-xl transition-shadow duration-300 group flex flex-col justify-between relative overflow-hidden"
    >
      {/* Exclusive Gold Top Accent Line */}
      {coaching.isExclusive && (
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500" />
      )}

      <div>
        {/* Top Header Row */}
        <div className="flex items-start justify-between gap-3 mb-3.5">
          <div className="flex items-center gap-3">
            {coaching.logoUrl ? (
              <img
                src={coaching.logoUrl}
                alt={coaching.name}
                className="w-12 h-12 rounded-2xl object-cover border border-neutral-100 shadow-xs"
              />
            ) : (
              <div className="w-12 h-12 rounded-2xl bg-neutral-100 border border-neutral-200/80 flex items-center justify-center text-neutral-900 font-extrabold text-lg shadow-2xs">
                {coaching.name.substring(0, 2).toUpperCase()}
              </div>
            )}

            <div>
              <Link to={`/coaching/${coaching.slug}`} className="group-hover:text-neutral-700 transition-colors">
                <h3 className="font-bold text-[#1A1F36] text-base leading-snug tracking-[-0.015em] line-clamp-1">
                  {coaching.name}
                </h3>
              </Link>
              <p className="text-xs text-neutral-500 font-medium flex items-center gap-1 mt-0.5">
                <span>By {coaching.teacherName}</span>
                {coaching.isVerified && (
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-500 inline shrink-0" title="Verified Teacher" />
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Exclusive Partner Badge */}
        {coaching.isExclusive && (
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={appleSpringSnappy}
            className="mb-3.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50/90 border border-amber-200/80 text-[11px] font-bold text-amber-800 shadow-2xs"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500 fill-amber-400 shrink-0" />
            <span>Exclusive MathLogs Partner</span>
          </motion.div>
        )}

        {/* Tagline */}
        {coaching.tagline && (
          <p className="text-xs text-neutral-500 italic mt-1 mb-3 line-clamp-2 bg-neutral-50/70 p-2.5 rounded-xl border border-neutral-100/80">
            "{coaching.tagline}"
          </p>
        )}

        {/* Location & Rating */}
        <div className="mt-3 flex items-center justify-between text-xs text-neutral-600 border-t border-neutral-100 pt-3">
          <div className="flex items-center gap-1.5 text-neutral-500 font-medium line-clamp-1">
            <MapPin className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
            <span>{coaching.area ? `${coaching.area}, ${coaching.city}` : coaching.city}</span>
          </div>

          <div className="flex items-center gap-1 font-bold text-neutral-800 bg-amber-50/80 px-2.5 py-1 rounded-full border border-amber-200/80">
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
              <span className="text-neutral-400 font-normal text-[11px]">({coaching.reviewCount})</span>
            )}
          </div>
        </div>

        {/* Subjects Badges */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {coaching.subjectsOffered && coaching.subjectsOffered.length > 0 ? (
            coaching.subjectsOffered.slice(0, 4).map((sub, i) => (
              <span
                key={i}
                className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-neutral-100/90 text-neutral-700 border border-neutral-200/60"
              >
                {sub}
              </span>
            ))
          ) : (
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-neutral-100 text-neutral-500">
              General Coaching
            </span>
          )}
          {coaching.subjectsOffered && coaching.subjectsOffered.length > 4 && (
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-neutral-100 text-neutral-500">
              +{coaching.subjectsOffered.length - 4} more
            </span>
          )}
        </div>
      </div>

      {/* Action Footer with Apple Instant Feedback on Touch */}
      <div className="mt-5 pt-3.5 border-t border-neutral-100 flex items-center gap-2">
        <Link
          to={`/coaching/${coaching.slug}`}
          className="flex-1"
        >
          <motion.button
            whileTap={{ scale: 0.95 }}
            transition={appleSpringSnappy}
            className="w-full text-center px-4 py-2.5 text-xs font-bold text-white bg-neutral-900 hover:bg-neutral-800 rounded-full transition-colors cursor-pointer"
          >
            View Profile
          </motion.button>
        </Link>

        {whatsappUrl && (
          <motion.a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            whileTap={{ scale: 0.94 }}
            transition={appleSpringSnappy}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-bold text-[#16a34a] bg-[#effdf4] hover:bg-[#dcfce7] border border-[#bbf7d0] rounded-full transition-colors cursor-pointer"
            title="Chat on WhatsApp"
          >
            <MessageCircle className="w-4 h-4 fill-[#16a34a] text-white" />
            <span className="hidden sm:inline">WhatsApp</span>
          </motion.a>
        )}

        {coaching.phone && (
          <motion.a
            href={`tel:${coaching.phone}`}
            whileTap={{ scale: 0.94 }}
            transition={appleSpringSnappy}
            className="p-2.5 text-neutral-700 bg-white border border-neutral-200/80 rounded-full hover:bg-neutral-100 transition-colors cursor-pointer"
            title={`Call ${coaching.phone}`}
          >
            <Phone className="w-4 h-4 text-neutral-700" />
          </motion.a>
        )}
      </div>
    </motion.div>
  );
};

export default CoachingCard;
