import { Router } from 'express';
import { loginAdmin, createInitialAdmin, changePassword, getProfile } from '../controllers/authController';
import { authenticateToken } from '../middleware/auth';
import { authLimiter, publicLimiter, paymentLimiter, ocrLimiter, bulkNotifyLimiter, upiPaymentLimiter } from '../middleware/security';
import { validateRequest } from '../middleware/validation';
import { loginSchema, setupSchema, changePasswordSchema, registerStudentSchema, createBatchSchema, updateBatchSchema, updateStudentSchema, paymentSchema, payInstallmentSchema, submitMarkSchema, createTestSchema, updateTestSchema, createInstallmentSchema, createCustomInvoiceSchema } from '../schemas';
import { createBatch, getBatches, getBatchDetails, downloadBatchPDF, toggleBatchRegistration, createFeeInstallment, updateFeeInstallment, deleteFeeInstallment, getBatchPublicStatus, endBatchRegistration, updateBatch, deleteBatch, sendBatchWhatsappInvite, sendStudentWhatsappInvite, downloadBatchQRPDF, inviteStudentToBatch } from '../controllers/batchController';
import { registerStudent, getPendingStudents, approveStudent, rejectStudent, archiveStudent, updateStudent, addStudentManually, getStudentGrowthStats, getClassAverageStats } from '../controllers/studentController';
import { checkRegistrationStatus } from '../controllers/statusController';
import { generateStickerSheet } from '../controllers/stickerController';
import { createTest, getTests, submitMark, getStudentByHumanId, getTestDetails, updateTest, deleteTest, downloadTestReport, getTestEligibleStudents, sendTestResultsEmail, generateAITest, saveOnlineQuiz, getOnlineQuizzes, finalizeOnlineQuiz, downloadOnlineQuizReport, updateOnlineQuiz, deleteOnlineQuiz, downloadOnlineQuizQuestionsPdf, downloadOnlineQuizReportPdf, generateSingleQuestionRoute, generateVariantQuestionRoute } from '../controllers/testController';
import { getOnlineQuizAnalytics, getLiveQuizStatus } from '../controllers/analyticsController';
import { getFeeSummary, recordPayment, payInstallment, downloadPendingFeesReport, getRecentTransactions, sendFeeReminder, downloadMonthlyReport, getUpiVerifications, approveUpiVerification, rejectUpiVerification, getCustomInvoices, createCustomInvoice, scanReceipt } from '../controllers/feeController';



import { getDashboardSummary, getFinancialGrowthStats } from '../controllers/dashboardController';
import { generateInvite, validateInvite, setupAccount, getInstitutes } from '../controllers/inviteController';
import { createOrder, verifyPayment, trackLead, startTrial, resendSetupLink } from '../controllers/onboardingController';
import { getPaymentHistory } from '../controllers/feeController';
import multer from 'multer';
import { processOCR } from '../utils/ocr';
import { processOCRTextract } from '../utils/ocrTextract';

import { getPublicInstituteProfile, submitPublicLead } from '../controllers/publicController';

const router = Router();

// ================= PUBLIC DOMAIN ROUTES =================
// These routes do NOT require authentication and are used by parents/students.
router.get('/public/i/:slug', publicLimiter, getPublicInstituteProfile as any);
router.post('/public/i/:slug/lead', publicLimiter, submitPublicLead as any);
import { getPublicStudentFees, submitUpiPayment, getPaymentScreenshot } from '../controllers/publicController';
router.get('/public/i/:slug/student-fees', upiPaymentLimiter, getPublicStudentFees as any);
router.get('/public/payment-screenshot/:key', publicLimiter, getPaymentScreenshot as any);
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
router.post('/public/i/:slug/submit-upi', upiPaymentLimiter, upload.single('screenshot'), submitUpiPayment as any);

import crypto from 'crypto';
import { prisma } from '../prisma';

// SECURITY FIX (P1-B): Replace in-memory Map cache with DB-backed deduplication.
//
// The old approach (JS Map) fragmented across multiple server instances (dynos/pods).
// Instance A cached a scan — but Instance B knew nothing about it, so it would re-call
// the Gemini API on the SAME image again. At burst scanning (100 scans/min), this doubled
// AI costs. A compromised teacher could also replay the same image hundreds of times.
//
// The new approach stores the hash + result in Postgres with a 60s TTL. Any server
// instance checks the same source of truth before calling the Gemini API.

