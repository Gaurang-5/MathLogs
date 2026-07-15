import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { heartbeatManager } from '../utils/redis';
import { autoFinalizeExpiredSubmissions } from './studentPortalController';
import { secureLogger } from '../utils/secureLogger';



const SCORE_BINS = [
    { label: '0-20%', min: 0, max: 20 },
    { label: '21-40%', min: 20, max: 40 },
    { label: '41-60%', min: 40, max: 60 },
    { label: '61-80%', min: 60, max: 80 },
    { label: '81-100%', min: 80, max: 100 }
];

export const getOnlineQuizAnalytics = async (req: Request, res: Response) => {
    try {
        const quizId = String(req.params.id);
        const teacherId = req.user?.id;
        const instituteId = req.user?.instituteId;

        // Auto-finalize any expired submissions to update database state before aggregates
        await autoFinalizeExpiredSubmissions(quizId);

        const quiz = await prisma.onlineQuiz.findFirst({
            where: { id: quizId, teacherId, instituteId },
            select: { id: true, title: true, totalMarks: true }
        });

        if (!quiz) {
            return res.status(404).json({ error: 'Quiz not found' });
        }

        const submittedWhere = {
            quizId,
            submittedAt: { not: null }
        };

        const [stats, submissions, questions, integritySubmissions] = await Promise.all([
            prisma.quizSubmission.aggregate({
                where: submittedWhere,
                _count: { _all: true },
                _avg: { score: true },
                _max: { score: true },
                _min: { score: true }
            }),
            prisma.quizSubmission.findMany({
                where: submittedWhere,
                select: { id: true, score: true }
            }),
            prisma.quizQuestion.findMany({
                where: { quizId },
                select: {
                    id: true,
                    questionText: true,
                    marks: true,
                    orderIndex: true,
                    answers: {
                        where: {
                            submission: submittedWhere
                        },
                        select: { isCorrect: true }
                    }
                },
                orderBy: { orderIndex: 'asc' }
            }),
            prisma.quizSubmission.findMany({
                where: {
                    quizId,
                    cheatingEvents: { some: {} }
                },
                select: {
                    id: true,
                    student: { select: { id: true, name: true, humanId: true } },
                    cheatingEvents: {
                        select: { eventType: true }
                    }
                }
            })
        ]);

        const scoreDistribution = SCORE_BINS.map((bin, index) => ({
            label: bin.label,
            count: submissions.filter((submission) => {
                const score = Number(submission.score || 0);
                const percentage = quiz.totalMarks > 0 ? (score / quiz.totalMarks) * 100 : 0;
                if (index === 0) return percentage >= bin.min && percentage <= bin.max;
                return percentage > bin.min && percentage <= bin.max;
            }).length
        }));

        const questionDifficulty = questions
            .map((question) => {
                const attempts = question.answers.length;
                const incorrectCount = question.answers.filter((answer) => !answer.isCorrect).length;
                const correctCount = attempts - incorrectCount;
                const failureRate = attempts > 0 ? (incorrectCount / attempts) * 100 : 0;

                return {
                    id: question.id,
                    questionText: question.questionText,
                    orderIndex: question.orderIndex,
                    marks: question.marks,
                    attempts,
                    correctCount,
                    incorrectCount,
                    failureRate: Number(failureRate.toFixed(1))
                };
            })
            .sort((a, b) => b.failureRate - a.failureRate || b.incorrectCount - a.incorrectCount);

        const integrityReport = integritySubmissions
            .map((submission) => {
                const eventBreakdown = submission.cheatingEvents.reduce<Record<string, number>>((acc, event) => {
                    acc[event.eventType] = (acc[event.eventType] || 0) + 1;
                    return acc;
                }, {});

                return {
                    studentId: submission.student.id,
                    studentName: submission.student.name,
                    humanId: submission.student.humanId,
                    totalFlags: submission.cheatingEvents.length,
                    eventBreakdown
                };
            })
            .sort((a, b) => b.totalFlags - a.totalFlags || a.studentName.localeCompare(b.studentName));

        res.json({
            quiz: {
                id: quiz.id,
                title: quiz.title,
                totalMarks: quiz.totalMarks
            },
            stats: {
                totalSubmissions: stats._count._all,
                averageScore: Number((stats._avg.score || 0).toFixed(2)),
                highestScore: stats._max.score || 0,
                lowestScore: stats._min.score || 0
            },
            scoreDistribution,
            questionDifficulty,
            integrityReport
        });
    } catch (error) {
        console.error('Online Quiz Analytics Error:', error);
        res.status(500).json({ error: 'Failed to load quiz analytics' });
    }
};

