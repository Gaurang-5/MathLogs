import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, BookOpen, Heart, Users } from 'lucide-react';
import { appleSpringDefault } from '../utils/appleDesign';

export default function AboutUs() {
    return (
        <div className="min-h-screen bg-neutral-50 py-12 px-4 sm:px-6 lg:px-8 font-sans text-neutral-900 selection:bg-neutral-900 selection:text-white">
            <motion.div
                initial={{ opacity: 0, y: 16, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={appleSpringDefault}
                className="max-w-4xl mx-auto bg-white/80 backdrop-blur-2xl rounded-3xl shadow-xl border border-neutral-200/80 p-8 md:p-12"
            >
                <Link to="/" className="inline-flex items-center text-neutral-500 hover:text-neutral-900 mb-8 transition-colors font-semibold text-sm">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Home
                </Link>

                <h1 className="text-4xl font-extrabold text-neutral-900 tracking-[-0.03em] mb-8">About MathLogs</h1>

                <div className="space-y-8 text-neutral-600 leading-relaxed text-lg font-medium">
                    <div>
                        <h2 className="text-2xl font-extrabold text-neutral-900 tracking-[-0.02em] mb-4">Our Story</h2>
                        <p>
                            MathLogs was born out of a simple observation: independent teachers and small coaching centre
                            owners spend far too much time managing spreadsheets, taking attendance, chasing fee payments,
                            and sending manual WhatsApp messages to parents. We built MathLogs to automate the repetitive
                            administrative tasks so that teachers can return to what they do best: teaching.
                        </p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-8 py-8">
                        <motion.div
                            whileHover={{ y: -3, scale: 1.02 }}
                            transition={appleSpringDefault}
                            className="bg-neutral-50/80 p-6 rounded-2xl border border-neutral-200/80 text-center"
                        >
                            <div className="w-12 h-12 bg-neutral-900 text-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xs">
                                <Users className="w-6 h-6" />
                            </div>
                            <h3 className="font-extrabold text-neutral-900 mb-2">For Teachers</h3>
                            <p className="text-sm text-neutral-600">Designed specifically for the needs of independent educators and coaching centres.</p>
                        </motion.div>

                        <motion.div
                            whileHover={{ y: -3, scale: 1.02 }}
                            transition={appleSpringDefault}
                            className="bg-neutral-50/80 p-6 rounded-2xl border border-neutral-200/80 text-center"
                        >
                            <div className="w-12 h-12 bg-neutral-900 text-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xs">
                                <BookOpen className="w-6 h-6" />
                            </div>
                            <h3 className="font-extrabold text-neutral-900 mb-2">Simplicity First</h3>
                            <p className="text-sm text-neutral-600">No complex onboarding or training required. If you can use WhatsApp, you can use MathLogs.</p>
                        </motion.div>

                        <motion.div
                            whileHover={{ y: -3, scale: 1.02 }}
                            transition={appleSpringDefault}
                            className="bg-neutral-50/80 p-6 rounded-2xl border border-neutral-200/80 text-center"
                        >
                            <div className="w-12 h-12 bg-neutral-900 text-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xs">
                                <Heart className="w-6 h-6" />
                            </div>
                            <h3 className="font-extrabold text-neutral-900 mb-2">Made with Care</h3>
                            <p className="text-sm text-neutral-600">We continuously listen to teacher feedback to build features that actively solve real classroom problems.</p>
                        </motion.div>
                    </div>

                    <div>
                        <h2 className="text-2xl font-extrabold text-neutral-900 tracking-[-0.02em] mb-4">Our Mission</h2>
                        <p>
                            Our mission is to empower every independent educator with technology that is usually reserved
                            for large, heavily-funded educational institutions. We believe that managing a coaching centre
                            should be stress-free, transparent, and completely digital.
                        </p>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
