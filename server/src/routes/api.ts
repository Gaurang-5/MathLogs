import { Router } from 'express';
import { loginAdmin, createInitialAdmin, changePassword, getProfile } from '../controllers/authController';
import { authenticateToken } from '../middleware/auth';
import { authLimiter, publicLimiter, paymentLimiter } from '../middleware/security';
import { validateRequest } from '../middleware/validation';
import { loginSchema, setupSchema, changePasswordSchema, registerStudentSchema, createBatchSchema, updateBatchSchema, updateStudentSchema, paymentSchema, payInstallmentSchema, submitMarkSchema, createTestSchema, updateTestSchema, createAcademicYearSchema, createInstallmentSchema } from '../schemas';
import { createBatch, getBatches, getBatchDetails, downloadBatchPDF, toggleBatchRegistration, createFeeInstallment, getBatchPublicStatus, endBatchRegistration, updateBatch, deleteBatch, sendBatchWhatsappInvite, sendStudentWhatsappInvite, downloadBatchQRPDF } from '../controllers/batchController';
import { registerStudent, getPendingStudents, approveStudent, rejectStudent, updateStudent, addStudentManually, getStudentGrowthStats } from '../controllers/studentController';
import { checkRegistrationStatus } from '../controllers/statusController';
import { generateStickerSheet } from '../controllers/stickerController';
import { createTest, getTests, submitMark, getStudentByHumanId, getTestDetails, updateTest, deleteTest, downloadTestReport, getTestEligibleStudents } from '../controllers/testController';
import { getFeeSummary, recordPayment, payInstallment, downloadPendingFeesReport, getRecentTransactions, sendFeeReminder, downloadMonthlyReport } from '../controllers/feeController';
import { listAcademicYears, createAcademicYear, switchAcademicYear, backupAcademicYear, deleteAcademicYear } from '../controllers/academicYearController';

import { getDashboardSummary } from '../controllers/dashboardController';
import { generateInvite, validateInvite, setupAccount, getInstitutes } from '../controllers/inviteController';
import { getPaymentHistory } from '../controllers/feeController';

const router = Router();

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
import { getGlobalAnalytics, updateInstituteConfig, getInstituteDetails, suspendInstitute, deleteInstitute, getMyInstitute } from '../controllers/instituteController';
router.get('/institutes/analytics', authenticateToken as any, getGlobalAnalytics as any);
router.put('/institutes/:id/config', authenticateToken as any, updateInstituteConfig as any);
router.get('/institute/me', authenticateToken as any, getMyInstitute as any);
router.get('/institute/:id/details', authenticateToken as any, getInstituteDetails as any);
router.put('/institutes/:id/suspend', authenticateToken as any, suspendInstitute as any);
router.delete('/institutes/:id', authenticateToken as any, deleteInstitute as any);


router.get('/invites/:token', publicLimiter, validateInvite as any);
router.post('/auth/setup-account', publicLimiter, setupAccount as any);

export default router;
