import express from 'express';
import { loginStudent, getStudentDashboard, getInstituteBranding } from '../controllers/studentPortalController';

const router = express.Router();

router.get('/branding/:slug', getInstituteBranding); // public — no auth
router.post('/login', loginStudent);
router.get('/dashboard', getStudentDashboard);

export default router;
