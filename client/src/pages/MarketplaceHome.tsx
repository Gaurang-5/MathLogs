import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Search, MapPin, Sparkles, Filter, SlidersHorizontal, GraduationCap, Star, ArrowRight, Loader2, BookOpen } from 'lucide-react';
import { CoachingCard, CoachingItem } from '../components/CoachingCard';

const FEATURED_SUBJECTS = ['Mathematics', 'Physics', 'Chemistry', 'Biology', 'Science', 'English', 'Commerce'];

export default function MarketplaceHome() {
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
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Navbar Header */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white font-bold text-xl shadow-md">
              M
            </div>
            <div>
              <span className="font-extrabold text-xl text-slate-900 tracking-tight">MathLogs</span>
              <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">Marketplace</span>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <Link
              to="/list-coaching"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm transition-colors"
            >
              <GraduationCap className="w-4 h-4" />
              <span>List Your Coaching Free</span>
            </Link>
            <Link
              to="/login"
              className="px-3.5 py-2 text-xs font-semibold text-slate-700 hover:text-indigo-600 transition-colors"
            >
              Teacher Login
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-indigo-900 via-indigo-800 to-purple-900 text-white pt-12 pb-20 px-4 sm:px-6 lg:px-8 overflow-hidden">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px]"></div>
        
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 backdrop-blur-md text-indigo-200 text-xs font-semibold mb-4 border border-white/10">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>Find Verified Local Teachers & Coaching Classes</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-tight">
            Discover Top Coaching Classes & Teachers in Your City
          </h1>
          <p className="mt-4 text-base sm:text-lg text-indigo-200 max-w-2xl mx-auto font-normal">
            Search by subject, teacher name, locality, or review ratings. Contact teachers directly via WhatsApp or phone.
          </p>

          {/* Search Box */}
          <div className="mt-8 bg-white p-3 rounded-2xl shadow-2xl border border-white/20 text-slate-800 flex flex-col md:flex-row gap-2">
            <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 focus-within:ring-2 focus-within:ring-indigo-500">
              <Search className="w-5 h-5 text-slate-400 shrink-0" />
              <input
                type="text"
                placeholder="Search by subject, teacher name, coaching name or area..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
              />
            </div>

            <div className="flex gap-2">
              {/* City Filter */}
              <div className="flex-1 md:w-44 flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-xl border border-slate-200">
                <MapPin className="w-4 h-4 text-indigo-600 shrink-0" />
                <select
                  value={selectedCity}
                  onChange={(e) => setSelectedCity(e.target.value)}
                  className="w-full bg-transparent text-sm text-slate-800 outline-none cursor-pointer"
                >
                  <option value="">All Cities</option>
                  {availableCities.map((city) => (
                    <option key={city} value={city}>{city}</option>
                  ))}
                </select>
              </div>

              <button
                onClick={fetchMarketplaceData}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm rounded-xl transition-colors flex items-center gap-2 shadow-md shrink-0"
              >
                <span>Search</span>
              </button>
            </div>
          </div>

          {/* Quick Subject Chips */}
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <span className="text-xs text-indigo-300 font-medium self-center mr-1">Popular Subjects:</span>
            {FEATURED_SUBJECTS.map((subj) => {
              const active = selectedSubject === subj;
              return (
                <button
                  key={subj}
                  onClick={() => handleSubjectClick(subj)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                    active
                      ? 'bg-amber-400 text-slate-900 shadow-md scale-105'
                      : 'bg-white/10 text-white hover:bg-white/20 border border-white/10'
                  }`}
                >
                  {subj}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex-1 w-full">
        {/* Filters Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
          <div>
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <span>Coaching Classes</span>
              <span className="text-sm font-normal text-slate-500">({coachings.length} found)</span>
            </h2>
            {selectedSubject && (
              <p className="text-xs text-indigo-600 font-medium mt-0.5">
                Filtering by subject: <span className="font-bold">{selectedSubject}</span>
                <button onClick={() => setSelectedSubject('')} className="ml-2 text-slate-400 hover:text-slate-600">✕ Clear</button>
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Exclusive Filter Toggle */}
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-xl cursor-pointer hover:bg-amber-100 transition-colors">
              <input
                type="checkbox"
                checked={exclusiveOnly}
                onChange={(e) => setExclusiveOnly(e.target.checked)}
                className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
              />
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              <span>Exclusive MathLogs Partners</span>
            </label>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-2 bg-white border border-slate-200 px-3 py-1.5 rounded-xl text-xs">
              <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-500 font-medium">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="bg-transparent font-semibold text-slate-800 outline-none cursor-pointer"
              >
                <option value="exclusive">Exclusive Priority</option>
                <option value="rating">Highest Rated</option>
              </select>
            </div>
          </div>
        </div>

        {/* Featured Exclusive Partners Banner Section */}
        {!exclusiveOnly && exclusivePartners.length > 0 && !selectedSubject && !searchTerm && (
          <div className="mt-8 mb-10 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/10 border border-amber-300/40 rounded-3xl p-6 relative overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-500 fill-amber-400" />
                <h3 className="font-extrabold text-slate-900 text-lg">Featured Exclusive MathLogs Partners</h3>
              </div>
              <span className="text-xs font-semibold text-amber-700 bg-amber-100 px-3 py-1 rounded-full border border-amber-200">
                Verified Software Partners
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {exclusivePartners.slice(0, 3).map((coaching) => (
                <CoachingCard key={`featured-${coaching.id}`} coaching={coaching} />
              ))}
            </div>
          </div>
        )}

        {/* Results Grid */}
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-400">
            <Loader2 className="w-10 h-10 animate-spin text-indigo-600 mb-3" />
            <p className="text-sm font-medium">Loading coaching classes...</p>
          </div>
        ) : coachings.length === 0 ? (
          <div className="py-16 text-center bg-white rounded-3xl border border-slate-200 p-8 my-8">
            <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-lg font-bold text-slate-800">No coaching classes found</h3>
            <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
              Try resetting your subject filter or search keywords to explore more teachers in your city.
            </p>
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedSubject('');
                setSelectedCity('');
                setExclusiveOnly(false);
              }}
              className="mt-4 px-4 py-2 bg-indigo-50 text-indigo-600 font-semibold text-xs rounded-xl hover:bg-indigo-100 transition-colors"
            >
              Reset All Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
            {coachings.map((coaching) => (
              <CoachingCard key={coaching.id} coaching={coaching} />
            ))}
          </div>
        )}

        {/* Teacher Registration Banner Callout */}
        <section className="mt-16 bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-3xl p-8 sm:p-12 relative overflow-hidden shadow-xl">
          <div className="max-w-2xl relative z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-indigo-300 text-xs font-semibold mb-3">
              <GraduationCap className="w-4 h-4" />
              <span>For Coaching Owners & Teachers</span>
            </div>
            <h3 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Are you a teacher? List your coaching on MathLogs for FREE
            </h3>
            <p className="mt-2 text-slate-300 text-sm sm:text-base">
              Reach local students searching for specialized subject coaching in your city. Receive direct student leads and WhatsApp inquiries.
            </p>
            <div className="mt-6 flex flex-wrap gap-4 items-center">
              <Link
                to="/list-coaching"
                className="inline-flex items-center gap-2 px-6 py-3 bg-amber-400 hover:bg-amber-300 text-slate-900 font-bold text-sm rounded-xl shadow-lg transition-transform hover:scale-105"
              >
                <span>Create Free Listing Now</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 mt-20 py-8 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4">
          <p>© {new Date().getFullYear()} MathLogs Marketplace. Empowering Local Education.</p>
        </div>
      </footer>
    </div>
  );
}
