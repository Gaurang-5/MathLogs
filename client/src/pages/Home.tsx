import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { QrCode, Users, Receipt, BarChart3, Clock, Shield, Zap, ChevronDown, CheckCircle2, X, MessageCircle } from 'lucide-react';

export default function Home() {
    const [openFaq, setOpenFaq] = useState<number | null>(null);

    const features = [
        {
            icon: QrCode,
            title: "QR-Based Student Onboarding",
            description: "Students register instantly by scanning a QR code. No manual data entry required."
        },
        {
            icon: Users,
            title: "Batch & Academic Year Management",
            description: "Organize students by batch and year. Access past data anytime, forever."
        },
        {
            icon: Receipt,
            title: "Fee Tracking & Recovery",
            description: "Never lose track of payments. Recover missed fees from previous months automatically."
        },
        {
            icon: BarChart3,
            title: "Barcode-Based Test Management",
            description: "Generate unique barcodes for tests. Scan to record marks instantly."
        }
    ];

    const steps = [
        {
            number: "01",
            title: "Create batches and share QR code",
            description: "Set up your batches in seconds. Students scan to register."
        },
        {
            number: "02",
            title: "Students register instantly",
            description: "No paperwork. No manual entry. Everything digital."
        },
        {
            number: "03",
            title: "Manage from one dashboard",
            description: "Track fees, record marks, and generate reports—all in one place."
        }
    ];

    const faqs = [
        {
            question: "Is my data safe?",
            answer: "Yes. All data is encrypted and stored securely. Only you have access to your coaching centre's information."
        },
        {
            question: "Can it handle many students at once?",
            answer: "Absolutely. MathLogs is built to handle 100+ students per batch without any slowdown."
        },
        {
            question: "Do I need technical knowledge?",
            answer: "No. If you can use WhatsApp, you can use MathLogs. It's designed for teachers, not tech experts."
        },
        {
            question: "Can I access past academic years?",
            answer: "Yes. All your data is preserved. You can access any previous academic year's records anytime."
        },
        {
            question: "What happens to unpaid fees from previous months?",
            answer: "MathLogs tracks all pending fees automatically. You can recover missed payments even months later."
        }
    ];

    return (
        <div className="min-h-screen bg-white">
            {/* Navigation */}
            <nav className="fixed top-0 left-0 right-0 bg-white/80 backdrop-blur-lg border-b border-gray-200 z-50">
                <div className="max-w-7xl mx-auto px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        <div className="text-2xl font-bold text-gray-900">
                            Math<span className="text-gray-600">Logs</span>
                        </div>
                        <div className="hidden md:flex items-center gap-8">
                            <a href="#features" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">Features</a>
                            <a href="#pricing" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">Pricing</a>
                            <a href="#faq" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">FAQ</a>
                            <Link to="/login" className="px-5 py-2.5 bg-gray-900 text-white text-sm font-semibold rounded-full hover:bg-black transition-all shadow-sm hover:shadow active:scale-95">
                                Sign In
                            </Link>
                        </div>
                        {/* Mobile Sign In Button */}
                        <div className="md:hidden">
                            <Link to="/login" className="px-4 py-2 bg-gray-900 text-white text-sm font-semibold rounded-full hover:bg-black transition-all shadow-sm active:scale-95">
                                Sign In
                            </Link>
                        </div>
                    </div>
                </div>
            </nav>

            {/* 1. Hero Section */}
            <section className="pt-32 pb-20 px-6 lg:px-8">
                <div className="max-w-7xl mx-auto">
                    <div className="grid lg:grid-cols-2 gap-12 items-center">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6 }}
                        >
                            <h1 className="text-5xl lg:text-6xl font-bold text-gray-900 leading-tight mb-6">
                                Spend less time on paperwork.<br />
                                <span className="text-gray-600">More time teaching.</span>
                            </h1>
                            <p className="text-xl text-gray-600 mb-8 leading-relaxed">
                                The complete coaching management platform for single-teacher centres. Track students, fees, and tests—all from one dashboard.
                            </p>
                            <div className="flex flex-col sm:flex-row gap-4">
                                <Link
                                    to="/login"
                                    className="px-8 py-4 bg-gray-900 text-white font-semibold rounded-lg hover:bg-black transition-all shadow-sm hover:shadow-md text-center"
                                >
                                    Get Started Free
                                </Link>
                                <a
                                    href="#how-it-works"
                                    className="px-8 py-4 bg-gray-100 text-gray-900 font-semibold rounded-lg hover:bg-gray-200 transition-all text-center"
                                >
                                    View Demo
                                </a>
                            </div>
                        </motion.div>

                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.6, delay: 0.2 }}
                            className="relative flex items-center justify-center"
                        >
                            {/* Mobile Dashboard Preview */}
                            <div className="relative w-[320px] h-[640px] bg-gray-100 rounded-[48px] border-[12px] border-gray-900 shadow-2xl overflow-hidden">
                                {/* Status Bar */}
                                <div className="absolute top-0 left-0 right-0 h-8 bg-white flex items-center justify-center">
                                    <div className="w-20 h-5 bg-gray-900 rounded-full"></div>
                                </div>

                                {/* Dashboard Content */}
                                <div className="pt-8 px-5 pb-20 h-full overflow-hidden bg-gray-50">
                                    {/* Header */}
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="text-xl font-bold text-gray-900">ML</div>
                                        <div className="text-sm text-gray-600">Dashboard</div>
                                    </div>

                                    {/* Stats Cards */}
                                    <div className="space-y-3 mb-4">
                                        <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
                                            <div className="text-xs text-gray-500 mb-1">TOTAL STUDENTS</div>
                                            <div className="text-2xl font-bold text-gray-900">8</div>
                                        </div>
                                        <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
                                            <div className="text-xs text-gray-500 mb-1">ACTIVE BATCHES</div>
                                            <div className="text-2xl font-bold text-gray-900">2</div>
                                        </div>
                                        <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
                                            <div className="text-xs text-gray-500 mb-1">COLLECTION RATE</div>
                                            <div className="text-2xl font-bold text-gray-900">93%</div>
                                        </div>
                                        <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
                                            <div className="text-xs text-gray-500 mb-1">TOTAL COLLECTED</div>
                                            <div className="text-2xl font-bold text-gray-900">₹42,570</div>
                                        </div>
                                    </div>

                                    {/* Chart Section */}
                                    <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
                                        <div className="text-sm font-bold text-gray-900 mb-2">Growth Trends</div>
                                        <div className="h-24 flex items-end gap-2">
                                            <div className="flex-1 bg-gray-900 rounded-t" style={{ height: '40%' }}></div>
                                            <div className="flex-1 bg-gray-900 rounded-t" style={{ height: '60%' }}></div>
                                            <div className="flex-1 bg-gray-900 rounded-t" style={{ height: '80%' }}></div>
                                            <div className="flex-1 bg-gray-900 rounded-t" style={{ height: '100%' }}></div>
                                        </div>
                                    </div>
                                </div>

                                {/* Bottom Navigation */}
                                <div className="absolute bottom-0 left-0 right-0 h-16 bg-white border-t border-gray-200 flex items-center justify-around px-4">
                                    <div className="w-8 h-8 rounded-lg bg-gray-100"></div>
                                    <div className="w-8 h-8 rounded-lg bg-gray-100"></div>
                                    <div className="w-12 h-12 rounded-full bg-gray-900"></div>
                                    <div className="w-8 h-8 rounded-lg bg-gray-100"></div>
                                    <div className="w-8 h-8 rounded-lg bg-gray-100"></div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                </div>
            </section>

            {/* 2. Credibility / Scale Section */}
            <section className="py-16 bg-gray-50 border-y border-gray-200">
                <div className="max-w-7xl mx-auto px-6 lg:px-8">
                    <p className="text-center text-lg text-gray-600 mb-12 max-w-3xl mx-auto">
                        Built for real classrooms. Used by teachers to manage <span className="font-semibold text-gray-900">100+ students effortlessly</span>.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                        <div className="text-center">
                            <div className="w-16 h-16 bg-gray-900 text-white rounded-2xl flex items-center justify-center mx-auto mb-4">
                                <Clock className="w-8 h-8" />
                            </div>
                            <div className="text-3xl font-bold text-gray-900 mb-2">60–70%</div>
                            <div className="text-sm text-gray-600">Time saved on admin work</div>
                        </div>
                        <div className="text-center">
                            <div className="w-16 h-16 bg-gray-900 text-white rounded-2xl flex items-center justify-center mx-auto mb-4">
                                <Users className="w-8 h-8" />
                            </div>
                            <div className="text-3xl font-bold text-gray-900 mb-2">100+</div>
                            <div className="text-sm text-gray-600">Students per batch supported</div>
                        </div>
                        <div className="text-center">
                            <div className="w-16 h-16 bg-gray-900 text-white rounded-2xl flex items-center justify-center mx-auto mb-4">
                                <Shield className="w-8 h-8" />
                            </div>
                            <div className="text-3xl font-bold text-gray-900 mb-2">Zero</div>
                            <div className="text-sm text-gray-600">Data loss, ever</div>
                        </div>
                        <div className="text-center">
                            <div className="w-16 h-16 bg-gray-900 text-white rounded-2xl flex items-center justify-center mx-auto mb-4">
                                <Receipt className="w-8 h-8" />
                            </div>
                            <div className="text-3xl font-bold text-gray-900 mb-2">25–30%</div>
                            <div className="text-sm text-gray-600">Increase in fee collection</div>
                        </div>
                    </div>
                </div>
            </section>

            {/* 3. Core Features Section */}
            <section id="features" className="py-24 px-6 lg:px-8">
                <div className="max-w-7xl mx-auto">
                    <div className="text-center mb-16">
                        <h2 className="text-4xl font-bold text-gray-900 mb-4">
                            Everything you need to run your coaching centre
                        </h2>
                        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                            Stop juggling registers, Excel sheets, and WhatsApp messages. One platform, all features.
                        </p>
                    </div>

                    <div className="grid md:grid-cols-2 gap-8">
                        {features.map((feature, index) => (
                            <motion.div
                                key={index}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: index * 0.1 }}
                                className="p-8 rounded-2xl border border-gray-200 hover:border-gray-300 hover:shadow-lg transition-all bg-white"
                            >
                                <div className="w-14 h-14 bg-gray-900 text-white rounded-xl flex items-center justify-center mb-6">
                                    <feature.icon className="w-7 h-7" strokeWidth={1.5} />
                                </div>
                                <h3 className="text-xl font-bold text-gray-900 mb-3">{feature.title}</h3>
                                <p className="text-gray-600 leading-relaxed">{feature.description}</p>
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* 4. Real-World Value Section */}
            <section className="py-24 bg-gray-50 px-6 lg:px-8">
                <div className="max-w-5xl mx-auto">
                    <h2 className="text-4xl font-bold text-gray-900 mb-12 text-center">
                        Why MathLogs matters
                    </h2>

                    <div className="space-y-12">
                        <div className="flex gap-6 items-start">
                            <div className="w-2 h-2 bg-gray-900 rounded-full mt-2 flex-shrink-0"></div>
                            <div>
                                <h3 className="text-xl font-semibold text-gray-900 mb-3">
                                    Replace registers, Excel sheets, and WhatsApp chaos
                                </h3>
                                <p className="text-gray-600 leading-relaxed">
                                    No more lost notebooks. No more corrupted Excel files. No more searching through WhatsApp for that one student's fee payment screenshot. Everything is in one place, accessible anytime.
                                </p>
                            </div>
                        </div>

                        <div className="flex gap-6 items-start">
                            <div className="w-2 h-2 bg-gray-900 rounded-full mt-2 flex-shrink-0"></div>
                            <div>
                                <h3 className="text-xl font-semibold text-gray-900 mb-3">
                                    Recover untracked fees automatically
                                </h3>
                                <p className="text-gray-600 leading-relaxed">
                                    Did a student miss payment in March? July? Last year? MathLogs remembers. It shows you every unpaid fee, even from months ago, so you never lose money due to poor tracking.
                                </p>
                            </div>
                        </div>

                        <div className="flex gap-6 items-start">
                            <div className="w-2 h-2 bg-gray-900 rounded-full mt-2 flex-shrink-0"></div>
                            <div>
                                <h3 className="text-xl font-semibold text-gray-900 mb-3">
                                    Parents stay informed automatically
                                </h3>
                                <p className="text-gray-600 leading-relaxed">
                                    Students can share their test marks and progress with parents instantly. No phone calls. No manual reports. Just transparency and trust.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* 5. How It Works */}
            <section id="how-it-works" className="py-24 px-6 lg:px-8">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-16">
                        <h2 className="text-4xl font-bold text-gray-900 mb-4">
                            How it works
                        </h2>
                        <p className="text-lg text-gray-600">
                            Get started in 3 simple steps
                        </p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-8">
                        {steps.map((step, index) => (
                            <motion.div
                                key={index}
                                initial={{ opacity: 0, y: 20 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true }}
                                transition={{ delay: index * 0.15 }}
                                className="relative"
                            >
                                <div className="text-7xl font-bold text-gray-200 mb-4">{step.number}</div>
                                <h3 className="text-xl font-bold text-gray-900 mb-3">{step.title}</h3>
                                <p className="text-gray-600 leading-relaxed">{step.description}</p>

                                {index < steps.length - 1 && (
                                    <div className="hidden md:block absolute top-12 -right-4 w-8 h-0.5 bg-gray-200"></div>
                                )}
                            </motion.div>
                        ))}
                    </div>
                </div>
            </section>

            {/* 6. Pricing Section */}
            <section id="pricing" className="py-24 bg-gray-900 text-white px-6 lg:px-8">
                <div className="max-w-4xl mx-auto text-center">
                    <h2 className="text-4xl font-bold mb-4" style={{ color: '#ffffff' }}>
                        Simple, transparent pricing
                    </h2>
                    <p className="text-xl text-gray-300 mb-12">
                        Designed specifically for small coaching centres
                    </p>

                    <div className="bg-white text-gray-900 rounded-2xl p-12 max-w-lg mx-auto">
                        <div className="mb-8">
                            <div className="text-5xl font-bold mb-2 text-gray-900">₹ XXXX</div>
                            <div className="text-gray-600">per month</div>
                            <div className="mt-4 inline-block px-6 py-2 bg-gray-100 text-gray-900 rounded-full text-sm font-semibold">
                                🚀 Launching Soon
                            </div>
                        </div>

                        <div className="space-y-4 mb-10">
                            <div className="flex items-center gap-3">
                                <CheckCircle2 className="w-5 h-5 text-gray-900 flex-shrink-0" />
                                <span className="text-left">Unlimited students</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <CheckCircle2 className="w-5 h-5 text-gray-900 flex-shrink-0" />
                                <span className="text-left">Unlimited batches</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <CheckCircle2 className="w-5 h-5 text-gray-900 flex-shrink-0" />
                                <span className="text-left">All features included</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <CheckCircle2 className="w-5 h-5 text-gray-900 flex-shrink-0" />
                                <span className="text-left">Lifetime data access</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <CheckCircle2 className="w-5 h-5 text-gray-900 flex-shrink-0" />
                                <span className="text-left">Priority support</span>
                            </div>
                        </div>

                        <Link
                            to="/login"
                            className="block w-full px-8 py-4 bg-gray-900 text-white font-semibold rounded-lg hover:bg-black transition-all text-center"
                        >
                            Join Waitlist – Get Early Access
                        </Link>

                        <p className="text-sm text-gray-500 mt-6">
                            Be among the first to experience simplified coaching management. <span className="font-semibold">Price reveal coming soon!</span>
                        </p>
                    </div>
                </div>
            </section>

            {/* 7. FAQ Section */}
            <section id="faq" className="py-24 px-6 lg:px-8">
                <div className="max-w-3xl mx-auto">
                    <h2 className="text-4xl font-bold text-gray-900 mb-12 text-center">
                        Frequently asked questions
                    </h2>

                    <div className="space-y-4">
                        {faqs.map((faq, index) => (
                            <div key={index} className="border border-gray-200 rounded-xl overflow-hidden">
                                <button
                                    onClick={() => setOpenFaq(openFaq === index ? null : index)}
                                    className="w-full px-6 py-5 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
                                >
                                    <span className="font-semibold text-gray-900">{faq.question}</span>
                                    <ChevronDown
                                        className={`w-5 h-5 text-gray-600 transition-transform ${openFaq === index ? 'rotate-180' : ''
                                            }`}
                                    />
                                </button>
                                {openFaq === index && (
                                    <div className="px-6 pb-5 text-gray-600 leading-relaxed">
                                        {faq.answer}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* 8. Final CTA */}
            <section className="py-24 px-6 lg:px-8 bg-gray-50">
                <div className="max-w-4xl mx-auto text-center">
                    <h2 className="text-5xl font-bold text-gray-900 mb-6 leading-tight">
                        Spend less time on paperwork.<br />
                        More time teaching.
                    </h2>
                    <p className="text-xl text-gray-600 mb-10">
                        Join teachers who've already simplified their coaching management.
                    </p>
                    <Link
                        to="/login"
                        className="inline-block px-12 py-5 bg-gray-900 text-white font-semibold rounded-lg hover:bg-black transition-all shadow-sm hover:shadow-md text-lg"
                    >
                        Start Using MathLogs
                    </Link>
                </div>
            </section>

            {/* 9. Contact / WhatsApp CTA */}
            <section className="py-24 bg-white px-6 lg:px-8 border-t border-gray-200">
                <div className="max-w-4xl mx-auto text-center">
                    <h2 className="text-3xl font-bold text-gray-900 mb-6">
                        Still have questions?
                    </h2>
                    <p className="text-lg text-gray-600 mb-8">
                        Directly chat with us on WhatsApp. We usually reply within minutes.
                    </p>
                    <a
                        href="https://wa.me/918439245302?text=Hi%2C%20I%20have%20a%20question%20about%20MathLogs"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center px-8 py-4 bg-gray-900 text-white font-bold rounded-full hover:bg-black transition-all shadow-lg hover:shadow-xl hover:-translate-y-1"
                    >
                        <MessageCircle className="w-6 h-6 mr-3" />
                        Chat on WhatsApp
                    </a>
                </div>
            </section>

            {/* Floating WhatsApp Button */}
            <a
                href="https://wa.me/918439245302?text=Hi%2C%20I%20have%20a%20question%20about%20MathLogs"
                target="_blank"
                rel="noopener noreferrer"
                className="fixed bottom-6 right-6 z-50 w-16 h-16 bg-gray-900 text-white rounded-full flex items-center justify-center shadow-2xl hover:bg-black transition-all active:scale-90 hover:scale-110"
                title="Chat on WhatsApp"
            >
                <MessageCircle className="w-8 h-8" />
                <span className="absolute top-0 right-0 gap-1 flex h-4 w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-gray-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-white"></span>
                </span>
            </a>

            {/* Footer */}
            <footer className="border-t border-gray-200 py-12 px-6 lg:px-8">
                <div className="max-w-7xl mx-auto">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                        <div className="text-2xl font-bold text-gray-900">
                            Math<span className="text-gray-600">Logs</span>
                        </div>
                        <div className="flex gap-8 text-sm text-gray-600">
                            <a href="#features" className="hover:text-gray-900 transition-colors">Features</a>
                            <a href="#pricing" className="hover:text-gray-900 transition-colors">Pricing</a>
                            <a href="#faq" className="hover:text-gray-900 transition-colors">FAQ</a>
                            <Link to="/login" className="hover:text-gray-900 transition-colors">Sign In</Link>
                            <Link to="/login" className="hover:text-gray-900 transition-colors opacity-50 text-xs">Admin Login</Link>
                        </div>
                    </div>
                    <div className="mt-8 pt-8 border-t border-gray-200 text-center text-sm text-gray-500">
                        © 2026 MathLogs. Built for teachers, by teachers.
                    </div>
                </div>
            </footer>
        </div>
    );
}
