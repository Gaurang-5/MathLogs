"use strict";
console.log("api.ts: top");
import { Router } from "express";
console.log("api.ts: authController");
import { loginAdmin, createInitialAdmin, changePassword, getProfile } from "../controllers/authController";
console.log("api.ts: auth middleware");
import { authenticateToken } from "../middleware/auth";
console.log("api.ts: security middleware");
import { authLimiter, publicLimiter, paymentLimiter, ocrLimiter, bulkNotifyLimiter, upiPaymentLimiter } from "../middleware/security";
console.log("api.ts: validation");
import { validateRequest } from "../middleware/validation";
console.log("api.ts: schemas");
import { loginSchema, setupSchema, changePasswordSchema, registerStudentSchema, createBatchSchema, updateBatchSchema, updateStudentSchema, paymentSchema, payInstallmentSchema, submitMarkSchema, createTestSchema, updateTestSchema, createInstallmentSchema, createCustomInvoiceSchema } from "../schemas";
console.log("api.ts: batchController");
import { createBatch, getBatches, getBatchDetails, downloadBatchPDF, toggleBatchRegistration, createFeeInstallment, updateFeeInstallment, deleteFeeInstallment, getBatchPublicStatus, endBatchRegistration, updateBatch, deleteBatch, sendBatchWhatsappInvite, sendStudentWhatsappInvite, downloadBatchQRPDF, inviteStudentToBatch } from "../controllers/batchController";
console.log("api.ts: studentController");
import { registerStudent, getPendingStudents, approveStudent, rejectStudent, archiveStudent, updateStudent, addStudentManually, getStudentGrowthStats, getClassAverageStats } from "../controllers/studentController";
console.log("api.ts: statusController");
import { checkRegistrationStatus } from "../controllers/statusController";
console.log("api.ts: stickerController");
import { generateStickerSheet } from "../controllers/stickerController";
console.log("api.ts: testController");
import { createTest, getTests, submitMark, getStudentByHumanId, getTestDetails, updateTest, deleteTest, downloadTestReport, getTestEligibleStudents, sendTestResultsEmail, generateAITest, saveOnlineQuiz, getOnlineQuizzes, finalizeOnlineQuiz, downloadOnlineQuizReport, updateOnlineQuiz, deleteOnlineQuiz, downloadOnlineQuizQuestionsPdf, downloadOnlineQuizReportPdf, generateSingleQuestionRoute, generateVariantQuestionRoute } from "../controllers/testController";
console.log("api.ts: analyticsController");
import { getOnlineQuizAnalytics, getLiveQuizStatus } from "../controllers/analyticsController";
console.log("api.ts: feeController");
import { getFeeSummary, recordPayment, payInstallment, downloadPendingFeesReport, getRecentTransactions, sendFeeReminder, downloadMonthlyReport, getUpiVerifications, approveUpiVerification, rejectUpiVerification, getCustomInvoices, createCustomInvoice, scanReceipt } from "../controllers/feeController";
console.log("api.ts: dashboardController");
import { getDashboardSummary, getFinancialGrowthStats } from "../controllers/dashboardController";
console.log("api.ts: inviteController");
import { generateInvite, validateInvite, setupAccount, getInstitutes } from "../controllers/inviteController";
console.log("api.ts: onboardingController");
import { createOrder, verifyPayment, trackLead, startTrial, resendSetupLink } from "../controllers/onboardingController";
console.log("api.ts: multer");
import multer from "multer";
console.log("api.ts: ocr");
import { processOCR } from "../utils/ocr";
console.log("api.ts: ocrTextract");
import { processOCRTextract } from "../utils/ocrTextract";
console.log("api.ts: publicController");
import { getPublicInstituteProfile, submitPublicLead } from "../controllers/publicController";
const router = Router();
router.get("/public/i/:slug", publicLimiter, getPublicInstituteProfile);
router.post("/public/i/:slug/lead", publicLimiter, submitPublicLead);
import { getPublicStudentFees, submitUpiPayment, getPaymentScreenshot } from "../controllers/publicController";
router.get("/public/i/:slug/student-fees", upiPaymentLimiter, getPublicStudentFees);
router.get("/public/payment-screenshot/:key", publicLimiter, getPaymentScreenshot);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    // 5MB limit
    files: 1
    // Prevent multi-file attacks
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only JPEG, PNG and WebP are allowed."));
    }
  }
});
const testDocUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    // 10MB limit
    files: 5
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
      "text/plain"
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only JPEG, PNG, WebP, PDF, and TXT files are allowed."));
    }
  }
});
router.post("/public/i/:slug/submit-upi", upiPaymentLimiter, upload.single("screenshot"), submitUpiPayment);
import crypto from "crypto";
import { prisma } from "../prisma";
const OCR_CACHE_TTL_SECONDS = 60;
async function checkOcrCache(hash) {
  try {
    const record = await prisma.ocrScanCache.findUnique({
      where: { imageHash: hash }
    });
    if (!record) return null;
    const ageMs = Date.now() - new Date(record.createdAt).getTime();
    if (ageMs > OCR_CACHE_TTL_SECONDS * 1e3) {
      return null;
    }
    return record.result;
  } catch {
    return null;
  }
}
async function setOcrCache(hash, result) {
  try {
    await prisma.ocrScanCache.upsert({
      where: { imageHash: hash },
      create: { imageHash: hash, result, createdAt: /* @__PURE__ */ new Date() },
      update: { result, createdAt: /* @__PURE__ */ new Date() }
    });
  } catch {
  }
}
if (true) {
  const ocrCacheCleanupInterval = setInterval(async () => {
    try {
      const cutoff = new Date(Date.now() - OCR_CACHE_TTL_SECONDS * 1e3);
      await prisma.ocrScanCache.deleteMany({
        where: { createdAt: { lt: cutoff } }
      });
    } catch (err) {
      if (true) {
        console.warn("[OcrScanCache] TTL cleanup failed (migration pending?):", err?.message);
      }
    }
  }, 5 * 60 * 1e3);
  ocrCacheCleanupInterval.unref();
}
router.post("/scan-ocr", authenticateToken, ocrLimiter, upload.single("image"), async (req, res) => {
  try {
    console.log("\u{1F4E5} Received OCR Request", req.user?.username);
    let imageBuffer;
    if (req.file) {
      console.log(`\u{1F4CE} File received: ${req.file.originalname} (${req.file.size} bytes)`);
      imageBuffer = req.file.buffer;
    } else if (req.body.image) {
      console.log("\u26A0\uFE0F Legacy Base64 JSON received");
      imageBuffer = req.body.image;
    }
    if (!imageBuffer) {
      console.error("\u274C No image data found in request");
      return res.status(400).json({ error: "Missing image data" });
    }
    const rawBuffer = req.file ? req.file.buffer : Buffer.from(imageBuffer.toString(), "base64");
    const hash = crypto.createHash("sha256").update(rawBuffer).digest("hex");
    const cached = await checkOcrCache(hash);
    if (cached) {
      console.log("\u267B\uFE0F Duplicate Scan \u2014 Returning DB-Cached Result");
      return res.json(cached);
    }
    const maxMarks = req.body.maxMarks ? parseFloat(req.body.maxMarks) : void 0;
    if (maxMarks) console.log(`\u{1F4CF} MaxMarks constraint: ${maxMarks}`);
    const [geminiResult, textractResult] = await Promise.allSettled([
      processOCR(imageBuffer),
      processOCRTextract(imageBuffer, maxMarks).catch((err) => {
        console.warn("\u26A0\uFE0F Textract failed:", err.message);
        return { score: "TEXTRACT_ERROR", confidence: 0, raw: err.message, rawTexts: [] };
      })
    ]);
    const gemini = geminiResult.status === "fulfilled" ? geminiResult.value : { score: "GEMINI_ERROR", confidence: 0, raw: geminiResult.reason?.message || "Unknown error" };
    const textract = textractResult.status === "fulfilled" ? textractResult.value : { score: "TEXTRACT_ERROR", confidence: 0, raw: textractResult.reason?.message || "Unknown error", rawTexts: [] };
    const match = gemini.score === textract.score;
    console.log(`\u2705 OCR | Gemini: "${gemini.score}" (${(gemini.confidence * 100).toFixed(0)}%) | Textract: "${textract.score}" (${(textract.confidence * 100).toFixed(0)}%) | Match: ${match ? "\u2705" : "\u274C"}`);
    const geminiOk = gemini.score && !gemini.score.includes("ERROR");
    const textractOk = textract.score && !textract.score.includes("ERROR");
    let primary;
    if (geminiOk && textractOk && match) {
      primary = { score: gemini.score, confidence: Math.min(1, gemini.confidence + 0.1), raw: gemini.raw, source: "both" };
    } else if (geminiOk) {
      primary = { score: gemini.score, confidence: gemini.confidence, raw: gemini.raw, source: "gemini" };
    } else if (textractOk) {
      primary = { score: textract.score, confidence: textract.confidence, raw: textract.raw, source: "textract" };
    } else {
      primary = { score: "ERROR_UNCERTAIN", confidence: 0, raw: "Both engines failed", source: "none" };
    }
    await setOcrCache(hash, primary);
    res.json({ score: primary.score, confidence: primary.confidence, raw: primary.raw, source: primary.source });
  } catch (error) {
    console.error("\u274C OCR Proxy Error:", error);
    res.status(500).json({ error: "OCR Processing Failed", details: error.message });
  }
});
router.get("/dashboard/summary", authenticateToken, getDashboardSummary);
router.post("/auth/login", authLimiter, validateRequest(loginSchema), loginAdmin);
router.post("/auth/setup", authLimiter, validateRequest(setupSchema), createInitialAdmin);
router.post("/auth/change-password", authenticateToken, validateRequest(changePasswordSchema), changePassword);
router.get("/auth/me", authenticateToken, getProfile);
import { sendMobileOtp, verifyMobileOtp, refreshTokenUser } from "../controllers/authController";
router.post("/auth/send-otp", authLimiter, sendMobileOtp);
router.post("/auth/verify-otp", authLimiter, verifyMobileOtp);
router.post("/auth/refresh", authLimiter, refreshTokenUser);
router.get("/batches", authenticateToken, getBatches);
router.post("/batches", authenticateToken, validateRequest(createBatchSchema), createBatch);
router.get("/batches/:id", authenticateToken, getBatchDetails);
router.put("/batches/:id", authenticateToken, validateRequest(updateBatchSchema), updateBatch);
router.delete("/batches/:id", authenticateToken, deleteBatch);
router.get("/batches/:id/download", authenticateToken, downloadBatchPDF);
router.get("/batches/:id/qr-pdf", authenticateToken, downloadBatchQRPDF);
router.put("/batches/:id/toggle-registration", authenticateToken, toggleBatchRegistration);
router.put("/batches/:id/end-registration", authenticateToken, endBatchRegistration);
router.post("/batches/:id/installments", authenticateToken, validateRequest(createInstallmentSchema), createFeeInstallment);
router.put("/installments/:id", authenticateToken, updateFeeInstallment);
router.delete("/installments/:id", authenticateToken, deleteFeeInstallment);
router.post("/batches/:id/whatsapp-invite", authenticateToken, bulkNotifyLimiter, sendBatchWhatsappInvite);
router.post("/batches/:id/invite", authenticateToken, inviteStudentToBatch);
router.post("/students/:id/whatsapp-invite", authenticateToken, sendStudentWhatsappInvite);
router.get("/public/batch/:id", publicLimiter, getBatchPublicStatus);
router.post("/public/register", publicLimiter, validateRequest(registerStudentSchema), registerStudent);
router.get("/public/check-status", publicLimiter, checkRegistrationStatus);
router.post("/students/manual", authenticateToken, validateRequest(registerStudentSchema), addStudentManually);
router.get("/students/pending", authenticateToken, getPendingStudents);
router.post("/students/:id/approve", authenticateToken, approveStudent);
router.post("/students/:id/reject", authenticateToken, rejectStudent);
router.delete("/students/:id/archive", authenticateToken, archiveStudent);
router.put("/students/:id", authenticateToken, validateRequest(updateStudentSchema), updateStudent);
router.get("/students/lookup/:humanId", authenticateToken, getStudentByHumanId);
router.get("/stickers/download", authenticateToken, generateStickerSheet);
router.get("/tests", authenticateToken, getTests);
router.post("/tests", authenticateToken, validateRequest(createTestSchema), createTest);
router.post("/tests/generate", authenticateToken, testDocUpload.array("files", 5), generateAITest);
router.post("/tests/generate-single-question", authenticateToken, generateSingleQuestionRoute);
router.post("/tests/generate-variant-question", authenticateToken, generateVariantQuestionRoute);
router.post("/tests/online", authenticateToken, saveOnlineQuiz);
router.get("/tests/online", authenticateToken, getOnlineQuizzes);
router.put("/tests/online/:id", authenticateToken, updateOnlineQuiz);
router.delete("/tests/online/:id", authenticateToken, deleteOnlineQuiz);
router.get("/tests/online/:id/analytics", authenticateToken, getOnlineQuizAnalytics);
router.get("/tests/online/:id/monitor", authenticateToken, getLiveQuizStatus);
router.post("/tests/online/:id/finalize", authenticateToken, bulkNotifyLimiter, finalizeOnlineQuiz);
router.get("/tests/online/:id/report", authenticateToken, downloadOnlineQuizReport);
router.get("/tests/online/:id/questions-pdf", authenticateToken, downloadOnlineQuizQuestionsPdf);
router.get("/tests/online/:id/report-pdf", authenticateToken, downloadOnlineQuizReportPdf);
router.get("/tests/:id", authenticateToken, getTestDetails);
router.put("/tests/:id", authenticateToken, validateRequest(updateTestSchema), updateTest);
router.delete("/tests/:id", authenticateToken, deleteTest);
router.post("/tests/:id/send-results", authenticateToken, bulkNotifyLimiter, sendTestResultsEmail);
router.get("/tests/:id/download", authenticateToken, downloadTestReport);
router.get("/tests/:id/eligible-students", authenticateToken, getTestEligibleStudents);
router.post("/marks", authenticateToken, validateRequest(submitMarkSchema), submitMark);
router.get("/fees", authenticateToken, getFeeSummary);
router.get("/fees/summary", authenticateToken, getFeeSummary);
router.get("/fees/download-pending", authenticateToken, downloadPendingFeesReport);
router.post("/fees/pay", authenticateToken, paymentLimiter, validateRequest(paymentSchema), recordPayment);
router.post("/fees/pay-installment", authenticateToken, paymentLimiter, validateRequest(payInstallmentSchema), payInstallment);
router.get("/fees/recent", authenticateToken, getRecentTransactions);
router.get("/fees/download-transactions", authenticateToken, downloadMonthlyReport);
router.post("/fees/remind", authenticateToken, bulkNotifyLimiter, sendFeeReminder);
router.get("/fees/upi-verifications", authenticateToken, getUpiVerifications);
router.post("/fees/upi-verifications/:id/approve", authenticateToken, paymentLimiter, approveUpiVerification);
router.post("/fees/upi-verifications/:id/reject", authenticateToken, paymentLimiter, rejectUpiVerification);
router.get("/fees/custom-invoices", authenticateToken, getCustomInvoices);
router.post("/fees/custom-invoices", authenticateToken, paymentLimiter, validateRequest(createCustomInvoiceSchema), createCustomInvoice);
router.post("/fees/scan-receipt", authenticateToken, ocrLimiter, upload.single("image"), scanReceipt);
router.get("/stats/growth", authenticateToken, getStudentGrowthStats);
router.get("/stats/finance-growth", authenticateToken, getFinancialGrowthStats);
router.get("/stats/class-average", authenticateToken, getClassAverageStats);
router.post("/invites", authenticateToken, generateInvite);
router.get("/institutes", authenticateToken, getInstitutes);
import { createBillingSession, verifyBillingPayment, cancelSubscription } from "../controllers/billingController";
router.post("/billing/create", authenticateToken, createBillingSession);
router.post("/billing/verify", authenticateToken, verifyBillingPayment);
router.delete("/billing/cancel", authenticateToken, cancelSubscription);
import { getGlobalAnalytics, updateInstituteConfig, updateInstituteDetails, updateInstitutePlan, getInstituteDetails, suspendInstitute, deleteInstitute, getMyInstitute, uploadLogo } from "../controllers/instituteController";
router.get("/institutes/analytics", authenticateToken, getGlobalAnalytics);
router.put("/institutes/:id/config", authenticateToken, updateInstituteConfig);
router.put("/institutes/:id/details", authenticateToken, updateInstituteDetails);
router.put("/institutes/:id/plan", authenticateToken, updateInstitutePlan);
router.get("/institute/me", authenticateToken, getMyInstitute);
router.put("/institute/me/logo", authenticateToken, uploadLogo);
router.get("/institute/:id/details", authenticateToken, getInstituteDetails);
router.put("/institutes/:id/suspend", authenticateToken, suspendInstitute);
router.delete("/institutes/:id", authenticateToken, deleteInstitute);
import { getOnboardingLeads } from "../controllers/instituteController";
router.get("/onboarding/leads", authenticateToken, getOnboardingLeads);
router.get("/invites/:token", publicLimiter, validateInvite);
router.post("/auth/setup-account", publicLimiter, setupAccount);
router.post("/onboarding/lead", publicLimiter, trackLead);
router.post("/onboarding/create-order", publicLimiter, createOrder);
router.post("/onboarding/verify-payment", publicLimiter, verifyPayment);
router.post("/onboarding/start-trial", publicLimiter, startTrial);
router.post("/onboarding/resend-setup-link", publicLimiter, resendSetupLink);
import { createAdminOnboardingLink, getAdminOnboardingLink, createAdminOnboardingOrder, verifyAdminOnboardingPayment, listAdminOnboardingLinks } from "../controllers/adminOnboardingController";
router.post("/admin-onboarding/create-link", authenticateToken, createAdminOnboardingLink);
router.get("/admin-onboarding/links", authenticateToken, listAdminOnboardingLinks);
router.get("/admin-onboarding/:token", publicLimiter, getAdminOnboardingLink);
router.post("/admin-onboarding/create-order", publicLimiter, createAdminOnboardingOrder);
router.post("/admin-onboarding/verify-payment", publicLimiter, verifyAdminOnboardingPayment);
export default router;
