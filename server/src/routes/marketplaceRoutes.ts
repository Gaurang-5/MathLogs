import { Router } from 'express';
import {
  searchMarketplace,
  getCoachingPublicProfile,
  submitReview,
  submitInquiry,
  registerExternalTeacher,
  getMarketplaceProfile,
  updateMarketplaceProfile,
  getInstituteLeads,
  searchGooglePlacesHandler,
  syncGooglePlaceHandler,
  unlinkGooglePlaceHandler
} from '../controllers/marketplaceController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Public Marketplace Endpoints
router.get('/search', searchMarketplace);
router.get('/google-place/search', searchGooglePlacesHandler);
router.get('/coaching/:slug', getCoachingPublicProfile);
router.post('/coaching/:id/reviews', submitReview);
router.post('/coaching/:id/inquire', submitInquiry);
router.post('/register-teacher', registerExternalTeacher);

// Authenticated Teacher / Institute Admin Endpoints
router.get('/admin/profile', authenticateToken, getMarketplaceProfile);
router.put('/admin/profile', authenticateToken, updateMarketplaceProfile);
router.get('/admin/leads', authenticateToken, getInstituteLeads);
router.post('/coaching/:id/sync-google-place', authenticateToken, syncGooglePlaceHandler);
router.post('/coaching/:id/unlink-google-place', authenticateToken, unlinkGooglePlaceHandler);

export default router;
