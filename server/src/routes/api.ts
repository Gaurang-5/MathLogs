import { Router } from 'express';
import { changePassword, createInitialAdmin, getProfile, loginAdmin, refreshTokenUser, sendMobileOtp, verifyMobileOtp } from '../controllers/authController';
import { authenticateToken } from '../middleware/auth';
import { authLimiter, bulkNotifyLimiter, ocrLimiter, paymentLimiter, publicLimiter, upiPaymentLimiter } from '../middleware/security';
import { validateRequest } from '../middleware/validation';
import { changePasswordSchema, createBatchSchema, createCustomInvoiceSchema, createInstallmentSchema, createTestSchema, loginSchema, payInstallmentSchema, paymentSchema, registerStudentSchema, setupSchema, submitMarkSchema, updateBatchSchema, updateStudentSchema, updateTestSchema } from '../schemas';
import { createBatch, createFeeInstallment, deleteBatch, deleteFeeInstallment, downloadBatchPDF, downloadBatchQRPDF, endBatchRegistration, getBatchDetails, getBatchPublicStatus, getBatches, inviteStudentToBatch, sendBatchWhatsappInvite, sendStudentWhatsappInvite, toggleBatchRegistration, updateBatch, updateFeeInstallment } from '../controllers/batchController';
import { addStudentManually, approveStudent, getClassAverageStats, getPendingStudents, getStudentGrowthStats, registerStudent, rejectStudent, updateStudent } from '../controllers/studentController';
import { checkRegistrationStatus } from '../controllers/statusController';
import { generateStickerSheet } from '../controllers/stickerController';
import { createTest, deleteOnlineQuiz, deleteTest, downloadOnlineQuizQuestionsPdf, downloadOnlineQuizReport, downloadOnlineQuizReportPdf, downloadTestReport, finalizeOnlineQuiz, generateAITest, generateSingleQuestionRoute, generateVariantQuestionRoute, getOnlineQuizzes, getStudentByHumanId, getTestDetails, getTestEligibleStudents, getTests, saveOnlineQuiz, sendTestResultsEmail, submitMark, updateOnlineQuiz, updateTest } from '../controllers/testController';
import { getLiveQuizStatus, getOnlineQuizAnalytics } from '../controllers/analyticsController';
import { approveUpiVerification, createCustomInvoice, downloadMonthlyReport, downloadPendingFeesReport, getCustomInvoices, getFeeSummary, getPaymentHistory, getRecentTransactions, getUpiVerifications, payInstallment, recordPayment, rejectUpiVerification, scanReceipt, sendFeeReminder, assignInstallmentToStudent } from '../controllers/feeController';
import { getDashboardSummary, getFinancialGrowthStats } from '../controllers/dashboardController';
import { generateInvite, getInstitutes, setupAccount, validateInvite } from '../controllers/inviteController';
import { createOrder, resendSetupLink, startTrial, trackLead, verifyPayment } from '../controllers/onboardingController';
import multer from 'multer';
import { getPaymentScreenshot, getPublicInstituteProfile, getPublicStudentFees, submitPublicLead, submitUpiPayment } from '../controllers/publicController';
import { scanOcr } from '../controllers/ocrController';
import { cancelSubscription, createBillingSession, verifyBillingPayment } from '../controllers/billingController';
import { deleteInstitute, getGlobalAnalytics, getInstituteDetails, getMyInstitute, getOnboardingLeads, suspendInstitute, updateInstituteConfig, updateInstituteDetails, updateInstitutePlan, updateMyInstituteConfig, uploadLogo } from '../controllers/instituteController';
import { createAdminOnboardingLink, createAdminOnboardingOrder, getAdminOnboardingLink, listAdminOnboardingLinks, verifyAdminOnboardingPayment } from '../controllers/adminOnboardingController';

const router = Router();

// ================= PUBLIC DOMAIN ROUTES =================
// These routes do NOT require authentication and are used by parents/students.
router.get('/public/i/:slug', publicLimiter, getPublicInstituteProfile);
router.post('/public/i/:slug/lead', publicLimiter, submitPublicLead);
router.get('/public/i/:slug/student-fees', upiPaymentLimiter, getPublicStudentFees);
router.get('/public/payment-screenshot/:key', publicLimiter, getPaymentScreenshot);
// Configure multer for memory storage (no temp files on disk)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
        files: 1 // Prevent multi-file attacks
    },
    fileFilter: (req: any, file: any, cb: any) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only JPEG, PNG and WebP are allowed.'));
        }
    }
});

const testDocUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
        files: 5
    },
    fileFilter: (req: any, file: any, cb: any) => {
        const allowedTypes = [
            'image/jpeg',
            'image/png',
            'image/webp',
            'application/pdf',
            'text/plain'
        ];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only JPEG, PNG, WebP, PDF, and TXT files are allowed.'));
        }
    }
});

