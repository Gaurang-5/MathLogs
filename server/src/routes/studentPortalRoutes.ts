import express from 'express';
import { loginStudent, getStudentDashboard, getInstituteBranding, getStudentQuizzes, startOnlineQuiz, autosaveOnlineQuiz, logQuizCheatingEvent, submitOnlineQuiz, getOnlineQuizResult, sendQuizHeartbeat } from '../controllers/studentPortalController';
import { studentLoginLimiter, quizActivityLimiter, studentPortalLimiter } from '../middleware/security';

const router = express.Router();

// Apply general limiter to all student portal routes
router.use(studentPortalLimiter);

router.get('/branding/:slug', getInstituteBranding); // public — no auth
router.post('/login', studentLoginLimiter, loginStudent);
router.get('/dashboard', getStudentDashboard);
router.get('/quizzes', getStudentQuizzes);
router.post('/quizzes/:id/start', quizActivityLimiter, startOnlineQuiz);
router.patch('/quizzes/:id/autosave', quizActivityLimiter, autosaveOnlineQuiz);
router.post('/quizzes/:id/heartbeat', quizActivityLimiter, sendQuizHeartbeat);
router.post('/quizzes/:id/cheating-events', quizActivityLimiter, logQuizCheatingEvent);
router.post('/quizzes/:id/submit', quizActivityLimiter, submitOnlineQuiz);
router.get('/quizzes/:id/result', getOnlineQuizResult);

export default router;
