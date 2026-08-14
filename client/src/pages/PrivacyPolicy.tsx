import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { appleSpringDefault } from '../utils/appleDesign';

export default function PrivacyPolicy() {
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

                <h1 className="text-4xl font-extrabold text-neutral-900 tracking-[-0.03em] mb-8">Privacy Policy</h1>

                <div className="space-y-6 text-neutral-600 leading-relaxed text-lg font-medium">
                    <p><strong>Effective Date:</strong> March 2026</p>
                    <p>This Privacy Policy is published in compliance with the Information Technology Act, 2000, the Information Technology (Reasonable Security Practices and Procedures and Sensitive Personal Data or Information) Rules, 2011, and the Digital Personal Data Protection (DPDP) Act, 2023 of India.</p>

                    <h2 className="text-2xl font-extrabold text-neutral-900 tracking-[-0.02em] mt-8 mb-4">1. Information We Collect</h2>
                    <p>We collect information you provide directly to us when using MathLogs, including:</p>
                    <ul className="list-disc pl-6 space-y-2">
                        <li>Account information (name, email address, password).</li>
                        <li>Coaching institute details.</li>
                        <li>Student data entered by you (names, parent contact numbers, academic performance, fee records).</li>
                    </ul>

                    <h2 className="text-2xl font-extrabold text-neutral-900 tracking-[-0.02em] mt-8 mb-4">2. Role under DPDP Act, 2023</h2>
                    <p>Under the DPDP Act, the educational institute or teacher using our platform acts as the <strong>Data Fiduciary</strong>, determining the purpose and means of processing personal data. MathLogs acts strictly as a <strong>Data Processor</strong>, processing data on behalf of the Data Fiduciary. Institutes must ensure they have obtained verifiable and explicit consent from students or their legal guardians before entering their data into our system.</p>

                    <h2 className="text-2xl font-extrabold text-neutral-900 tracking-[-0.02em] mt-8 mb-4">3. How We Use Your Information</h2>
                    <p>We use the collected information solely for providing and improving the MathLogs service:</p>
                    <ul className="list-disc pl-6 space-y-2">
                        <li>To operate, maintain, and provide the features of the application.</li>
                        <li>To send automated notifications (like emails and WhatsApp messages) on your behalf to students and parents.</li>
                        <li>To maintain secure electronic records as mandated by the IT Act, 2000.</li>
                    </ul>

                    <h2 className="text-2xl font-extrabold text-neutral-900 tracking-[-0.02em] mt-8 mb-4">4. Data Security and Privacy</h2>
                    <p>
                        We implement reasonable security practices and procedures (RSPP) as required under Indian laws to protect your information and the information of your students. We <strong>never</strong> sell, rent, or share your data or your students' data with third-party advertisers or data brokers.
                    </p>

                    <h2 className="text-2xl font-extrabold text-neutral-900 tracking-[-0.02em] mt-8 mb-4">5. Third-Party Services</h2>
                    <p>
                        We use third-party services like MSG91 strictly for delivering WhatsApp notifications and transactional emails. These services are bound by confidentiality agreements and are compliant with applicable data protection laws.
                    </p>

                    <h2 className="text-2xl font-extrabold text-neutral-900 tracking-[-0.02em] mt-8 mb-4">6. Your Rights (Data Principal Rights)</h2>
                    <p>
                        As per the DPDP Act, Data Principals (users/students) have the right to access, correct, erase, and nominate a representative for their data. You, as the Data Fiduciary, can manage or delete your account data at any time. Upon account deletion, all associated student data will be permanently removed from our active servers.
                    </p>

                    <h2 className="text-2xl font-extrabold text-neutral-900 tracking-[-0.02em] mt-8 mb-4">7. Grievance Redressal</h2>
                    <p>
                        In accordance with the Information Technology Act, 2000 and rules made there under, if you have any grievances regarding data privacy, you may contact our designated Grievance Officer via the support contact details provided on our website.
                    </p>
                </div>
            </motion.div>
        </div>
    );
}