const OCR_CACHE_TTL_SECONDS = 60;

async function checkOcrCache(hash: string): Promise<any | null> {
    try {
        const record = await prisma.ocrScanCache.findUnique({
            where: { imageHash: hash }
        });
        if (!record) return null;

        // Check TTL — if expired, treat as a cache miss
        const ageMs = Date.now() - new Date(record.createdAt).getTime();
        if (ageMs > OCR_CACHE_TTL_SECONDS * 1000) {
            return null;
        }

        return record.result;
    } catch {
        // If cache table doesn't exist yet (migration pending), degrade gracefully
        return null;
    }
}

async function setOcrCache(hash: string, result: any): Promise<void> {
    try {
        await prisma.ocrScanCache.upsert({
            where: { imageHash: hash },
            create: { imageHash: hash, result, createdAt: new Date() },
            update: { result, createdAt: new Date() }
        });
    } catch {
        // Non-critical: if cache write fails, OCR still proceeds
    }
}

// Clean up expired cache records every 5 minutes to prevent table bloat
if (process.env.NODE_ENV !== 'test') {
    const ocrCacheCleanupInterval = setInterval(async () => {
        try {
            const cutoff = new Date(Date.now() - OCR_CACHE_TTL_SECONDS * 1000);
            await prisma.ocrScanCache.deleteMany({
                where: { createdAt: { lt: cutoff } }
            });
        } catch (err: any) {
            // Non-critical — OCR works without the cache table.
            // Log in dev to surface migration drift; suppress in prod to avoid Sentry noise.
            if (process.env.NODE_ENV !== 'production') {
                console.warn('[OcrScanCache] TTL cleanup failed (migration pending?):', err?.message);
            }
        }
    }, 5 * 60 * 1000);
    ocrCacheCleanupInterval.unref();
}

// OCR Scan Endpoint
router.post('/scan-ocr', authenticateToken as any, ocrLimiter, upload.single('image'), async (req, res) => {
    try {
        console.log("📥 Received OCR Request", (req as any).user?.username);

        let imageBuffer: Buffer | string | undefined;

        if ((req as any).file) {
            console.log(`📎 File received: ${(req as any).file.originalname} (${(req as any).file.size} bytes)`);
            imageBuffer = (req as any).file.buffer;
        } else if (req.body.image) {
            // Fallback for JSON Base64 (Legacy/Dev)
            console.log("⚠️ Legacy Base64 JSON received");
            imageBuffer = req.body.image;
        }

        if (!imageBuffer) {
            console.error("❌ No image data found in request");
            return res.status(400).json({ error: "Missing image data" });
        }

        // Compute SHA-256 of raw image bytes for deduplication
        const rawBuffer = (req as any).file ? (req as any).file.buffer : Buffer.from(imageBuffer.toString(), 'base64');
        const hash = crypto.createHash('sha256').update(rawBuffer).digest('hex');

        // Check DB-backed cache first (works across all server instances)
        const cached = await checkOcrCache(hash);
        if (cached) {
            console.log("♻️ Duplicate Scan — Returning DB-Cached Result");
            return res.json(cached);
        }

        // DUAL ENGINE: Textract + Gemini run in parallel
        // Parse maxMarks from form data (sent alongside the image)
        const maxMarks = req.body.maxMarks ? parseFloat(req.body.maxMarks) : undefined;
        if (maxMarks) console.log(`📏 MaxMarks constraint: ${maxMarks}`);

        const [geminiResult, textractResult] = await Promise.allSettled([
            processOCR(imageBuffer),
            processOCRTextract(imageBuffer, maxMarks).catch((err: any) => {
                console.warn("⚠️ Textract failed:", err.message);
                return { score: "TEXTRACT_ERROR", confidence: 0, raw: err.message, rawTexts: [] };
            })
        ]);

        const gemini = geminiResult.status === 'fulfilled'
            ? geminiResult.value
            : { score: "GEMINI_ERROR", confidence: 0, raw: (geminiResult as any).reason?.message || "Unknown error" };

        const textract = textractResult.status === 'fulfilled'
            ? textractResult.value
            : { score: "TEXTRACT_ERROR", confidence: 0, raw: (textractResult as any).reason?.message || "Unknown error", rawTexts: [] };

        const match = gemini.score === (textract as any).score;
        console.log(`✅ OCR | Gemini: "${gemini.score}" (${(gemini.confidence * 100).toFixed(0)}%) | Textract: "${(textract as any).score}" (${((textract as any).confidence * 100).toFixed(0)}%) | Match: ${match ? '✅' : '❌'}`);

        const geminiOk = gemini.score && !gemini.score.includes('ERROR');
        const textractOk = (textract as any).score && !(textract as any).score.includes('ERROR');
        let primary: { score: string; confidence: number; raw: string; source: string };

        if (geminiOk && textractOk && match) {
            primary = { score: gemini.score, confidence: Math.min(1, gemini.confidence + 0.1), raw: gemini.raw, source: 'both' };
        } else if (geminiOk) {
            primary = { score: gemini.score, confidence: gemini.confidence, raw: gemini.raw, source: 'gemini' };
        } else if (textractOk) {
            primary = { score: (textract as any).score, confidence: (textract as any).confidence, raw: (textract as any).raw, source: 'textract' };
        } else {
            primary = { score: "ERROR_UNCERTAIN", confidence: 0, raw: "Both engines failed", source: 'none' };
        }

        await setOcrCache(hash, primary);
        res.json({ score: primary.score, confidence: primary.confidence, raw: primary.raw, source: primary.source });



    } catch (error: any) {
        console.error("❌ OCR Proxy Error:", error);
        res.status(500).json({ error: "OCR Processing Failed", details: error.message });
    }
});

