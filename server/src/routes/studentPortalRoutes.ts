import express from 'express';
import { loginStudent, getStudentDashboard, getInstituteBranding, getStudentQuizzes, startOnlineQuiz, autosaveOnlineQuiz, logQuizCheatingEvent, submitOnlineQuiz, getOnlineQuizResult, sendQuizHeartbeat } from '../controllers/studentPortalController';

const router = express.Router();

router.get('/branding/:slug', getInstituteBranding); // public — no auth
router.post('/login', loginStudent);
router.get('/dashboard', getStudentDashboard);
router.get('/quizzes', getStudentQuizzes);
router.post('/quizzes/:id/start', startOnlineQuiz);
router.patch('/quizzes/:id/autosave', autosaveOnlineQuiz);
router.post('/quizzes/:id/heartbeat', sendQuizHeartbeat);
router.post('/quizzes/:id/cheating-events', logQuizCheatingEvent);
router.post('/quizzes/:id/submit', submitOnlineQuiz);
router.get('/quizzes/:id/result', getOnlineQuizResult);

export default router;
