import { Link } from 'react-router-dom';
import { ArrowLeft, BookOpen, Heart, Users } from 'lucide-react';

export default function AboutUs() {
    return (
        <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-100 p-8 md:p-12">
                <Link to="/" className="inline-flex items-center text-gray-500 hover:text-gray-900 mb-8 transition-colors">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Home
                </Link>

                <h1 className="text-4xl font-bold text-gray-900 mb-8">About MathLogs</h1>

                <div className="space-y-8 text-gray-600 leading-relaxed text-lg">

                    <div>
                        <h2 className="text-2xl font-bold text-gray-900 mb-4">Our Story</h2>
                        <p>
                            MathLogs was born out of a simple observation: independent teachers and small coaching centre
                            owners spend far too much time managing spreadsheets, taking attendance, chasing fee payments,
                            and sending manual WhatsApp messages to parents. We built MathLogs to automate the repetitive
                            administrative tasks so that teachers can return to what they do best: teaching.
                        </p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-8 py-8">
                        <div className="bg-gray-50 p-6 rounded-xl border border-gray-100 text-center">
                            <div className="w-12 h-12 bg-gray-900 text-white rounded-full flex items-center justify-center mx-auto mb-4">
                                <Users className="w-6 h-6" />
                            </div>
                            <h3 className="font-bold text-gray-900 mb-2">For Teachers</h3>
                            <p className="text-base text-gray-600">Designed specifically for the needs of independent educators and coaching centres.</p>
                        </div>
                        <div className="bg-gray-50 p-6 rounded-xl border border-gray-100 text-center">
                            <div className="w-12 h-12 bg-gray-900 text-white rounded-full flex items-center justify-center mx-auto mb-4">
                                <BookOpen className="w-6 h-6" />
                            </div>
                            <h3 className="font-bold text-gray-900 mb-2">Simplicity First</h3>
                            <p className="text-base text-gray-600">No complex onboarding or training required. If you can use WhatsApp, you can use MathLogs.</p>
                        </div>
                        <div className="bg-gray-50 p-6 rounded-xl border border-gray-100 text-center">
                            <div className="w-12 h-12 bg-gray-900 text-white rounded-full flex items-center justify-center mx-auto mb-4">
                                <Heart className="w-6 h-6" />
                            </div>
                            <h3 className="font-bold text-gray-900 mb-2">Made with Care</h3>
                            <p className="text-base text-gray-600">We continuously listen to teacher feedback to build features that actively solve real classroom problems.</p>
                        </div>
                    </div>

                    <div>
                        <h2 className="text-2xl font-bold text-gray-900 mb-4">Our Mission</h2>
                        <p>
                            Our mission is to empower every independent educator with technology that is usually reserved
                            for large, heavily-funded educational institutions. We believe that managing a coaching centre
                            should be stress-free, transparent, and completely digital.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