// Dashboard (Optimized endpoint)
router.get('/dashboard/summary', authenticateToken as any, getDashboardSummary as any);

// Auth
router.post('/auth/login', authLimiter, validateRequest(loginSchema), loginAdmin as any);
router.post('/auth/setup', authLimiter, validateRequest(setupSchema), createInitialAdmin as any);
router.post('/auth/change-password', authenticateToken as any, validateRequest(changePasswordSchema), changePassword as any);
router.get('/auth/me', authenticateToken as any, getProfile as any);

import { sendMobileOtp, verifyMobileOtp, refreshTokenUser } from '../controllers/authController';
router.post('/auth/send-otp', authLimiter, sendMobileOtp as any);
router.post('/auth/verify-otp', authLimiter, verifyMobileOtp as any);
router.post('/auth/refresh', authLimiter, refreshTokenUser as any);

// Batches
router.get('/batches', authenticateToken as any, getBatches as any);
router.post('/batches', authenticateToken as any, validateRequest(createBatchSchema), createBatch as any);
router.get('/batches/:id', authenticateToken as any, getBatchDetails as any);
router.put('/batches/:id', authenticateToken as any, validateRequest(updateBatchSchema), updateBatch as any);
router.delete('/batches/:id', authenticateToken as any, deleteBatch as any);
router.get('/batches/:id/download', authenticateToken as any, downloadBatchPDF as any);
router.get('/batches/:id/qr-pdf', authenticateToken as any, downloadBatchQRPDF as any);
router.put('/batches/:id/toggle-registration', authenticateToken as any, toggleBatchRegistration as any);
router.put('/batches/:id/end-registration', authenticateToken as any, endBatchRegistration as any);
router.post('/batches/:id/installments', authenticateToken as any, validateRequest(createInstallmentSchema), createFeeInstallment as any);
router.put('/installments/:id', authenticateToken as any, updateFeeInstallment as any);
router.delete('/installments/:id', authenticateToken as any, deleteFeeInstallment as any);
router.post('/batches/:id/whatsapp-invite', authenticateToken as any, bulkNotifyLimiter, sendBatchWhatsappInvite as any);
router.post('/batches/:id/invite', authenticateToken as any, inviteStudentToBatch as any);
router.post('/students/:id/whatsapp-invite', authenticateToken as any, sendStudentWhatsappInvite as any);