// ================= FILE UPLOAD ROUTES =================
router.post('/public/i/:slug/submit-upi', upiPaymentLimiter, upload.single('screenshot'), submitUpiPayment);

// OCR Scan Endpoint
router.post('/scan-ocr', authenticateToken, ocrLimiter, upload.single('image'), scanOcr);

// Dashboard (Optimized endpoint)
router.get('/dashboard/summary', authenticateToken, getDashboardSummary);

// Auth
router.post('/auth/login', authLimiter, validateRequest(loginSchema), loginAdmin);
router.post('/auth/setup', authLimiter, validateRequest(setupSchema), createInitialAdmin);
router.post('/auth/change-password', authenticateToken, validateRequest(changePasswordSchema), changePassword);
router.get('/auth/me', authenticateToken, getProfile);

router.post('/auth/send-otp', authLimiter, sendMobileOtp);
router.post('/auth/verify-otp', authLimiter, verifyMobileOtp);
router.post('/auth/refresh', authLimiter, refreshTokenUser);

// Batches
router.get('/batches', authenticateToken, getBatches);
router.post('/batches', authenticateToken, validateRequest(createBatchSchema), createBatch);
router.get('/batches/:id', authenticateToken, getBatchDetails);
router.put('/batches/:id', authenticateToken, validateRequest(updateBatchSchema), updateBatch);
router.delete('/batches/:id', authenticateToken, deleteBatch);
router.get('/batches/:id/download', authenticateToken, downloadBatchPDF);
router.get('/batches/:id/qr-pdf', authenticateToken, downloadBatchQRPDF);
router.put('/batches/:id/toggle-registration', authenticateToken, toggleBatchRegistration);
router.put('/batches/:id/end-registration', authenticateToken, endBatchRegistration);
router.post('/batches/:id/installments', authenticateToken, validateRequest(createInstallmentSchema), createFeeInstallment);
router.put('/installments/:id', authenticateToken, updateFeeInstallment);
router.delete('/installments/:id', authenticateToken, deleteFeeInstallment);
router.post('/batches/:id/whatsapp-invite', authenticateToken, bulkNotifyLimiter, sendBatchWhatsappInvite);
router.post('/batches/:id/invite', authenticateToken, inviteStudentToBatch);
router.post('/students/:id/whatsapp-invite', authenticateToken, sendStudentWhatsappInvite);

// Students
router.get('/public/batch/:id', publicLimiter, getBatchPublicStatus); // Public Status
router.post('/public/register', publicLimiter, validateRequest(registerStudentSchema), registerStudent); // Public
router.get('/public/check-status', publicLimiter, checkRegistrationStatus); // Public - Check if registered
router.post('/students/manual', authenticateToken, validateRequest(registerStudentSchema), addStudentManually); // Authenticated Manual Add
router.get('/students/pending', authenticateToken, getPendingStudents);
router.post('/students/:id/approve', authenticateToken, approveStudent);
router.post('/students/:id/reject', authenticateToken, rejectStudent);
router.put('/students/:id', authenticateToken, validateRequest(updateStudentSchema), updateStudent);
router.get('/students/lookup/:humanId', authenticateToken, getStudentByHumanId);
// Students
// Stickers
router.get('/stickers/download', authenticateToken, generateStickerSheet);

// Tests
router.get('/tests', authenticateToken, getTests);
router.post('/tests', authenticateToken, validateRequest(createTestSchema), createTest);
router.post('/tests/generate', authenticateToken, testDocUpload.array('files', 5), generateAITest);
router.post('/tests/generate-single-question', authenticateToken, generateSingleQuestionRoute);
router.post('/tests/generate-variant-question', authenticateToken, generateVariantQuestionRoute);
router.post('/tests/online', authenticateToken, saveOnlineQuiz);
router.get('/tests/online', authenticateToken, getOnlineQuizzes);
router.put('/tests/online/:id', authenticateToken, updateOnlineQuiz);
router.delete('/tests/online/:id', authenticateToken, deleteOnlineQuiz);
router.get('/tests/online/:id/analytics', authenticateToken, getOnlineQuizAnalytics);
router.get('/tests/online/:id/monitor', authenticateToken, getLiveQuizStatus);
router.post('/tests/online/:id/finalize', authenticateToken, bulkNotifyLimiter, finalizeOnlineQuiz);
router.get('/tests/online/:id/report', authenticateToken, downloadOnlineQuizReport);
router.get('/tests/online/:id/questions-pdf', authenticateToken, downloadOnlineQuizQuestionsPdf);
router.get('/tests/online/:id/report-pdf', authenticateToken, downloadOnlineQuizReportPdf);
router.get('/tests/:id', authenticateToken, getTestDetails);
router.put('/tests/:id', authenticateToken, validateRequest(updateTestSchema), updateTest);
router.delete('/tests/:id', authenticateToken, deleteTest);
router.post('/tests/:id/send-results', authenticateToken, bulkNotifyLimiter, sendTestResultsEmail);
router.get('/tests/:id/download', authenticateToken, downloadTestReport);
router.get('/tests/:id/eligible-students', authenticateToken, getTestEligibleStudents);
router.post('/marks', authenticateToken, validateRequest(submitMarkSchema), submitMark);

