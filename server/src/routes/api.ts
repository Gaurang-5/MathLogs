import { Router } from 'express';
import { loginAdmin, createInitialAdmin, changePassword, getProfile } from '../controllers/authController';
import { authenticateToken } from '../middleware/auth';
import { authLimiter, publicLimiter, paymentLimiter, ocrLimiter } from '../middleware/security';
import { validateRequest } from '../middleware/validation';
import { loginSchema, setupSchema, changePasswordSchema, registerStudentSchema, createBatchSchema, updateBatchSchema, updateStudentSchema, paymentSchema, payInstallmentSchema, submitMarkSchema, createTestSchema, updateTestSchema, createAcademicYearSchema, createInstallmentSchema } from '../schemas';
import { createBatch, getBatches, getBatchDetails, downloadBatchPDF, toggleBatchRegistration, createFeeInstallment, getBatchPublicStatus, endBatchRegistration, updateBatch, deleteBatch, sendBatchWhatsappInvite, sendStudentWhatsappInvite, downloadBatchQRPDF } from '../controllers/batchController';
import { registerStudent, getPendingStudents, approveStudent, rejectStudent, updateStudent, addStudentManually, getStudentGrowthStats } from '../controllers/studentController';
import { checkRegistrationStatus } from '../controllers/statusController';
import { generateStickerSheet } from '../controllers/stickerController';
import { createTest, getTests, submitMark, getStudentByHumanId, getTestDetails, updateTest, deleteTest, downloadTestReport, getTestEligibleStudents, sendTestResultsEmail } from '../controllers/testController';
import { getFeeSummary, recordPayment, payInstallment, downloadPendingFeesReport, getRecentTransactions, sendFeeReminder, downloadMonthlyReport } from '../controllers/feeController';
import { listAcademicYears, createAcademicYear, switchAcademicYear, backupAcademicYear, deleteAcademicYear } from '../controllers/academicYearController';

import { getDashboardSummary } from '../controllers/dashboardController';
import { generateInvite, validateInvite, setupAccount, getInstitutes } from '../controllers/inviteController';
import { getPaymentHistory } from '../controllers/feeController';
import multer from 'multer';
import { processOCR } from '../utils/ocr';

const router = Router();

// Configure multer for memory storage
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
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
setInterval(async () => {
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

        const result = await processOCR(imageBuffer);

        // Store in DB cache for cross-instance deduplication
        await setOcrCache(hash, result);

        console.log("✅ OCR Success:", result);
        res.json(result);

    } catch (error: any) {
        console.error("❌ OCR Proxy Error:", error);
        res.status(500).json({ error: "OCR Processing Failed", details: error.message });
    }
});

// Dashboard (Optimized endpoint)
router.get('/dashboard/summary', authenticateToken as any, getDashboardSummary as any);

// Academic Year
router.get('/academic-years', authenticateToken as any, listAcademicYears as any);
router.post('/academic-years', authenticateToken as any, validateRequest(createAcademicYearSchema), createAcademicYear as any);
router.post('/academic-years/switch', authenticateToken as any, switchAcademicYear as any);
router.get('/academic-years/:id/backup', authenticateToken as any, backupAcademicYear as any);
router.delete('/academic-years/:id', authenticateToken as any, deleteAcademicYear as any);

// Auth
router.post('/auth/login', authLimiter, validateRequest(loginSchema), loginAdmin as any);
router.post('/auth/setup', authLimiter, validateRequest(setupSchema), createInitialAdmin as any);
router.post('/auth/change-password', authenticateToken as any, validateRequest(changePasswordSchema), changePassword as any);
router.get('/auth/me', authenticateToken as any, getProfile as any);

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
router.post('/batches/:id/whatsapp-invite', authenticateToken as any, sendBatchWhatsappInvite as any);
router.post('/students/:id/whatsapp-invite', authenticateToken as any, sendStudentWhatsappInvite as any);

// Students
router.get('/public/batch/:id', publicLimiter, getBatchPublicStatus as any); // Public Status
router.post('/public/register', publicLimiter, validateRequest(registerStudentSchema), registerStudent as any); // Public
router.get('/public/check-status', publicLimiter, checkRegistrationStatus as any); // Public - Check if registered
router.post('/students/manual', authenticateToken as any, validateRequest(registerStudentSchema), addStudentManually as any); // Authenticated Manual Add
router.get('/students/pending', authenticateToken as any, getPendingStudents as any);
router.post('/students/:id/approve', authenticateToken as any, approveStudent as any);
router.post('/students/:id/reject', authenticateToken as any, rejectStudent as any);
router.put('/students/:id', authenticateToken as any, validateRequest(updateStudentSchema), updateStudent as any);
router.get('/students/lookup/:humanId', authenticateToken as any, getStudentByHumanId as any);

// Stickers
router.get('/stickers/download', authenticateToken as any, generateStickerSheet as any);

// Tests
router.get('/tests', authenticateToken as any, getTests as any);
router.post('/tests', authenticateToken as any, validateRequest(createTestSchema), createTest as any);
router.get('/tests/:id', authenticateToken as any, getTestDetails as any);
router.put('/tests/:id', authenticateToken as any, validateRequest(updateTestSchema), updateTest as any);
router.delete('/tests/:id', authenticateToken as any, deleteTest as any);
router.post('/tests/:id/send-results', authenticateToken as any, sendTestResultsEmail as any);
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
router.post('/fees/remind', authenticateToken as any, sendFeeReminder as any);

// Stats
router.get('/stats/growth', authenticateToken as any, getStudentGrowthStats as any);

// Invites
router.post('/invites', authenticateToken as any, generateInvite as any);
router.get('/institutes', authenticateToken as any, getInstitutes as any);
// New Analytics & Config Routes
// New Analytics & Config Routes
import { getGlobalAnalytics, updateInstituteConfig, updateInstituteDetails, getInstituteDetails, suspendInstitute, deleteInstitute, getMyInstitute } from '../controllers/instituteController';
router.get('/institutes/analytics', authenticateToken as any, getGlobalAnalytics as any);
router.put('/institutes/:id/config', authenticateToken as any, updateInstituteConfig as any);
router.put('/institutes/:id/details', authenticateToken as any, updateInstituteDetails as any);
router.get('/institute/me', authenticateToken as any, getMyInstitute as any);
router.get('/institute/:id/details', authenticateToken as any, getInstituteDetails as any);
router.put('/institutes/:id/suspend', authenticateToken as any, suspendInstitute as any);
router.delete('/institutes/:id', authenticateToken as any, deleteInstitute as any);


router.get('/invites/:token', publicLimiter, validateInvite as any);
router.post('/auth/setup-account', publicLimiter, setupAccount as any);

export default router;
