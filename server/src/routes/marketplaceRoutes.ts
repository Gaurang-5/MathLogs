import { Router } from 'express';
import {
  searchMarketplace,
  getCoachingPublicProfile,
  submitReview,
  submitInquiry,
  submitClaimRequest,
  registerExternalTeacher,
  getMarketplaceProfile,
  updateMarketplaceProfile,
  getInstituteLeads,
  getMarketplaceSuperAdminOverview,
  getMarketplaceSuperAdminReviews,
  updateMarketplaceReviewStatus,
  searchGooglePlacesHandler,
  syncGooglePlaceHandler,
  unlinkGooglePlaceHandler
} from '../controllers/marketplaceController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Public Marketplace Endpoints
router.get('/search', searchMarketplace);
router.get('/coaching/:slug', getCoachingPublicProfile);
router.post('/coaching/:id/reviews', submitReview);
router.post('/coaching/:id/inquire', submitInquiry);
router.post('/coaching/:id/claim', submitClaimRequest);
router.post('/register-teacher', registerExternalTeacher);

// Authenticated Teacher / Institute Admin Endpoints
router.get('/admin/profile', authenticateToken, getMarketplaceProfile);
router.put('/admin/profile', authenticateToken, updateMarketplaceProfile);
router.get('/admin/leads', authenticateToken, getInstituteLeads);

// Superadmin-only marketplace operations. Google sync is deliberately kept
// out of both the public marketplace and institute-admin settings.
router.get('/super-admin/overview', authenticateToken, getMarketplaceSuperAdminOverview);
router.get('/super-admin/reviews', authenticateToken, getMarketplaceSuperAdminReviews);
router.patch('/super-admin/reviews/:id', authenticateToken, updateMarketplaceReviewStatus);
router.get('/google-place/search', authenticateToken, searchGooglePlacesHandler);
router.post('/coaching/:id/sync-google-place', authenticateToken, syncGooglePlaceHandler);
router.post('/coaching/:id/unlink-google-place', authenticateToken, unlinkGooglePlaceHandler);

export default router;
