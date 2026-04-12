import React, { useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, CheckCircle, AlertCircle, Loader, Phone, ChevronRight, IndianRupee, ArrowLeft, Clock } from 'lucide-react';

const API_URL = import.meta.env.PROD ? '/api' : (import.meta.env.VITE_API_URL || 'http://localhost:3001/api');

interface FeeInstallment {
    id: string;
    name: string;
    amount: number;
    dueDate?: string;
}

interface FeePayment {
    id: string;
    amount: number;
    installmentId?: string;
}

interface PendingVerification {
    id: string;
    amount: number;
    createdAt: string;
    status: string;
}

interface StudentData {
    studentId: string;
    studentName: string;
    batchName: string;
    feeInstallments: FeeInstallment[];
    feePayments: FeePayment[];
    pendingVerifications: PendingVerification[];
}

interface InstituteInfo {
    name: string;
    logoUrl: string | null;
}

type Step = 'phone' | 'select-student' | 'upload' | 'success';

export default function StudentPaymentPortal() {
    const { slug } = useParams<{ slug: string }>();

    const [step, setStep] = useState<Step>('phone');
    const [phone, setPhone] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const [institute, setInstitute] = useState<InstituteInfo | null>(null);
    const [students, setStudents] = useState<StudentData[]>([]);
    const [selectedStudent, setSelectedStudent] = useState<StudentData | null>(null);

    const [amount, setAmount] = useState('');
    const [selectedInstallmentId, setSelectedInstallmentId] = useState<string>('');
    const [file, setFile] = useState<File | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const lookupStudent = useCallback(async () => {
        if (!slug || phone.length < 10) return;
        setLoading(true);
        setError('');

        try {
            const res = await axios.get(`${API_URL}/public/i/${slug}/student-fees?phone=${phone.replace(/\D/g, '').slice(-10)}`);
            setInstitute(res.data.institute);
            setStudents(res.data.students);

            if (res.data.students.length === 1) {
                setSelectedStudent(res.data.students[0]);
                setStep('upload');
            } else {
                setStep('select-student');
            }
        } catch (err: any) {
            setError(err.response?.data?.error || 'Could not find student. Please check the number.');
        } finally {
            setLoading(false);
        }
    }, [slug, phone]);

    const handleSelectStudent = (student: StudentData) => {
        setSelectedStudent(student);
        setStep('upload');
    };

    const getBalance = (student: StudentData) => {
        const totalFee = student.feeInstallments.reduce((sum, i) => sum + i.amount, 0);
        const totalPaid = student.feePayments.reduce((sum, p) => sum + p.amount, 0);
        return totalFee - totalPaid;
    };

    const getInstallmentBalance = (student: StudentData, installment: FeeInstallment) => {
        const paid = student.feePayments
            .filter(p => p.installmentId === installment.id)
            .reduce((sum, p) => sum + p.amount, 0);
        return installment.amount - paid;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedStudent || !amount || !file) {
            setError('Please fill all fields and upload a screenshot.');
            return;
        }

        setSubmitting(true);
        setError('');

        const formData = new FormData();
        formData.append('studentId', selectedStudent.studentId);
        formData.append('amount', amount);
        if (selectedInstallmentId) {
            formData.append('installmentId', selectedInstallmentId);
        }
        formData.append('screenshot', file);

        try {
            await axios.post(`${API_URL}/public/i/${slug}/submit-upi`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setStep('success');
        } catch (err: any) {
            setError(err.response?.data?.error || 'Submission failed. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    if (!slug) {
        return (
            <div className="portal-container">
                <div className="portal-card text-center">
                    <div className="portal-icon-circle portal-icon-error">
                        <AlertCircle size={32} />
                    </div>
                    <h2>Invalid Link</h2>
                    <p className="text-muted">This payment link is not valid.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="portal-container">
            {/* Institute Header */}
            {institute && (
                <div className="portal-header">
                    {institute.logoUrl && (
                        <img src={institute.logoUrl} alt="" className="portal-logo" />
                    )}
                    <h1 className="portal-title">{institute.name}</h1>
                    <p className="portal-subtitle">Fee Payment Portal</p>
                </div>
            )}

            <AnimatePresence mode="wait">
                {/* STEP 1: Phone Entry */}
                {step === 'phone' && (
                    <motion.div
                        key="phone"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="portal-card"
                    >
                        {!institute && (
                            <div className="portal-header-inline">
                                <h2>Fee Payment Portal</h2>
                                <p className="text-muted">Enter your registered mobile number</p>
                            </div>
                        )}

                        {institute && (
                            <p className="text-muted" style={{ marginBottom: '1.5rem' }}>Enter your registered mobile number to view pending fees.</p>
                        )}

                        <form onSubmit={(e) => { e.preventDefault(); lookupStudent(); }}>
                            <div className="input-group">
                                <div className="input-icon"><Phone size={20} /></div>
                                <input
                                    type="tel"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    placeholder="e.g. 9876543210"
                                    className="portal-input"
                                    maxLength={13}
                                    required
                                />
                            </div>

                            {error && (
                                <div className="portal-error">
                                    <AlertCircle size={16} />
                                    <span>{error}</span>
                                </div>
                            )}

                            <button type="submit" className="portal-btn portal-btn-primary" disabled={loading || phone.length < 10}>
                                {loading ? <Loader size={20} className="spin" /> : <>Continue <ChevronRight size={18} /></>}
                            </button>
                        </form>
                    </motion.div>
                )}

                {/* STEP 2: Select Student (if multiple) */}
                {step === 'select-student' && (
                    <motion.div
                        key="select"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="portal-card"
                    >
                        <button className="portal-back" onClick={() => { setStep('phone'); setError(''); }}>
                            <ArrowLeft size={16} /> Back
                        </button>
                        <h3>We found {students.length} students</h3>
                        <p className="text-muted">Select whose fee you are paying:</p>

                        <div className="student-list">
                            {students.map(s => (
                                <button
                                    key={s.studentId}
                                    className="student-card"
                                    onClick={() => handleSelectStudent(s)}
                                >
                                    <div className="student-avatar">{s.studentName[0]}</div>
                                    <div className="student-info">
                                        <span className="student-name">{s.studentName}</span>
                                        <span className="student-batch">{s.batchName}</span>
                                        <span className="student-balance">Balance: ₹{getBalance(s).toLocaleString()}</span>
                                    </div>
                                    <ChevronRight size={18} className="text-muted" />
                                </button>
                            ))}
                        </div>
                    </motion.div>
                )}

                {/* STEP 3: Upload Screenshot */}
                {step === 'upload' && selectedStudent && (
                    <motion.div
                        key="upload"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="portal-card"
                    >
                        {students.length > 1 && (
                            <button className="portal-back" onClick={() => { setStep('select-student'); setError(''); setFile(null); setAmount(''); }}>
                                <ArrowLeft size={16} /> Change Student
                            </button>
                        )}

                        <div className="selected-student-banner">
                            <div className="student-avatar">{selectedStudent.studentName[0]}</div>
                            <div>
                                <strong>{selectedStudent.studentName}</strong>
                                <span className="student-batch">{selectedStudent.batchName}</span>
                            </div>
                        </div>

                        {/* Pending verifications warning */}
                        {selectedStudent.pendingVerifications.length > 0 && (
                            <div className="portal-warning">
                                <Clock size={16} />
                                <span>You already have {selectedStudent.pendingVerifications.length} payment(s) under review.</span>
                            </div>
                        )}

                        {/* Fee Breakdown */}
                        {selectedStudent.feeInstallments.length > 0 && (
                            <div className="fee-breakdown">
                                <h4>Fee Installments</h4>
                                {selectedStudent.feeInstallments.map(inst => {
                                    const balance = getInstallmentBalance(selectedStudent, inst);
                                    if (balance <= 0) return null;
                                    return (
                                        <label key={inst.id} className={`fee-item ${selectedInstallmentId === inst.id ? 'fee-item-selected' : ''}`}>
                                            <input
                                                type="radio"
                                                name="installment"
                                                value={inst.id}
                                                checked={selectedInstallmentId === inst.id}
                                                onChange={() => {
                                                    setSelectedInstallmentId(inst.id);
                                                    setAmount(String(balance));
                                                }}
                                            />
                                            <div className="fee-item-text">
                                                <span>{inst.name}</span>
                                                <span className="fee-item-amount">₹{balance.toLocaleString()} due</span>
                                            </div>
                                        </label>
                                    );
                                })}
                            </div>
                        )}

                        <form onSubmit={handleSubmit}>
                            <div className="input-group">
                                <div className="input-icon"><IndianRupee size={20} /></div>
                                <input
                                    type="number"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    placeholder="Amount paid"
                                    className="portal-input"
                                    min="1"
                                    required
                                />
                            </div>

                            <label className={`upload-area ${file ? 'upload-area-filled' : ''}`}>
                                <input
                                    type="file"
                                    accept="image/jpeg,image/png,image/jpg"
                                    onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])}
                                    hidden
                                />
                                {file ? (
                                    <>
                                        <CheckCircle size={28} />
                                        <span className="upload-filename">{file.name}</span>
                                        <span className="text-muted">Tap to change</span>
                                    </>
                                ) : (
                                    <>
                                        <Upload size={28} />
                                        <span>Tap to upload payment screenshot</span>
                                        <span className="text-muted">JPG, PNG (Max 5MB)</span>
                                    </>
                                )}
                            </label>

                            {error && (
                                <div className="portal-error">
                                    <AlertCircle size={16} />
                                    <span>{error}</span>
                                </div>
                            )}

                            <button type="submit" className="portal-btn portal-btn-primary" disabled={submitting || !file || !amount}>
                                {submitting ? <Loader size={20} className="spin" /> : 'Submit Payment Receipt'}
                            </button>
                        </form>
                    </motion.div>
                )}

                {/* STEP 4: Success */}
                {step === 'success' && (
                    <motion.div
                        key="success"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="portal-card text-center"
                    >
                        <div className="portal-icon-circle portal-icon-success">
                            <CheckCircle size={40} />
                        </div>
                        <h2>Receipt Submitted!</h2>
                        <p className="text-muted">
                            Your payment of <strong>₹{Number(amount).toLocaleString()}</strong> for <strong>{selectedStudent?.studentName}</strong> has been submitted.
                        </p>
                        <p className="text-muted">Your teacher will verify it shortly. You'll receive a WhatsApp confirmation once approved.</p>
                    </motion.div>
                )}
            </AnimatePresence>

            <p className="portal-footer">Secured by MathLogs</p>

            <style>{`
                .portal-container {
                    min-height: 100vh;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding: 1.5rem;
                    background: linear-gradient(135deg, #f0f4ff 0%, #fafbff 50%, #f5f0ff 100%);
                    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                }
                .portal-header {
                    text-align: center;
                    margin-bottom: 1.5rem;
                }
                .portal-logo {
                    width: 64px;
                    height: 64px;
                    border-radius: 16px;
                    object-fit: contain;
                    background: #fff;
                    padding: 4px;
                    box-shadow: 0 2px 12px rgba(0,0,0,0.08);
                    margin-bottom: 0.75rem;
                }
                .portal-title {
                    font-size: 1.5rem;
                    font-weight: 800;
                    color: #1a1a2e;
                    margin: 0;
                }
                .portal-subtitle {
                    color: #6b7280;
                    font-size: 0.9rem;
                    margin-top: 0.25rem;
                }
                .portal-card {
                    width: 100%;
                    max-width: 420px;
                    background: #fff;
                    border-radius: 20px;
                    padding: 2rem;
                    box-shadow: 0 4px 24px rgba(0,0,0,0.06);
                    border: 1px solid rgba(0,0,0,0.04);
                }
                .portal-header-inline h2 {
                    font-size: 1.4rem;
                    font-weight: 700;
                    margin: 0 0 0.25rem;
                    color: #1a1a2e;
                }
                .text-center { text-align: center; }
                .text-muted { color: #6b7280; font-size: 0.9rem; }
                .input-group {
                    position: relative;
                    margin-bottom: 1rem;
                }
                .input-icon {
                    position: absolute;
                    left: 14px;
                    top: 50%;
                    transform: translateY(-50%);
                    color: #9ca3af;
                }
                .portal-input {
                    width: 100%;
                    padding: 14px 14px 14px 46px;
                    font-size: 1.05rem;
                    border: 1.5px solid #e5e7eb;
                    border-radius: 14px;
                    outline: none;
                    transition: all 0.2s;
                    background: #fafafa;
                    box-sizing: border-box;
                }
                .portal-input:focus {
                    border-color: #6366f1;
                    background: #fff;
                    box-shadow: 0 0 0 3px rgba(99,102,241,0.1);
                }
                .portal-btn {
                    width: 100%;
                    padding: 14px;
                    border: none;
                    border-radius: 14px;
                    font-size: 1rem;
                    font-weight: 600;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    transition: all 0.2s;
                    margin-top: 0.5rem;
                }
                .portal-btn-primary {
                    background: #6366f1;
                    color: #fff;
                }
                .portal-btn-primary:hover:not(:disabled) {
                    background: #4f46e5;
                    transform: translateY(-1px);
                    box-shadow: 0 4px 16px rgba(99,102,241,0.3);
                }
                .portal-btn:disabled {
                    opacity: 0.4;
                    cursor: not-allowed;
                    transform: none;
                }
                .portal-error {
                    display: flex;
                    align-items: flex-start;
                    gap: 8px;
                    background: #fef2f2;
                    color: #dc2626;
                    padding: 12px 14px;
                    border-radius: 12px;
                    font-size: 0.88rem;
                    margin-bottom: 0.75rem;
                }
                .portal-warning {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    background: #fffbeb;
                    color: #b45309;
                    padding: 12px 14px;
                    border-radius: 12px;
                    font-size: 0.88rem;
                    margin-bottom: 1rem;
                }
                .portal-back {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    background: none;
                    border: none;
                    color: #6366f1;
                    font-size: 0.88rem;
                    font-weight: 500;
                    cursor: pointer;
                    padding: 0;
                    margin-bottom: 1rem;
                }
                .student-list {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                    margin-top: 1rem;
                }
                .student-card {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 14px;
                    border: 1.5px solid #e5e7eb;
                    border-radius: 14px;
                    background: #fff;
                    cursor: pointer;
                    text-align: left;
                    width: 100%;
                    transition: all 0.2s;
                }
                .student-card:hover {
                    border-color: #6366f1;
                    background: #fafaff;
                }
                .student-avatar {
                    width: 42px;
                    height: 42px;
                    border-radius: 12px;
                    background: #eef2ff;
                    color: #6366f1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: 700;
                    font-size: 1.1rem;
                    flex-shrink: 0;
                }
                .student-info {
                    display: flex;
                    flex-direction: column;
                    flex: 1;
                    min-width: 0;
                }
                .student-name {
                    font-weight: 600;
                    color: #1a1a2e;
                    font-size: 0.95rem;
                }
                .student-batch {
                    color: #6b7280;
                    font-size: 0.82rem;
                }
                .student-balance {
                    color: #dc2626;
                    font-size: 0.82rem;
                    font-weight: 500;
                }
                .selected-student-banner {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    padding: 12px;
                    background: #f9fafb;
                    border-radius: 14px;
                    margin-bottom: 1rem;
                }
                .selected-student-banner strong {
                    display: block;
                    color: #1a1a2e;
                }
                .fee-breakdown {
                    margin-bottom: 1rem;
                }
                .fee-breakdown h4 {
                    font-size: 0.85rem;
                    color: #6b7280;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    margin: 0 0 0.5rem;
                }
                .fee-item {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 12px;
                    border: 1.5px solid #e5e7eb;
                    border-radius: 12px;
                    cursor: pointer;
                    margin-bottom: 6px;
                    transition: all 0.15s;
                }
                .fee-item:hover, .fee-item-selected {
                    border-color: #6366f1;
                    background: #fafaff;
                }
                .fee-item input[type="radio"] {
                    accent-color: #6366f1;
                }
                .fee-item-text {
                    display: flex;
                    justify-content: space-between;
                    flex: 1;
                    font-size: 0.9rem;
                }
                .fee-item-amount {
                    font-weight: 600;
                    color: #dc2626;
                }
                .upload-area {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    gap: 6px;
                    padding: 2rem 1rem;
                    border: 2px dashed #d1d5db;
                    border-radius: 14px;
                    cursor: pointer;
                    color: #6b7280;
                    text-align: center;
                    transition: all 0.2s;
                    margin-bottom: 1rem;
                }
                .upload-area:hover {
                    border-color: #6366f1;
                    background: #fafaff;
                }
                .upload-area-filled {
                    border-color: #6366f1;
                    background: #eef2ff;
                    color: #4f46e5;
                }
                .upload-filename {
                    font-weight: 600;
                    font-size: 0.9rem;
                    word-break: break-all;
                }
                .portal-icon-circle {
                    width: 72px;
                    height: 72px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin: 0 auto 1rem;
                }
                .portal-icon-success {
                    background: #dcfce7;
                    color: #16a34a;
                }
                .portal-icon-error {
                    background: #fee2e2;
                    color: #dc2626;
                }
                .portal-footer {
                    margin-top: 2rem;
                    font-size: 0.78rem;
                    color: #9ca3af;
                }
                .spin { animation: spin 1s linear infinite; }
                @keyframes spin { to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}
