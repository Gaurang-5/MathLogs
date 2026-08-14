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
  updateInstituteLeadStatus
} from '../controllers/marketplaceController';
import {
  approveClaim,
  contactMarketplaceClaim,
  getMarketplaceClaim,
  getMarketplaceListing,
  getMarketplaceOverview,
  listMarketplaceActivity,
  listMarketplaceClaims,
  listMarketplaceLeads,
  listMarketplaceListings,
  listMarketplaceReviews,
  rejectClaim,
  releaseLead,
  requireMarketplaceSuperAdmin,
  resendClaimNotification,
  retryMarketplaceLead,
  searchGooglePlacesHandler,
  syncGooglePlaceHandler,
  unlinkGooglePlaceHandler,
  updateMarketplaceListing,
  updateMarketplaceReview
} from '../controllers/marketplaceSuperAdminController';
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
router.patch('/admin/leads/:id', authenticateToken, updateInstituteLeadStatus);

// Superadmin-only marketplace operations. Google sync is deliberately kept
// out of both the public marketplace and institute-admin settings.
router.get('/super-admin/overview', authenticateToken, requireMarketplaceSuperAdmin, getMarketplaceOverview);
router.get('/super-admin/listings', authenticateToken, requireMarketplaceSuperAdmin, listMarketplaceListings);
router.get('/super-admin/listings/:id', authenticateToken, requireMarketplaceSuperAdmin, getMarketplaceListing);
router.patch('/super-admin/listings/:id', authenticateToken, requireMarketplaceSuperAdmin, updateMarketplaceListing);
router.get('/super-admin/claims', authenticateToken, requireMarketplaceSuperAdmin, listMarketplaceClaims);
router.get('/super-admin/claims/:id', authenticateToken, requireMarketplaceSuperAdmin, getMarketplaceClaim);
router.patch('/super-admin/claims/:id/contacted', authenticateToken, requireMarketplaceSuperAdmin, contactMarketplaceClaim);
router.post('/super-admin/claims/:id/approve', authenticateToken, requireMarketplaceSuperAdmin, approveClaim);
router.post('/super-admin/claims/:id/reject', authenticateToken, requireMarketplaceSuperAdmin, rejectClaim);
router.post('/super-admin/claims/:id/resend', authenticateToken, requireMarketplaceSuperAdmin, resendClaimNotification);
router.get('/super-admin/reviews', authenticateToken, requireMarketplaceSuperAdmin, listMarketplaceReviews);
router.patch('/super-admin/reviews/:id', authenticateToken, requireMarketplaceSuperAdmin, updateMarketplaceReview);
router.get('/super-admin/leads', authenticateToken, requireMarketplaceSuperAdmin, listMarketplaceLeads);
router.post('/super-admin/leads/:id/retry', authenticateToken, requireMarketplaceSuperAdmin, retryMarketplaceLead);
router.post('/super-admin/leads/:id/release', authenticateToken, requireMarketplaceSuperAdmin, releaseLead);
router.get('/super-admin/activity', authenticateToken, requireMarketplaceSuperAdmin, listMarketplaceActivity);
router.get('/google-place/search', authenticateToken, requireMarketplaceSuperAdmin, searchGooglePlacesHandler);
router.post('/coaching/:id/sync-google-place', authenticateToken, requireMarketplaceSuperAdmin, syncGooglePlaceHandler);
router.post('/coaching/:id/unlink-google-place', authenticateToken, requireMarketplaceSuperAdmin, unlinkGooglePlaceHandler);

export default router;
