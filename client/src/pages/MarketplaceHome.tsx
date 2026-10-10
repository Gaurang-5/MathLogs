import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Search, MapPin, Sparkles, SlidersHorizontal, GraduationCap, Star,
  ArrowRight, Loader2, BookOpen, ChevronRight, X, Filter, Phone, MessageCircle
} from 'lucide-react';
import CoachingCard, { type CoachingItem } from '../components/CoachingCard';
import MarketplaceBreadcrumbs from '../components/MarketplaceBreadcrumbs';
import { MARKETPLACE_CITY, parseMarketplaceLandingParams } from '../features/marketplace/location';
import type { MarketplaceLandingPage } from '../features/marketplace/types';
import { useMetaTags } from '../hooks/useMetaTags';

const FEATURED_SUBJECTS = [
  'Mathematics', 'Physics', 'Chemistry', 'Biology', 'Science',
  'English', 'Hindi', 'Commerce', 'Computer Science'
];

const FEATURED_CLASSES = [
  'Class 8', 'Class 9', 'Class 10', 'Class 11', 'Class 12', 'JEE / NEET', 'Dropper'
];

const SORT_OPTIONS = [
  { value: 'rating', label: 'Highest Rated' },
  { value: 'reviews', label: 'Most Reviewed' },
  { value: 'newest', label: 'Newest First' },
];

