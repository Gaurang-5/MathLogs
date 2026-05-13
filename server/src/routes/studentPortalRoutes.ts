import express from 'express';
import { loginStudent, getStudentDashboard } from '../controllers/studentPortalController';

const router = express.Router();

router.post('/login', loginStudent);
router.get('/dashboard', getStudentDashboard);

export default router;
