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

const router = Router();

router.use(authenticateToken, requireSuperAdmin);
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
