
import { useState, useEffect } from 'react';
import { motion, AnimatePresence, useScroll, useTransform, useMotionValue, useSpring } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
    Users,
    CreditCard,
    BarChart3,
    ArrowRight,
    Menu,
    X,
    School,
    LayoutGrid,
    Sparkles,
    Zap,
    Shield
} from 'lucide-react';

const Home = () => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isEnquireOpen, setIsEnquireOpen] = useState(false);

    // Mouse parallax state
    const mouseX = useMotionValue(0);
    const mouseY = useMotionValue(0);

    // Smooth spring animation for mouse movement
    const springConfig = { damping: 25, stiffness: 150 };
    const smoothMouseX = useSpring(mouseX, springConfig);
    const smoothMouseY = useSpring(mouseY, springConfig);

    // Scroll-based parallax
    const { scrollYProgress } = useScroll();
    const heroOpacity = useTransform(scrollYProgress, [0, 0.3], [1, 0]);
    const heroScale = useTransform(scrollYProgress, [0, 0.3], [1, 0.95]);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            const { clientX, clientY } = e;
            const clientWidth = window.innerWidth;
            const clientHeight = window.innerHeight;

            // Normalize to -1 to 1
            const x = (clientX / clientWidth - 0.5) * 2;
            const y = (clientY / clientHeight - 0.5) * 2;

            mouseX.set(x);
            mouseY.set(y);
        };

        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, [mouseX, mouseY]);

    const toggleMenu = () => setIsMenuOpen(!isMenuOpen);
    const toggleEnquire = () => setIsEnquireOpen(!isEnquireOpen);

    const features = [
        {
            icon: Users,
            title: "Student Management",
            description: "Effortlessly manage student profiles, attendance, and batch allocations in one centralized system."
        },
        {
            icon: CreditCard,
            title: "Fee Tracking",
            description: "Automated fee reminders, receipt generation, and comprehensive financial reports at your fingertips."
        },
        {
            icon: BarChart3,
            title: "Performance Analytics",
            description: "Deep insights into student performance with detailed exam analysis and progress reports."
        },
        {
            icon: School,
            title: "Batch Management",
            description: "Create and organize batches, assign teachers, and schedule classes seamlessly."
        }
    ];

    return (
        <div className="min-h-screen bg-white text-gray-900 font-sans selection:bg-gray-200 selection:text-black overflow-x-hidden">
            {/* Animated Grid Background */}
            <div className="fixed inset-0 z-0 opacity-20">
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#00000008_1px,transparent_1px),linear-gradient(to_bottom,#00000008_1px,transparent_1px)] bg-[size:4rem_4rem]" />
                <div className="absolute inset-0 bg-gradient-to-b from-white via-transparent to-white" />
            </div>

            {/* Floating Orbs (Very Subtle on White) */}
            <motion.div
                style={{
                    x: useTransform(smoothMouseX, [-1, 1], [-100, 100]),
                    y: useTransform(smoothMouseY, [-1, 1], [-100, 100]),
                }}
                className="fixed top-1/4 left-1/4 w-96 h-96 bg-gray-100/50 rounded-full blur-3xl pointer-events-none z-0"
            />
            <motion.div
                style={{
                    x: useTransform(smoothMouseX, [-1, 1], [100, -100]),
                    y: useTransform(smoothMouseY, [-1, 1], [100, -100]),
                }}
                className="fixed bottom-1/4 right-1/4 w-96 h-96 bg-gray-100/50 rounded-full blur-3xl pointer-events-none z-0"
            />

            {/* Navigation */}
            <nav className="fixed w-full z-50 bg-white/80 backdrop-blur-xl border-b border-gray-200">
                <div className="max-w-7xl mx-auto px-6 lg:px-8">
                    <div className="flex items-center justify-between h-20">
                        {/* Logo */}
                        <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="flex items-center gap-3 cursor-pointer"
                            onClick={() => window.scrollTo(0, 0)}
                        >
                            <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center text-white">
                                <LayoutGrid size={18} />
                            </div>
                            <span className="text-xl font-bold tracking-tight text-gray-900">
                                MathLogs
                            </span>
                        </motion.div>

                        {/* Desktop Nav */}
                        <div className="hidden md:flex items-center gap-8">
                            <a href="#features" className="text-sm font-medium text-gray-600 hover:text-black transition-colors">Features</a>
                            <a href="#pricing" className="text-sm font-medium text-gray-600 hover:text-black transition-colors">Pricing</a>

                            <div className="flex items-center gap-3 ml-4">
                                <Link
                                    to="/login"
                                    className="px-5 py-2.5 rounded-full text-sm font-medium text-gray-900 border border-gray-300 hover:bg-gray-50 transition-all"
                                >
                                    Login
                                </Link>
                                <button
                                    onClick={toggleEnquire}
                                    className="px-5 py-2.5 rounded-full bg-black text-white text-sm font-bold hover:bg-gray-800 transition-all shadow-lg shadow-gray-200"
                                >
                                    Enquire Now
                                </button>
                            </div>
                        </div>

                        {/* Mobile Menu Button */}
                        <div className="md:hidden">
                            <button onClick={toggleMenu} className="p-2 text-gray-600 hover:text-black">
                                {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Mobile Menu */}
                <AnimatePresence>
                    {isMenuOpen && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="md:hidden bg-white/90 backdrop-blur-xl border-b border-gray-200 overflow-hidden"
                        >
                            <div className="px-6 py-8 space-y-4">
                                <a href="#features" onClick={() => setIsMenuOpen(false)} className="block text-lg font-medium text-gray-600 hover:text-black">Features</a>
                                <a href="#pricing" onClick={() => setIsMenuOpen(false)} className="block text-lg font-medium text-gray-600 hover:text-black">Pricing</a>
                                <div className="pt-4 flex flex-col gap-3">
                                    <Link to="/login" className="w-full py-3 rounded-xl border border-gray-300 text-center font-medium hover:bg-gray-50">Login</Link>
                                    <button onClick={toggleEnquire} className="w-full py-3 rounded-xl bg-black text-white text-center font-bold hover:bg-gray-800">Enquire Now</button>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </nav>

            {/* Hero Section with 3D Card */}
            <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden min-h-screen flex items-center">
                <div className="max-w-7xl mx-auto px-6 lg:px-8 relative z-10 w-full">
                    <motion.div
                        style={{
                            opacity: heroOpacity,
                            scale: heroScale,
                        }}
                        className="grid lg:grid-cols-2 gap-12 items-center"
                    >
                        {/* Left: Text */}
                        <div className="space-y-8">
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.1 }}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gray-100 border border-gray-200"
                            >
                                <Sparkles className="w-4 h-4 text-gray-900" />
                                <span className="text-xs font-bold tracking-widest text-gray-700 uppercase">
                                    The Future of Coaching Management
                                </span>
                            </motion.div>

                            <motion.h1
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.2 }}
                                className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.1]"
                            >
                                <span className="text-gray-900">
                                    Elevate Your
                                </span>
                                <br />
                                <span className="bg-gradient-to-r from-gray-900 via-gray-700 to-gray-500 bg-clip-text text-transparent">
                                    Coaching Empire
                                </span>
                            </motion.h1>

                            <motion.p
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.3 }}
                                className="text-xl text-gray-600 leading-relaxed max-w-lg"
                            >
                                Streamline admissions, automate fees, track progress, and grow your institute with AI-powered precision.
                            </motion.p>

                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.4 }}
                                className="flex flex-col sm:flex-row gap-4"
                            >
                                <button
                                    onClick={toggleEnquire}
                                    className="px-8 py-4 rounded-full bg-black text-white font-bold shadow-2xl shadow-gray-300/50 hover:shadow-gray-400/50 hover:scale-105 transition-all duration-300 flex items-center gap-2 justify-center group"
                                >
                                    Get Started Free
                                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                </button>
                                <a
                                    href="#features"
                                    className="px-8 py-4 rounded-full border border-gray-300 text-gray-900 font-medium hover:bg-gray-50 transition-all flex items-center justify-center"
                                >
                                    View Features
                                </a>
                            </motion.div>

                            {/* Stats */}
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.5 }}
                                className="flex gap-8 pt-8"
                            >
                                {[
                                    { label: 'Active Users', value: '10K+' },
                                    { label: 'Uptime', value: '99.9%' },
                                    { label: 'Support', value: '24/7' }
                                ].map((stat, i) => (
                                    <div key={i}>
                                        <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
                                        <div className="text-sm text-gray-500">{stat.label}</div>
                                    </div>
                                ))}
                            </motion.div>
                        </div>

                        {/* Right: 3D Floating Card */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.3, duration: 0.6 }}
                            style={{
                                rotateY: useTransform(smoothMouseX, [-1, 1], [-15, 15]),
                                rotateX: useTransform(smoothMouseY, [-1, 1], [15, -15]),
                            }}
                            className="relative hidden lg:block perspective-1000"
                        >
                            {/* Glass Card */}
                            <div className="relative p-8 rounded-3xl bg-white/90 backdrop-blur-2xl border border-gray-200 shadow-2xl">
                                {/* Card Glow */}
                                <div className="absolute inset-0 bg-gradient-to-br from-gray-100/50 to-gray-50/50 rounded-3xl blur-xl -z-10" />

                                <div className="space-y-6">
                                    {/* Dashboard Preview */}
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-900 to-gray-700" />
                                            <div>
                                                <div className="text-sm font-bold text-gray-900">Teacher Dashboard</div>
                                                <div className="text-xs text-gray-500">Real-time Analytics</div>
                                            </div>
                                        </div>
                                        <div className="px-3 py-1 rounded-full bg-green-50 text-green-600 text-xs font-bold border border-green-200">
                                            Live
                                        </div>
                                    </div>

                                    {/* Stats Grid */}
                                    <div className="grid grid-cols-2 gap-4">
                                        {[
                                            { icon: Users, label: 'Students', value: '248', color: 'gray' },
                                            { icon: CreditCard, label: 'Revenue', value: '₹1.2M', color: 'gray' },
                                            { icon: BarChart3, label: 'Avg Score', value: '8.4/10', color: 'gray' },
                                            { icon: Zap, label: 'Efficiency', value: '95%', color: 'gray' }
                                        ].map((item, i) => (
                                            <motion.div
                                                key={i}
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: 0.5 + i * 0.1 }}
                                                className="p-4 rounded-2xl bg-gray-50 border border-gray-200"
                                            >
                                                <item.icon className="w-5 h-5 text-gray-900 mb-2" />
                                                <div className="text-2xl font-bold text-gray-900">{item.value}</div>
                                                <div className="text-xs text-gray-500">{item.label}</div>
                                            </motion.div>
                                        ))}
                                    </div>

                                    {/* Security Badge */}
                                    <div className="flex items-center gap-2 p-3 rounded-xl bg-green-50 border border-green-200">
                                        <Shield className="w-4 h-4 text-green-600" />
                                        <span className="text-xs text-gray-700 font-medium">Enterprise-grade Security</span>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                </div>
            </section>

            {/* Features Section */}
            <section id="features" className="py-24 relative z-10 bg-gray-50">
                <div className="max-w-7xl mx-auto px-6 lg:px-8">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6 }}
                        className="text-center mb-20"
                    >
                        <h2 className="text-3xl md:text-5xl font-bold mb-4 tracking-tight text-gray-900">
                            Everything you need to succeed
                        </h2>
                        <p className="text-gray-600 text-lg font-medium max-w-2xl mx-auto">
                            Powerful tools designed specifically for the unique needs of educational institutes.
                        </p>
                    </motion.div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-6xl mx-auto">
                        {features.map((feature, index) => (
                            <motion.div
                                key={index}
                                initial={{ opacity: 0, y: 30 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: index * 0.1, duration: 0.5 }}
                                whileHover={{ scale: 1.02, y: -5 }}
                                className="group p-8 rounded-3xl bg-white border border-gray-200 hover:border-gray-300 hover:shadow-xl transition-all duration-300 relative overflow-hidden cursor-pointer"
                            >
                                {/* Subtle hover gradient */}
                                <div className="absolute inset-0 bg-gradient-to-br from-gray-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 -z-10" />

                                <feature.icon className="w-12 h-12 text-gray-900 mb-6 group-hover:scale-110 transition-transform" strokeWidth={1.5} />
                                <h3 className="text-2xl font-bold mb-3 text-gray-900">{feature.title}</h3>
                                <p className="text-gray-600 leading-relaxed">
                                    {feature.description}
                                </p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="py-24 relative z-10 bg-white">
                <div className="max-w-4xl mx-auto px-6 lg:px-8 text-center">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        className="p-12 rounded-3xl bg-gray-50 border border-gray-200 relative overflow-hidden shadow-xl cursor-pointer hover:shadow-2xl transition-shadow duration-300"
                    >
                        <div className="absolute inset-0 bg-gradient-to-br from-gray-100/50 to-transparent -z-10" />

                        <h2 className="text-4xl md:text-5xl font-bold mb-6 text-gray-900">
                            Ready to Transform Your Coaching?
                        </h2>
                        <p className="text-gray-600 text-lg mb-8 max-w-2xl mx-auto">
                            Join thousands of educators who have already revolutionized their teaching with MathLogs.
                        </p>
                        <button
                            onClick={toggleEnquire}
                            className="px-10 py-4 rounded-full bg-black text-white font-bold text-lg shadow-2xl shadow-gray-300/50 hover:shadow-gray-400/50 hover:scale-105 transition-all duration-300 cursor-pointer"
                        >
                            Start Your Free Trial
                        </button>
                    </motion.div>
                </div>
            </section>

            {/* Footer */}
            <footer className="border-t border-gray-200 py-12 relative z-10 bg-white">
                <div className="max-w-7xl mx-auto px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-6 text-sm text-gray-600">
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-black rounded flex items-center justify-center text-white">
                            <LayoutGrid size={14} />
                        </div>
                        <span className="font-bold text-gray-900">MathLogs</span>
                    </div>
                    <div>
                        © {new Date().getFullYear()} MathLogs. All rights reserved.
                    </div>
                    <div className="flex gap-6">
                        <a href="#" className="hover:text-black transition-colors">Privacy</a>
                        <a href="#" className="hover:text-black transition-colors">Terms</a>
                        <a href="#" className="hover:text-black transition-colors">Contact</a>
                    </div>
                </div>
            </footer>

            {/* Enquire Modal */}
            <AnimatePresence>
                {isEnquireOpen && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={toggleEnquire}
                            className="absolute inset-0 bg-black/20 backdrop-blur-md"
                        />
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            className="relative bg-white/95 backdrop-blur-2xl border border-gray-200 rounded-3xl p-8 max-w-lg w-full shadow-2xl"
                        >
                            <button onClick={toggleEnquire} className="absolute top-6 right-6 text-gray-400 hover:text-black transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                            <div className="text-center mb-8">
                                <h3 className="text-2xl font-bold text-gray-900">Get in Touch</h3>
                                <p className="text-gray-600 mt-2">We'd love to hear from you.</p>
                            </div>
                            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); alert('We will reach out shortly!'); toggleEnquire(); }}>
                                <input type="text" required className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-500 outline-none focus:border-gray-400 transition-colors" placeholder="Full Name" />
                                <input type="email" required className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-500 outline-none focus:border-gray-400 transition-colors" placeholder="Email Address" />
                                <textarea className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-500 outline-none focus:border-gray-400 transition-colors h-24 resize-none" placeholder="Message"></textarea>
                                <button type="submit" className="w-full bg-black text-white font-bold py-3.5 rounded-xl hover:bg-gray-800 transition-all shadow-lg">Submit</button>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default Home;
