import { useState, useEffect, memo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion';
import {
    ChevronRight, MessageSquare, Shield,
    CheckCircle, ArrowRight, Database, LineChart,
    Camera, X, Maximize2, Settings,
    Download, FileText, Printer, Wallet, Plus, Minus
} from 'lucide-react';

/** Static data outside components to prevent recreation on every render */
const ONBOARDING_STEPS = [
    { num: '1', label: 'Kiosk Link', desc: 'Open on a tablet at reception. Students register one after another.' },
    { num: '2', label: 'QR Code', desc: 'Students scan, fill details, and join the batch instantly.' },
    { num: '3', label: 'Manual Entry', desc: 'Teacher adds students directly from the dashboard.' },
] as const;

const KIOSK_STUDENTS = ['Aryan K.', 'Sneha M.', 'Rahul D.'] as const;

const QR_PATTERN = [1, 0, 1, 1, 0, 0, 1, 0, 1, 1, 1, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 0] as const;

/** Memoized card component — only re-renders when props change (none here) */
const OnboardingCard = memo(function OnboardingCard() {
    const [activeStep, setActiveStep] = useState(0);
    useEffect(() => {
        const t = setInterval(() => setActiveStep(s => (s + 1) % 3), 3200);
        return () => clearInterval(t);
    }, []);
    return (
        <div className="bg-white rounded-[2.5rem] p-8 lg:p-12 shadow-sm border border-neutral-100 flex flex-col lg:col-span-2 hover:shadow-md transition-all overflow-hidden">
            <div className="w-[52px] h-[52px] rounded-2xl bg-[#eff4ff] border border-[#d6e4ff] flex items-center justify-center text-[#2970ff] mb-8 shadow-sm">
                <Database className="w-6 h-6" strokeWidth={1.5} />
            </div>
            <h4 className="text-[28px] font-bold text-[#1a1f36] tracking-[-0.03em] mb-4 leading-[1.1]">Flexible Student Onboarding</h4>
            <p className="text-[#697386] text-[17px] leading-relaxed mb-10 max-w-xl">Launch your batches instantly using three seamless registration methods tailored to any scenario.</p>

            <div className="flex flex-col sm:flex-row gap-8 flex-1 min-h-[260px]">
                {/* LEFT: vertical stepper */}
                <div className="flex flex-col justify-center gap-2 sm:w-[200px] shrink-0">
                    {ONBOARDING_STEPS.map((s, i) => (
                        <button
                            key={i}
                            onClick={() => setActiveStep(i)}
                            className={`text-left px-4 py-3.5 rounded-2xl transition-all duration-300 cursor-pointer ${activeStep === i ? 'bg-[#eff4ff] border border-[#d6e4ff]' : 'hover:bg-neutral-50 border border-transparent'}`}
                        >
                            <div className={`text-[13px] font-bold mb-0.5 tracking-tight transition-colors ${activeStep === i ? 'text-[#2970ff]' : 'text-[#697386]'}`}>
                                {s.num}. {s.label}
                            </div>
                            {activeStep === i && (
                                <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="text-[11px] text-[#697386] leading-relaxed">
                                    {s.desc}
                                </motion.div>
                            )}
                        </button>
                    ))}
                </div>

                {/* RIGHT: animated mock UI */}
                <div className="flex-1 relative rounded-2xl bg-[#f7f9fb] border border-neutral-100 overflow-hidden min-h-[240px] flex items-center justify-center">
                    <AnimatePresence mode="wait">
                        {activeStep === 0 && (
                            <motion.div key="kiosk" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.4 }} className="w-full max-w-[280px] bg-white rounded-2xl shadow-[0_8px_40px_-8px_rgba(0,0,0,0.1)] border border-neutral-100 overflow-hidden">
                                <div className="bg-[#eff4ff] px-5 py-3 flex items-center justify-between border-b border-[#d6e4ff]">
                                    <span className="text-[11px] font-bold text-[#2970ff] tracking-wider uppercase">Kiosk Mode</span>
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                                        <span className="text-[10px] text-green-600 font-semibold">LIVE</span>
                                    </div>
                                </div>
                                <div className="p-4 space-y-2">
                                    {KIOSK_STUDENTS.map((name, i) => (
                                        <motion.div key={name} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.25 }} className="flex items-center justify-between bg-neutral-50 rounded-xl px-3 py-2 border border-neutral-100">
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 rounded-full bg-[#eff4ff] text-[#2970ff] flex items-center justify-center text-[9px] font-bold">{name[0]}</div>
                                                <span className="text-[11px] font-semibold text-neutral-800">{name}</span>
                                            </div>
                                            <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                                        </motion.div>
                                    ))}
                                </div>
                                <div className="px-4 pb-4">
                                    <div className="w-full bg-[#2970ff] text-white text-[11px] font-bold rounded-xl py-2 text-center">Next Student →</div>
                                </div>
                            </motion.div>
                        )}
                        {activeStep === 1 && (
                            <motion.div key="qr" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.4 }} className="w-full max-w-[260px] bg-white rounded-2xl shadow-[0_8px_40px_-8px_rgba(0,0,0,0.1)] border border-neutral-100 p-5 flex flex-col items-center">
                                <div className="text-[11px] font-bold text-[#697386] tracking-wider uppercase mb-4">Scan to Register</div>
                                <div className="relative w-[120px] h-[120px] bg-white border-2 border-[#2970ff]/30 rounded-xl flex items-center justify-center mb-4 overflow-hidden">
                                    <div className="grid grid-cols-5 gap-[3px] p-2">
                                        {QR_PATTERN.map((v, i) => (
                                            <motion.div key={i} className="w-full aspect-square rounded-[2px]" style={{ backgroundColor: v ? '#1a1f36' : 'transparent' }} animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 2, repeat: Infinity, delay: i * 0.04 }} />
                                        ))}
                                    </div>
                                    <motion.div className="absolute left-0 right-0 h-0.5 bg-[#2970ff]/60 shadow-[0_0_8px_rgba(41,112,255,0.8)]" animate={{ top: ['10%', '90%', '10%'] }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }} />
                                </div>
                                <div className="text-[10px] text-[#697386] text-center leading-relaxed">Class 10 — JEE Batch<br /><span className="text-[#2970ff] font-semibold">45 spots remaining</span></div>
                            </motion.div>
                        )}
                        {activeStep === 2 && (
                            <motion.div key="manual" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.4 }} className="w-full max-w-[280px] bg-white rounded-2xl shadow-[0_8px_40px_-8px_rgba(0,0,0,0.1)] border border-neutral-100 p-5">
                                <div className="text-[11px] font-bold text-[#697386] tracking-wider uppercase mb-4">Add Student</div>
                                <div className="space-y-3">
                                    {[{ label: 'Name', val: 'Priya Sharma' }, { label: 'WhatsApp', val: '+91 98765...' }].map((field, i) => (
                                        <div key={i} className="flex flex-col gap-1">
                                            <label className="text-[9px] font-bold text-[#697386] uppercase tracking-wider">{field.label}</label>
                                            <motion.div className="border border-neutral-200 rounded-lg px-3 py-1.5 text-[11px] text-[#1a1f36] font-medium bg-white overflow-hidden whitespace-nowrap" initial={{ width: '30%' }} animate={{ width: '100%' }} transition={{ duration: 1.2, delay: i * 0.6, ease: 'easeOut' }}>
                                                {field.val}
                                            </motion.div>
                                        </div>
                                    ))}
                                </div>
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.4 }} className="mt-4 w-full bg-[#2970ff] text-white text-[11px] font-bold rounded-xl py-2 text-center flex items-center justify-center gap-1.5">
                                    <CheckCircle className="w-3 h-3" /> Add to Batch
                                </motion.div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                    <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
                        {[0, 1, 2].map(i => (
                            <button key={i} onClick={() => setActiveStep(i)} className={`h-1.5 rounded-full transition-all duration-300 ${activeStep === i ? 'bg-[#2970ff] w-4' : 'bg-neutral-300 w-1.5'}`} />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
});

// Animated background path lines (inspired by aceternity/magic-ui FloatingPaths)
function FloatingPaths({ position }: { position: number }) {
    const paths = Array.from({ length: 36 }, (_, i) => ({
        id: i,
        d: `M-${380 - i * 5 * position} -${189 + i * 6}C-${380 - i * 5 * position
            } -${189 + i * 6} -${312 - i * 5 * position} ${216 - i * 6} ${152 - i * 5 * position
            } ${343 - i * 6}C${616 - i * 5 * position} ${470 - i * 6} ${684 - i * 5 * position
            } ${875 - i * 6} ${684 - i * 5 * position} ${875 - i * 6}`,
        width: 0.5 + i * 0.03,
    }));
    return (
        <div className="absolute inset-0 pointer-events-none">
            <svg className="w-full h-full" viewBox="0 0 696 316" fill="none" aria-hidden="true">
                {paths.map((path) => (
                    <motion.path
                        key={path.id}
                        d={path.d}
                        stroke="currentColor"
                        strokeWidth={path.width}
                        strokeOpacity={0.06 + path.id * 0.018}
                        className="text-indigo-900"
                        initial={{ pathLength: 0.3, opacity: 0.4 }}
                        animate={{
                            pathLength: 1,
                            opacity: [0.2, 0.45, 0.2],
                            pathOffset: [0, 1, 0],
                        }}
                        transition={{
                            duration: 20 + (path.id % 7) * 3,
                            repeat: Infinity,
                            ease: 'linear',
                        }}
                    />
                ))}
            </svg>
        </div>
    );
}

export default function Home() {
    const { scrollY } = useScroll();
    const [expandedFeature, setExpandedFeature] = useState<string | null>(null);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const carouselRef = useRef<HTMLDivElement>(null);
    const y1 = useTransform(scrollY, [0, 1000], [0, 200]);
    const y2 = useTransform(scrollY, [0, 1000], [0, -100]);

    // Auto-scroll logic for mobile carousel
    useEffect(() => {
        if (!expandedFeature || (expandedFeature !== 'whatsapp' && expandedFeature !== 'scan')) return;

        const interval = setInterval(() => {
            // Ensure this only runs for mobile screens where snap carousel is active
            if (window.innerWidth >= 768) return;

            if (carouselRef.current) {
                const { scrollLeft, scrollWidth, clientWidth } = carouselRef.current;

                // If we've reached the end
                if (scrollLeft + clientWidth >= scrollWidth - 10) {
                    carouselRef.current.scrollTo({ left: 0, behavior: 'smooth' });
                } else {
                    carouselRef.current.scrollBy({ left: clientWidth, behavior: 'smooth' });
                }
            }
        }, 3000); // Swipe every 3 seconds

        return () => clearInterval(interval);
    }, [expandedFeature]);

    return (
        <div className="relative min-h-screen bg-neutral-50 font-sans text-neutral-900 overflow-x-hidden selection:bg-accent-primary selection:text-white">
            {/* Skip to main content — accessibility */}
            <a
                href="#main-content"
                className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[200] focus:px-4 focus:py-2 focus:bg-indigo-600 focus:text-white focus:rounded-lg focus:font-semibold"
            >
                Skip to main content
            </a>

            {/* SOFT AMBIENT ANIMATED BACKGROUND */}
            <div className="absolute top-0 left-0 w-full min-h-[180vh] md:min-h-[130vh] pointer-events-none overflow-hidden z-0 bg-[#f8faff]">
                {/* Ambient Glowing Orbs — mix-blend-multiply removed for Safari/mobile compat */}
                <div className="absolute inset-0 w-full h-full">
                    {/* Center Right - Main Indigo/Purple Glow */}
                    <motion.div
                        animate={{
                            x: [0, -40, 0],
                            y: [0, 30, 0],
                            scale: [1, 1.1, 1],
                        }}
                        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
                        className="absolute top-[-5%] right-[-10%] w-[80vw] h-[80vw] md:w-[65vw] md:h-[65vw] bg-gradient-to-bl from-purple-400 via-indigo-300 to-transparent rounded-full blur-[80px] md:blur-[120px] opacity-50 will-change-transform"
                    />
                    {/* Bottom Right - Blue Glow */}
                    <motion.div
                        animate={{
                            x: [0, 40, 0],
                            y: [0, -20, 0],
                            scale: [1.1, 1, 1.1],
                        }}
                        transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
                        className="absolute top-[30%] right-[10%] w-[70vw] h-[70vw] md:w-[50vw] md:h-[50vw] bg-gradient-to-tr from-blue-400 via-cyan-200 to-transparent rounded-full blur-[80px] md:blur-[140px] opacity-45 will-change-transform"
                    />
                    {/* Left - Soft Pink/Peach Glow */}
                    <motion.div
                        animate={{
                            x: [0, 20, -20, 0],
                            y: [0, 40, 0],
                            scale: [1, 1.05, 1],
                        }}
                        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
                        className="absolute top-[10%] left-[-20%] w-[75vw] h-[75vw] md:w-[60vw] md:h-[60vw] bg-gradient-to-br from-orange-100 via-pink-200 to-transparent rounded-full blur-[80px] md:blur-[140px] opacity-50 will-change-transform"
                    />
                    {/* Center - Deep Blue Accent */}
                    <motion.div
                        animate={{
                            x: [0, -30, 20, 0],
                            y: [0, -20, 30, 0],
                        }}
                        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
                        className="absolute top-[20%] left-[20%] w-[55vw] h-[55vw] md:w-[40vw] md:h-[40vw] bg-indigo-300 rounded-full blur-[80px] md:blur-[150px] opacity-35 will-change-transform"
                    />
                </div>
                {/* Glassmorphism overlay — lighter blur on mobile */}
                <div className="absolute inset-0 bg-white/30 backdrop-blur-[40px] md:backdrop-blur-[100px] z-0 [mask-image:linear-gradient(to_bottom,white_40%,transparent_100%)]" />

                {/* Floating path lines */}
                <div className="absolute inset-0 z-[1] opacity-30 md:opacity-40 text-slate-900">
                    <FloatingPaths position={1} />
                    <FloatingPaths position={-1} />
                </div>
            </div>

            {/* NAV BAR */}
            <nav role="navigation" aria-label="Main navigation" className="relative z-50 flex items-center justify-between px-6 py-5 max-w-7xl mx-auto">
                <div className="flex items-center gap-2.5">
                    <img src="/icon-512x512.png" alt="MathLogs Logo" width={36} height={36} fetchPriority="high" className="w-9 h-9 rounded-xl shadow-md border border-neutral-100 object-cover" />
                    <span className="text-[22px] font-extrabold tracking-tight text-neutral-900">MathLogs</span>
                </div>

                {/* Desktop links */}
                <div className="hidden md:flex items-center gap-8 font-medium text-sm text-neutral-600">
                    <a href="#features" className="hover:text-neutral-900 transition-colors">Features</a>
                    <a href="#pricing" className="hover:text-neutral-900 transition-colors">Pricing</a>
                    <a href="#contact" className="hover:text-neutral-900 transition-colors">Contact Us</a>
                </div>

                {/* Desktop CTA */}
                <div className="hidden md:flex items-center gap-4">
                    <Link to="/login" className="text-sm font-semibold text-neutral-700 hover:text-neutral-900 transition-colors">
                        Sign in
                    </Link>
                    <Link
                        to="/onboarding"
                        className="group relative inline-flex items-center gap-2 px-5 py-2.5 bg-neutral-900 text-white text-sm font-semibold rounded-full overflow-hidden transition-all hover:bg-neutral-800 hover:shadow-lg hover:shadow-black/10 active:scale-95"
                    >
                        <span>Sign Up</span>
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </Link>
                </div>

                {/* Mobile: Sign Up + Hamburger */}
                <div className="flex md:hidden items-center gap-3">
                    <Link
                        to="/onboarding"
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-neutral-900 text-white text-sm font-semibold rounded-full"
                    >
                        Sign Up
                    </Link>
                    <button
                        onClick={() => setMobileMenuOpen(o => !o)}
                        aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
                        aria-expanded={mobileMenuOpen}
                        className="w-10 h-10 flex flex-col items-center justify-center gap-1.5 rounded-xl bg-white border border-neutral-200 shadow-sm"
                    >
                        <span className={`block w-5 h-0.5 bg-neutral-800 transition-all duration-300 ${mobileMenuOpen ? 'rotate-45 translate-y-2' : ''}`} />
                        <span className={`block w-5 h-0.5 bg-neutral-800 transition-all duration-300 ${mobileMenuOpen ? 'opacity-0' : ''}`} />
                        <span className={`block w-5 h-0.5 bg-neutral-800 transition-all duration-300 ${mobileMenuOpen ? '-rotate-45 -translate-y-2' : ''}`} />
                    </button>
                </div>
            </nav>

            {/* Mobile Dropdown Menu */}
            <AnimatePresence>
                {mobileMenuOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.2 }}
                        className="relative z-40 md:hidden mx-4 mb-2 bg-white/90 backdrop-blur-xl rounded-2xl border border-neutral-200/80 shadow-lg overflow-hidden"
                    >
                        <div className="flex flex-col py-2">
                            <a href="#features" onClick={() => setMobileMenuOpen(false)} className="px-6 py-4 text-base font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors">Features</a>
                            <a href="#pricing" onClick={() => setMobileMenuOpen(false)} className="px-6 py-4 text-base font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors">Pricing</a>
                            <a href="#contact" onClick={() => setMobileMenuOpen(false)} className="px-6 py-4 text-base font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors">Contact Us</a>
                            <div className="mx-4 my-2 h-px bg-neutral-100" />
                            <Link to="/login" onClick={() => setMobileMenuOpen(false)} className="px-6 py-4 text-base font-semibold text-neutral-500 hover:bg-neutral-50 transition-colors">Sign in</Link>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* HERO SECTION */}
            <main id="main-content" role="main" className="relative z-10 lg:block flex flex-col lg:min-h-0 min-h-svh pt-14 pb-0 md:pt-24 px-6 lg:pb-40">
                <div className="max-w-7xl mx-auto lg:flex-none lg:block flex-1 flex flex-col">
                    <div className="grid lg:grid-cols-2 gap-8 items-center">

                        {/* HERO TEXT (LEFT) */}
                        <div className="relative z-20 max-w-2xl">
                            <h1 className="text-[2.75rem] sm:text-[3.5rem] md:text-[5rem] font-extrabold tracking-tighter leading-[1.05] mb-5 text-[#1A1F36]">
                                Everything you need for
                                {/* Fixed-height block prevents layout shift when typed text changes line count */}
                                <span className="block min-h-[2.2em] sm:min-h-[1.15em]">
                                    <TypewriterText texts={[
                                        "modern coaching.",
                                        "instant grading.",
                                        "fee collection.",
                                        "parent updates."
                                    ]} />
                                </span>
                            </h1>

                            <p className="text-lg md:text-2xl text-neutral-500 font-medium leading-relaxed mb-8 max-w-lg">
                                Spend less time on paperwork.{' '}
                                {/* Fixed height prevents jump between subtitle phrases */}
                                <span className="block min-h-[1.6em] text-blue-600 font-semibold">
                                    <TypewriterText texts={[
                                        "More time teaching.",
                                        "More time with students.",
                                        "More time to grow."
                                    ]} />
                                </span>
                            </p>

                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                                <Link
                                    to="/onboarding"
                                    className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-indigo-600 text-white font-bold rounded-full transition-all hover:bg-indigo-700 hover:shadow-lg hover:shadow-indigo-500/25 active:scale-95 group"
                                >
                                    Get Started
                                    <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                </Link>
                                <a
                                    href="https://docs.google.com/forms/d/e/1FAIpQLSf_iZpFA8pDCv5ESQ8OwESB7YzlMjWETwwRirk-MV6LddQBeQ/viewform"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center justify-center px-8 py-4 font-bold text-neutral-700 border border-neutral-200 rounded-full hover:bg-neutral-100 transition-colors bg-white/60"
                                >
                                    Request Demo
                                </a>
                            </div>
                        </div>

                        {/* DESKTOP MOCKUP — right column, lg+ only */}
                        <div className="hidden lg:block relative z-10 w-full h-[600px] flex items-center justify-center perspective-[2000px]">
                            <div className="relative w-full h-full flex items-center justify-center">
                                <motion.div
                                    initial={{ opacity: 0, y: 40, rotateX: 10, rotateY: -10 }}
                                    animate={{ opacity: 1, y: 0, rotateX: 0, rotateY: -2 }}
                                    transition={{ duration: 1.2, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
                                    className="absolute left-1/2 -translate-x-[33%] top-[10%] w-[160%] max-w-[1300px] z-10 flex flex-col bg-white rounded-3xl shadow-[0_30px_100px_-20px_rgba(0,0,0,0.2)] border border-neutral-200/60 overflow-hidden transform-gpu"
                                >
                                    <div className="w-full bg-neutral-100/80 backdrop-blur-md border-b border-neutral-200/80 px-4 py-3 flex items-center gap-2">
                                        <div className="flex gap-2">
                                            <div className="w-3 h-3 rounded-full bg-[#ff5f56] border border-[#e0443e]" />
                                            <div className="w-3 h-3 rounded-full bg-[#ffbd2e] border border-[#dea123]" />
                                            <div className="w-3 h-3 rounded-full bg-[#27c93f] border border-[#1aab29]" />
                                        </div>
                                    </div>
                                    <div className="w-full relative bg-[#f8faff]">
                                        <img
                                            src="/dashboard.png"
                                            alt="MathLogs dashboard showing student tracking, fee collection, and growth trends"
                                            fetchPriority="high"
                                            className="w-full h-auto object-cover pointer-events-none origin-top"
                                        />
                                        <div className="absolute bottom-0 left-0 w-full h-24 bg-gradient-to-t from-white/10 to-transparent pointer-events-none" />
                                    </div>
                                </motion.div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── MOBILE MOCKUP (< 768px) — Bulletproof Flex Centering ── */}
                <div className="md:hidden mt-auto pt-6 flex justify-center overflow-hidden w-screen relative left-1/2 -translate-x-1/2">
                    <motion.img
                        src="/images/features/dashboard-mobile.png"
                        alt="MathLogs mobile app dashboard"
                        fetchPriority="high"
                        animate={{ y: [0, -10, 0] }}
                        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                        className="w-[220%] max-w-[1000px] flex-shrink-0 drop-shadow-[0_24px_48px_rgba(0,0,0,0.18)] origin-top"
                    />
                </div>

                {/* ── TABLET MOCKUP  (md → lg, 768–1023px) ─────────────────────────── */}
                <div className="hidden md:flex lg:hidden mt-auto pt-6 justify-center overflow-hidden w-screen relative left-1/2 -translate-x-1/2 h-auto items-end">
                    <motion.img
                        src="/images/features/dashboard-tablet.png"
                        alt="MathLogs tablet app dashboard"
                        fetchPriority="high"
                        animate={{ y: [0, -10, 0] }}
                        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                        className="w-[160%] min-w-[1000px] max-w-[1400px] flex-shrink-0 drop-shadow-[0_24px_48px_rgba(0,0,0,0.14)] origin-top mb-[-28%]"
                    />
                </div>
            </main>


            {/* STRIPE-LIKE "UNIFIED PLATFORM" FEATURE GRID */}
            <section id="features" className="py-24 md:py-32 bg-neutral-50 relative z-20">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="text-center max-w-3xl mx-auto mb-20">
                        <h2 className="text-accent-primary font-bold tracking-wider uppercase text-sm mb-4">A unified solution</h2>
                        <h3 className="text-3xl md:text-5xl font-extrabold tracking-tight mb-6">
                            Everything you need to run your center, built into one platform.
                        </h3>
                        <p className="text-neutral-500 text-lg md:text-xl font-medium">
                            Stop switching between WhatsApp web, Excel sheets, and paper registers.
                            MathLogs merges grading, communication, and fee tracking.
                        </p>
                    </div>

                    {/* Bento Grid layout */}
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">

                        {/* Large Feature 1 - Intelligent Batch Management */}
                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                            className="md:col-span-2 bg-white rounded-3xl md:rounded-[2.5rem] border border-neutral-100 shadow-sm hover:shadow-md transition-all group relative overflow-hidden flex flex-col pt-7 px-8 md:pt-8 md:px-12"
                        >
                            {/* Icon + badge — same as other cards */}
                            <div className="flex items-center gap-3 mb-5 z-20 relative">
                                <div className="w-11 h-11 rounded-2xl bg-indigo-50 border border-indigo-100/60 flex items-center justify-center text-[#635bff] group-hover:scale-110 transition-transform shrink-0">
                                    <Database className="w-5 h-5" />
                                </div>
                                <span className="text-[11px] font-bold text-[#635bff] bg-indigo-50 border border-indigo-100 px-3 py-1 rounded-full tracking-wide">Batch Management</span>
                            </div>

                            {/* Top row: Title and Expand Button */}
                            <div className="flex justify-between items-start mb-6 z-20 relative w-full">
                                <h4 className="text-[32px] md:text-[40px] font-bold tracking-[-0.03em] text-[#1a1f36] max-w-full max-w-[420px] leading-[1.1]">
                                    Intelligent batch & student tracking
                                </h4>
                                <button
                                    onClick={() => setExpandedFeature('batch')}
                                    className="w-10 h-10 rounded-xl bg-[#f7f9fa] flex items-center justify-center text-[#635bff] hover:bg-[#f0f2f5] transition-colors shrink-0 cursor-pointer shadow-sm relative z-50 border border-neutral-200/50"
                                >
                                    <Maximize2 className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Dashboard preview — mirrors real batch dashboard */}
                            <div className="relative z-10 w-full flex items-end justify-center pt-5 overflow-hidden">
                                <motion.div
                                    className="w-full max-w-full max-w-[860px] bg-white rounded-t-3xl border border-neutral-200/60 shadow-[0_-10px_50px_-10px_rgba(0,0,0,0.1)] overflow-hidden overflow-x-auto custom-scrollbar"
                                    initial={{ y: 60, opacity: 0 }}
                                    whileInView={{ y: 0, opacity: 1 }}
                                    transition={{ duration: 0.8, delay: 0.2, type: 'spring', bounce: 0.15 }}
                                >
                                    <div className="min-w-[700px]">
                                        {/* Batch Header Card */}
                                        <div className="bg-white border-b border-neutral-100 px-6 py-4 flex items-start justify-between">
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-[15px] font-bold text-[#1a1f36]">CLASS 10</span>
                                                    <span className="text-[10px] bg-neutral-100 text-neutral-600 font-semibold px-2 py-0.5 rounded-full border border-neutral-200">Math</span>
                                                    <span className="text-[10px] bg-[#eff4ff] text-[#2970ff] font-bold px-2 py-0.5 rounded-full">10</span>
                                                </div>
                                                <div className="flex items-center gap-3 text-[11px] text-[#697386]">
                                                    <span>🕐 4–5</span>
                                                    <span>👥 3 Students</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3 mt-1">
                                                {/* Action buttons row */}
                                                {['Download List', 'Add Student', 'Fee Columns', 'Add Group Link'].map((action) => (
                                                    <div key={action} className="text-[9px] font-semibold text-neutral-600 border border-neutral-200 rounded-lg px-2.5 py-1.5 bg-white whitespace-nowrap">{action}</div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Search bar */}
                                        <div className="px-6 py-2 border-b border-neutral-100 bg-neutral-50/50">
                                            <div className="flex items-center gap-2 bg-white border border-neutral-200 rounded-xl px-3 py-1.5 max-w-xs">
                                                <span className="text-neutral-300 text-[12px]">🔍</span>
                                                <span className="text-[11px] text-neutral-400">Search by name, school, ID, or phone...</span>
                                            </div>
                                        </div>

                                        {/* Table header */}
                                        <div className="grid grid-cols-[80px_1fr_1fr_1fr_80px_80px_100px_60px] px-6 py-2 bg-white border-b border-neutral-100">
                                            {['ID', 'STUDENT NAME', 'SCHOOL', 'PARENT NAME', 'TESTS', 'AVG (10)', 'JAN ₹1000', 'ACTIONS'].map((col) => (
                                                <span key={col} className="text-[9px] font-bold text-[#697386] tracking-wider uppercase">{col}</span>
                                            ))}
                                        </div>

                                        {/* Student rows */}
                                        {[
                                            { id: 'DE-MTH26-001', name: 'student1', school: 'school1', parent: 'parent1', tests: '👁', avg: '9.5', feeIcon: '⦾', feeColor: 'text-[#1a1f36]' },
                                            { id: 'DE-MTH26-002', name: 'student2', school: 'school2', parent: 'parent2', tests: '👁', avg: '8.6', feeIcon: '◎', feeColor: 'text-amber-500' },
                                            { id: 'DE-MTH26-003', name: 'student3', school: 'school3', parent: 'parent3', tests: '👁', avg: '7.9', feeIcon: '○', feeColor: 'text-neutral-400' },
                                            { id: 'DE-MTH26-004', name: 'student4', school: 'school4', parent: 'parent4', tests: '👁', avg: '8.2', feeIcon: '⦾', feeColor: 'text-[#1a1f36]' },
                                            { id: 'DE-MTH26-005', name: 'student5', school: 'school5', parent: 'parent5', tests: '👁', avg: '7.4', feeIcon: '◎', feeColor: 'text-amber-500' },
                                        ].map((row, i) => (
                                            <motion.div
                                                key={row.id}
                                                initial={{ opacity: 0, x: -10 }}
                                                whileInView={{ opacity: 1, x: 0 }}
                                                transition={{ delay: 0.5 + i * 0.12 }}
                                                className="grid grid-cols-[80px_1fr_1fr_1fr_80px_80px_100px_60px] px-6 py-2.5 border-b border-neutral-50 hover:bg-neutral-50/70 transition-colors"
                                            >
                                                <span className="text-[10px] font-mono text-neutral-400">{row.id}</span>
                                                <span className="text-[11px] font-bold text-[#1a1f36]">{row.name}</span>
                                                <span className="text-[11px] text-neutral-500">{row.school}</span>
                                                <span className="text-[11px] text-neutral-500">{row.parent}</span>
                                                <span className="text-[11px] text-neutral-500">{row.tests}</span>
                                                <span className="text-[12px] font-bold text-[#1a1f36]">{row.avg}</span>
                                                <span className={`text-[14px] font-bold ${row.feeColor} text-center`}>{row.feeIcon}</span>
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-neutral-300 text-[11px] cursor-pointer">✏</span>
                                                    <span className="text-neutral-300 text-[11px] cursor-pointer">🗑</span>
                                                </div>
                                            </motion.div>
                                        ))}

                                        {/* Summary stats footer */}
                                        <div className="px-6 py-3 bg-neutral-50/80 border-t border-neutral-100 flex items-center justify-between">
                                            <div className="flex items-center gap-5">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider">Students</span>
                                                    <span className="text-[11px] font-bold text-[#1a1f36]">5</span>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider">Avg Score</span>
                                                    <span className="text-[11px] font-bold text-[#1a1f36]">8.3 / 10</span>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider">Fees Paid</span>
                                                    <span className="text-[11px] font-bold text-green-600">₹4,000</span>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-wider">Due</span>
                                                    <span className="text-[11px] font-bold text-amber-500">₹2,000</span>
                                                </div>
                                            </div>
                                            <span className="text-[9px] text-neutral-300">Showing 5 of 10 students</span>
                                        </div>
                                    </div>
                                </motion.div>
                            </div>
                        </motion.div>

                        {/* Feature 2 - Fee Logging */}
                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
                            className="bg-white rounded-3xl md:rounded-[2.5rem] p-8 md:p-10 lg:p-12 border border-neutral-100 shadow-sm hover:shadow-md transition-all group relative overflow-hidden flex flex-col min-h-[580px]"
                        >
                            <div className="relative z-10 mb-8">
                                <Shield className="w-8 h-8 text-[#9324ff] mb-6" strokeWidth={1.5} />
                                <h4 className="text-[24px] font-bold text-[#1a1f36] tracking-[-0.02em] mb-4">Fee Logging & Tracking</h4>
                                <p className="text-[#697386] font-medium text-[15px] leading-relaxed">
                                    Log payments securely and track pending fees at a glance. Maintain absolute clarity over who has paid.
                                </p>
                            </div>

                            {/* Card / Finance UI animation */}
                            <div className="relative flex-1 mt-auto h-64 rounded-[2rem] flex items-center justify-center overflow-visible bg-[#f7f9fa] border border-neutral-100 p-6 shadow-inner">
                                <motion.div
                                    className="w-full max-w-[260px] bg-white rounded-2xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.08)] border border-neutral-200/60 p-5 flex flex-col relative z-10"
                                    initial={{ y: 20, opacity: 0 }}
                                    whileInView={{ y: 0, opacity: 1 }}
                                    viewport={{ once: true }}
                                    transition={{ duration: 0.6, delay: 0.3 }}
                                >
                                    <div className="flex justify-between items-start mb-5 pb-4 border-b border-neutral-100">
                                        <div>
                                            <h5 className="font-bold text-[#1a1f36] text-[13px] mb-1">Log Fee Payment</h5>
                                            <p className="text-[#697386] text-[10px]">Quickly record a payment</p>
                                        </div>
                                        <X className="w-4 h-4 text-neutral-400 mt-0.5" />
                                    </div>

                                    <div className="mb-4">
                                        <label className="text-[9px] font-bold text-[#697386] tracking-wider uppercase mb-2 block">Select Student</label>
                                        <div className="flex items-center justify-between border border-neutral-200/80 rounded-lg p-2 bg-white">
                                            <div className="flex items-center gap-2.5">
                                                <div className="w-5 h-5 rounded overflow-hidden bg-[#e3efff] text-[#0066ff] flex items-center justify-center text-[9px] font-bold shrink-0">
                                                    RS
                                                </div>
                                                <motion.span
                                                    className="text-[#1a1f36] text-[11px] font-semibold"
                                                    initial={{ opacity: 0 }}
                                                    animate={{ opacity: 1 }}
                                                    transition={{ duration: 0.5, delay: 0.2 }}
                                                >
                                                    Rahul Sharma
                                                </motion.span>
                                            </div>
                                            <X className="w-3.5 h-3.5 text-neutral-400" />
                                        </div>
                                    </div>

                                    <div className="mb-6">
                                        <label className="text-[9px] font-bold text-[#697386] tracking-wider uppercase mb-2 block">Amount to collect</label>
                                        <div className="flex items-center border border-neutral-200/80 rounded-lg p-2 gap-2 bg-white">
                                            <span className="text-neutral-400 text-[13px] font-semibold px-1.5">₹</span>
                                            <AnimatedAmountInput />
                                        </div>
                                    </div>

                                    <FeeCollectButton width="full" />

                                    {/* Animated Cursor pointing to Collect button in Bento Box */}
                                    <motion.div
                                        animate={{
                                            x: [100, 10, 10, 100],
                                            y: [-40, 16, 16, -40],
                                            opacity: [0, 1, 1, 0],
                                            scale: [1, 1, 0.9, 1]
                                        }}
                                        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                                        className="absolute right-10 bottom-4 w-6 h-6 z-50 pointer-events-none drop-shadow-lg"
                                        style={{ transformOrigin: "top left" }}
                                    >
                                        <svg viewBox="0 0 24 24" fill="#000" xmlns="http://www.w3.org/2000/svg" stroke="white" strokeWidth="1.5">
                                            <path d="M4.00494 10.4215L2.39958 11.2242L2.39958 11.2242L4.00494 10.4215ZM4.3945 9.64168L2.78923 10.4446L2.78923 10.4446L4.3945 9.64168ZM12.9155 13.9016L14.5208 13.0987L14.5208 13.0987L11.724 12.3524C11.6669 12.3371 11.6698 12.2536 11.7285 12.2415C11.9687 12.1923 12.3344 12.1171 12.6931 12.0433L12.6953 12.0428L12.7231 12.0371L12.8252 12.0163M2.78923 10.4446C1.63756 12.748 -0.0639436 16.5912 0.812328 17.4338C1.55403 18.1466 4.79373 17.5539 7.37397 16.5937L6.68007 14.7317C4.19503 15.6565 2.16246 16.0963 1.9566 15.8984C1.72791 15.6787 2.87955 12.6715 4.3945 9.64168L2.78923 10.4446ZM7.37397 16.5937C7.62232 16.5013 7.7818 16.2736 7.84478 16.0279L5.90807 15.5348C5.9388 15.4148 6.00259 15.3045 6.0927 15.2155C6.18281 15.1265 6.2952 15.063 6.4151 15.0323L7.37397 16.5937ZM7.84478 16.0279C7.90776 15.7821 7.86821 15.5332 7.73461 15.3216L6.04419 16.3848L6.04375 16.3845C6.01257 16.3353 5.95267 16.2413 5.90807 15.5348L7.84478 16.0279ZM7.73461 15.3216L4.00494 10.4215L2.39958 11.2242L6.12925 16.1243L7.73461 15.3216ZM4.00494 10.4215C3.59385 9.59932 3.19154 8.79471 2.78923 10.4446L4.3945 9.64168C4.015 8.88267 3.59892 8.0505 4.3945 9.64168L4.00494 10.4215ZM12.9155 13.9016C12.9099 13.9129 12.9042 13.9242 12.8986 13.9355L14.6872 14.8296C14.7176 14.7686 14.7479 14.708 14.7781 14.6476L12.9155 13.9016ZM14.5208 13.0987L12.9155 13.9016L14.7781 14.6476L16.3835 13.8446L14.5208 13.0987ZM14.5208 13.0987L14.5103 13.0784C14.4996 13.0577 14.4883 13.0366 14.4759 13.0142C14.4503 12.9678 14.4172 12.909 14.372 12.8396C14.2811 12.7001 14.1507 12.5118 13.9631 12.2618C13.5901 11.7645 13.0474 11.1147 12.338 10.3644L10.8856 11.7408C11.5312 12.424 12.015 13.0039 12.3619 13.4659C12.5348 13.6961 12.6468 13.8584 12.7214 13.9723C12.7588 14.0296 12.7845 14.0706 12.8021 14.0991C12.8109 14.1133 12.817 14.1235 12.821 14.1303C12.8251 14.1373 12.823 14.134 12.8193 14.1308L14.5208 13.0987ZM12.8252 12.0163C13.0041 11.9796 13.2575 11.9275 13.5678 11.8638L13.166 9.90562C12.8559 9.96924 12.6027 10.0212 12.424 10.058C12.2855 10.0865 12.187 10.1068 12.1264 10.1192L12.1009 10.1245L12.1105 10.1226C11.6669 12.3371 11.6698 12.2536 11.7285 12.2415C11.9687 12.1923 12.3344 12.1171 12.6931 12.0433V12.0433L12.8252 12.0163Z" />
                                        </svg>
                                    </motion.div>
                                </motion.div>
                            </div>
                        </motion.div>

                        {/* Feature 3 - Automated WhatsApp Messages */}
                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
                            className="bg-white rounded-3xl md:rounded-[2.5rem] p-8 md:p-10 lg:p-12 border border-neutral-100 shadow-sm hover:shadow-md transition-all group relative overflow-hidden flex flex-col min-h-[580px]"
                        >
                            <div className="flex justify-between items-start mb-6 z-20 relative w-full">
                                <div className="space-y-6">
                                    <MessageSquare className="w-8 h-8 text-[#0066ff]" strokeWidth={1.5} />
                                    <h4 className="text-[24px] font-bold text-[#1a1f36] tracking-[-0.02em] leading-tight">WhatsApp Alerts</h4>
                                </div>
                                <button
                                    onClick={() => setExpandedFeature('whatsapp')}
                                    className="w-10 h-10 rounded-xl bg-[#f7f9fa] flex items-center justify-center text-[#0066ff] hover:bg-[#f0f2f5] transition-colors shrink-0 cursor-pointer shadow-sm relative z-50 border border-neutral-200/50"
                                >
                                    <Maximize2 className="w-4 h-4" />
                                </button>
                            </div>

                            <p className="text-[#697386] font-medium text-[15px] leading-relaxed relative z-10 max-w-sm mb-8">
                                Keep parents in the loop. Send automated updates for test marks and timely reminders for pending fees.
                            </p>

                            {/* Outer Card Simple Animation */}
                            <div className="relative flex-1 mt-auto bg-[#fafafa] rounded-2xl border border-neutral-100 p-6 flex items-center justify-center shadow-inner overflow-hidden">
                                <motion.div
                                    animate={{ y: [0, -10, 0] }}
                                    transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                                    className="w-20 h-20 bg-[#25d366] rounded-full shadow-xl shadow-[#25d366]/30 flex items-center justify-center group-hover:scale-110 transition-transform relative z-10 text-white"
                                >
                                    <MessageSquare className="w-8 h-8" fill="currentColor" />
                                    {/* Small notification badge */}
                                    <motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: [1, 1.2, 1] }}
                                        transition={{ duration: 2, repeat: Infinity, delay: 1 }}
                                        className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-bold"
                                    >
                                        3
                                    </motion.div>
                                </motion.div>

                                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,#25d36611_0%,transparent_70%)] opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                            </div>
                        </motion.div>

                        {/* Feature 4 - Smart Sticker Scanning */}
                        <motion.div
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.7, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
                            className="md:col-span-2 bg-white rounded-3xl md:rounded-[2.5rem] p-8 md:p-12 lg:p-16 border border-neutral-100 shadow-sm hover:shadow-md transition-all relative overflow-hidden group flex flex-col md:flex-row items-center justify-between min-h-[580px]"
                        >
                            <button
                                onClick={() => setExpandedFeature('scan')}
                                className="absolute top-8 right-8 md:top-12 md:right-12 lg:top-16 lg:right-16 w-10 h-10 rounded-xl bg-[#f7f9fa] flex items-center justify-center text-[#0066ff] hover:bg-[#f0f2f5] transition-colors shrink-0 cursor-pointer shadow-sm z-50 border border-neutral-200/50"
                            >
                                <Maximize2 className="w-4 h-4" />
                            </button>

                            <div className="relative z-10 mb-12 md:mb-0 max-w-full max-w-[460px]">
                                <Camera className="w-8 h-8 text-[#0066ff] mb-8" strokeWidth={1.5} />
                                <h4 className="text-[32px] md:text-[40px] font-bold text-[#1a1f36] tracking-[-0.03em] mb-5 leading-[1.1]">Smart Sticker Scanning</h4>
                                <ul className="space-y-4">
                                    <li className="flex items-start gap-3">
                                        <CheckCircle className="w-5 h-5 text-[#0066ff] shrink-0 mt-0.5" strokeWidth={2} />
                                        <span className="text-[#697386] font-medium text-[15px] leading-snug">Generate and print custom QR stickers for each test sheet</span>
                                    </li>
                                    <li className="flex items-start gap-3">
                                        <CheckCircle className="w-5 h-5 text-[#0066ff] shrink-0 mt-0.5" strokeWidth={2} />
                                        <span className="text-[#697386] font-medium text-[15px] leading-snug">Teacher manually writes the student's marks directly on the sticker</span>
                                    </li>
                                    <li className="flex items-start gap-3">
                                        <CheckCircle className="w-5 h-5 text-[#0066ff] shrink-0 mt-0.5" strokeWidth={2} />
                                        <span className="text-[#697386] font-medium text-[15px] leading-snug">Scan the sheet: instantly identify the student (QR) and read their score (OCR)</span>
                                    </li>
                                </ul>
                            </div>

                            {/* Scanning UI Animation */}
                            <div className="relative z-0 mt-8 md:mt-0 h-[320px] w-[100%] md:w-full max-w-[420px] bg-[#f8faff] rounded-[2rem] border border-blue-50 overflow-hidden shadow-inner shrink-0 group">
                                {/* Fake Test Paper Background */}
                                <div className="absolute inset-x-8 -bottom-16 top-12 bg-[#fdfdfd] rounded-t-md border border-neutral-300 shadow-[0_0_30px_rgba(0,0,0,0.1)] overflow-hidden transition-transform duration-700 ease-in-out group-hover:-translate-y-2">
                                    {/* Vertical Red Margin Line */}
                                    <div className="absolute left-10 top-0 bottom-0 w-[1.5px] bg-red-200/80"></div>

                                    {/* Paper Header / Name Field */}
                                    <div className="pt-6 pl-14 pr-6 pb-3 border-b border-blue-100 flex flex-col gap-2 relative z-0">
                                        <div className="text-[#9ca3af] font-medium text-[11px] tracking-wide uppercase">Physics Final Exam</div>
                                        <div className="flex items-end gap-2 text-[#cbd5e1] font-mono text-sm leading-none">
                                            <span className="text-[#64748b] text-[12px]">Name:</span>
                                            <span className="flex-1 border-b border-neutral-300 border-dashed"></span>
                                        </div>
                                    </div>

                                    {/* Horizontal Ruled Lines */}
                                    <div className="w-full flex-1 flex flex-col relative z-0">
                                        {[...Array(7)].map((_, i) => (
                                            <div key={i} className="w-full h-[36px] bg-transparent border-b border-blue-100/60"></div>
                                        ))}
                                    </div>

                                    {/* Handwritten mock student answers underneath the sticker */}
                                    <div className="absolute left-14 top-24 right-6 text-[#1a1f36] z-0 flex flex-col gap-3 pointer-events-none">
                                        <div className="text-[13px] font-medium text-neutral-600 font-serif italic -rotate-1">
                                            Q1. State Newton's Second Law of Motion.
                                        </div>
                                        <div className="text-[14px] text-blue-800/80 italic pl-2 rotate-1 leading-relaxed">
                                            "The rate of change of momentum of a body <br />
                                            is directly proportional to the applied force <br />
                                            and takes place in the direction of the force."
                                        </div>
                                        <div className="text-red-500 font-bold text-xl ml-48 -rotate-6 mt-1 opacity-80">
                                            ✓
                                        </div>
                                    </div>
                                </div>

                                {/* Real Smart Sticker Image Placed on the test paper */}
                                <motion.img
                                    src="/sticker-mockup.png"
                                    alt="Smart QR sticker with handwritten marks for OCR scanning"
                                    loading="lazy"
                                    width={200}
                                    className="w-[200px] h-auto object-contain drop-shadow-[0_12px_24px_rgba(0,0,0,0.25)] absolute top-14 right-4 z-20 cursor-pointer"
                                    initial={{ opacity: 0, scale: 1.5, rotate: 15, y: -40 }}
                                    whileInView={{ opacity: 1, scale: 1, rotate: 4, y: 0 }}
                                    viewport={{ once: true }}
                                    transition={{ duration: 0.7, type: 'spring', bounce: 0.4, delay: 0.1 }}
                                    whileHover={{ scale: 1.05, rotate: 2, transition: { duration: 0.2 } }}
                                />
                            </div>
                        </motion.div>
                    </div>
                </div>
            </section>

            {/* THE STATS SECTION */}
            <section className="py-24 md:py-32 bg-white relative overflow-hidden z-20">
                <div className="max-w-6xl mx-auto px-6 relative z-10">
                    <div className="text-center md:mb-24 mb-16">
                        <h2 className="text-[2.5rem] md:text-[4rem] tracking-tight font-medium text-[#1A1F36] leading-[1.1]">
                            The backbone <br className="hidden md:block" />of modern coaching
                        </h2>
                    </div>

                    {/* Horizontal lines containing the metrics */}
                    <div className="relative border-y border-neutral-200 py-12 md:py-16">
                        {/* Top subtle gradient overlay on the border line */}
                        <div className="absolute top-[-1px] left-0 w-1/3 h-[1px] bg-gradient-to-r from-transparent via-indigo-400 to-transparent opacity-60"></div>
                        <div className="absolute bottom-[-1px] left-[20%] w-1/2 h-[1px] bg-gradient-to-r from-transparent via-purple-300 to-transparent opacity-60"></div>

                        <div className="grid grid-cols-2 md:grid-cols-3 gap-y-12 gap-x-6 text-center">

                            {/* Metric 1 - Darker emphasis */}
                            <div className="flex flex-col items-center justify-center space-y-3">
                                <span className="text-[2.5rem] md:text-[3.25rem] font-semibold tracking-tight text-[#1A1F36] leading-none mb-1">
                                    60-70%
                                </span>
                                <span className="text-[13px] font-medium text-[#425466] max-w-[140px] leading-snug">
                                    Time saved on admin work
                                </span>
                            </div>

                            {/* Metric 2 - Grey emphasis */}
                            <div className="flex flex-col items-center justify-center space-y-3">
                                <span className="text-[2.5rem] md:text-[3.25rem] font-semibold tracking-tight text-[#1A1F36] leading-none mb-1">
                                    100+
                                </span>
                                <span className="text-[13px] font-medium text-[#8792a2] max-w-[140px] leading-snug">
                                    Students per batch supported
                                </span>
                            </div>

                            {/* Metric 3 - Grey emphasis (formerly Metric 4) */}
                            <div className="flex flex-col items-center justify-center space-y-3 col-span-2 md:col-span-1">
                                <span className="text-[2.5rem] md:text-[3.25rem] font-semibold tracking-tight text-[#1A1F36] leading-none mb-1">
                                    25-30%
                                </span>
                                <span className="text-[13px] font-medium text-[#8792a2] max-w-[140px] leading-snug">
                                    Increase in fee collection
                                </span>
                            </div>

                        </div>
                    </div>
                </div>
            </section>

            {/* PRICING SECTION */}
            <section id="pricing" className="py-24 md:py-32 bg-neutral-50 relative z-20 border-t border-neutral-100">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="text-center mb-16 md:mb-24">
                        <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight text-neutral-900 mb-6">
                            Simple, transparent pricing
                        </h2>
                        <p className="text-xl text-neutral-500 max-w-2xl mx-auto">
                            Choose the plan that fits your coaching center. No hidden fees or surprise charges.
                        </p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto items-start">
                        {/* Basic Tier */}
                        <div className="bg-white rounded-3xl p-8 border border-neutral-200 shadow-sm transition-transform hover:-translate-y-1 hover:shadow-md">
                            <h3 className="text-xl font-bold text-neutral-900 mb-2">Basic</h3>
                            <p className="text-neutral-500 text-sm mb-6 h-10">Perfect for independent tutors starting their journey.</p>
                            <div className="mb-8">
                                <span className="text-4xl font-extrabold text-neutral-900">₹999</span>
                                <span className="text-neutral-500"> /mo</span>
                            </div>
                            <Link to="/onboarding" className="block w-full text-center py-3 px-4 rounded-full bg-neutral-100 text-neutral-900 font-bold hover:bg-neutral-200 transition-colors mb-8">
                                Get Started
                            </Link>
                            <ul className="space-y-4">
                                <li className="flex items-start gap-3">
                                    <CheckCircle className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                                    <span className="text-neutral-600">Up to 100 students</span>
                                </li>
                                <li className="flex items-start gap-3">
                                    <CheckCircle className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                                    <span className="text-neutral-600">Unlimited Batches</span>
                                </li>
                                <li className="flex items-start gap-3">
                                    <CheckCircle className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                                    <span className="text-neutral-600">Automated Grading</span>
                                </li>
                                <li className="flex items-start gap-3">
                                    <CheckCircle className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                                    <span className="text-neutral-600">WhatsApp Alerts</span>
                                </li>
                            </ul>
                        </div>

                        {/* Pro Tier (Most Popular) */}
                        <div className="bg-white rounded-3xl p-8 border-2 border-indigo-500 shadow-xl shadow-indigo-100 relative transform md:-translate-y-4">
                            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-indigo-500 text-white text-xs font-bold uppercase tracking-wider py-1.5 px-3 rounded-full">
                                Most Popular
                            </div>
                            <h3 className="text-xl font-bold text-neutral-900 mb-2">Pro</h3>
                            <p className="text-neutral-500 text-sm mb-6 h-10">For growing coaching centers with more students.</p>
                            <div className="mb-8">
                                <span className="text-4xl font-extrabold text-neutral-900">₹1,999</span>
                                <span className="text-neutral-500"> /mo</span>
                            </div>
                            <Link to="/onboarding" className="block w-full text-center py-3 px-4 rounded-full bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition-colors mb-8 shadow-md">
                                Try Pro Today
                            </Link>
                            <ul className="space-y-4">
                                <li className="flex items-start gap-3">
                                    <CheckCircle className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                                    <span className="text-neutral-900 font-medium">Up to 250 students</span>
                                </li>
                                <li className="flex items-start gap-3">
                                    <CheckCircle className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                                    <span className="text-neutral-600">Unlimited Batches</span>
                                </li>
                                <li className="flex items-start gap-3">
                                    <CheckCircle className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                                    <span className="text-neutral-600">Automated Grading</span>
                                </li>
                                <li className="flex items-start gap-3">
                                    <CheckCircle className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                                    <span className="text-neutral-600">WhatsApp Alerts</span>
                                </li>
                            </ul>
                        </div>

                        {/* Enterprise Tier */}
                        <div className="bg-white rounded-3xl p-8 border border-neutral-200 shadow-sm transition-transform hover:-translate-y-1 hover:shadow-md">
                            <h3 className="text-xl font-bold text-neutral-900 mb-2">Enterprise</h3>
                            <p className="text-neutral-500 text-sm mb-6 h-10">Custom deployment & limits for large coaching networks.</p>
                            <div className="mb-8">
                                <span className="text-4xl font-extrabold text-neutral-900">Custom</span>
                                <span className="text-neutral-500"> pricing</span>
                            </div>
                            <a href="https://docs.google.com/forms/d/e/1FAIpQLSf_iZpFA8pDCv5ESQ8OwESB7YzlMjWETwwRirk-MV6LddQBeQ/viewform" target="_blank" rel="noopener noreferrer" className="block w-full text-center py-3 px-4 rounded-full bg-neutral-100 text-neutral-900 font-bold hover:bg-neutral-200 transition-colors mb-8">
                                Request Demo
                            </a>
                            <ul className="space-y-4">
                                <li className="flex items-start gap-3">
                                    <CheckCircle className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                                    <span className="text-neutral-600">Unlimited students</span>
                                </li>
                                <li className="flex items-start gap-3">
                                    <CheckCircle className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                                    <span className="text-neutral-600">Unlimited Batches</span>
                                </li>
                                <li className="flex items-start gap-3">
                                    <CheckCircle className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                                    <span className="text-neutral-600">White-label branding</span>
                                </li>
                                <li className="flex items-start gap-3">
                                    <CheckCircle className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
                                    <span className="text-neutral-600">Dedicated account manager</span>
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
            </section>

            {/* FAQ SECTION */}
            <section className="py-24 bg-neutral-50 relative z-20 border-b border-neutral-100">
                <div className="max-w-3xl mx-auto px-6">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight text-neutral-900 mb-6">
                            Frequently Asked Questions
                        </h2>
                        <p className="text-lg text-neutral-500 max-w-xl mx-auto">
                            Everything you need to know about the product and billing. Can't find the answer you're looking for? Please reach out to our team.
                        </p>
                    </div>

                    <div className="mt-8 space-y-4">
                        <FAQItem
                            question="How exactly does the zero-touch WhatsApp onboarding work?"
                            answer="You simply generate an invite link for your WhatsApp group and paste it into MathLogs. When a student registers, they're immediately shown the link and sent an automated message prompting them to join. You never have to manually save their number or invite them yourself."
                        />
                        <FAQItem
                            question="Are student phone numbers kept secure?"
                            answer="Yes, absolute privacy is guaranteed. Numbers are transmitted securely and only used for direct communication between your coaching center and the students via official API integrations. We never share or sell contact data."
                        />
                        <FAQItem
                            question="Can I upgrade or downgrade my plan at any time?"
                            answer="Of course! Our pricing is completely flexible. If you realize your student count has grown, you can instantly upgrade your subscription online. We'll automatically prorate the cost."
                        />
                        <FAQItem
                            question="Do parents see other students' marks?"
                            answer="Never! Our system generates unique, personalized reports accessible only through secure logins or sent directly to individual parent WhatsApp numbers. Complete privacy for your students' performance is built-in."
                        />
                        <FAQItem
                            question="Do I need technical skills to use MathLogs?"
                            answer="Not at all. If you know how to use WhatsApp or send an email, you can use MathLogs. We built this platform specifically to be intuitive and practically invisible during your day-to-day teaching."
                        />
                    </div>
                </div>
            </section>

            {/* CTA SECTION */}
            <section className="py-32 md:py-48 bg-white relative z-20 border-b border-neutral-100">
                <div className="max-w-4xl mx-auto px-6 text-center">
                    <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-neutral-900 mb-6">
                        Ready to automate your center?
                    </h2>
                    <p className="text-sm md:text-[15px] font-medium text-neutral-500 mb-10 max-w-xl mx-auto">
                        Join hundreds of educators who have reclaimed their evenings by automating grading and parent communication.
                    </p>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                        <Link
                            to="/onboarding"
                            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white text-xs md:text-sm font-bold tracking-wide rounded-full transition-all hover:bg-indigo-700 hover:shadow-lg hover:shadow-indigo-500/25 active:scale-95 group"
                        >
                            Get Started
                            <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </Link>
                        <a
                            href="https://docs.google.com/forms/d/e/1FAIpQLSf_iZpFA8pDCv5ESQ8OwESB7YzlMjWETwwRirk-MV6LddQBeQ/viewform"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center px-6 py-3 bg-[#f3f4f6] text-neutral-900 text-xs md:text-sm font-bold tracking-wide rounded-full transition-colors hover:bg-neutral-200"
                        >
                            Request Demo
                        </a>
                    </div>
                </div>
            </section>

            {/* FOOTER */}
            <footer className="bg-slate-950 pt-20 md:pt-32 pb-0 overflow-hidden relative z-20 flex flex-col items-center">
                <div className="w-full max-w-6xl mx-auto px-8 md:px-12 flex flex-col md:flex-row justify-between mb-24 md:mb-32">

                    {/* Logo (Abstract geometric icon) */}
                    <div className="mb-16 md:mb-0 max-w-sm">
                        <div className="w-[48px] h-[48px] border border-slate-800 rounded-[14px] flex items-center justify-center bg-slate-900/50 shadow-inner">
                            <div className="w-[20px] h-[20px] grid grid-cols-2 gap-[4px]">
                                <div className="bg-indigo-500 rounded-[4px]"></div>
                                <div className="bg-indigo-400 rounded-[4px] opacity-60"></div>
                                <div className="bg-indigo-400 rounded-[4px] opacity-60"></div>
                                <div className="bg-white rounded-[4px]"></div>
                            </div>
                        </div>
                        <p className="mt-6 text-[13px] text-slate-400 leading-relaxed font-medium">
                            The backbone of modern coaching centers. Automate your administration and focus on teaching.
                        </p>
                    </div>

                    {/* Links List */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-10 md:gap-16">
                        {/* Col 1 */}
                        <div className="flex flex-col gap-6">
                            <span className="text-[12px] text-slate-100 font-bold tracking-wider uppercase">Product</span>
                            <div className="flex flex-col gap-4">
                                <Link to="/" className="text-[13px] font-medium text-slate-400 hover:text-indigo-400 transition-colors duration-300">Home</Link>
                                <a href="#features" className="text-[13px] font-medium text-slate-400 hover:text-indigo-400 transition-colors duration-300">Features</a>
                                <a href="#pricing" className="text-[13px] font-medium text-slate-400 hover:text-indigo-400 transition-colors duration-300">Pricing</a>
                            </div>
                        </div>

                        {/* Col 2 */}
                        <div className="flex flex-col gap-6">
                            <span className="text-[12px] text-slate-100 font-bold tracking-wider uppercase">Company</span>
                            <div className="flex flex-col gap-4">
                                <Link to="/about" className="text-[13px] font-medium text-slate-400 hover:text-indigo-400 transition-colors duration-300">About Us</Link>
                                <Link to="/privacy-policy" className="text-[13px] font-medium text-slate-400 hover:text-indigo-400 transition-colors duration-300">Privacy Policy</Link>
                                <Link to="/terms" className="text-[13px] font-medium text-slate-400 hover:text-indigo-400 transition-colors duration-300">Terms of Service</Link>
                            </div>
                        </div>

                        {/* Col 3: Contact */}
                        <div className="flex flex-col gap-6" id="contact">
                            <span className="text-[12px] text-slate-100 font-bold tracking-wider uppercase">Contact Us</span>
                            <div className="flex flex-col gap-4">
                                <a href="mailto:support@mathlogs.app" className="text-[13px] font-medium text-slate-400 hover:text-indigo-400 transition-colors duration-300">Email: support@mathlogs.app</a>
                                <a href="https://wa.me/918439245302" target="_blank" rel="noopener noreferrer" className="text-[13px] font-medium text-slate-400 hover:text-indigo-400 transition-colors duration-300">WhatsApp: +91 8439245302</a>
                                <a href="tel:+918439245302" className="text-[13px] font-medium text-slate-400 hover:text-indigo-400 transition-colors duration-300">Call: +91 8439245302</a>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Decorative large brand text */}
                <div className="w-full flex justify-center pointer-events-none select-none overflow-hidden translate-y-[28%] md:translate-y-[26%]" aria-hidden="true">
                    <p className="text-[28vw] md:text-[24vw] font-black leading-[0.7] tracking-tighter mx-auto text-center whitespace-nowrap !text-white">
                        Mathlogs
                    </p>
                </div>
            </footer>

            {/* EXPANDED FEATURE MODAL OVERLAY */}
            <AnimatePresence>
                {
                    expandedFeature === 'batch' && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setExpandedFeature(null)}
                            className="fixed inset-0 z-[100] flex justify-center items-center p-4 sm:p-6 md:p-10 bg-neutral-900/60 backdrop-blur-md"
                        >
                            <motion.div
                                initial={{ y: 50, opacity: 0, scale: 0.95 }}
                                animate={{ y: 0, opacity: 1, scale: 1 }}
                                exit={{ y: 20, opacity: 0, scale: 0.95 }}
                                transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                                className="bg-white rounded-3xl md:rounded-[2.5rem] shadow-2xl w-full max-w-full max-w-[1400px] h-full max-h-[900px] overflow-hidden flex flex-col relative"
                                onClick={e => e.stopPropagation()}
                            >
                                {/* Modal Header */}
                                <div className="absolute top-6 right-6 z-50">
                                    <button
                                        onClick={() => setExpandedFeature(null)}
                                        className="w-10 h-10 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 flex items-center justify-center text-indigo-500 transition-colors"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>

                                {/* Modal Content - Nested Cards Layout */}
                                <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col p-6 md:p-10 lg:p-16 relative bg-neutral-50/50">

                                    {/* Header */}
                                    <div className="max-w-5xl mx-auto w-full mb-12 text-center mt-8">
                                        <h3 className="text-3xl md:text-5xl font-bold text-neutral-900 tracking-tight mb-4">
                                            Supercharge your batch operations
                                        </h3>
                                        <p className="text-neutral-500 text-lg max-w-2xl mx-auto">
                                            Everything you need to run your center, flawlessly integrated into one powerful dashboard. Explore the features below.
                                        </p>
                                    </div>

                                    {/* Nested Feature Cards Grid */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto w-full mb-20">

                                        {/* Card 1: 3 Registration Modes — animated */}
                                        <OnboardingCard />

                                        {/* Card 2: Complete Control */}
                                        <div className="bg-white rounded-3xl p-8 shadow-sm border border-neutral-200/60 flex flex-col group hover:shadow-md transition-all relative overflow-hidden">
                                            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl -mr-10 -mt-10 transition-all group-hover:bg-purple-500/20" />
                                            <div className="w-12 h-12 rounded-2xl bg-purple-100 flex items-center justify-center text-purple-600 mb-5 group-hover:scale-110 transition-transform relative z-10">
                                                <Settings className="w-6 h-6" />
                                            </div>
                                            <h4 className="text-xl font-bold text-neutral-900 mb-2 relative z-10">Dynamic Control</h4>
                                            <p className="text-neutral-500 text-[15px] leading-relaxed mb-6 relative z-10">
                                                Pause or close registration with a single switch. Never worry about overcrowded batches.
                                            </p>

                                            {/* Registration state control mockup */}
                                            <div className="flex flex-col gap-2.5 relative z-10">
                                                {[
                                                    { label: 'Live Registration', color: 'bg-green-500', textColor: 'text-green-700', bg: 'bg-green-50 border-green-100', active: true, dot: 'bg-green-400' },
                                                    { label: 'Paused', color: 'bg-amber-400', textColor: 'text-amber-700', bg: 'bg-amber-50 border-amber-100', active: false, dot: 'bg-amber-400' },
                                                    { label: 'Registration Closed', color: 'bg-neutral-300', textColor: 'text-neutral-500', bg: 'bg-neutral-50 border-neutral-100', active: false, dot: 'bg-neutral-300' },
                                                ].map((item) => (
                                                    <div key={item.label} className={`rounded-2xl px-4 py-3 flex items-center justify-between border ${item.bg}`}>
                                                        <div className="flex items-center gap-2">
                                                            <div className={`w-2 h-2 rounded-full ${item.dot} ${item.active ? 'animate-pulse' : ''}`} />
                                                            <span className={`text-[13px] font-semibold ${item.textColor}`}>{item.label}</span>
                                                        </div>
                                                        <div className={`w-9 h-5 rounded-full flex items-center p-[2px] transition-colors ${item.active ? item.color : 'bg-neutral-200'}`}>
                                                            <div className={`w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${item.active ? 'translate-x-3.5' : 'translate-x-0'}`} />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Card 3: WhatsApp Automation */}
                                        <div className="bg-[#fcfdfd] rounded-[2.5rem] pt-8 lg:pt-10 px-8 lg:px-10 pb-0 shadow-sm border border-neutral-100 flex flex-col group hover:shadow-md transition-all relative overflow-hidden">
                                            <div className="w-[48px] h-[48px] rounded-2xl bg-[#effdf4] border border-[#dcfce7] flex items-center justify-center text-[#22c55e] mb-5 relative z-10 shadow-sm">
                                                <MessageSquare className="w-5 h-5" strokeWidth={1.5} />
                                            </div>
                                            <h4 className="text-[24px] font-bold text-[#1a1f36] tracking-[-0.03em] mb-3 relative z-10 leading-[1.1]">Zero-Touch WhatsApp</h4>
                                            <p className="text-[#697386] text-[15px] leading-relaxed mb-6 relative z-10 max-w-[95%]">
                                                Link your WhatsApp group once — approved students join automatically.
                                            </p>
                                            <div className="mt-auto pointer-events-none relative flex justify-center px-4">
                                                <img src="/images/features/registration-success.png" alt="WhatsApp Alert" className="w-[220px] rounded-t-[1.5rem] shadow-[0_-10px_30px_-15px_rgba(0,0,0,0.15)] border border-neutral-200/60 object-cover object-top opacity-95 group-hover:opacity-100 transition-opacity transform translate-y-2 group-hover:translate-y-0 duration-500 ease-out" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                                            </div>
                                        </div>

                                        {/* Card 4: Student Performance Insights (Spans 2 columns) */}
                                        <div className="bg-white rounded-3xl p-8 shadow-sm border border-neutral-200/60 flex flex-col gap-6 lg:col-span-2 group hover:shadow-md transition-all">

                                            {/* TOP: compact text + pills row */}
                                            <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8">
                                                <div className="flex items-center gap-4 shrink-0">
                                                    <div className="w-11 h-11 rounded-2xl bg-orange-100 flex items-center justify-center text-orange-600 group-hover:scale-110 transition-transform shrink-0">
                                                        <LineChart className="w-5 h-5" />
                                                    </div>
                                                    <div>
                                                        <h4 className="text-xl font-bold text-neutral-900 leading-tight">Student Performance Insights</h4>
                                                        <p className="text-neutral-500 text-[13px] leading-snug mt-0.5 max-w-sm">
                                                            Track normalized marks across every test — see exactly how each student is progressing.
                                                        </p>
                                                    </div>
                                                </div>
                                                {/* Feature pills */}
                                                <div className="flex flex-wrap gap-2 sm:ml-auto">
                                                    <div className="bg-orange-50 border border-orange-100 rounded-xl px-3 py-1.5 flex items-center gap-1.5">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                                                        <span className="text-[11px] font-semibold text-orange-700">Avg. Marks</span>
                                                    </div>

                                                    <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-1.5 flex items-center gap-1.5">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                                                        <span className="text-[11px] font-semibold text-blue-700">Performance</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* BOTTOM: full-width performance panel */}
                                            <div className="flex-1 bg-white rounded-2xl border border-neutral-200 overflow-hidden flex flex-col shadow-sm">
                                                {/* Panel header */}
                                                <div className="px-6 pt-4 pb-3 border-b border-neutral-100 flex items-center justify-between">
                                                    <div>
                                                        <div className="text-[13px] font-bold text-[#1a1f36]">student1's Performance</div>
                                                        <div className="text-[11px] text-[#697386]">Detailed breakdown of test scores</div>
                                                    </div>
                                                    <span className="text-neutral-300 text-[14px]">✕</span>
                                                </div>

                                                {/* Table */}
                                                <div className="overflow-x-auto">
                                                    <div className="min-w-[500px]">
                                                        {/* Table header */}
                                                        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] px-6 py-2.5 border-b border-neutral-100 bg-neutral-50/60">
                                                            {['TEST NAME', 'DATE', 'SCORE', 'MAX MARKS', 'NORMALIZED (10)'].map((col) => (
                                                                <span key={col} className="text-[10px] font-bold text-[#697386] uppercase tracking-wider">{col}</span>
                                                            ))}
                                                        </div>

                                                        {/* Test rows */}
                                                        {[
                                                            { test: 'Quiz 1', date: 'Jan 12', score: 95, max: 100, norm: '9.5' },
                                                            { test: 'Mid Term', date: 'Feb 3', score: 78, max: 100, norm: '7.8' },
                                                            { test: 'Unit Test', date: 'Feb 20', score: 88, max: 100, norm: '8.8' },
                                                            { test: 'Class Test 2', date: 'Mar 5', score: 82, max: 100, norm: '8.2' },
                                                            { test: 'Final Exam', date: 'Mar 18', score: 91, max: 100, norm: '9.1' },
                                                        ].map((row, i) => (
                                                            <motion.div
                                                                key={row.test}
                                                                initial={{ opacity: 0, x: -8 }}
                                                                whileInView={{ opacity: 1, x: 0 }}
                                                                transition={{ delay: 0.2 + i * 0.1 }}
                                                                className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] px-6 py-3 border-b border-neutral-50 hover:bg-neutral-50/70 transition-colors"
                                                            >
                                                                <span className="text-[12px] font-semibold text-[#1a1f36]">{row.test}</span>
                                                                <span className="text-[12px] text-neutral-400">{row.date}</span>
                                                                <span className="text-[12px] text-neutral-600">{row.score}</span>
                                                                <span className="text-[12px] text-neutral-600">{row.max}</span>
                                                                <span className="text-[13px] font-bold text-[#1a1f36]">{row.norm}</span>
                                                            </motion.div>
                                                        ))}

                                                        {/* Average row */}
                                                        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] px-6 py-3 bg-neutral-50 border-t border-neutral-200">
                                                            <span className="col-span-3" />
                                                            <span className="text-[11px] font-bold text-[#1a1f36]">Average Normalized</span>
                                                            <span className="text-[14px] font-bold text-[#1a1f36]">8.7</span>
                                                        </div>
                                                    </div>
                                                </div>


                                            </div>
                                        </div>

                                        {/* Card 5: Export & Print — full-width row spanning all 3 cols */}
                                        <div className="bg-white rounded-3xl p-7 shadow-sm border border-neutral-200/60 flex flex-col sm:flex-row sm:items-center gap-6 group hover:shadow-md transition-all relative overflow-hidden lg:col-span-3">
                                            <div className="absolute top-0 right-0 w-48 h-48 bg-sky-400/10 rounded-full blur-3xl -mr-12 -mt-12 transition-all group-hover:bg-sky-400/20 pointer-events-none" />

                                            {/* Left: icon + title + description */}
                                            <div className="flex items-center gap-4 shrink-0 relative z-10">
                                                <div className="w-12 h-12 rounded-2xl bg-sky-100 flex items-center justify-center text-sky-600 group-hover:scale-110 transition-transform shrink-0">
                                                    <Download className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <h4 className="text-[17px] font-bold text-neutral-900">Export & Print</h4>
                                                    <p className="text-neutral-500 text-[13px] leading-snug mt-0.5 max-w-xs">
                                                        One-click exports for offline use — student records and sticker labels.
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Right: two buttons side by side */}
                                            <div className="flex flex-col sm:flex-row gap-3 relative z-10 sm:ml-auto w-full sm:w-auto">
                                                {/* Student List */}
                                                <div className="group/btn flex items-center gap-3 bg-neutral-50 hover:bg-sky-50 border border-neutral-200 hover:border-sky-200 rounded-2xl px-5 py-4 cursor-pointer transition-all min-w-[220px]">
                                                    <div className="w-9 h-9 rounded-xl bg-white border border-neutral-200 group-hover/btn:border-sky-200 flex items-center justify-center shrink-0 shadow-sm transition-colors">
                                                        <FileText className="w-4 h-4 text-neutral-500 group-hover/btn:text-sky-600 transition-colors" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-[13px] font-bold text-neutral-800 group-hover/btn:text-sky-700 transition-colors">Student List</div>
                                                        <div className="text-[11px] text-neutral-400">Name · Contact · School · Fee</div>
                                                    </div>
                                                    <Download className="w-3.5 h-3.5 text-neutral-300 group-hover/btn:text-sky-500 transition-colors shrink-0" />
                                                </div>

                                                {/* Print Stickers */}
                                                <div className="group/btn flex items-center gap-3 bg-neutral-50 hover:bg-violet-50 border border-neutral-200 hover:border-violet-200 rounded-2xl px-5 py-4 cursor-pointer transition-all min-w-[220px]">
                                                    <div className="w-9 h-9 rounded-xl bg-white border border-neutral-200 group-hover/btn:border-violet-200 flex items-center justify-center shrink-0 shadow-sm transition-colors">
                                                        <Printer className="w-4 h-4 text-neutral-500 group-hover/btn:text-violet-600 transition-colors" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-[13px] font-bold text-neutral-800 group-hover/btn:text-violet-700 transition-colors">Print Stickers</div>
                                                        <div className="text-[11px] text-neutral-400">Unique labels for test papers</div>
                                                    </div>
                                                    <Printer className="w-3.5 h-3.5 text-neutral-300 group-hover/btn:text-violet-500 transition-colors shrink-0" />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        </motion.div>
                    )
                }
            </AnimatePresence >

            {/* WA Modal View */}
            <AnimatePresence>
                {
                    expandedFeature === 'whatsapp' && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setExpandedFeature(null)}
                            className="fixed inset-0 z-[100] flex justify-center items-center p-2 sm:p-4 md:p-10 bg-neutral-900/60 backdrop-blur-md"
                        >
                            <motion.div
                                initial={{ y: 50, opacity: 0, scale: 0.95 }}
                                animate={{ y: 0, opacity: 1, scale: 1 }}
                                exit={{ y: 20, opacity: 0, scale: 0.95 }}
                                transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                                className="bg-white rounded-2xl md:rounded-[2.5rem] shadow-2xl w-full max-w-full max-w-[1200px] p-4 sm:p-6 md:p-10 lg:p-16 relative overflow-y-auto max-h-[96vh] md:max-h-none"
                                onClick={e => e.stopPropagation()}
                            >
                                <div className="absolute top-3 right-3 sm:top-6 sm:right-6 z-50">
                                    <button
                                        onClick={() => setExpandedFeature(null)}
                                        className="w-10 h-10 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-100 flex items-center justify-center text-blue-500 transition-colors"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>

                                <div className="max-w-4xl mx-auto w-full mb-12 text-center mt-10 sm:mt-4">
                                    <h3 className="text-3xl md:text-5xl font-bold text-neutral-900 tracking-tight mb-4 flex items-center justify-center gap-4">
                                        <MessageSquare className="w-10 h-10 text-[#25d366]" fill="currentColor" />
                                        Automated WhatsApp Alerts
                                    </h3>
                                    <p className="text-neutral-500 text-lg mx-auto">
                                        Keep everyone in sync effortlessly. Automated triggers send perfectly formatted WhatsApp updates.
                                    </p>
                                </div>

                                {/* 3 Column WA layout - Light Mode -> Horizontal swipe on mobile */}
                                <div ref={expandedFeature === 'whatsapp' ? carouselRef : null} className="flex overflow-x-auto md:grid md:grid-cols-3 gap-4 md:gap-6 relative p-4 md:p-8 rounded-2xl md:rounded-3xl bg-[#f4ebe1] border border-[#e8dccb] shadow-inner mt-8 custom-scrollbar snap-x snap-mandatory pb-6">
                                    <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: "url('https://w0.peakpx.com/wallpaper/818/148/HD-wallpaper-whatsapp-background-cool-dark-green-new-theme-whatsapp-thumbnail.jpg')", backgroundSize: 'cover', filter: 'invert(1)' }} />

                                    {/* --- Card 1: Welcome + Group Invite --- */}
                                    <motion.div
                                        className="relative z-10 bg-white rounded-2xl md:rounded-[1.5rem] p-5 md:p-6 text-[14.5px] text-[#111b21] leading-relaxed shadow-sm hover:shadow-md transition-shadow flex flex-col h-full min-w-full sm:min-w-[320px] md:min-w-0 md:w-auto snap-center shrink-0 w-full"
                                        initial={{ opacity: 0, y: 30 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.5, delay: 0.2 }}
                                    >
                                        <div className="flex items-center gap-2 mb-6">
                                            <span className="text-[10px] sm:text-[11px] font-bold text-[#008a4b] bg-[#e6f4ed] px-3 py-1.5 rounded-full uppercase tracking-widest flex items-center gap-1.5"><span className="text-sm">🎉</span> WELCOME</span>
                                        </div>
                                        <div className="mb-4 text-[15px]">
                                            Hi <strong>Aarav</strong> 👋,<br />
                                            Your registration for <strong>CLASS 10 · Math</strong> is <strong className="text-[#25d366]">approved!</strong>
                                        </div>
                                        <div className="mb-5 text-[#667781] flex-1">Join your class WhatsApp group below 👇</div>

                                        <div className="bg-[#f0f2f5] rounded-xl p-4 border border-[#e9edef] shadow-inner mt-auto transition-colors">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-[#25d366]/10 flex items-center justify-center shrink-0">
                                                    <MessageSquare className="w-5 h-5 text-[#25d366]" fill="currentColor" />
                                                </div>
                                                <div className="overflow-hidden">
                                                    <div className="text-[11px] text-neutral-500 font-medium mb-0.5">Invite Link</div>
                                                    <div className="text-[#008a4b] text-[13px] font-bold truncate">chat.whatsapp.com/class10...</div>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex justify-end mt-4">
                                            <span className="text-[11px] text-[#8696a0] font-medium tracking-wide">9:10 AM <span className="text-[#53bdeb] ml-0.5 tracking-tighter">✓✓</span></span>
                                        </div>
                                    </motion.div>

                                    {/* --- Card 2: Test Marks --- */}
                                    <motion.div
                                        className="relative z-10 bg-white rounded-2xl md:rounded-[1.5rem] p-5 md:p-6 text-[14.5px] text-[#111b21] leading-relaxed shadow-sm hover:shadow-md transition-shadow flex flex-col h-full min-w-full sm:min-w-[320px] md:min-w-0 md:w-auto snap-center shrink-0 w-full"
                                        initial={{ opacity: 0, y: 30 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.5, delay: 0.35 }}
                                    >
                                        <div className="flex items-center gap-2 mb-6">
                                            <span className="text-[10px] sm:text-[11px] font-bold text-[#3b82f6] bg-[#eff6ff] px-3 py-1.5 rounded-full uppercase tracking-widest flex items-center gap-1.5"><span className="text-sm">📊</span> TEST RESULT</span>
                                        </div>
                                        <div className="mb-5 text-[15px] flex-1">
                                            Hi <strong>Aarav</strong>, your marks for <strong>Mid Term · CLASS 10</strong> are out!
                                        </div>

                                        <div className="bg-[#f8faff] rounded-xl p-5 border border-blue-50 grid grid-cols-2 gap-y-5 gap-x-2 shadow-inner mt-auto">
                                            <div>
                                                <div className="text-[10px] text-[#667781] uppercase tracking-wider mb-1">Score</div>
                                                <div className="text-[18px] font-bold text-neutral-900">78<span className="text-[12px] text-[#667781] font-normal"> / 100</span></div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-[10px] text-[#667781] uppercase tracking-wider mb-1">Rank</div>
                                                <div className="text-[18px] font-bold text-neutral-900">#3</div>
                                            </div>
                                            <div className="col-span-2 pt-4 border-t border-blue-100">
                                                <div className="text-[10px] text-[#667781] uppercase tracking-wider mb-1">Normalised Score</div>
                                                <div className="text-[18px] font-bold text-[#3b82f6]">7.8<span className="text-[13px] text-[#3b82f6]/60 font-medium"> / 10</span></div>
                                            </div>
                                        </div>
                                        <div className="flex justify-end mt-4">
                                            <span className="text-[11px] text-[#8696a0] font-medium tracking-wide">2:30 PM <span className="text-[#53bdeb] ml-0.5 tracking-tighter">✓✓</span></span>
                                        </div>
                                    </motion.div>

                                    {/* --- Card 3: Fee Alert --- */}
                                    <motion.div
                                        className="relative z-10 bg-white rounded-2xl md:rounded-[1.5rem] p-5 md:p-6 text-[14.5px] text-[#111b21] leading-relaxed shadow-sm hover:shadow-md transition-shadow flex flex-col h-full min-w-full sm:min-w-[320px] md:min-w-0 md:w-auto snap-center shrink-0 w-full"
                                        initial={{ opacity: 0, y: 30 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.5, delay: 0.5 }}
                                    >
                                        <div className="flex items-center gap-2 mb-6">
                                            <span className="text-[10px] sm:text-[11px] font-bold text-[#d97706] bg-[#fffbeb] px-3 py-1.5 rounded-full uppercase tracking-widest flex items-center gap-1.5"><span className="text-sm">⚠️</span> FEE ALERT</span>
                                        </div>
                                        <div className="mb-5 text-[15px] flex-1">
                                            Dear Parent, fee dues for <strong>Aarav</strong> in <strong>CLASS 10 · Math</strong> are pending.
                                        </div>

                                        <div className="bg-[#fffdf8] rounded-xl p-5 border border-amber-100 shadow-inner mt-auto">
                                            <div className="flex justify-between items-start mb-4 pb-4 border-b border-amber-100/60">
                                                <span className="text-[13px] text-neutral-600">Months Due</span>
                                                <span className="text-[13px] font-semibold text-neutral-900">April + June</span>
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-[13px] font-medium text-neutral-600">Total Outstanding</span>
                                                <span className="text-[20px] font-bold text-[#d97706]">₹ 2,000</span>
                                            </div>
                                        </div>
                                        <div className="mt-4 mb-2 text-[#667781] text-[13px] italic bg-[#f9fafb] p-3.5 rounded-lg border border-neutral-100 shadow-inner">
                                            Please clear the dues at your earliest convenience.
                                        </div>
                                        <div className="flex justify-end mt-2">
                                            <span className="text-[11px] text-[#8696a0] font-medium tracking-wide">9:43 PM <span className="text-[#53bdeb] ml-0.5 tracking-tighter">✓✓</span></span>
                                        </div>
                                    </motion.div>

                                </div>
                            </motion.div>
                        </motion.div>
                    )
                }

                {
                    expandedFeature === 'scan' && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setExpandedFeature(null)}
                            className="fixed inset-0 z-[100] flex justify-center items-center p-4 sm:p-6 md:p-10 bg-neutral-900/60 backdrop-blur-md"
                        >
                            <motion.div
                                initial={{ y: 50, opacity: 0, scale: 0.95 }}
                                animate={{ y: 0, opacity: 1, scale: 1 }}
                                exit={{ y: 20, opacity: 0, scale: 0.95 }}
                                transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                                className="bg-[#f8f9fa] rounded-2xl md:rounded-[2.5rem] shadow-2xl w-full max-w-full max-w-[1200px] p-4 sm:p-6 md:p-10 lg:p-16 relative overflow-y-auto max-h-[96vh] md:max-h-none"
                                onClick={e => e.stopPropagation()}
                            >
                                <div className="absolute top-3 right-3 sm:top-6 sm:right-6 z-50">
                                    <button
                                        onClick={() => setExpandedFeature(null)}
                                        className="w-10 h-10 rounded-xl bg-blue-100/50 hover:bg-blue-100 border border-blue-200/50 flex items-center justify-center text-[#0066ff] transition-colors"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>

                                <div className="max-w-4xl mx-auto w-full mb-12 text-center mt-10 sm:mt-4">
                                    <h3 className="text-3xl md:text-5xl font-bold text-[#1a1f36] tracking-tight mb-4 flex items-center justify-center gap-4">
                                        <Camera className="w-10 h-10 text-[#0066ff]" strokeWidth={1.5} />
                                        Smart Scanning Workflow
                                    </h3>
                                    <p className="text-[#697386] text-lg mx-auto">
                                        Grading papers is a breeze. See how our end-to-end scanning pipeline saves you hours.
                                    </p>
                                </div>

                                <div ref={expandedFeature === 'scan' ? carouselRef : null} className="flex overflow-x-auto md:grid md:grid-cols-3 gap-4 md:gap-6 relative mt-8 custom-scrollbar snap-x snap-mandatory pb-6">
                                    {/* Card 1: Scanning */}
                                    <motion.div
                                        className="bg-white rounded-2xl md:rounded-[1.5rem] p-5 md:p-8 shadow-sm hover:shadow-md transition-shadow border border-neutral-200/60 flex flex-col h-full min-w-full sm:min-w-[320px] md:min-w-0 md:w-auto snap-center shrink-0 w-full"
                                        initial={{ opacity: 0, y: 30 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.5, delay: 0.2 }}
                                    >
                                        <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center mb-6">
                                            <Camera className="w-6 h-6 text-[#0066ff]" />
                                        </div>
                                        <h4 className="text-[20px] font-bold text-[#1a1f36] mb-3 leading-snug">1. Instant OCR Scan</h4>
                                        <p className="text-[14.5px] text-[#697386] leading-relaxed mb-8 flex-1">
                                            We automatically detect the student via the printed smart QR code and read the handwritten marks using advanced OCR. Manual entry is also fully supported.
                                        </p>
                                        <div className="bg-[#f8faff] rounded-[1rem] p-5 border border-blue-50 flex items-center justify-center h-[120px] shadow-inner mt-auto">
                                            <div className="text-center w-full flex flex-col items-center">
                                                <div className="text-4xl text-neutral-800 font-medium italic border-b border-neutral-300 pb-1 mb-3 w-16 mx-auto flex justify-center">
                                                    <span style={{ transform: 'rotate(-4deg)', display: 'inline-block' }}>8</span>
                                                    <span style={{ transform: 'rotate(2deg)', display: 'inline-block' }}>5</span>
                                                </div>
                                                <div className="text-[11px] font-bold text-[#008a4b] bg-[#e6f4ed] px-3 py-1.5 rounded-full w-max mt-1 flex items-center gap-1.5"><CheckCircle className="w-3.5 h-3.5" strokeWidth={2.5} /> Aarav Detected</div>
                                            </div>
                                        </div>
                                    </motion.div>

                                    {/* Card 2: WhatsApp */}
                                    <motion.div
                                        className="bg-white rounded-2xl md:rounded-[1.5rem] p-5 md:p-8 shadow-sm hover:shadow-md transition-shadow border border-neutral-200/60 flex flex-col h-full min-w-full sm:min-w-[320px] md:min-w-0 md:w-auto snap-center shrink-0 w-full"
                                        initial={{ opacity: 0, y: 30 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.5, delay: 0.35 }}
                                    >
                                        <div className="w-12 h-12 rounded-2xl bg-[#e6f4ed] flex items-center justify-center mb-6">
                                            <MessageSquare className="w-6 h-6 text-[#008a4b]" fill="currentColor" />
                                        </div>
                                        <h4 className="text-[20px] font-bold text-[#1a1f36] mb-3 leading-snug">2. Automated Alerts</h4>
                                        <p className="text-[14.5px] text-[#697386] leading-relaxed mb-8 flex-1">
                                            As soon as you finish grading a batch, perfectly formatted test result notifications are sent out immediately via WhatsApp to all registered parents.
                                        </p>
                                        <div className="bg-[#f0f2f5] rounded-[1rem] p-4 border border-neutral-200 flex flex-col justify-center h-[120px] shadow-inner mt-auto relative overflow-hidden">
                                            <div className="absolute top-0 right-0 w-32 h-32 bg-[url('https://w0.peakpx.com/wallpaper/818/148/HD-wallpaper-whatsapp-background-cool-dark-green-new-theme-whatsapp-thumbnail.jpg')] opacity-[0.05] invert" />
                                            <div className="bg-white p-4 rounded-xl rounded-tl-[4px] shadow-sm relative z-10 w-[95%] border border-neutral-100">
                                                <div className="text-[13px] text-[#111b21] leading-relaxed">
                                                    Hi <strong>Aarav's Parent</strong>,
                                                    The Mid Term marks are <strong className="text-[#3b82f6]">78/100</strong>.
                                                </div>
                                                <div className="flex justify-end mt-1.5">
                                                    <span className="text-[10px] text-[#8696a0] font-medium tracking-wide">2:30 PM <span className="text-[#53bdeb] ml-0.5 tracking-tighter">✓✓</span></span>
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>

                                    {/* Card 3: Report Gen */}
                                    <motion.div
                                        className="bg-white rounded-2xl md:rounded-[1.5rem] p-5 md:p-8 shadow-sm hover:shadow-md transition-shadow border border-neutral-200/60 flex flex-col h-full min-w-full sm:min-w-[320px] md:min-w-0 md:w-auto snap-center shrink-0 w-full"
                                        initial={{ opacity: 0, y: 30 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.5, delay: 0.5 }}
                                    >
                                        <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center mb-6">
                                            <Download className="w-6 h-6 text-amber-500" />
                                        </div>
                                        <h4 className="text-[20px] font-bold text-[#1a1f36] mb-3 leading-snug">3. Comprehensive Reports</h4>
                                        <p className="text-[14.5px] text-[#697386] leading-relaxed mb-8 flex-1">
                                            With one click, generate downloadable PDF or Excel reports. View the full class list, aggregated marks, student rankings, and overall averages effortlessly.
                                        </p>
                                        <div className="bg-[#fffdf8] rounded-[1rem] p-4 border border-amber-100 flex flex-col justify-center h-[120px] shadow-inner mt-auto">
                                            <div className="flex justify-between text-[10px] font-bold text-neutral-400 uppercase tracking-wider mb-2.5 px-1">
                                                <span>Student</span>
                                                <span>Score / Rank</span>
                                            </div>
                                            <div className="space-y-2.5">
                                                <div className="flex justify-between items-center bg-white p-2.5 rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.02)] border border-[#f3e9da]">
                                                    <span className="text-[13px] font-medium text-[#111b21] pl-1">Aarav</span>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[14px] font-bold text-[#0066ff]">92</span>
                                                        <span className="text-[11px] font-bold text-neutral-600 bg-[#f9fafb] border border-neutral-100 px-2 py-0.5 rounded-md">#1</span>
                                                    </div>
                                                </div>
                                                <div className="flex justify-between items-center bg-white p-2.5 rounded-lg shadow-[0_1px_3px_rgba(0,0,0,0.02)] border border-[#f3e9da]">
                                                    <span className="text-[13px] font-medium text-[#111b21] pl-1">Rohan</span>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[14px] font-bold text-[#111b21]">85</span>
                                                        <span className="text-[11px] font-bold text-neutral-600 bg-[#f9fafb] border border-neutral-100 px-2 py-0.5 rounded-md">#2</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                </div>
                            </motion.div>
                        </motion.div>
                    )
                }
            </AnimatePresence >
        </div >
    );
}

