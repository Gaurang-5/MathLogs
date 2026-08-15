import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { requireSuperAdmin, requireSuperAdminReauth } from '../middleware/superAdmin';
import { authLimiter } from '../middleware/security';
import {
  endSupportSession,
  sendReauthOtp,
  startSupportSession,
  verifyReauthOtp
} from '../controllers/superAdminSecurityController';
import { getHome, searchInstitutes } from '../controllers/superAdminHomeController';
import {
  commitImport,
  commitOnboarding,
  getInstitute,
  listInstitutes,
  previewImport,
  previewOnboarding,
  updateInstituteConfiguration,
  updateInstituteDetails
} from '../controllers/superAdminInstituteController';
import {
  billingHistory,
  billingPreview,
  createBillingOperation,
  requireBillingReauth,
  retryOperation,
  revenueOverview,
  revenueSubscriptions
} from '../controllers/superAdminRevenueController';

const router = Router();

router.use(authenticateToken, requireSuperAdmin);
router.get('/home', getHome);
router.get('/search', searchInstitutes);
router.get('/revenue/overview', revenueOverview);
router.get('/revenue/subscriptions', revenueSubscriptions);
router.get('/institutes', listInstitutes);
router.post('/institutes/onboarding/preview', previewOnboarding);
router.post('/institutes/onboarding/commit', commitOnboarding);
router.post('/institutes/import/preview', previewImport);
router.post('/institutes/import/commit', commitImport);
router.get('/institutes/:id', getInstitute);
router.patch('/institutes/:id/details', updateInstituteDetails);
router.patch('/institutes/:id/configuration', updateInstituteConfiguration);
router.get('/institutes/:id/billing-history', billingHistory);
router.post('/institutes/:id/billing-operations/preview', billingPreview);
router.post('/institutes/:id/billing-operations', requireBillingReauth, createBillingOperation);
router.post('/institutes/:id/billing-operations/:operationId/retry', retryOperation);
router.post('/security/reauth/send', authLimiter, sendReauthOtp);
router.post('/security/reauth/verify', authLimiter, verifyReauthOtp);
router.post('/support-sessions', (req, res, next) => {
  if (!String(req.body?.instituteId || '').trim() || String(req.body?.reason || '').trim().length < 10) {
    res.status(400).json({ success: false, error: 'INSTITUTE_AND_REASON_REQUIRED' });
    return;
  }
  next();
}, requireSuperAdminReauth('SUPPORT_SESSION'), startSupportSession);
router.delete('/support-sessions/:id', endSupportSession);

export default router;