// Students
router.get('/public/batch/:id', publicLimiter, getBatchPublicStatus as any); // Public Status
router.post('/public/register', publicLimiter, validateRequest(registerStudentSchema), registerStudent as any); // Public
router.get('/public/check-status', publicLimiter, checkRegistrationStatus as any); // Public - Check if registered
router.post('/students/manual', authenticateToken as any, validateRequest(registerStudentSchema), addStudentManually as any); // Authenticated Manual Add
router.get('/students/pending', authenticateToken as any, getPendingStudents as any);
router.post('/students/:id/approve', authenticateToken as any, approveStudent as any);
router.post('/students/:id/reject', authenticateToken as any, rejectStudent as any);
router.delete('/students/:id/archive', authenticateToken as any, archiveStudent as any);
router.put('/students/:id', authenticateToken as any, validateRequest(updateStudentSchema), updateStudent as any);
router.get('/students/lookup/:humanId', authenticateToken as any, getStudentByHumanId as any);
// Students
// Stickers
router.get('/stickers/download', authenticateToken as any, generateStickerSheet as any);

// Tests
router.get('/tests', authenticateToken as any, getTests as any);
router.post('/tests', authenticateToken as any, validateRequest(createTestSchema), createTest as any);
router.post('/tests/generate', authenticateToken as any, testDocUpload.array('files', 5), generateAITest as any);
router.post('/tests/generate-single-question', authenticateToken as any, generateSingleQuestionRoute as any);
router.post('/tests/generate-variant-question', authenticateToken as any, generateVariantQuestionRoute as any);
router.post('/tests/online', authenticateToken as any, saveOnlineQuiz as any);
router.get('/tests/online', authenticateToken as any, getOnlineQuizzes as any);
router.put('/tests/online/:id', authenticateToken as any, updateOnlineQuiz as any);
router.delete('/tests/online/:id', authenticateToken as any, deleteOnlineQuiz as any);
router.get('/tests/online/:id/analytics', authenticateToken as any, getOnlineQuizAnalytics as any);
router.get('/tests/online/:id/monitor', authenticateToken as any, getLiveQuizStatus as any);
router.post('/tests/online/:id/finalize', authenticateToken as any, bulkNotifyLimiter, finalizeOnlineQuiz as any);
router.get('/tests/online/:id/report', authenticateToken as any, downloadOnlineQuizReport as any);
router.get('/tests/online/:id/questions-pdf', authenticateToken as any, downloadOnlineQuizQuestionsPdf as any);
router.get('/tests/online/:id/report-pdf', authenticateToken as any, downloadOnlineQuizReportPdf as any);
router.get('/tests/:id', authenticateToken as any, getTestDetails as any);
router.put('/tests/:id', authenticateToken as any, validateRequest(updateTestSchema), updateTest as any);
router.delete('/tests/:id', authenticateToken as any, deleteTest as any);
router.post('/tests/:id/send-results', authenticateToken as any, bulkNotifyLimiter, sendTestResultsEmail as any);
router.get('/tests/:id/download', authenticateToken as any, downloadTestReport as any);
router.get('/tests/:id/eligible-students', authenticateToken as any, getTestEligibleStudents as any);
router.post('/marks', authenticateToken as any, validateRequest(submitMarkSchema), submitMark as any);

