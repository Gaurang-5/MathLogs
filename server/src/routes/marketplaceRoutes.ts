import { Router } from 'express';
import {
  searchMarketplace,
  getCoachingPublicProfile,
  submitReview,
  submitInquiry,
  registerExternalTeacher,
  getMarketplaceProfile,
  updateMarketplaceProfile,
  getInstituteLeads
} from '../controllers/marketplaceController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Public Marketplace Endpoints
router.get('/search', searchMarketplace);
router.get('/coaching/:slug', getCoachingPublicProfile);
router.post('/coaching/:id/reviews', submitReview);
router.post('/coaching/:id/inquire', submitInquiry);
router.post('/register-teacher', registerExternalTeacher);

// Authenticated Teacher / Institute Admin Endpoints
router.get('/admin/profile', authenticateToken, getMarketplaceProfile);
router.put('/admin/profile', authenticateToken, updateMarketplaceProfile);
router.get('/admin/leads', authenticateToken, getInstituteLeads);

export default router;