// Custom Typewriter Component for Hero Section
function TypewriterText({ texts }: { texts: string[] }) {
    const [textIndex, setTextIndex] = useState(0);
    const [charIndex, setCharIndex] = useState(0);
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        const currentText = texts[textIndex];

        const timeout = setTimeout(() => {
            if (!isDeleting) {
                if (charIndex < currentText.length) {
                    setCharIndex(prev => prev + 1);
                } else {
                    setTimeout(() => setIsDeleting(true), 2500); // Pause before deleting
                }
            } else {
                if (charIndex > 0) {
                    setCharIndex(prev => prev - 1);
                } else {
                    setIsDeleting(false);
                    setTextIndex((prev) => (prev + 1) % texts.length);
                }
            }
        }, isDeleting ? 45 : 60); // Typing speed vs deleting speed (45ms delete feels calmer)

        return () => clearTimeout(timeout);
    }, [charIndex, isDeleting, textIndex, texts]);

    return (
        <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600">
            {texts[textIndex].substring(0, charIndex)}
            <span className="animate-pulse text-indigo-500 font-light" style={{ WebkitTextFillColor: '#6366f1' }}>|</span>
        </span>
    );
}

// Custom FAQ Item component
function FAQItem({ question, answer }: { question: string, answer: string }) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className={`border border-neutral-200 bg-white rounded-2xl overflow-hidden transition-all duration-300 shadow-sm hover:shadow-md ${isOpen ? 'ring-1 ring-indigo-500/20' : ''}`}>
            <button
                className="w-full px-6 py-5 flex items-center justify-between text-left focus:outline-none"
                onClick={() => setIsOpen(!isOpen)}
            >
                <span className="font-semibold text-neutral-900 text-[15px]">{question}</span>
                <span className="ml-6 flex-shrink-0 text-neutral-400 object-contain overflow-visible flex items-center justify-center">
                    <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.3 }}>
                        {isOpen ? <Minus className="h-5 w-5 text-indigo-500" /> : <Plus className="h-5 w-5 text-neutral-400" />}
                    </motion.div>
                </span>
            </button>
            <motion.div
                initial={false}
                animate={{ height: isOpen ? 'auto' : 0, opacity: isOpen ? 1 : 0 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                className="overflow-hidden"
            >
                <div className="px-6 pb-5 pt-0 text-neutral-500 text-[15px] leading-relaxed">
                    {answer}
                </div>
            </motion.div>
        </div>
    );
}
// Fee Collection Button component representing animated interaction state
function FeeCollectButton({ width = 'auto' }: { width?: 'full' | 'auto' }) {
    const [state, setState] = useState<'idle' | 'loading' | 'success'>('idle');

    useEffect(() => {
        const interval = setInterval(() => {
            setState('loading');
            setTimeout(() => {
                setState('success');
                setTimeout(() => {
                    setState('idle');
                }, 2000);
            }, 800);
        }, 4000);
        return () => clearInterval(interval);
    }, []);

    const widthClass = width === 'full' ? 'w-full' : 'w-auto min-w-[90px]';

    if (state === 'success') {
        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className={`flex items-center justify-center gap-1.5 px-3 py-2 bg-green-50 text-green-700 rounded-md text-[10px] font-medium border border-green-200 ${widthClass}`}
            >
                <CheckCircle className="w-3 h-3" />
                Payment Logged
            </motion.div>
        );
    }

    return (
        <button
            className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-[10px] font-medium tracking-wide transition-all shadow-sm ${widthClass} ${state === 'loading' ? 'bg-[#0f172a]/80 text-white/50 cursor-default' : 'bg-[#0f172a] text-white hover:bg-[#0f172a]/90'}`}
        >
            {state === 'loading' ? (
                <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
                <>
                    <Wallet className="w-3 h-3" />
                    Log Payment
                </>
            )}
        </button>
    );
}

// Component for typing effect in the amount field synced with a 4-second loop
function AnimatedAmountInput() {
    const [text, setText] = useState("");
    const target = "5000.00";

    useEffect(() => {
        let i = 0;
        let currentText = "";
        let typingInterval: ReturnType<typeof setInterval>;

        const startTyping = () => {
            currentText = "";
            setText(currentText);
            i = 0;

            typingInterval = setInterval(() => {
                if (i < target.length) {
                    currentText += target[i];
                    setText(currentText);
                    i++;
                } else {
                    clearInterval(typingInterval);
                }
            }, 100);
        };

        // Start typing immediately
        startTyping();

        // Restart typing every 4 seconds to match the interaction loop
        const loopInterval = setInterval(() => {
            clearInterval(typingInterval);
            startTyping();
        }, 4000);

        return () => {
            clearInterval(typingInterval);
            clearInterval(loopInterval);
        };
    }, []);

    return (
        <div className="flex items-center">
            <span className="text-neutral-700 text-[10px] font-medium min-w-[38px] text-left inline-block">{text}</span>
            <motion.div
                className="w-[1.5px] h-3 bg-blue-500 ml-[1px]"
                animate={{ opacity: [1, 0] }}
                transition={{ repeat: Infinity, duration: 0.8 }}
            />
        </div>
    );
}
