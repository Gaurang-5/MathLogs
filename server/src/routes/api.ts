import { submitMarksBatch } from '../controllers/marksBatchController';
import { Router } from 'express';
import { loginAdmin, createInitialAdmin, changePassword, getProfile } from '../controllers/authController';
import { authenticateToken } from '../middleware/auth';
import { requireCoachingFeeMode } from '../middleware/requireCoachingFeeMode';
import { authLimiter, publicLimiter, paymentLimiter, ocrLimiter, bulkNotifyLimiter, upiPaymentLimiter } from '../middleware/security';
import { validateRequest } from '../middleware/validation';
import { assignFeeSchema, changePasswordSchema, confirmMonthCoverageProfileSchema, createBatchSchema, createCustomInvoiceSchema, createEnrollmentSchema, createInstallmentSchema, createMonthCoveragePaymentSchema, createTestSchema, deleteEmptyStudentSchema, endEnrollmentSchema, inviteStudentEnrollmentSchema, loginSchema, payInstallmentSchema, paymentSchema, previewEnrollmentSchema, previewMonthCoveragePaymentSchema, registerStudentSchema, resendEnrollmentNotificationSchema, resolveIdentityReviewSchema, retryEnrollmentNotificationSchema, sendMonthCoverageReminderSchema, setupAccountSchema, setupSchema, submitMarkSchema, submitMarksBatchSchema, updateBatchSchema, updateMonthCoveragePaymentSchema, updateStudentSchema, updateTestSchema, voidMonthCoveragePaymentSchema } from '../schemas';
import { createBatch, createFeeInstallment, deleteBatch, deleteFeeInstallment, downloadBatchPDF, downloadBatchQRPDF, endBatchRegistration, getBatchDetails, getBatchPublicStatus, getBatches, inviteStudentToBatch, sendBatchWhatsappInvite, sendStudentWhatsappInvite, toggleBatchRegistration, updateBatch, updateFeeInstallment } from '../controllers/batchController';
import { addStudentManually, approveStudent, archiveStudent, confirmMonthCoverageProfileController, getClassAverageStats, getPendingStudents, getStudentGrowthStats, getStudentProfile, registerStudent, rejectStudent, searchStudents, updateStudent } from '../controllers/studentController';
import { checkRegistrationStatus } from '../controllers/statusController';
import { generateStickerSheet } from '../controllers/stickerController';
import { createTest, getTests, submitMark, getStudentByHumanId, getStudentsByHumanIds, getTestDetails, updateTest, deleteTest, downloadTestReport, getTestEligibleStudents, sendTestResultsEmail, generateAITest, saveOnlineQuiz, getOnlineQuizzes, finalizeOnlineQuiz, downloadOnlineQuizReport, updateOnlineQuiz, deleteOnlineQuiz, downloadOnlineQuizQuestionsPdf, downloadOnlineQuizReportPdf, generateSingleQuestionRoute, generateVariantQuestionRoute, getAITestJobStatus } from '../controllers/testController';
import { getOnlineQuizAnalytics, getLiveQuizStatus, unlockQuizSubmission } from '../controllers/analyticsController';
import { getStudentPaymentOptions, assignFeeInstallment, getFeeSummary, recordPayment, payInstallment, downloadPendingFeesReport, getRecentTransactions, sendFeeReminder, downloadMonthlyReport, getUpiVerifications, approveUpiVerification, rejectUpiVerification, getCustomInvoices, createCustomInvoice, scanReceipt, getFeeInstallmentsList, getPaymentHistory } from '../controllers/feeController';
import { getDashboardSummary, getFinancialGrowthStats, getInstallmentGrowthStats } from '../controllers/dashboardController';
import { validateInvite, setupAccount } from '../controllers/inviteController';
import { createOrder, verifyPayment, trackLead, startTrial, resendSetupLink } from '../controllers/onboardingController';
import multer from 'multer';
import { processOCR } from '../utils/ocr';
import { processMultiStickerOCR } from '../utils/multiStickerOcr';
import { buildGeminiOcrResult } from '../utils/ocrResult';
import { readOcrCacheFast } from '../utils/ocrTiming';
import { secureLogger } from '../utils/secureLogger';
import { ensureStickerResearchCapture, recordStickerResearchOcrAttempt } from '../services/stickerResearchService';
import { createStickerResearchCapture, patchStickerResearchGeometry, updateStickerResearchOutcome } from '../controllers/stickerResearchController';

