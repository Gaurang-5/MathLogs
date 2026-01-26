
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
    Users,
    CreditCard,
    BarChart3,
    ArrowRight,
    Menu,
    X,
    School,
    LayoutGrid
} from 'lucide-react';

const Home = () => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isEnquireOpen, setIsEnquireOpen] = useState(false);

    const toggleMenu = () => setIsMenuOpen(!isMenuOpen);
    const toggleEnquire = () => setIsEnquireOpen(!isEnquireOpen);

    const fadeIn = {
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0 }
    };

    const staggerContainer = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: { staggerChildren: 0.1 }
        }
    };

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
        <div className="min-h-screen bg-[#F9FAFB] text-gray-900 font-sans selection:bg-gray-200 selection:text-black">

            {/* Navigation */}
            <nav className="fixed w-full z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
                <div className="max-w-7xl mx-auto px-6 lg:px-8">
                    <div className="flex items-center justify-between h-20">
                        {/* Logo */}
                        <div className="flex items-center gap-3 cursor-pointer" onClick={() => window.scrollTo(0, 0)}>
                            <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center text-white">
                                <LayoutGrid size={18} />
                            </div>
                            <span className="text-xl font-bold tracking-tight text-gray-900">
                                MathLogs
                            </span>
                        </div>

                        {/* Desktop Nav */}
                        <div className="hidden md:flex items-center gap-8">
                            <a href="#features" className="text-sm font-medium text-gray-600 hover:text-black transition-colors">Features</a>
                            <a href="#pricing" className="text-sm font-medium text-gray-600 hover:text-black transition-colors">Pricing</a>

                            <div className="flex items-center gap-3 ml-4">
                                <Link to="/login" className="px-5 py-2.5 rounded-full text-sm font-medium text-gray-900 border border-gray-300 hover:bg-gray-50 transition-all">
                                    Login
                                </Link>
                                <button
                                    onClick={toggleEnquire}
                                    className="px-5 py-2.5 rounded-full bg-white text-gray-900 text-sm font-medium border border-transparent hover:bg-gray-50 transition-all shadow-sm"
                                >
                                    Enquire Now
                                </button>
                            </div>
                        </div>

                        {/* Mobile Menu Button */}
                        <div className="md:hidden">
                            <button onClick={toggleMenu} className="p-2 text-gray-600">
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
                            className="md:hidden bg-white border-b border-gray-100 overflow-hidden"
                        >
                            <div className="px-6 py-8 space-y-4">
                                <a href="#features" onClick={() => setIsMenuOpen(false)} className="block text-lg font-medium text-gray-600">Features</a>
                                <a href="#pricing" onClick={() => setIsMenuOpen(false)} className="block text-lg font-medium text-gray-600">Pricing</a>
                                <div className="pt-4 flex flex-col gap-3">
                                    <Link to="/login" className="w-full py-3 rounded-xl border border-gray-200 text-center font-medium">Login</Link>
                                    <button onClick={toggleEnquire} className="w-full py-3 rounded-xl bg-black text-white text-center font-medium">Enquire Now</button>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </nav>

            {/* Hero Section */}
            <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden bg-[#F9FAFB]">
                <div className="max-w-7xl mx-auto px-6 lg:px-8 relative z-10">
                    <motion.div
                        initial="hidden"
                        animate="visible"
                        variants={staggerContainer}
                        className="text-center max-w-4xl mx-auto"
                    >
                        <motion.div variants={fadeIn} className="mb-6">
                            <span className="text-xs font-bold tracking-widest text-gray-500 uppercase">
                                The #1 Platform for Modern Tuition Centers
                            </span>
                        </motion.div>

                        <motion.h1 variants={fadeIn} className="text-5xl md:text-7xl font-bold tracking-tight mb-8 text-gray-900 leading-[1.1]">
                            Manage Your Tuition Classes <br className="hidden md:block" />
                            Like a Pro
                        </motion.h1>

                        <motion.p variants={fadeIn} className="text-xl text-gray-500 mb-10 max-w-2xl mx-auto leading-relaxed font-medium">
                            Streamline admissions, automate fees, track progress, and grow your institute with our intelligent, all-in-one platform.
                        </motion.p>

                        <motion.div variants={fadeIn} className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                            <button
                                onClick={toggleEnquire}
                                className="px-8 py-4 rounded-full bg-white text-gray-900 font-bold border border-gray-200 shadow-xl shadow-gray-200/50 hover:shadow-2xl hover:-translate-y-0.5 transition-all duration-300 flex items-center gap-2 group"
                            >
                                Get Started Free
                                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                            </button>
                            <a href="#features" className="px-8 py-4 rounded-full border border-gray-300 text-gray-600 font-medium hover:bg-gray-50 transition-all">
                                View Features
                            </a>
                        </motion.div>
                    </motion.div>
                </div>
            </section>

            {/* Features Section */}
            <section id="features" className="py-24 bg-white relative">
                <div className="max-w-7xl mx-auto px-6 lg:px-8">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.6 }}
                        className="text-center mb-20"
                    >
                        <h2 className="text-3xl md:text-4xl font-bold mb-4 tracking-tight text-gray-900">Everything you need to succeed</h2>
                        <p className="text-gray-500 text-lg font-medium">Powerful tools designed specifically for the unique needs of educational institutes.</p>
                    </motion.div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto">
                        {features.map((feature, index) => (
                            <motion.div
                                key={index}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: index * 0.1, duration: 0.5 }}
                                className="p-8 rounded-[32px] bg-white border border-gray-200 hover:border-gray-300 transition-all duration-300 group h-full flex flex-col items-start text-left"
                            >
                                <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center mb-6 text-gray-900 border border-gray-100">
                                    <feature.icon className="w-6 h-6" strokeWidth={1.5} />
                                </div>
                                <h3 className="text-xl font-bold mb-3 text-gray-900">{feature.title}</h3>
                                <p className="text-gray-500 leading-relaxed font-medium">
                                    {feature.description}
                                </p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Footer */}
            <footer className="bg-[#F9FAFB] border-t border-gray-200 py-12">
                <div className="max-w-7xl mx-auto px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-6 text-sm text-gray-500 font-medium">
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

            {/* Enquire Modal (Kept for functionality) */}
            <AnimatePresence>
                {isEnquireOpen && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={toggleEnquire}
                            className="absolute inset-0 bg-black/20 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            className="relative bg-white rounded-3xl p-8 max-w-lg w-full shadow-2xl border border-gray-100"
                        >
                            <button onClick={toggleEnquire} className="absolute top-6 right-6 text-gray-400 hover:text-black transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                            <div className="text-center mb-8">
                                <h3 className="text-2xl font-bold text-gray-900">Get in Touch</h3>
                                <p className="text-gray-500 mt-2">We'd love to hear from you.</p>
                            </div>
                            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); alert('We will reach out shortly!'); toggleEnquire(); }}>
                                <input type="text" required className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 outline-none focus:border-black transition-colors" placeholder="Full Name" />
                                <input type="email" required className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 outline-none focus:border-black transition-colors" placeholder="Email Address" />
                                <textarea className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-900 outline-none focus:border-black transition-colors h-24 resize-none" placeholder="Message"></textarea>
                                <button type="submit" className="w-full bg-black text-white font-bold py-3.5 rounded-xl hover:bg-gray-800 transition-all">Submit</button>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default Home;