export default function MarketplaceHome() {
  const rawParams = useParams();
  const landingParams = parseMarketplaceLandingParams(rawParams);
  const isLandingRoute = Boolean(landingParams.areaSlug || landingParams.classSlug || landingParams.subjectSlug);
  const [landingPage, setLandingPage] = useState<MarketplaceLandingPage | null>(null);
  const canonicalPath = landingPage?.canonicalPath || '/coaching';
  const [coachings, setCoachings] = useState<CoachingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedCity, setSelectedCity] = useState<string>(MARKETPLACE_CITY);
  const [sortBy, setSortBy] = useState('rating');
  const [filterOpen, setFilterOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);

  const structuredData = useMemo(() => ({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Best coaching institutes in Muzaffarnagar',
    url: `https://mathlogs.app${canonicalPath}`,
    description: 'Compare coaching institutes in Muzaffarnagar by subjects, classes, student reviews, ratings and location.',
    mainEntity: {
      '@type': 'ItemList',
      name: 'Coaching institutes in Muzaffarnagar',
      itemListElement: coachings.map((coaching, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: `https://mathlogs.app/coaching/${coaching.slug}`,
        name: coaching.name
      }))
    }
  }), [canonicalPath, coachings]);

  useMetaTags({
    title: landingPage?.title || 'Best Coaching Institutes in Muzaffarnagar | Reviews & Contact',
    description: landingPage?.description || 'Find and compare coaching institutes in Muzaffarnagar. Explore subjects, classes, verified profiles, student reviews, ratings, locations and direct contact details.',
    canonicalPath,
    robots: isLandingRoute && landingPage && !landingPage.indexable ? 'noindex, follow' : undefined,
    structuredData
  });

  const fetchMarketplaceData = useCallback(async () => {
    setLoading(true);
    try {
      if (isLandingRoute) {
        const landingQuery = new URLSearchParams();
        if (landingParams.areaSlug) landingQuery.set('areaSlug', landingParams.areaSlug);
        if (landingParams.classSlug) landingQuery.set('classSlug', landingParams.classSlug);
        if (landingParams.subjectSlug) landingQuery.set('subjectSlug', landingParams.subjectSlug);
        const res = await fetch(`/api/marketplace/landing?${landingQuery.toString()}`);
        const payload = await res.json();
        if (payload.success) {
          const page = payload.data as MarketplaceLandingPage;
          setLandingPage(page);
          setCoachings(page.items || []);
          setSelectedCity(MARKETPLACE_CITY);
          setSelectedClass(page.filters.className || '');
          setSelectedSubject(page.filters.subject || '');
        }
        return;
      }

      const queryParams = new URLSearchParams();
      if (searchTerm) queryParams.append('q', searchTerm);
      if (selectedSubject) queryParams.append('subject', selectedSubject);
      if (selectedClass) queryParams.append('classGrade', selectedClass);
      if (selectedCity) queryParams.append('city', selectedCity);
      if (sortBy) queryParams.append('sortBy', sortBy);

      const res = await fetch(`/api/marketplace/search?${queryParams.toString()}`);
      const data = await res.json();

      if (data.success) {
        setCoachings(data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch marketplace coachings:', err);
    } finally {
      setLoading(false);
    }
  }, [isLandingRoute, landingParams.areaSlug, landingParams.classSlug, landingParams.subjectSlug, searchTerm, selectedSubject, selectedClass, selectedCity, sortBy]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchMarketplaceData();
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchMarketplaceData]);

  // Close drawer on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (filterOpen && drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [filterOpen]);

  const handleSubjectClick = (subj: string) => {
    setSelectedSubject(prev => (prev === subj ? '' : subj));
    setFilterOpen(false);
  };

  const handleClassClick = (cls: string) => {
    setSelectedClass(prev => (prev === cls ? '' : cls));
    setFilterOpen(false);
  };

  const hasActiveFilters = Boolean(selectedSubject || selectedClass || searchTerm);

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedSubject('');
    setSelectedClass('');
    setSelectedCity(MARKETPLACE_CITY);
    setSortBy('rating');
  };

  const displayCities = [MARKETPLACE_CITY];

  return (
    <div className="min-h-screen bg-[#F8F9FB] flex flex-col font-sans text-neutral-900 selection:bg-neutral-900 selection:text-white relative overflow-x-hidden">

      {/* ── Sticky Nav ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-xl border-b border-neutral-200/60 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2.5 shrink-0">
            <img src="/logo-64.webp" alt="MathLogs Logo" width={34} height={34} className="w-[34px] h-[34px] rounded-xl shadow-md border border-neutral-100 object-cover" />
            <span className="text-[18px] font-extrabold tracking-tight text-neutral-900 hidden sm:block">MathLogs</span>
          </Link>

          {/* Center: Mobile search pill */}
          <div className="flex-1 max-w-md">
            <div className="relative">
              <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-neutral-400" />
              <input
                type="text"
                placeholder="Search coaching by name or teacher..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-neutral-100/80 border border-neutral-200/60 text-xs sm:text-sm text-neutral-900 pl-9 pr-4 py-2 rounded-full outline-none focus:bg-white focus:ring-2 focus:ring-neutral-900 transition-all font-medium"
              />
              {searchTerm && (
                <button onClick={() => setSearchTerm('')} className="absolute right-3 top-2.5 text-neutral-400 hover:text-neutral-600">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/onboarding"
              className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 bg-neutral-900 hover:bg-black text-white text-xs font-bold rounded-full transition-all shadow-sm active:scale-95"
            >
              <span>List Your Coaching</span>
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero / Search Bar Section ──────────────────────────────────────── */}
      <section className="bg-white border-b border-neutral-200/60 py-8 sm:py-12 px-4 sm:px-6 relative overflow-hidden">
        <div className="max-w-4xl mx-auto text-center relative z-10">
          {landingPage ? <MarketplaceBreadcrumbs items={landingPage.breadcrumbs} /> : null}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-amber-50 text-amber-800 border border-amber-200/80 text-xs font-bold rounded-full mb-4 shadow-2xs">
            <Sparkles className="w-3.5 h-3.5 text-amber-600" />
            <span>Compare Coaching in Muzaffarnagar</span>
          </div>

          <h1 className="text-2xl sm:text-4xl md:text-5xl font-black text-neutral-900 tracking-tight leading-tight mb-3">
            {landingPage?.heading || 'Best Coaching Institutes in Muzaffarnagar'}
          </h1>
          <p className="text-sm sm:text-base text-neutral-500 font-medium max-w-xl mx-auto mb-8">
            {landingPage?.introduction || 'Compare coaching centers in Muzaffarnagar by subjects, classes, student reviews, ratings and location, then contact teachers directly.'}
          </p>

          {/* Desktop Search Box */}
          <div className="hidden sm:flex items-center gap-2 p-2 bg-white rounded-[2rem] border border-neutral-300 shadow-xl max-w-3xl mx-auto">
            <div className="flex-1 flex items-center gap-2.5 px-4">
              <Search className="w-5 h-5 text-neutral-400 shrink-0" />
              <input
                type="text"
                placeholder="Search coaching name, teacher, subject, or location..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-transparent text-sm text-neutral-900 font-medium outline-none placeholder:text-neutral-400"
              />
            </div>
            <div className="flex items-center gap-2 px-4 py-2.5 bg-neutral-50 rounded-[1.5rem] border border-neutral-200/60 min-w-[140px]">
              <MapPin className="w-4 h-4 text-neutral-500 shrink-0" />
              <select
                value={selectedCity}
                onChange={(e) => setSelectedCity(e.target.value)}
                className="w-full bg-transparent text-sm font-semibold text-neutral-800 outline-none cursor-pointer"
              >
                {displayCities.map((city) => (
                  <option key={city} value={city}>{city}</option>
                ))}
              </select>
            </div>
            <button
              onClick={fetchMarketplaceData}
              className="px-6 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-sm rounded-full transition-all hover:shadow-md active:scale-95 flex items-center gap-2"
            >
              <span>Search</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Class-by-Class Filter Pills */}
          <div className="mt-5 flex gap-2 items-center overflow-x-auto pb-1 scrollbar-hide justify-start sm:justify-center">
            <span className="text-xs text-neutral-400 font-bold uppercase tracking-wider shrink-0 mr-1">Class:</span>
            {FEATURED_CLASSES.map((cls) => {
              const active = selectedClass === cls;
              return (
                <button
                  key={cls}
                  onClick={() => handleClassClick(cls)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-bold shrink-0 transition-all border ${active
                    ? 'bg-amber-600 text-white border-amber-600 shadow-sm scale-105'
                    : 'bg-amber-50/60 text-amber-900 hover:bg-amber-100/80 border-amber-200/80'
                  }`}
                >
                  {cls}
                </button>
              );
            })}
          </div>

          {/* Subject Pills */}
          <div className="mt-3 flex gap-2 items-center overflow-x-auto pb-1 scrollbar-hide justify-start sm:justify-center">
            <span className="text-xs text-neutral-400 font-bold uppercase tracking-wider shrink-0 mr-1">Subject:</span>
            {FEATURED_SUBJECTS.map((subj) => {
              const active = selectedSubject === subj;
              return (
                <button
                  key={subj}
                  onClick={() => handleSubjectClick(subj)}
                  className={`px-4 py-1.5 rounded-full text-xs font-semibold shrink-0 transition-all border ${active
                    ? 'bg-neutral-900 text-white border-neutral-900 shadow-sm scale-105'
                    : 'bg-white text-neutral-700 hover:bg-neutral-100 border-neutral-200/80'
                  }`}
                >
                  {subj}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Main Content ───────────────────────────────────────────────────── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pb-28 sm:pb-16 flex-1 w-full relative z-10">
        {/* Results Bar */}
        <div className="flex items-center justify-between gap-3 py-5 border-b border-neutral-200/60">
          <div>
            <h2 className="text-base sm:text-xl font-extrabold text-[#1A1F36] tracking-tight flex items-center gap-2">
              <span>Coaching Classes</span>
              <span className="text-xs font-semibold text-neutral-500 bg-white px-2.5 py-0.5 rounded-full border border-neutral-200/60">
                {coachings.length} found
              </span>
            </h2>
            {hasActiveFilters && (
              <div className="flex items-center gap-2 mt-1">
                {selectedClass && (
                  <span className="text-[11px] bg-amber-600 text-white font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                    {selectedClass}
                    <button onClick={() => setSelectedClass('')}><X className="w-3 h-3" /></button>
                  </span>
                )}
                {selectedSubject && (
                  <span className="text-[11px] bg-neutral-900 text-white font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                    {selectedSubject}
                    <button onClick={() => setSelectedSubject('')}><X className="w-3 h-3" /></button>
                  </span>
                )}
                {selectedCity && (
                  <span className="text-[11px] bg-neutral-900 text-white font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                    {selectedCity}
                  </span>
                )}
                <button onClick={clearFilters} className="text-[11px] text-neutral-400 hover:text-neutral-700 font-semibold">Clear all</button>
              </div>
            )}
          </div>

          {/* Desktop Sort */}
          <div className="hidden sm:flex items-center gap-2 bg-white border border-neutral-200/80 px-4 py-2 rounded-full text-xs shadow-xs">
            <SlidersHorizontal className="w-3.5 h-3.5 text-neutral-400" />
            <span className="text-neutral-400 font-semibold">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-transparent font-bold text-neutral-800 outline-none cursor-pointer"
            >
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        {/* Results Grid */}
        {loading ? (
          <div className="py-24 flex flex-col items-center justify-center text-neutral-400">
            <Loader2 className="w-10 h-10 animate-spin text-neutral-900 mb-3" />
            <p className="text-sm font-semibold">Searching coaching classes...</p>
          </div>
        ) : coachings.length === 0 ? (
          <div className="py-20 text-center bg-white rounded-2xl border border-neutral-200/80 p-8 my-8 shadow-xs">
            <BookOpen className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
            <h3 className="text-xl font-bold text-neutral-900">No coaching classes found</h3>
            <p className="text-sm text-neutral-500 mt-1 max-w-md mx-auto">
              Try resetting your filters or search keywords to explore more teachers.
            </p>
            {isLandingRoute ? (
              <Link
                to="/coaching"
                className="mt-5 inline-flex px-6 py-2.5 bg-neutral-900 text-white font-bold text-xs rounded-full hover:bg-neutral-800 transition-colors"
              >Browse all coaching in Muzaffarnagar</Link>
            ) : <button
              onClick={clearFilters}
              className="mt-5 px-6 py-2.5 bg-neutral-900 text-white font-bold text-xs rounded-full hover:bg-neutral-800 transition-colors"
            >
              Reset All Filters
            </button>}
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {coachings.map((coaching) => (
              <CoachingCard key={coaching.id} coaching={coaching} />
            ))}
          </div>
        )}
      </main>

      {/* ── Mobile Fixed CTA Bar ────────────────────────────────────────────── */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-neutral-200/80 shadow-lg px-4 py-3 flex gap-3">
        <Link
          to="/onboarding"
          className="flex-1 flex items-center justify-center gap-2 py-3 bg-neutral-900 text-white font-bold text-xs rounded-xl transition-all active:scale-95"
        >
          <GraduationCap className="w-4 h-4" />
          List Coaching Free
        </Link>
        <button
          onClick={() => setFilterOpen(true)}
          className={`flex items-center justify-center gap-1.5 px-4 py-3 font-bold text-xs rounded-xl border transition-all active:scale-95 ${hasActiveFilters ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-700 border-neutral-200/80'}`}
        >
          <Filter className="w-4 h-4" />
          Filters
        </button>
      </div>

      {/* ── Filter Drawer (Mobile Bottom Sheet) ───────────────────────────── */}
      {filterOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end" aria-modal="true">
          <div ref={drawerRef} className="w-full bg-white rounded-t-3xl max-h-[85vh] overflow-y-auto">
            {/* Handle */}
            <div className="flex justify-center pt-4 pb-2">
              <div className="w-10 h-1 bg-neutral-200 rounded-full" />
            </div>
            <div className="px-5 pb-8">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-base font-extrabold text-[#1A1F36] tracking-tight">Filters & Sort</h3>
                <button onClick={() => setFilterOpen(false)} className="p-2 rounded-full bg-neutral-100 hover:bg-neutral-200 transition-colors">
                  <X className="w-4 h-4 text-neutral-700" />
                </button>
              </div>

              {/* City */}
              <div className="mb-5">
                <p className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-2.5 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" /> City
                </p>
                <div className="flex flex-wrap gap-2">
                  {displayCities.map(city => (
                    <button
                      key={city}
                      onClick={() => setSelectedCity(city)}
                      className={`px-4 py-2 rounded-full text-xs font-semibold border transition-all ${selectedCity === city ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-700 border-neutral-200/80'}`}
                    >
                      {city}
                    </button>
                  ))}
                </div>
              </div>

              {/* Subject */}
              <div className="mb-5">
                <p className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-2.5 flex items-center gap-1.5">
                  <Star className="w-3.5 h-3.5" /> Subject
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setSelectedSubject('')}
                    className={`px-4 py-2 rounded-full text-xs font-semibold border transition-all ${!selectedSubject ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-700 border-neutral-200/80'}`}
                  >
                    All Subjects
                  </button>
                  {FEATURED_SUBJECTS.map(subj => (
                    <button
                      key={subj}
                      onClick={() => handleSubjectClick(subj)}
                      className={`px-4 py-2 rounded-full text-xs font-semibold border transition-all ${selectedSubject === subj ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-700 border-neutral-200/80'}`}
                    >
                      {subj}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sort */}
              <div className="mb-6">
                <p className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-2.5 flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3.5 h-3.5" /> Sort By
                </p>
                <div className="flex flex-wrap gap-2">
                  {SORT_OPTIONS.map(o => (
                    <button
                      key={o.value}
                      onClick={() => setSortBy(o.value)}
                      className={`px-4 py-2 rounded-full text-xs font-semibold border transition-all ${sortBy === o.value ? 'bg-neutral-900 text-white border-neutral-900' : 'bg-white text-neutral-700 border-neutral-200/80'}`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={clearFilters} className="flex-1 py-3 border border-neutral-200/80 bg-white text-neutral-700 font-bold text-xs rounded-xl hover:bg-neutral-100 transition-colors">
                  Clear All
                </button>
                <button
                  onClick={() => { fetchMarketplaceData(); setFilterOpen(false); }}
                  className="flex-1 py-3 bg-neutral-900 text-white font-bold text-xs rounded-xl hover:bg-neutral-800 transition-colors"
                >
                  Apply Filters
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {landingPage?.relatedLinks.length ? (
        <aside className="mx-auto w-full max-w-7xl px-4 pb-24 sm:px-6 sm:pb-12" aria-label="Related coaching searches">
          <h2 className="mb-3 text-sm font-extrabold text-neutral-900">Related coaching searches</h2>
          <div className="flex flex-wrap gap-2">
            {landingPage.relatedLinks.map(link => (
              <Link key={link.path} to={link.path} className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-xs font-bold text-neutral-700 hover:border-neutral-400">
                {link.label}
              </Link>
            ))}
          </div>
        </aside>
      ) : null}

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="hidden sm:block bg-white border-t border-neutral-200/60 py-10 px-6">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6 text-center sm:text-left">
          <div className="flex items-center gap-3">
            <img src="/logo-64.webp" alt="MathLogs Logo" width={32} height={32} className="w-8 h-8 rounded-lg shadow-sm border border-neutral-100" />
            <div>
              <span className="font-extrabold text-sm text-neutral-900">Are you a teacher or coaching owner?</span>
              <p className="text-xs text-emerald-600 font-bold mt-0.5">⚡ Limited Time Offer: List your institute on MathLogs Marketplace for free!</p>
            </div>
          </div>
          <Link
            to="/onboarding"
            className="px-6 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-white font-bold text-xs rounded-full transition-all hover:shadow-md active:scale-95 inline-flex items-center gap-2"
          >
            <span>List Coaching Free</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        <nav aria-label="Popular coaching locations" className="max-w-7xl mx-auto mt-7 pt-6 border-t border-neutral-100 flex flex-wrap items-center gap-3 text-xs font-semibold text-neutral-500">
          <span className="font-extrabold text-neutral-800">Popular searches:</span>
          <Link to="/coaching" className="hover:text-neutral-900 underline underline-offset-4">Best coaching in Muzaffarnagar</Link>
          <Link to="/ai-quiz-generator" className="hover:text-neutral-900 underline underline-offset-4">AI quiz generator for teachers</Link>
        </nav>
      </footer>

      {/* ── Public Mobile Floating Bottom Navigation ──────────────────────────── */}
      <div className="fixed bottom-4 left-4 right-4 z-40 bg-white/95 backdrop-blur-2xl border border-neutral-200/90 shadow-[0_16px_36px_rgba(0,0,0,0.12)] rounded-full h-14 px-4 flex items-center justify-between sm:hidden">
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="flex flex-col items-center justify-center flex-1 text-neutral-900 active:scale-95 transition-transform"
        >
          <Search className="w-4 h-4 text-neutral-900" />
          <span className="text-[10px] font-extrabold mt-0.5">Explore</span>
        </button>

        <button
          onClick={() => setFilterOpen(true)}
          className={`flex flex-col items-center justify-center flex-1 active:scale-95 transition-transform ${hasActiveFilters ? 'text-amber-600' : 'text-neutral-600'}`}
        >
          <Filter className="w-4 h-4" />
          <span className="text-[10px] font-extrabold mt-0.5">{hasActiveFilters ? 'Filtered' : 'Filter'}</span>
        </button>

        <Link
          to="/onboarding"
          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-neutral-900 text-white rounded-full text-xs font-extrabold shadow-sm active:scale-95 transition-transform shrink-0"
        >
          <GraduationCap className="w-3.5 h-3.5 text-amber-400" />
          <span>List Free</span>
        </Link>
      </div>
    </div>
  );
}