export const getLiveQuizStatus = async (req: Request, res: Response) => {
    try {
        const quizId = String(req.params.id);
        const teacherId = req.user?.id;
        const instituteId = req.user?.instituteId;

        // Auto-finalize any expired submissions to clean up database state before fetching
        await autoFinalizeExpiredSubmissions(quizId);

        const quiz = await prisma.onlineQuiz.findFirst({
            where: { id: quizId, teacherId, instituteId },
            select: {
                id: true,
                title: true,
                timeLimitMins: true,
                studentQuestionCount: true,
                _count: {
                    select: { questions: true }
                }
            }
        });

        if (!quiz) {
            return res.status(404).json({ error: 'Quiz not found' });
        }

        const submissions = await prisma.quizSubmission.findMany({
            where: { quizId },
            select: {
                id: true,
                startedAt: true,
                submittedAt: true,
                score: true,
                autoSavedAnswers: true,
                shuffledQuestions: true,
                student: {
                    select: {
                        id: true,
                        name: true,
                        humanId: true
                    }
                },
                cheatingEvents: {
                    select: {
                        id: true,
                        eventType: true,
                        timestamp: true,
                        metadata: true
                    },
                    orderBy: { timestamp: 'desc' }
                }
            },
            orderBy: { startedAt: 'desc' }
        });

        const now = Date.now();

        // Fetch all heartbeats from Redis in one pipeline call
        const submissionIds = submissions.map(s => s.id);
        const heartbeats = await heartbeatManager.getMultiple(submissionIds);

        const defaultStudentQuestionCount = quiz.studentQuestionCount && quiz.studentQuestionCount > 0
            ? Math.min(quiz.studentQuestionCount, quiz._count.questions)
            : quiz._count.questions;

        const activeSubmissions = submissions.map((sub) => {
            let answeredCount = 0;
            if (sub.autoSavedAnswers && typeof sub.autoSavedAnswers === 'object' && !Array.isArray(sub.autoSavedAnswers)) {
                answeredCount = Object.keys(sub.autoSavedAnswers).length;
            }
            const assignedQuestionCount = Array.isArray(sub.shuffledQuestions) && sub.shuffledQuestions.length > 0
                ? sub.shuffledQuestions.length
                : defaultStudentQuestionCount;

            // Calculate remaining seconds if active
            let remainingSeconds = 0;
            let isTimeExpired = false;

            if (!sub.submittedAt && quiz.timeLimitMins) {
                const elapsedMs = now - new Date(sub.startedAt).getTime();
                const totalMs = quiz.timeLimitMins * 60 * 1000;
                remainingSeconds = Math.max(0, Math.floor((totalMs - elapsedMs) / 1000));
                if (remainingSeconds <= 0) {
                    isTimeExpired = true;
                }
            }

            // Connection health check (heartbeat within last 60s, or started within last 60s)
            const lastActive = heartbeats[sub.id] || 0;
            const elapsedSinceLastActive = now - lastActive;
            const elapsedSinceStart = now - new Date(sub.startedAt).getTime();
            const isOffline = !sub.submittedAt && elapsedSinceLastActive > 60000 && elapsedSinceStart > 60000;

            return {
                id: sub.id,
                student: sub.student,
                startedAt: sub.startedAt,
                submittedAt: sub.submittedAt,
                score: sub.score,
                answeredCount,
                totalQuestions: assignedQuestionCount,
                remainingSeconds,
                isTimeExpired,
                isOffline,
                cheatingEventsCount: sub.cheatingEvents.length,
                cheatingEvents: sub.cheatingEvents
            };
        });

        res.json({
            quiz: {
                id: quiz.id,
                title: quiz.title,
                timeLimitMins: quiz.timeLimitMins,
                totalQuestions: defaultStudentQuestionCount
            },
            students: activeSubmissions
        });
    } catch (error) {
        console.error('Online Quiz Live Monitor Error:', error);
        res.status(500).json({ error: 'Failed to load live quiz monitor data' });
    }
};

export const unlockQuizSubmission = async (req: Request, res: Response) => {
    try {
        const { id: quizId, submissionId } = req.params;
        const teacherId = req.user?.id;
        const instituteId = req.user?.instituteId;

        // Verify teacher owns the quiz
        const quiz = await prisma.onlineQuiz.findFirst({
            where: { id: quizId, teacherId, instituteId }
        });

        if (!quiz) {
            return res.status(404).json({ error: 'Quiz not found' });
        }

        // Verify the submission exists for this quiz
        const submission = await prisma.quizSubmission.findFirst({
            where: { id: submissionId, quizId }
        });

        if (!submission) {
            return res.status(404).json({ error: 'Submission not found' });
        }

        // Delete all cheating events for this submission to reset the lock
        await prisma.cheatingEvent.deleteMany({
            where: { submissionId }
        });

        res.json({ success: true, message: 'Student attempt unlocked and warnings reset.' });
    } catch (error) {
        console.error('Unlock Submission Error:', error);
        res.status(500).json({ error: 'Failed to unlock submission' });
    }
};