// Fees
router.get('/fees', authenticateToken, getFeeSummary);
router.get('/fees/summary', authenticateToken, getFeeSummary);
router.get('/fees/download-pending', authenticateToken, downloadPendingFeesReport);
// ✅ HIGH-2 FIX: Rate limiting on payment endpoints
router.post('/fees/pay', authenticateToken, paymentLimiter, validateRequest(paymentSchema), recordPayment);
router.post('/fees/pay-installment', authenticateToken, paymentLimiter, validateRequest(payInstallmentSchema), payInstallment);
router.get('/fees/recent', authenticateToken, getRecentTransactions);
router.get('/fees/download-transactions', authenticateToken, downloadMonthlyReport);
router.post('/fees/remind', authenticateToken, bulkNotifyLimiter, sendFeeReminder);
router.get('/fees/upi-verifications', authenticateToken, getUpiVerifications);
router.post('/fees/upi-verifications/:id/approve', authenticateToken, paymentLimiter, approveUpiVerification);
router.post('/fees/upi-verifications/:id/reject', authenticateToken, paymentLimiter, rejectUpiVerification);
router.get('/fees/custom-invoices', authenticateToken, getCustomInvoices);
router.post('/fees/custom-invoices', authenticateToken, paymentLimiter, validateRequest(createCustomInvoiceSchema), createCustomInvoice);
router.post('/fees/assign', authenticateToken, assignInstallmentToStudent);
router.post('/fees/scan-receipt', authenticateToken, ocrLimiter, upload.single('image'), scanReceipt);

// Stats
router.get('/stats/growth', authenticateToken, getStudentGrowthStats);
router.get('/stats/finance-growth', authenticateToken, getFinancialGrowthStats);
router.get('/stats/class-average', authenticateToken, getClassAverageStats);


// Invites
router.post('/invites', authenticateToken, generateInvite);
router.get('/institutes', authenticateToken, getInstitutes);
router.post('/billing/create', authenticateToken, createBillingSession);
router.post('/billing/verify', authenticateToken, verifyBillingPayment);
router.delete('/billing/cancel', authenticateToken, cancelSubscription);


router.get('/institutes/analytics', authenticateToken, getGlobalAnalytics);
router.put('/institutes/:id/config', authenticateToken, updateInstituteConfig);
router.put('/institutes/:id/details', authenticateToken, updateInstituteDetails);
router.put('/institutes/:id/plan', authenticateToken, updateInstitutePlan);
router.get('/institute/me', authenticateToken, getMyInstitute);
router.put('/institute/me/config', authenticateToken, updateMyInstituteConfig);
router.put('/institute/me/logo', authenticateToken, uploadLogo);
router.get('/institute/:id/details', authenticateToken, getInstituteDetails);
router.put('/institutes/:id/suspend', authenticateToken, suspendInstitute);
router.delete('/institutes/:id', authenticateToken, deleteInstitute);
router.get('/onboarding/leads', authenticateToken, getOnboardingLeads);


router.get('/invites/:token', publicLimiter, validateInvite);
router.post('/auth/setup-account', publicLimiter, setupAccount);

// Onboarding
router.post('/onboarding/lead', publicLimiter, trackLead);
router.post('/onboarding/create-order', publicLimiter, createOrder);
router.post('/onboarding/verify-payment', publicLimiter, verifyPayment);
router.post('/onboarding/start-trial', publicLimiter, startTrial);
router.post('/onboarding/resend-setup-link', publicLimiter, resendSetupLink);

// Admin Onboarding Links (Super Admin custom pricing flow)
router.post('/admin-onboarding/create-link', authenticateToken, createAdminOnboardingLink);
router.get('/admin-onboarding/links', authenticateToken, listAdminOnboardingLinks);
router.get('/admin-onboarding/:token', publicLimiter, getAdminOnboardingLink);
router.post('/admin-onboarding/create-order', publicLimiter, createAdminOnboardingOrder);
router.post('/admin-onboarding/verify-payment', publicLimiter, verifyAdminOnboardingPayment);


export default router;
