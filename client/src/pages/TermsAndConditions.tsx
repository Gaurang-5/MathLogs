import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function TermsAndConditions() {
    return (
        <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-100 p-8 md:p-12">
                <Link to="/" className="inline-flex items-center text-gray-500 hover:text-gray-900 mb-8 transition-colors">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Home
                </Link>

                <h1 className="text-4xl font-bold text-gray-900 mb-8">Terms and Conditions</h1>

                <div className="space-y-6 text-gray-600 leading-relaxed text-lg">
                    <p><strong>Effective Date:</strong> March 2026</p>

                    <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">1. Acceptance of Terms</h2>
                    <p>By accessing and using MathLogs, you accept and agree to be bound by these Terms and Conditions. If you do not agree to these terms, you may not access or use the application.</p>

                    <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">2. Description of Service</h2>
                    <p>MathLogs is a coaching management platform designed to help teachers manage student records, track fees, record test marks, and automate parent notifications through WhatsApp and email.</p>

                    <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">3. User Responsibilities</h2>
                    <ul className="list-disc pl-6 space-y-2">
                        <li>You are responsible for maintaining the confidentiality of your account credentials.</li>
                        <li>You must ensure that the student and parent data you enter is accurate and that you have the right to process this data.</li>
                        <li>You agree not to use the service for any illegal or unauthorized purpose.</li>
                        <li>You are solely responsible for compliance with any local regulations regarding student data privacy in your region.</li>
                    </ul>

                    <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">4. WhatsApp and Email Communication</h2>
                    <p>The platform enables the sending of automated messages to parents regarding fees, marks, and announcements. You agree to use this feature responsibly and not for spam or unsolicited marketing communications. We reserve the right to suspend email or messaging access if abuse is detected.</p>

                    <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">5. Intellectual Property</h2>
                    <p>All content, features, and functionality of MathLogs are the exclusive property of its creators and are protected by international copyright, trademark, and other intellectual property laws.</p>

                    <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">6. Limitation of Liability</h2>
                    <p>In no event shall MathLogs, nor its directors, employees, partners, agents, suppliers, or affiliates, be liable for any indirect, incidental, special, consequential or punitive damages, including without limitation, loss of profits, data, use, goodwill, or other intangible losses, resulting from your access to or use of or inability to access or use the service.</p>

                    <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">7. Changes to Terms</h2>
                    <p>We reserve the right to modify or replace these Terms at any time. We will provide notice of any material changes via the application.</p>

                    <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">8. Contact Us</h2>
                    <p>If you have any questions about these Terms, please contact us via the WhatsApp support number provided on our website.</p>
                </div>
            </div>
        </div>
    );
}