import { getPublicInstituteProfile, submitPublicLead } from '../controllers/publicController';
import superAdminRoutes from './superAdminRoutes';
import { createInstituteTicket, downloadSupportAttachment, getInstituteTicket, listInstituteTickets, replyInstituteTicket, uploadInstituteAttachments } from '../controllers/superAdminSupportController';
import { getOwnPreference, updateOwnPreference } from '../controllers/superAdminCommunicationController';
import { parseSupportAttachments } from '../middleware/supportUpload';
import { requireSupportFeature } from '../middleware/supportFeatureGate';
import { getPublicPlanCatalogue } from '../controllers/planCatalogController';
import { monthCoverageHandlers } from '../controllers/monthCoverageController';
import { deleteEmptyStudentController, endEnrollmentController, enrollExistingStudentController, getDeletionEligibilityController, previewEnrollmentFeesController, resendEnrollmentNotificationController, retryEnrollmentNotificationController, searchEnrollmentCandidatesController } from '../controllers/enrollmentController';
import { listIdentityReviews, resolveIdentityReview } from '../controllers/identityReviewController';

const router = Router();
const requireCurrentDueFeeMode = requireCoachingFeeMode('CURRENT_DUE_BASED');
const requireMonthCoverageFeeMode = requireCoachingFeeMode('MONTH_COVERAGE');
router.get('/plans', publicLimiter, getPublicPlanCatalogue as any);
router.use('/super-admin', superAdminRoutes);
router.use('/support', requireSupportFeature);
router.post('/support/tickets', authenticateToken as any, createInstituteTicket as any);
router.get('/support/tickets', authenticateToken as any, listInstituteTickets as any);
router.get('/support/tickets/:id', authenticateToken as any, getInstituteTicket as any);
router.post('/support/tickets/:id/messages', authenticateToken as any, replyInstituteTicket as any);
router.post('/support/tickets/:id/attachments', authenticateToken as any, parseSupportAttachments as any, uploadInstituteAttachments as any);
router.get('/support/attachments/:id', authenticateToken as any, downloadSupportAttachment as any);
router.get('/communication-preferences', authenticateToken as any, getOwnPreference as any);
router.patch('/communication-preferences', authenticateToken as any, updateOwnPreference as any);

const legacySuperAdminRouteRemoved = (_req: any, res: any) =>
    res.status(404).json({ success: false, error: 'LEGACY_SUPERADMIN_ROUTE_REMOVED' });

router.get('/institutes', legacySuperAdminRouteRemoved);
router.get('/institutes/analytics', legacySuperAdminRouteRemoved);
router.post('/institutes/bulk-import', legacySuperAdminRouteRemoved);
router.put('/institutes/:id/plan', legacySuperAdminRouteRemoved);
router.put('/institutes/:id/config', legacySuperAdminRouteRemoved);
router.put('/institutes/:id/details', legacySuperAdminRouteRemoved);
router.put('/institutes/:id/suspend', legacySuperAdminRouteRemoved);
router.patch('/institutes/:id/toggle-listing', legacySuperAdminRouteRemoved);
router.get('/onboarding/leads', legacySuperAdminRouteRemoved);
router.post('/admin-onboarding/create-link', legacySuperAdminRouteRemoved);
router.get('/admin-onboarding/links', legacySuperAdminRouteRemoved);

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

// Original camera photos can exceed the general 5 MB upload limit.
// Keep base64 inline requests below Gemini's 20 MB request budget (14 MB raw).
const ocrUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 14 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, callback) => {
        if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) callback(null, true);
        else callback(new Error('Only JPEG, PNG and WebP photos are supported.'));
    },
});

const stickerResearchUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 30 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, callback) => {
        if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) callback(null, true);
        else callback(new Error('Only JPEG, PNG and WebP photos are supported.'));
    },
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
router.post('/sticker-research/captures', authenticateToken as any, stickerResearchUpload.single('image'), createStickerResearchCapture as any);
router.patch('/sticker-research/captures/:id/geometry', authenticateToken as any, patchStickerResearchGeometry as any);
router.post('/sticker-research/captures/:id/outcome', authenticateToken as any, updateStickerResearchOutcome as any);
router.post('/scan-ocr', (req, res, next) => {
    const started = Date.now();
    res.locals.scanPhase = 'authenticating';
    secureLogger.info('Sticker request arrived', { requestId: req.correlationId, bytes: Number(req.headers['content-length']) || undefined });
    res.once('close', () => secureLogger.info('Sticker request closed', {
        requestId: req.correlationId, phase: res.locals.scanPhase, received: req.complete,
        responded: res.writableEnded, status: res.statusCode, elapsedMs: Date.now() - started,
    }));
    next();
}, authenticateToken as any, ocrLimiter, (req, res, next) => {
    res.locals.scanPhase = 'receiving_photo';
    ocrUpload.single('image')(req, res, error => {
        if (error) {
            res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'Photo exceeds the 14 MB upload limit.' : error.message });
            return;
        }
        res.locals.scanPhase = 'authorizing_test';
        next();
    });
}, async (req, res) => {
    try {
        let imageBuffer: Buffer | string | undefined;

        if ((req as any).file) {
            imageBuffer = (req as any).file.buffer;
        } else if (req.body.image) {
            // Fallback for JSON Base64 (Legacy/Dev)
            secureLogger.debug('Legacy base64 OCR payload received');
            imageBuffer = req.body.image;
        }

        if (!imageBuffer) {
            return res.status(400).json({ error: "Missing image data" });
        }

        // Compute SHA-256 of raw image bytes for deduplication
        const rawBuffer = (req as any).file ? (req as any).file.buffer : Buffer.from(imageBuffer.toString().replace(/^data:image\/[^;]+;base64,/, ''), 'base64');
        const test = typeof req.body.testId === 'string' ? await prisma.test.findFirst({ where: { id: req.body.testId, instituteId: req.user.instituteId, teacherId: req.user.id } }) : null;
        if (!test) return res.status(403).json({ error: 'Select an authorized test before scanning.' });
        const researchCaptureId = await ensureStickerResearchCapture({
            id: req.body.researchCaptureId, instituteId: req.user.instituteId, teacherId: req.user.id, teacherName: req.user.username,
            test, image: rawBuffer, contentType: req.file?.mimetype || 'image/jpeg', captureSource: req.body.captureSource,
            clientPlatform: req.body.clientPlatform,
        });
        res.locals.scanPhase = 'reading_marks';
        if (req.body.mode === 'multiple') {
            if (!req.file) return res.status(400).json({ error: 'Upload the original photo.' });
            let targets: {x:number;y:number}[] | undefined;
            if(req.body.targets !== undefined){
                try { targets=JSON.parse(req.body.targets); } catch { return res.status(400).json({error:'Invalid QR positions.'}); }
                if(!Array.isArray(targets)||targets.length<1||targets.length>10||targets.some(p=>!p||typeof p.x!=='number'||typeof p.y!=='number'||!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>1000||p.y<0||p.y>1000)) return res.status(400).json({error:'Invalid QR positions.'});
            }
            const progress = req.body.progress === '1';
            if (progress) {
                // Acknowledge receipt at the origin, not merely the proxy edge.
                res.status(200).set({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store, no-transform', 'X-OCR-Stage': 'reading' });
                res.flushHeaders();
                res.write(' ');
            }
            const started = Date.now();
            secureLogger.info('Multi-sticker OCR received', { bytes: req.file.size, mime: req.file.mimetype });
            const controller = new AbortController();
            const disconnected = () => { if (!res.writableEnded) controller.abort(); };
            res.once('close', disconnected);
            try {
                const result = await processMultiStickerOCR(req.file.buffer, req.file.mimetype, test.maxMarks, { signal: controller.signal, targets });
                secureLogger.info('Multi-sticker OCR completed', { count: result.stickers.length, reason: result.reason, elapsedMs: Date.now() - started });
                if (!controller.signal.aborted) {
                    await recordStickerResearchOcrAttempt({ captureId: researchCaptureId, teacherId: req.user.id, mode: 'multiple', targets,
                        image: req.file.buffer, contentType: req.file.mimetype, result, status: result.reason ? 'error' : 'read', reason: result.reason,
                        elapsedMs: Date.now() - started });
                    const response = { ...result, researchCaptureId };
                    if (progress) res.end(JSON.stringify(response)); else res.json(response);
                }
            } finally { res.off('close', disconnected); }
            return;
        }
        const hash = crypto.createHash('sha256').update(`sticker-single-box-v5-gemini35-38:${req.user.instituteId}:${test.id}:${test.maxMarks}:`).update(rawBuffer).digest('hex');

        // Check DB-backed cache first (works across all server instances)
        const started = Date.now();
        secureLogger.info('Sticker OCR received', { bytes: rawBuffer.length, mime: req.file?.mimetype });
        const cached = await readOcrCacheFast(() => checkOcrCache(hash));
        if (cached) {
            await recordStickerResearchOcrAttempt({ captureId: researchCaptureId, teacherId: req.user.id, mode: 'single', targets: undefined,
                image: rawBuffer, contentType: req.file?.mimetype || 'image/jpeg', result: cached, status: cached.status || 'unknown', reason: cached.reason,
                elapsedMs: Date.now() - started, cacheHit: true });
            return res.json({ ...cached, researchCaptureId });
        }

        const controller = new AbortController();
        const disconnected = () => { if (!res.writableEnded) controller.abort(); };
        res.once('close', disconnected);
        const gemini = await processOCR(imageBuffer, req.file?.mimetype, { signal: controller.signal, maxMarks: test.maxMarks }).catch((error: any) => ({
            score: 'GEMINI_ERROR',
            raw: '',
            reason: 'provider_error' as const,
        }));
        res.off('close', disconnected);
        if (controller.signal.aborted) return;
        const primary = buildGeminiOcrResult(gemini);
        secureLogger.info('Sticker OCR completed', { status: primary.status, reason: primary.reason, elapsedMs: Date.now() - started });

        if (primary.status === 'read') void setOcrCache(hash, primary);
        await recordStickerResearchOcrAttempt({ captureId: researchCaptureId, teacherId: req.user.id, mode: 'single', targets: undefined,
            image: rawBuffer, contentType: req.file?.mimetype || 'image/jpeg', result: primary, status: primary.status, reason: primary.reason,
            elapsedMs: Date.now() - started });
        res.json({ ...primary, researchCaptureId });



    } catch (error: any) {
        if (res.headersSent) { if (!res.writableEnded) res.end(JSON.stringify({ stickers: [], reason: 'provider_error' })); return; }
        console.error("❌ OCR Proxy Error:", error);
        res.status(500).json({ error: "OCR Processing Failed", details: error.message });
    }
});

// Dashboard (Optimized endpoint)
router.get('/dashboard/summary', authenticateToken as any, getDashboardSummary as any);
router.get('/dashboard/installment-stats', authenticateToken as any, getInstallmentGrowthStats as any);

// Auth
router.post('/auth/login', authLimiter, validateRequest(loginSchema), loginAdmin as any);
router.post('/auth/setup', authLimiter, validateRequest(setupSchema), createInitialAdmin as any);
router.post('/auth/change-password', authenticateToken as any, validateRequest(changePasswordSchema), changePassword as any);
router.get('/auth/me', authenticateToken as any, getProfile as any);

import { sendMobileOtp, verifyMobileOtp, refreshTokenUser, logoutUser, selectMobileAccount, sendSignupOtp, verifySignupOtp } from '../controllers/authController';
router.post('/auth/send-otp', authLimiter, sendMobileOtp as any);
router.post('/auth/send-mobile-otp', authLimiter, sendMobileOtp as any);
router.post('/auth/verify-otp', authLimiter, verifyMobileOtp as any);
router.post('/auth/verify-mobile-otp', authLimiter, verifyMobileOtp as any);
router.post('/auth/select-account', authLimiter, selectMobileAccount as any);
router.post('/auth/refresh', authLimiter, refreshTokenUser as any);
router.post('/auth/logout', authenticateToken as any, logoutUser as any);
router.post('/auth/send-signup-otp', authLimiter, sendSignupOtp as any);
router.post('/auth/verify-signup-otp', authLimiter, verifySignupOtp as any);

// Batches
router.get('/batches/:batchId/enrollment-candidates', authenticateToken as any, searchEnrollmentCandidatesController as any);
router.post('/batches/:batchId/enrollments/preview', authenticateToken as any, validateRequest(previewEnrollmentSchema), previewEnrollmentFeesController as any);
router.post('/batches/:batchId/enrollments', authenticateToken as any, validateRequest(createEnrollmentSchema), enrollExistingStudentController as any);
router.delete('/batches/:batchId/enrollments/:enrollmentId', authenticateToken as any, validateRequest(endEnrollmentSchema), endEnrollmentController as any);
router.post('/enrollments/:enrollmentId/notification/retry', authenticateToken as any, validateRequest(retryEnrollmentNotificationSchema), retryEnrollmentNotificationController as any);
router.post('/enrollments/:enrollmentId/notification/resend', authenticateToken as any, validateRequest(resendEnrollmentNotificationSchema), resendEnrollmentNotificationController as any);
router.get('/batches', authenticateToken as any, getBatches as any);
router.post('/batches', authenticateToken as any, validateRequest(createBatchSchema), createBatch as any);
router.get('/batches/:id', authenticateToken as any, getBatchDetails as any);
router.put('/batches/:id', authenticateToken as any, validateRequest(updateBatchSchema), updateBatch as any);
router.delete('/batches/:id', authenticateToken as any, deleteBatch as any);
router.get('/batches/:id/download', authenticateToken as any, downloadBatchPDF as any);
router.get('/batches/:id/qr-pdf', authenticateToken as any, downloadBatchQRPDF as any);
router.put('/batches/:id/toggle-registration', authenticateToken as any, toggleBatchRegistration as any);
router.put('/batches/:id/end-registration', authenticateToken as any, endBatchRegistration as any);
router.post('/batches/:id/installments', authenticateToken as any, requireCurrentDueFeeMode as any, validateRequest(createInstallmentSchema), createFeeInstallment as any);
router.put('/installments/:id', authenticateToken as any, requireCurrentDueFeeMode as any, updateFeeInstallment as any);
router.delete('/installments/:id', authenticateToken as any, requireCurrentDueFeeMode as any, deleteFeeInstallment as any);
router.post('/batches/:id/whatsapp-invite', authenticateToken as any, bulkNotifyLimiter, sendBatchWhatsappInvite as any);
router.post('/batches/:id/invite', authenticateToken as any, validateRequest(inviteStudentEnrollmentSchema), inviteStudentToBatch as any);
router.post('/students/:id/whatsapp-invite', authenticateToken as any, sendStudentWhatsappInvite as any);

// Students
router.get('/students/:studentId/deletion-eligibility', authenticateToken as any, getDeletionEligibilityController as any);
router.delete('/students/:studentId/permanent', authenticateToken as any, validateRequest(deleteEmptyStudentSchema), deleteEmptyStudentController as any);
router.get('/public/batch/:id', publicLimiter, getBatchPublicStatus as any); // Public Status
router.post('/public/register', publicLimiter, validateRequest(registerStudentSchema), registerStudent as any); // Public
router.get('/public/check-status', publicLimiter, checkRegistrationStatus as any); // Public - Check if registered
router.post('/students/manual', authenticateToken as any, validateRequest(registerStudentSchema), addStudentManually as any); // Authenticated Manual Add
router.get('/students/search', authenticateToken as any, searchStudents as any);
router.get('/students/pending', authenticateToken as any, getPendingStudents as any);
router.post('/students/:id/approve', authenticateToken as any, approveStudent as any);
router.post('/students/:id/reject', authenticateToken as any, rejectStudent as any);
router.delete('/students/:id/archive', authenticateToken as any, archiveStudent as any);
router.put('/students/:id', authenticateToken as any, validateRequest(updateStudentSchema), updateStudent as any);
router.get('/identity-reviews', authenticateToken as any, listIdentityReviews as any);
router.post('/identity-reviews/:id/resolve', authenticateToken as any, validateRequest(resolveIdentityReviewSchema), resolveIdentityReview as any);
router.post('/students/lookup-many', authenticateToken as any, getStudentsByHumanIds as any);
router.get('/students/lookup/:humanId', authenticateToken as any, getStudentByHumanId as any);
router.get('/students/:id/profile', authenticateToken as any, getStudentProfile as any);
router.put('/month-coverage/students/:studentId/profile', authenticateToken as any, requireMonthCoverageFeeMode as any, validateRequest(confirmMonthCoverageProfileSchema), confirmMonthCoverageProfileController as any);
// Students
// Stickers
router.get('/stickers/download', authenticateToken as any, generateStickerSheet as any);

// Tests
router.get('/tests', authenticateToken as any, getTests as any);
router.post('/tests', authenticateToken as any, validateRequest(createTestSchema), createTest as any);
router.post('/tests/generate', authenticateToken as any, testDocUpload.array('files', 5), generateAITest as any);
router.post('/tests/generate-single-question', authenticateToken as any, generateSingleQuestionRoute as any);
router.post('/tests/generate-variant-question', authenticateToken as any, generateVariantQuestionRoute as any);
router.get('/tests/generate/status/:jobId', authenticateToken as any, getAITestJobStatus as any);
router.post('/tests/online', authenticateToken as any, saveOnlineQuiz as any);
router.get('/tests/online', authenticateToken as any, getOnlineQuizzes as any);
router.put('/tests/online/:id', authenticateToken as any, updateOnlineQuiz as any);
router.delete('/tests/online/:id', authenticateToken as any, deleteOnlineQuiz as any);
router.get('/tests/online/:id/analytics', authenticateToken as any, getOnlineQuizAnalytics as any);
router.get('/tests/online/:id/monitor', authenticateToken as any, getLiveQuizStatus as any);
router.post('/tests/online/:id/submissions/:submissionId/unlock', authenticateToken as any, unlockQuizSubmission as any);
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
router.post('/marks/batch', authenticateToken as any, validateRequest(submitMarksBatchSchema), submitMarksBatch as any);
router.post('/marks', authenticateToken as any, validateRequest(submitMarkSchema), submitMark as any);

// Fees
router.get('/month-coverage/summary', authenticateToken as any, requireMonthCoverageFeeMode as any, monthCoverageHandlers.summary as any);
router.get('/month-coverage/payments/recent', authenticateToken as any, requireMonthCoverageFeeMode as any, monthCoverageHandlers.recentPayments as any);
router.post('/month-coverage/payments/preview', authenticateToken as any, requireMonthCoverageFeeMode as any, validateRequest(previewMonthCoveragePaymentSchema), monthCoverageHandlers.previewPayment as any);
router.post('/month-coverage/payments', authenticateToken as any, requireMonthCoverageFeeMode as any, paymentLimiter, validateRequest(createMonthCoveragePaymentSchema), monthCoverageHandlers.createPayment as any);
router.put('/month-coverage/payments/:paymentId', authenticateToken as any, requireMonthCoverageFeeMode as any, paymentLimiter, validateRequest(updateMonthCoveragePaymentSchema), monthCoverageHandlers.updatePayment as any);
router.get('/month-coverage/payments/:paymentId/void-preview', authenticateToken as any, requireMonthCoverageFeeMode as any, monthCoverageHandlers.voidPreview as any);
router.delete('/month-coverage/payments/:paymentId', authenticateToken as any, requireMonthCoverageFeeMode as any, paymentLimiter, validateRequest(voidMonthCoveragePaymentSchema), monthCoverageHandlers.voidPayment as any);
router.post('/month-coverage/scan-receipt', authenticateToken as any, requireMonthCoverageFeeMode as any, ocrLimiter, upload.single('image'), scanReceipt as any);
router.post('/month-coverage/reminders', authenticateToken as any, requireMonthCoverageFeeMode as any, bulkNotifyLimiter, validateRequest(sendMonthCoverageReminderSchema), monthCoverageHandlers.sendReminders as any);
router.get('/month-coverage/reports/pending', authenticateToken as any, requireMonthCoverageFeeMode as any, monthCoverageHandlers.pendingReport as any);
router.get('/month-coverage/reports/transactions', authenticateToken as any, requireMonthCoverageFeeMode as any, monthCoverageHandlers.transactionReport as any);
router.get('/fees', authenticateToken as any, requireCurrentDueFeeMode as any, getFeeSummary as any);
router.get('/fees/summary', authenticateToken as any, requireCurrentDueFeeMode as any, getFeeSummary as any);
router.get('/fees/installments-list', authenticateToken as any, requireCurrentDueFeeMode as any, getFeeInstallmentsList as any);
router.get('/fees/download-pending', authenticateToken as any, requireCurrentDueFeeMode as any, downloadPendingFeesReport as any);
// ✅ HIGH-2 FIX: Rate limiting on payment endpoints
router.get('/fees/students/:id/payment-options', authenticateToken as any, requireCurrentDueFeeMode as any, getStudentPaymentOptions as any);
router.post('/fees/pay', authenticateToken as any, requireCurrentDueFeeMode as any, paymentLimiter, validateRequest(paymentSchema), recordPayment as any);
router.post('/fees/pay-installment', authenticateToken as any, requireCurrentDueFeeMode as any, paymentLimiter, validateRequest(payInstallmentSchema), payInstallment as any);
router.get('/fees/recent', authenticateToken as any, requireCurrentDueFeeMode as any, getRecentTransactions as any);
router.get('/fees/download-transactions', authenticateToken as any, requireCurrentDueFeeMode as any, downloadMonthlyReport as any);
router.post('/fees/remind', authenticateToken as any, requireCurrentDueFeeMode as any, bulkNotifyLimiter, sendFeeReminder as any);
router.get('/fees/upi-verifications', authenticateToken as any, requireCurrentDueFeeMode as any, getUpiVerifications as any);
router.post('/fees/upi-verifications/:id/approve', authenticateToken as any, requireCurrentDueFeeMode as any, paymentLimiter, approveUpiVerification as any);
router.post('/fees/upi-verifications/:id/reject', authenticateToken as any, requireCurrentDueFeeMode as any, paymentLimiter, rejectUpiVerification as any);
router.get('/fees/custom-invoices', authenticateToken as any, requireCurrentDueFeeMode as any, getCustomInvoices as any);
router.post('/fees/assign', authenticateToken as any, requireCurrentDueFeeMode as any, paymentLimiter, validateRequest(assignFeeSchema), assignFeeInstallment as any);
router.post('/fees/custom-invoices', authenticateToken as any, requireCurrentDueFeeMode as any, paymentLimiter, validateRequest(createCustomInvoiceSchema), createCustomInvoice as any);
router.post('/fees/scan-receipt', authenticateToken as any, requireCurrentDueFeeMode as any, ocrLimiter, upload.single('image'), scanReceipt as any);

// Stats
router.get('/stats/growth', authenticateToken as any, getStudentGrowthStats as any);
router.get('/stats/finance-growth', authenticateToken as any, getFinancialGrowthStats as any);
router.get('/stats/class-average', authenticateToken as any, getClassAverageStats as any);


import { createBillingSession, verifyBillingPayment, cancelSubscription, getBillingSubscription } from '../controllers/billingController';
router.post('/billing/create', authenticateToken as any, createBillingSession as any);
router.post('/billing/verify', authenticateToken as any, verifyBillingPayment as any);
router.get('/billing/subscription', authenticateToken as any, getBillingSubscription as any);
router.delete('/billing/cancel', authenticateToken as any, cancelSubscription as any);

import { getMyInstitute, uploadLogo, updateMyInstituteConfig } from '../controllers/instituteController';


router.get('/institute/me', authenticateToken as any, getMyInstitute as any);
router.put('/institute/me/config', authenticateToken as any, updateMyInstituteConfig as any);
router.put('/institute/me/logo', authenticateToken as any, uploadLogo as any);


router.get('/invites/:token', publicLimiter, validateInvite as any);
router.post('/auth/setup-account', publicLimiter, validateRequest(setupAccountSchema), setupAccount as any);

// Onboarding
router.post('/onboarding/send-phone-otp', publicLimiter, sendSignupOtp as any);
router.post('/onboarding/verify-phone-otp', publicLimiter, verifySignupOtp as any);
router.post('/onboarding/lead', publicLimiter, trackLead as any);
router.post('/onboarding/create-order', publicLimiter, createOrder as any);
router.post('/onboarding/verify-payment', publicLimiter, verifyPayment as any);
router.post('/onboarding/start-trial', publicLimiter, startTrial as any);
router.post('/onboarding/resend-setup-link', publicLimiter, resendSetupLink as any);

// Admin Onboarding Links (Super Admin custom pricing flow)
import { getAdminOnboardingLink, createAdminOnboardingOrder, verifyAdminOnboardingPayment } from '../controllers/adminOnboardingController';
router.get('/admin-onboarding/:token', publicLimiter, getAdminOnboardingLink as any);
router.post('/admin-onboarding/create-order', publicLimiter, createAdminOnboardingOrder as any);
router.post('/admin-onboarding/verify-payment', publicLimiter, verifyAdminOnboardingPayment as any);


export default router;
