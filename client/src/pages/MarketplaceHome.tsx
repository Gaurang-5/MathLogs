import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Search, MapPin, Sparkles, SlidersHorizontal, GraduationCap, Star, ArrowRight, Loader2, BookOpen, ChevronRight } from 'lucide-react';
import CoachingCard, { type CoachingItem } from '../components/CoachingCard';
import { appleSpringDefault, appleSpringSnappy, appleStaggerContainer, appleItemReveal } from '../utils/appleDesign';

const FEATURED_SUBJECTS = ['Mathematics', 'Physics', 'Chemistry', 'Biology', 'Science', 'English', 'Commerce'];

export default function MarketplaceHome() {
  const prefersReducedMotion = useReducedMotion();
  const [coachings, setCoachings] = useState<CoachingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedCity, setSelectedCity] = useState('');
  const [selectedArea, setSelectedArea] = useState('');
  const [exclusiveOnly, setExclusiveOnly] = useState(false);
  const [sortBy, setSortBy] = useState('exclusive');

  const [availableCities, setAvailableCities] = useState<string[]>([]);

  const fetchMarketplaceData = useCallback(async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams();
      if (searchTerm) queryParams.append('q', searchTerm);
      if (selectedSubject) queryParams.append('subject', selectedSubject);
      if (selectedCity) queryParams.append('city', selectedCity);
      if (selectedArea) queryParams.append('area', selectedArea);
      if (exclusiveOnly) queryParams.append('exclusiveOnly', 'true');
      if (sortBy) queryParams.append('sortBy', sortBy);

      const res = await fetch(`/api/marketplace/search?${queryParams.toString()}`);
      const data = await res.json();

      if (data.success) {
        setCoachings(data.data || []);
        if (data.availableFilters?.cities) {
          setAvailableCities(data.availableFilters.cities);
        }
      }
    } catch (err) {
      console.error('Failed to fetch marketplace coachings:', err);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, selectedSubject, selectedCity, selectedArea, exclusiveOnly, sortBy]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchMarketplaceData();
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchMarketplaceData]);

  const handleSubjectClick = (subj: string) => {
    setSelectedSubject(prev => (prev === subj ? '' : subj));
  };

  const exclusivePartners = coachings.filter(c => c.isExclusive);

  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col font-sans text-neutral-900 selection:bg-neutral-900 selection:text-white relative overflow-x-hidden">
      {/* Soft Ambient Background Glows */}
      <div className="absolute top-0 left-0 w-full min-h-[100vh] pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] right-[-5%] w-[65vw] h-[65vw] bg-gradient-to-bl from-neutral-200/60 via-neutral-100/40 to-transparent rounded-full blur-[120px]" />
        <div className="absolute top-[15%] left-[-10%] w-[55vw] h-[55vw] bg-gradient-to-br from-neutral-200/50 via-neutral-100/30 to-transparent rounded-full blur-[120px]" />
      </div>

      {/* Translucent Apple Glass Header */}
      <header className="sticky top-0 z-40 bg-white/70 backdrop-blur-2xl saturate-180 border-b border-white/40 shadow-xs">
        <div className="max-w-7xl mx-auto px-6 h-18 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <motion.img
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              src="/logo-64.webp"
              alt="MathLogs Logo"
              width={36}
              height={36}
              className="w-9 h-9 rounded-xl shadow-xs border border-white/60 object-cover"
            />
            <div className="flex items-center gap-2">
              <span className="text-[22px] font-extrabold tracking-[-0.025em] text-neutral-900">MathLogs</span>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <Link to="/list-coaching">
              <motion.button
                whileTap={{ scale: 0.95 }}
                whileHover={{ scale: 1.02 }}
                transition={appleSpringSnappy}
                className="hidden sm:inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-semibold text-white bg-neutral-900 hover:bg-neutral-800 rounded-full transition-colors shadow-xs cursor-pointer"
              >
                <GraduationCap className="w-4 h-4" />
                <span>List Your Coaching Free</span>
              </motion.button>
            </Link>
            <Link
              to="/login"
              className="text-xs font-semibold text-neutral-700 hover:text-neutral-900 transition-colors px-3 py-2"
            >
              Teacher Sign in
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative z-10 pt-12 pb-14 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={appleSpringDefault}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/80 backdrop-blur-md border border-neutral-200/80 shadow-2xs text-neutral-700 text-xs font-bold mb-6"
          >
            <Sparkles className="w-4 h-4 text-amber-500 fill-amber-400" />
            <span>Find Verified Local Teachers & Coaching Classes</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...appleSpringDefault, delay: 0.05 }}
            className="text-4xl sm:text-6xl font-extrabold tracking-[-0.03em] text-[#1A1F36] leading-[1.05]"
          >
            Discover Top Coaching Classes & Teachers in Your City
          </motion.h1>
          
          <motion.p
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...appleSpringDefault, delay: 0.1 }}
            className="mt-4 text-lg sm:text-xl text-neutral-500 font-medium max-w-2xl mx-auto leading-relaxed"
          >
            Search by subject, teacher name, locality, or review ratings. Connect directly via WhatsApp or phone.
          </motion.p>

          {/* Search Box with Fluid Motion */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ ...appleSpringDefault, delay: 0.15 }}
            className="mt-10 bg-white/90 backdrop-blur-xl p-3 rounded-[2.5rem] shadow-lg border border-neutral-200/80 flex flex-col md:flex-row gap-2 max-w-3xl mx-auto"
          >
            <div className="flex-1 flex items-center gap-3 px-4 py-3 bg-neutral-50/80 rounded-[1.8rem] border border-neutral-200/60 focus-within:bg-white focus-within:ring-2 focus-within:ring-neutral-900 transition-all">
              <Search className="w-5 h-5 text-neutral-400 shrink-0" />
              <input
                type="text"
                placeholder="Search by subject, teacher name, coaching name or area..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-transparent text-sm text-neutral-900 font-medium outline-none placeholder:text-neutral-400"
              />
            </div>

            <div className="flex gap-2">
              {/* City Filter */}
              <div className="flex-1 md:w-48 flex items-center gap-2 px-4 py-3 bg-neutral-50/80 rounded-[1.8rem] border border-neutral-200/60">
                <MapPin className="w-4 h-4 text-neutral-500 shrink-0" />
                <select
                  value={selectedCity}
                  onChange={(e) => setSelectedCity(e.target.value)}
                  className="w-full bg-transparent text-sm font-semibold text-neutral-800 outline-none cursor-pointer"
                >
                  <option value="">All Cities</option>
                  {availableCities.map((city) => (
                    <option key={city} value={city}>{city}</option>
                  ))}
                </select>
              </div>

              <motion.button
                whileTap={{ scale: 0.95 }}
                whileHover={{ scale: 1.02 }}
                transition={appleSpringSnappy}
                onClick={fetchMarketplaceData}
                className="px-7 py-3 bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-sm rounded-full transition-all shrink-0 flex items-center gap-2 cursor-pointer"
              >
                <span>Search</span>
                <ChevronRight className="w-4 h-4" />
              </motion.button>
            </div>
          </motion.div>

          {/* Quick Subject Chips with Apple Spring LayoutId */}
          <div className="mt-8 flex flex-wrap justify-center gap-2 items-center">
            <span className="text-xs text-neutral-400 font-bold uppercase tracking-wider mr-2">Popular Subjects:</span>
            {FEATURED_SUBJECTS.map((subj) => {
              const active = selectedSubject === subj;
              return (
                <motion.button
                  key={subj}
                  whileTap={{ scale: 0.94 }}
                  transition={appleSpringSnappy}
                  onClick={() => handleSubjectClick(subj)}
                  className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-colors border relative cursor-pointer ${
                    active
                      ? 'bg-neutral-900 text-white border-neutral-900 shadow-sm'
                      : 'bg-white/80 backdrop-blur-sm text-neutral-700 hover:bg-neutral-100 border-neutral-200/80'
                  }`}
                >
                  {subj}
                </motion.button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-6 pb-20 flex-1 w-full relative z-10">
        {/* Filters Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-neutral-200/80">
          <div>
            <h2 className="text-2xl font-bold text-[#1A1F36] tracking-[-0.02em] flex items-center gap-2.5">
              <span>Coaching Classes</span>
              <span className="text-sm font-semibold text-neutral-400 bg-neutral-100 px-3 py-0.5 rounded-full border border-neutral-200/60">
                {coachings.length} found
              </span>
            </h2>
            {selectedSubject && (
              <p className="text-xs text-neutral-600 font-semibold mt-1 flex items-center gap-2">
                <span>Filtering by subject: <strong className="text-neutral-900">{selectedSubject}</strong></span>
                <button onClick={() => setSelectedSubject('')} className="text-neutral-400 hover:text-neutral-700 font-bold cursor-pointer">✕ Clear</button>
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Exclusive Filter Toggle */}
            <motion.label
              whileTap={{ scale: 0.97 }}
              className="flex items-center gap-2 text-xs font-bold text-amber-900 bg-amber-50/80 border border-amber-200/80 px-4 py-2 rounded-full cursor-pointer hover:bg-amber-100/60 transition-colors shadow-2xs"
            >
              <input
                type="checkbox"
                checked={exclusiveOnly}
                onChange={(e) => setExclusiveOnly(e.target.checked)}
                className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
              />
              <Sparkles className="w-3.5 h-3.5 text-amber-600 fill-amber-400" />
              <span>Exclusive MathLogs Partners Only</span>
            </motion.label>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-2 bg-white/80 backdrop-blur-md border border-neutral-200/80 px-4 py-2 rounded-full text-xs shadow-2xs">
              <SlidersHorizontal className="w-3.5 h-3.5 text-neutral-400" />
              <span className="text-neutral-400 font-semibold">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="bg-transparent font-bold text-neutral-800 outline-none cursor-pointer"
              >
                <option value="exclusive">Exclusive Priority</option>
                <option value="rating">Highest Rated</option>
              </select>
            </div>
          </div>
        </div>

        {/* Featured Exclusive Partners Banner Section */}
        {!exclusiveOnly && exclusivePartners.length > 0 && !selectedSubject && !searchTerm && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={appleSpringDefault}
            className="mt-8 mb-12 bg-gradient-to-r from-amber-50/70 via-amber-100/40 to-amber-50/70 border border-amber-200/70 backdrop-blur-md rounded-[2.5rem] p-6 sm:p-8 relative overflow-hidden shadow-2xs"
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-400 text-amber-950 flex items-center justify-center shadow-xs font-bold">
                  <Sparkles className="w-4 h-4 fill-amber-950" />
                </div>
                <div>
                  <h3 className="font-extrabold text-[#1A1F36] text-xl tracking-tight">Featured Exclusive MathLogs Partners</h3>
                  <p className="text-xs text-neutral-500 font-medium">Verified institutes using MathLogs ERP for digital attendance, fees & tests</p>
                </div>
              </div>
              <span className="hidden sm:inline-flex text-xs font-bold text-amber-800 bg-amber-100/80 px-3.5 py-1 rounded-full border border-amber-200">
                Verified Software Partners
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {exclusivePartners.slice(0, 3).map((coaching) => (
                <CoachingCard key={`featured-${coaching.id}`} coaching={coaching} />
              ))}
            </div>
          </motion.div>
        )}

        {/* Results Grid with Apple Spring Stagger */}
        {loading ? (
          <div className="py-24 flex flex-col items-center justify-center text-neutral-400">
            <Loader2 className="w-10 h-10 animate-spin text-neutral-900 mb-3" />
            <p className="text-sm font-semibold">Searching coaching classes...</p>
          </div>
        ) : coachings.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={appleSpringDefault}
            className="py-20 text-center bg-white/80 backdrop-blur-md rounded-[2.5rem] border border-neutral-200/80 p-8 my-8 shadow-xs"
          >
            <BookOpen className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
            <h3 className="text-xl font-bold text-neutral-900">No coaching classes found</h3>
            <p className="text-sm text-neutral-500 mt-1 max-w-md mx-auto">
              Try resetting your subject filter or search keywords to explore more teachers in your city.
            </p>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                setSearchTerm('');
                setSelectedSubject('');
                setSelectedCity('');
                setExclusiveOnly(false);
              }}
              className="mt-5 px-6 py-2.5 bg-neutral-900 text-white font-bold text-xs rounded-full hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              Reset All Filters
            </motion.button>
          </motion.div>
        ) : (
          <motion.div
            variants={prefersReducedMotion ? undefined : appleStaggerContainer}
            initial="hidden"
            animate="show"
            className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            <AnimatePresence mode="popLayout">
              {coachings.map((coaching) => (
                <CoachingCard key={coaching.id} coaching={coaching} />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </main>

      {/* Footer CTA */}
      <footer className="bg-white/80 backdrop-blur-md border-t border-neutral-200/80 py-12 px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6 text-center sm:text-left">
          <div className="flex items-center gap-3">
            <img src="/logo-64.webp" alt="MathLogs Logo" width={32} height={32} className="w-8 h-8 rounded-lg shadow-sm border border-neutral-100" />
            <div>
              <span className="font-extrabold text-base text-neutral-900">Are you a teacher or coaching owner?</span>
              <p className="text-xs text-neutral-500">List your institute on MathLogs Marketplace in under 2 minutes.</p>
            </div>
          </div>

          <Link to="/list-coaching">
            <motion.button
              whileTap={{ scale: 0.95 }}
              whileHover={{ scale: 1.03 }}
              transition={appleSpringSnappy}
              className="px-6 py-3 bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs rounded-full shadow-xs inline-flex items-center gap-2 cursor-pointer"
            >
              <span>List Your Coaching Free</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </motion.button>
          </Link>
        </div>
      </footer>
    </div>
  );
}