// Fees
router.get('/fees', authenticateToken as any, getFeeSummary as any);
router.get('/fees/summary', authenticateToken as any, getFeeSummary as any);
router.get('/fees/download-pending', authenticateToken as any, downloadPendingFeesReport as any);
// ✅ HIGH-2 FIX: Rate limiting on payment endpoints
router.post('/fees/pay', authenticateToken as any, paymentLimiter, validateRequest(paymentSchema), recordPayment as any);
router.post('/fees/pay-installment', authenticateToken as any, paymentLimiter, validateRequest(payInstallmentSchema), payInstallment as any);
router.get('/fees/recent', authenticateToken as any, getRecentTransactions as any);
router.get('/fees/download-transactions', authenticateToken as any, downloadMonthlyReport as any);
router.post('/fees/remind', authenticateToken as any, bulkNotifyLimiter, sendFeeReminder as any);
router.get('/fees/upi-verifications', authenticateToken as any, getUpiVerifications as any);
router.post('/fees/upi-verifications/:id/approve', authenticateToken as any, paymentLimiter, approveUpiVerification as any);
router.post('/fees/upi-verifications/:id/reject', authenticateToken as any, paymentLimiter, rejectUpiVerification as any);
router.get('/fees/custom-invoices', authenticateToken as any, getCustomInvoices as any);
router.post('/fees/custom-invoices', authenticateToken as any, paymentLimiter, validateRequest(createCustomInvoiceSchema), createCustomInvoice as any);
router.post('/fees/scan-receipt', authenticateToken as any, ocrLimiter, upload.single('image'), scanReceipt as any);

// Stats
router.get('/stats/growth', authenticateToken as any, getStudentGrowthStats as any);
router.get('/stats/finance-growth', authenticateToken as any, getFinancialGrowthStats as any);
router.get('/stats/class-average', authenticateToken as any, getClassAverageStats as any);


// Invites
router.post('/invites', authenticateToken as any, generateInvite as any);
router.get('/institutes', authenticateToken as any, getInstitutes as any);
import { createBillingSession, verifyBillingPayment, cancelSubscription } from '../controllers/billingController';
router.post('/billing/create', authenticateToken as any, createBillingSession as any);
router.post('/billing/verify', authenticateToken as any, verifyBillingPayment as any);
router.delete('/billing/cancel', authenticateToken as any, cancelSubscription as any);

import { getGlobalAnalytics, updateInstituteConfig, updateInstituteDetails, updateInstitutePlan, getInstituteDetails, suspendInstitute, deleteInstitute, getMyInstitute, uploadLogo } from '../controllers/instituteController';

router.get('/institutes/analytics', authenticateToken as any, getGlobalAnalytics as any);
router.put('/institutes/:id/config', authenticateToken as any, updateInstituteConfig as any);
router.put('/institutes/:id/details', authenticateToken as any, updateInstituteDetails as any);
router.put('/institutes/:id/plan', authenticateToken as any, updateInstitutePlan as any);
router.get('/institute/me', authenticateToken as any, getMyInstitute as any);
router.put('/institute/me/logo', authenticateToken as any, uploadLogo as any);
router.get('/institute/:id/details', authenticateToken as any, getInstituteDetails as any);
router.put('/institutes/:id/suspend', authenticateToken as any, suspendInstitute as any);
router.delete('/institutes/:id', authenticateToken as any, deleteInstitute as any);
import { getOnboardingLeads } from '../controllers/instituteController';
router.get('/onboarding/leads', authenticateToken as any, getOnboardingLeads as any);


router.get('/invites/:token', publicLimiter, validateInvite as any);
router.post('/auth/setup-account', publicLimiter, setupAccount as any);

// Onboarding
router.post('/onboarding/lead', publicLimiter, trackLead as any);
router.post('/onboarding/create-order', publicLimiter, createOrder as any);
router.post('/onboarding/verify-payment', publicLimiter, verifyPayment as any);
router.post('/onboarding/start-trial', publicLimiter, startTrial as any);
router.post('/onboarding/resend-setup-link', publicLimiter, resendSetupLink as any);

// Admin Onboarding Links (Super Admin custom pricing flow)
import { createAdminOnboardingLink, getAdminOnboardingLink, createAdminOnboardingOrder, verifyAdminOnboardingPayment, listAdminOnboardingLinks } from '../controllers/adminOnboardingController';
router.post('/admin-onboarding/create-link', authenticateToken as any, createAdminOnboardingLink as any);
router.get('/admin-onboarding/links', authenticateToken as any, listAdminOnboardingLinks as any);
router.get('/admin-onboarding/:token', publicLimiter, getAdminOnboardingLink as any);
router.post('/admin-onboarding/create-order', publicLimiter, createAdminOnboardingOrder as any);
router.post('/admin-onboarding/verify-payment', publicLimiter, verifyAdminOnboardingPayment as any);


export default router;
