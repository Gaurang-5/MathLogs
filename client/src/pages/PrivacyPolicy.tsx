import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function PrivacyPolicy() {
    return (
        <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-100 p-8 md:p-12">
                <Link to="/" className="inline-flex items-center text-gray-500 hover:text-gray-900 mb-8 transition-colors">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Home
                </Link>

                <h1 className="text-4xl font-bold text-gray-900 mb-8">Privacy Policy</h1>

                <div className="space-y-6 text-gray-600 leading-relaxed text-lg">
                    <p><strong>Effective Date:</strong> March 2026</p>

                    <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">1. Information We Collect</h2>
                    <p>We collect information you provide directly to us when using MathLogs, including:</p>
                    <ul className="list-disc pl-6 space-y-2">
                        <li>Account information (name, email address, password).</li>
                        <li>Coaching institute details.</li>
                        <li>Student data entered by you (names, parent contact numbers, academic performance, fee records).</li>
                    </ul>

                    <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">2. How We Use Your Information</h2>
                    <p>We use the collected information solely for providing and improving the MathLogs service:</p>
                    <ul className="list-disc pl-6 space-y-2">
                        <li>To operate, maintain, and provide the features of the application.</li>
                        <li>To send automated notifications (like emails and WhatsApp messages) on your behalf to students and parents.</li>
                        <li>To analyze usage patterns to improve the user experience.</li>
                    </ul>

                    <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">3. Data Security and Privacy</h2>
                    <p>
                        Your data belongs to you. We implement robust security measures to protect your information and the information of your students. We <strong>never</strong> sell, rent, or share your data or your students' data with third-party advertisers or data brokers.
                    </p>

                    <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">4. Third-Party Services</h2>
                    <p>
                        We use third-party services like MSG91 strictly for delivering WhatsApp notifications and transactional emails. These services are bound by confidentiality agreements and are only permitted to use the data for the purpose of message delivery.
                    </p>

                    <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">5. Your Rights</h2>
                    <p>
                        You have the right to access, modify, or delete your account data at any time. Upon account deletion, all associated student data, fee records, and marks will be permanently removed from our active servers.
                    </p>

                    <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">6. Contact Us</h2>
                    <p>
                        If you have any questions about this Privacy Policy, please contact us via the WhatsApp support number provided on our website.
                    </p>
                </div>
            </div>
        </div>
    );
}
