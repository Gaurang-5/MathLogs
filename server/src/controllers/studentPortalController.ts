import { Request, Response } from 'express';
import { prisma } from '../prisma';
import jwt from 'jsonwebtoken';
import { quizCache, heartbeatManager, brandingCache } from '../utils/redis';
import { secureLogger } from '../utils/secureLogger';


const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';
const AUTOSAVE_MIN_INTERVAL_MS = 10_000;
const MAX_CHEATING_WARNINGS = 5;
const autosaveWriteTimes = new Map<string, number>();


function isPlainAnswerMap(value: unknown): value is Record<string, string> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }

    return Object.values(value).every((answer) => typeof answer === 'string');
}

function getStudentIdFromRequest(req: Request, res: Response): string | null {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized' });
        return null;
    }

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET) as { studentId?: string };
        if (!decoded.studentId) {
            res.status(401).json({ error: 'Invalid token' });
            return null;
        }
        return decoded.studentId;
    } catch {
        res.status(401).json({ error: 'Invalid token' });
        return null;
    }
}

/** Fisher-Yates shuffle — returns a new shuffled array */
function shuffleArray<T>(array: T[]): T[] {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// GET /api/student-portal/branding/:slug — public, no auth
export const getInstituteBranding = async (req: Request, res: Response): Promise<void> => {
    try {
        const slug = req.params.slug as string;
        
        // 1. Check Redis Cache First (PERF: <2ms response)
        const cached = await brandingCache.get(slug);
        if (cached) {
            res.json(cached);
            return;
        }

        // 2. Fallback to DB
        const institute = await prisma.institute.findUnique({
            where: { slug: slug.toLowerCase() },
            select: { name: true, config: true, websiteConfig: true }
        });

        if (!institute) {
            res.status(404).json({ error: 'Institute not found' });
            return;
        }

        const config = institute.config as any;
        const wc = institute.websiteConfig as any;

        const branding = {
            name: institute.name,
            logoUrl: config?.logo || null,
            primaryColor: wc?.theme?.primaryColor || config?.primaryColor || null,
        };

        // 3. Set Cache for future requests (Expires in 1 hour)
        await brandingCache.set(slug, branding);

        // 4. Set Browser Cache (1 hour)
        res.setHeader('Cache-Control', 'public, max-age=3600');

        res.json(branding);
    } catch (error) {
        console.error('Error fetching branding:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// POST /api/student-portal/login
// Body: { instituteSlug: string, mobileNumber: string }
export const loginStudent = async (req: Request, res: Response): Promise<void> => {
    try {
        const { instituteSlug, mobileNumber: rawMobile } = req.body;

        if (!instituteSlug || !rawMobile) {
            res.status(400).json({ error: 'Institute slug and mobile number are required' });
            return;
        }

        const institute = await prisma.institute.findUnique({
            where: { slug: instituteSlug.toLowerCase() }
        });

        if (!institute) {
            res.status(404).json({ error: 'Institute not found' });
            return;
        }

        // Normalize mobile number: Keep only digits
        const cleanMobile = rawMobile.replace(/\D/g, '');
        if (cleanMobile.length < 10) {
            res.status(400).json({ error: 'Please enter a valid 10-digit mobile number' });
            return;
        }

        // Prepare possible variants for matching (+91, and raw)
        const variants = [
            cleanMobile,                           // 9876543210
            `+91${cleanMobile}`,                   // +919876543210
            `91${cleanMobile}`                      // 919876543210
        ];

        // Find student(s) with matching mobile number in this institute
        const students = await prisma.student.findMany({
            where: {
                instituteId: institute.id,
                parentWhatsapp: { in: variants }
            },
            include: {
                batch: { select: { id: true, name: true } }
            }
        });

        if (students.length === 0) {
            secureLogger.warn(`[STUDENT_LOGIN_FAILED] No match for ${cleanMobile} in institute ${instituteSlug}`);
            res.status(404).json({ error: 'This mobile number is not registered. Please contact your teacher.' });
            return;
        }

        // Generate token for the first student found
        const student = students[0];

        const token = jwt.sign(
            {
                studentId: student.id,
                instituteId: institute.id,
                role: 'STUDENT'
            },
            JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.json({
            token,
            student: {
                id: student.id,
                name: student.name,
                batchName: student.batch?.name || 'N/A',
                instituteName: institute.name
            }
        });
    } catch (error) {
        console.error('[STUDENT_LOGIN_ERROR]', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// GET /api/student-portal/dashboard
export const getStudentDashboard = async (req: Request, res: Response): Promise<void> => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const token = authHeader.split(' ')[1];
        let decoded;
        try {
            decoded = jwt.verify(token, JWT_SECRET) as any;
        } catch (e) {
            res.status(401).json({ error: 'Invalid token' });
            return;
        }

        const studentId = decoded.studentId;

        // PERF: Parallelize student data and all associated lookups (fees, tests)
        const [student, batchInstallments, batchTests] = await Promise.all([
            prisma.student.findUnique({
                where: { id: studentId },
                include: {
                    batch: true,
                    balance: true,
                    feePayments: {
                        include: { installment: true },
                        orderBy: { date: 'desc' }
                    },
                    marks: {
                        include: { test: true }
                    }
                }
            }),
            prisma.feeInstallment.findMany({
                where: { 
                    OR: [
                        { studentId },
                        { batch: { students: { some: { id: studentId } } } }
                    ]
                },
                include: {
                    payments: { where: { studentId } }
                }
            }),
            prisma.student.findUnique({ where: { id: studentId }, select: { batchId: true } }).then(s => {
                if (!s?.batchId) return [];
                return prisma.test.findMany({
                    where: {
                        OR: [
                            { batchId: s.batchId },
                            { batches: { some: { id: s.batchId } } },
                            { marks: { some: { studentId } } }
                        ]
                    },
                    orderBy: { date: 'asc' }
                });
            })
        ]) as [any, any[], any[]];

        if (!student) {
            res.status(404).json({ error: 'Student not found' });
            return;
        }

        const studentJoinDate = new Date(student.createdAt);

        const eligibleInstallments = batchInstallments.filter((inst: any) => {
            if (inst.studentId && inst.studentId !== studentId) return false;
            if (inst.studentId === studentId) return true;
            return new Date(inst.createdAt) >= studentJoinDate || inst.payments.length > 0;
        });

        // Build a map of testId -> mark for fast lookup
        const markMap = new Map<string, any>();
        for (const mark of student.marks) {
            markMap.set(mark.test.id, mark);
        }

        // Only include tests that happened on or after the student joined, OR if the student has a mark for it
        const joinDate = new Date(student.createdAt);
        joinDate.setHours(0, 0, 0, 0);

        const eligibleTests = batchTests.filter((test: any) => {
            if (markMap.has(test.id)) return true;

            const testDate = new Date(test.date);
            testDate.setHours(0, 0, 0, 0);
            return testDate >= joinDate;
        });

        // Build the performance array: scored or absent
        const performance = eligibleTests.map((test: any) => {
            const mark = markMap.get(test.id);
            if (mark) {
                return {
                    testId: test.id,
                    testName: test.name,
                    subject: test.subject,
                    date: test.date,
                    status: 'SCORED' as const,
                    score: mark.score,
                    maxMarks: test.maxMarks,
                    percentage: (mark.score / test.maxMarks) * 100,
                    isQuiz: test.isQuiz
                };
            }
            return {
                testId: test.id,
                testName: test.name,
                subject: test.subject,
                date: test.date,
                status: 'ABSENT' as const,
                score: null,
                maxMarks: test.maxMarks,
                percentage: null,
                isQuiz: test.isQuiz
            };
        });

        res.json({
            student: {
                name: student.name,
                parentName: student.parentName,
                parentWhatsapp: student.parentWhatsapp,
                parentEmail: student.parentEmail || null,
                batchName: student.batch?.name || 'N/A',
                schoolName: student.schoolName || null,
                humanId: student.humanId || null,
                status: student.status,
            },
            fees: {
                balance: student.balance?.balance || 0,
                totalFees: student.balance?.totalFees || 0,
                totalPaid: student.balance?.totalPaid || 0,
                transactions: student.feePayments.map((payment: any) => ({
                    id: payment.id,
                    amount: payment.amountPaid,
                    date: payment.date,
                    type: 'PAYMENT',
                    label: payment.installment?.name || 'Fee Payment',
                    status: 'PAID'
                })),
                installmentBreakdown: eligibleInstallments.map((inst: any) => {
                    const paid = inst.payments.reduce((sum: number, p: any) => sum + p.amountPaid, 0);
                    const pending = Math.max(0, inst.amount - paid);
                    return {
                        id: inst.id,
                        name: inst.name,
                        totalAmount: inst.amount,
                        paid,
                        pending,
                        status: pending <= 0 ? 'PAID' : paid > 0 ? 'PARTIAL' : 'UNPAID'
                    };
                }).filter((inst: any) => inst.pending > 0) // Only show unpaid/partial
            },
            performance
        });
    } catch (error) {
        console.error('Error fetching student dashboard:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getStudentQuizzes = async (req: Request, res: Response): Promise<void> => {
    try {
        const studentId = getStudentIdFromRequest(req, res);
        if (!studentId) return;

        // PERF: Combined student and quiz lookup via batch link
        const student = await prisma.student.findUnique({
            where: { id: studentId },
            select: { 
                batchId: true, 
                createdAt: true,
                instituteId: true
            }
        });

        if (!student || !student.batchId) {
            res.json([]);
            return;
        }

        // Auto-finalize any expired submissions for assigned quizzes in parallel
        const candidateQuizzes = await prisma.onlineQuiz.findMany({
            where: {
                OR: [
                    { batchId: student.batchId },
                    { batches: { some: { id: student.batchId } } }
                ]
            },
            select: { id: true }
        });
        await Promise.all(candidateQuizzes.map((q: { id: string }) => autoFinalizeExpiredSubmissions(q.id)));

        const quizzes = await prisma.onlineQuiz.findMany({
            where: {
                AND: [
                    {
                        OR: [
                            { batchId: student.batchId },
                            { batches: { some: { id: student.batchId } } }
                        ]
                    },
                    { createdAt: { gte: student.createdAt } }
                ]
            },
            include: {
                _count: { select: { questions: true } },
                submissions: {
                    where: { studentId },
                    select: {
                        id: true,
                        score: true,
                        startedAt: true,
                        submittedAt: true,
                        cheatingEvents: { select: { id: true } }
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        const now = new Date();
        res.json(quizzes.map((quiz) => {
            const submission = quiz.submissions[0] || null;
            const expired = Boolean(quiz.availableUntil && quiz.availableUntil < now);
            const scheduled = Boolean(quiz.availableFrom && quiz.availableFrom > now);
            const cheatingCount = submission?.cheatingEvents?.length || 0;
            const isLocked = cheatingCount >= MAX_CHEATING_WARNINGS;

            const availabilityStatus = submission?.submittedAt
                ? 'SUBMITTED'
                : isLocked
                    ? 'LOCKED'
                    : expired
                        ? 'MISSED'
                        : scheduled
                            ? 'SCHEDULED'
                            : 'AVAILABLE';
            return {
                id: quiz.id,
                title: quiz.title,
                topic: quiz.topic,
                difficulty: quiz.difficulty,
                timeLimitMins: quiz.timeLimitMins,
                totalMarks: quiz.totalMarks,
                availableFrom: quiz.availableFrom,
                availableUntil: quiz.availableUntil,
                isFinalized: quiz.isFinalized,
                createdAt: quiz.createdAt,
                questionCount: quiz._count.questions,
                studentQuestionCount: quiz.studentQuestionCount,
                availabilityStatus,
                canStart: availabilityStatus === 'AVAILABLE',
                submission: submission ? {
                    id: submission.id,
                    score: submission.score,
                    startedAt: submission.startedAt,
                    submittedAt: submission.submittedAt,
                    cheatingWarnings: cheatingCount
                } : null,
                submissions: undefined,
                _count: undefined
            };
        }));
    } catch (error) {
        console.error('Error fetching student quizzes:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const startOnlineQuiz = async (req: Request, res: Response): Promise<void> => {
    try {
        const studentId = getStudentIdFromRequest(req, res);
        if (!studentId) return;

        const quizId = req.params.id as string;

        // Auto-finalize before starting/resuming to clean up database state
        await autoFinalizeExpiredSubmissions(quizId);

        // PERF: Combined student and submission lookup to save one DB roundtrip
        const student = await prisma.student.findUnique({
            where: { id: studentId },
            include: {
                quizSubmissions: {
                    where: { quizId },
                    include: { cheatingEvents: { select: { id: true } } }
                }
            }
        });

        if (!student?.batchId) {
            res.status(404).json({ error: 'Student batch not found' });
            return;
        }

        // PERF: Use Redis cache for Quiz data (questions, settings)
        let quiz = await quizCache.get(quizId);
        if (!quiz) {
            quiz = await prisma.onlineQuiz.findFirst({
                where: { id: quizId },
                include: {
                    questions: {
                        select: { id: true, questionText: true, options: true, marks: true, correctOption: true, orderIndex: true, variantGroup: true },
                        orderBy: { orderIndex: 'asc' }
                    },
                    batches: { select: { id: true } }
                }
            });

            if (quiz) {
                await quizCache.set(quizId, quiz);
            }
        }

        if (!quiz) {
            res.status(404).json({ error: 'Quiz not found' });
            return;
        }

        // Security: Check if student has access to this quiz (multi-batch aware)
        const hasAccess = quiz.batchId === student.batchId || 
                          quiz.batches.some((b: any) => b.id === student.batchId);
        const isNotNewerThanQuiz = new Date(quiz.createdAt) <= new Date(student.createdAt); // optional logic from original

        if (!hasAccess) {
            res.status(404).json({ error: 'Quiz not found' });
            return;
        }

        const now = new Date();
        if (quiz.availableFrom && now < quiz.availableFrom) {
            res.status(403).json({ error: 'This quiz is not available yet.' });
            return;
        }

        if (quiz.availableUntil && now > quiz.availableUntil) {
            res.status(403).json({ error: 'This quiz window has expired.' });
            return;
        }

        const preview = Boolean(req.body?.preview);

        // Get or Create submission (using upsert to avoid P2002 race conditions)
        let submission = await prisma.quizSubmission.findUnique({
            where: { quizId_studentId: { quizId, studentId } },
            include: { cheatingEvents: { select: { id: true } } }
        });

        if (preview && !submission) {
            // Student is just viewing instructions for a quiz they have not started yet.
            // Return quiz metadata only, submission remains null (starts timer later).
            res.json({
                quiz: {
                    id: quiz.id,
                    title: quiz.title,
                    topic: quiz.topic,
                    difficulty: quiz.difficulty,
                    timeLimitMins: quiz.timeLimitMins,
                    totalMarks: quiz.totalMarks,
                    questions: (quiz.questions as any[]).map((q: any) => ({
                        id: q.id,
                        questionText: q.questionText,
                        options: q.options,
                        marks: q.marks
                    }))
                },
                submission: null
            });
            return;
        }

        if (!submission) {
            try {
                submission = await prisma.quizSubmission.upsert({
                    where: { quizId_studentId: { quizId, studentId } },
                    create: { quizId, studentId },
                    update: {},
                    include: { cheatingEvents: { select: { id: true } } }
                });
            } catch (err: any) {
                if (err.code === 'P2002') {
                    submission = await prisma.quizSubmission.findUnique({
                        where: { quizId_studentId: { quizId, studentId } },
                        include: { cheatingEvents: { select: { id: true } } }
                    });
                    if (!submission) {
                        throw err;
                    }
                } else {
                    throw err;
                }
            }
        }

        if (submission.submittedAt) {
            res.status(400).json({ error: 'You have already submitted this quiz.' });
            return;
        }

        const cheatingCount = submission.cheatingEvents?.length || 0;
        if (cheatingCount >= MAX_CHEATING_WARNINGS) {
            res.status(403).json({ error: 'Your quiz attempt has been locked due to integrity violations. Please contact your teacher.' });
            return;
        }

        // Determine the student's personalized question set
        let shuffledQuestionsData: any[] = Array.isArray(submission.shuffledQuestions)
            ? (submission.shuffledQuestions as any[])
            : [];

        if (shuffledQuestionsData.length === 0) {
            const allQuestions = quiz.questions;
            let candidateQuestions: typeof allQuestions;

            // ── Variant-aware sampling ──────────────────────────────────────
            const variantGrouped = new Map<string, typeof allQuestions>();
            const standalone: typeof allQuestions = [];

            for (const q of allQuestions) {
                if (q.variantGroup) {
                    const group = variantGrouped.get(q.variantGroup) || [];
                    group.push(q);
                    variantGrouped.set(q.variantGroup, group);
                } else {
                    standalone.push(q);
                }
            }

            if (variantGrouped.size > 0) {
                const pickedFromGroups = Array.from(variantGrouped.values()).map(siblings => {
                    return siblings[Math.floor(Math.random() * siblings.length)];
                });
                candidateQuestions = shuffleArray([...pickedFromGroups, ...standalone]);
            } else {
                candidateQuestions = shuffleArray(allQuestions);
            }

            const targetCount = quiz.studentQuestionCount && quiz.studentQuestionCount < candidateQuestions.length
                ? quiz.studentQuestionCount
                : candidateQuestions.length;

            const sampledQuestions = candidateQuestions.slice(0, targetCount);

            shuffledQuestionsData = sampledQuestions.map((q: any) => {
                const rawOptions = Array.isArray(q.options) ? (q.options as string[]) : [];
                return {
                    id: q.id,
                    questionText: q.questionText,
                    options: shuffleArray(rawOptions),
                    marks: q.marks,
                    correctOption: q.correctOption 
                };
            });

            await prisma.quizSubmission.update({
                where: { id: submission.id },
                data: { shuffledQuestions: shuffledQuestionsData }
            });
        }

        const clientQuestions = shuffledQuestionsData.map(({ correctOption: _co, ...rest }) => rest);
        const autoSavedAnswers = submission.autoSavedAnswers as Record<string, string> | null;

        res.json({
            quiz: {
                id: quiz.id,
                title: quiz.title,
                topic: quiz.topic,
                difficulty: quiz.difficulty,
                timeLimitMins: quiz.timeLimitMins,
                totalMarks: quiz.totalMarks,
                questions: clientQuestions
            },
            submission: {
                id: submission.id,
                score: submission.score,
                autoSavedAnswers: autoSavedAnswers || {},
                startedAt: submission.startedAt,
                submittedAt: submission.submittedAt,
                cheatingWarnings: cheatingCount,
                maxWarnings: MAX_CHEATING_WARNINGS
            }
        });
    } catch (error) {
        console.error('Error starting quiz:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const autosaveOnlineQuiz = async (req: Request, res: Response): Promise<void> => {
    try {
        const studentId = getStudentIdFromRequest(req, res);
        if (!studentId) return;

        const quizId = req.params.id as string;
        const answers = req.body?.answers;

        if (!isPlainAnswerMap(answers)) {
            res.status(400).json({ error: 'Answers are required' });
            return;
        }

        const student = await prisma.student.findUnique({
            where: { id: studentId },
            select: { batchId: true, createdAt: true }
        });

        if (!student?.batchId) {
            res.status(404).json({ error: 'Student batch not found' });
            return;
        }

        const quiz = await prisma.onlineQuiz.findFirst({
            where: {
                id: quizId,
                OR: [
                    { batchId: student.batchId },
                    { batches: { some: { id: student.batchId } } }
                ],
                createdAt: { gte: student.createdAt }
            },
            select: { id: true }
        });

        if (!quiz) {
            res.status(404).json({ error: 'Quiz not found' });
            return;
        }

        const submission = await prisma.quizSubmission.findUnique({
            where: { quizId_studentId: { quizId, studentId } },
            include: {
                cheatingEvents: { select: { id: true } }
            }
        });

        if (!submission) {
            res.status(404).json({ error: 'Quiz attempt not started' });
            return;
        }

        if (submission.submittedAt) {
            res.status(400).json({ error: 'You have already submitted this quiz.' });
            return;
        }

        const cheatingCount = submission.cheatingEvents?.length || 0;
        if (cheatingCount >= MAX_CHEATING_WARNINGS) {
            res.status(403).json({ error: 'Quiz attempt locked due to integrity violations.' });
            return;
        }

        const now = Date.now();
        const lastWrite = autosaveWriteTimes.get(submission.id) || 0;
        if (now - lastWrite < AUTOSAVE_MIN_INTERVAL_MS) {
            res.json({ success: true, throttled: true });
            return;
        }

        await prisma.quizSubmission.update({
            where: { id: submission.id },
            data: { autoSavedAnswers: answers }
        });
        autosaveWriteTimes.set(submission.id, now);
        await heartbeatManager.set(submission.id);

        res.json({ success: true, savedAt: new Date(now).toISOString() });
    } catch (error) {
        console.error('Error autosaving quiz:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const sendQuizHeartbeat = async (req: Request, res: Response): Promise<void> => {
    try {
        const studentId = getStudentIdFromRequest(req, res);
        if (!studentId) return;

        const quizId = req.params.id as string;

        const submission = await prisma.quizSubmission.findUnique({
            where: { quizId_studentId: { quizId, studentId } },
            select: { id: true, submittedAt: true }
        });

        if (!submission) {
            res.status(404).json({ error: 'Quiz attempt not started' });
            return;
        }

        if (submission.submittedAt) {
            res.status(400).json({ error: 'You have already submitted this quiz.' });
            return;
        }

        await heartbeatManager.set(submission.id);
        res.json({ success: true });
    } catch (error) {
        console.error('Error handling quiz heartbeat:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};


export const logQuizCheatingEvent = async (req: Request, res: Response): Promise<void> => {
    try {
        const studentId = getStudentIdFromRequest(req, res);
        if (!studentId) return;

        const quizId = req.params.id as string;
        const eventType = typeof req.body?.eventType === 'string' ? req.body.eventType.trim() : '';
        const metadata = req.body?.metadata && typeof req.body.metadata === 'object' && !Array.isArray(req.body.metadata)
            ? req.body.metadata
            : undefined;

        if (!eventType) {
            res.status(400).json({ error: 'eventType is required' });
            return;
        }

        const submission = await prisma.quizSubmission.findFirst({
            where: {
                quizId,
                studentId,
                submittedAt: null
            },
            include: {
                cheatingEvents: { select: { id: true } }
            }
        });

        if (!submission) {
            res.status(404).json({ error: 'Active quiz attempt not found' });
            return;
        }

        await prisma.cheatingEvent.create({
            data: {
                submissionId: submission.id,
                eventType,
                metadata
            }
        });

        const newCount = (submission.cheatingEvents?.length || 0) + 1;
        const isLocked = newCount >= MAX_CHEATING_WARNINGS;

        res.status(201).json({
            success: true,
            warningCount: newCount,
            maxWarnings: MAX_CHEATING_WARNINGS,
            isLocked
        });
    } catch (error) {
        console.error('Error logging cheating event:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const submitOnlineQuiz = async (req: Request, res: Response): Promise<void> => {
    try {
        const studentId = getStudentIdFromRequest(req, res);
        if (!studentId) return;

        const quizId = req.params.id as string;
        const answers = req.body?.answers;

        if (!isPlainAnswerMap(answers)) {
            res.status(400).json({ error: 'Answers are required' });
            return;
        }

        const student = await prisma.student.findUnique({
            where: { id: studentId },
            select: { batchId: true, createdAt: true }
        });

        if (!student?.batchId) {
            res.status(404).json({ error: 'Student batch not found' });
            return;
        }

        // Fetch quiz — we only need metadata and totalMarks; actual grading uses shuffledQuestions
        const quiz = await prisma.onlineQuiz.findFirst({
            where: {
                id: quizId,
                OR: [
                    { batchId: student.batchId },
                    { batches: { some: { id: student.batchId } } }
                ],
                createdAt: { gte: student.createdAt }
            },
            select: { id: true, timeLimitMins: true, totalMarks: true }
        });

        if (!quiz) {
            res.status(404).json({ error: 'Quiz not found' });
            return;
        }

        const submittedAt = new Date();

        await prisma.$transaction(async (tx) => {
            const existingSubmission = await tx.quizSubmission.findUnique({
                where: { quizId_studentId: { quizId, studentId } },
                include: {
                    cheatingEvents: { select: { id: true } }
                }
            });

            if (existingSubmission?.submittedAt) {
                throw new Error('QUIZ_ALREADY_SUBMITTED');
            }

            const cheatingCount = existingSubmission?.cheatingEvents?.length || 0;
            if (cheatingCount >= MAX_CHEATING_WARNINGS) {
                throw new Error('QUIZ_LOCKED');
            }

            const startedAt = existingSubmission?.startedAt || submittedAt;
            const elapsedMs = submittedAt.getTime() - startedAt.getTime();
            const allowedMs = (quiz.timeLimitMins + 1) * 60 * 1000;

            // Gracefully accept late submissions, capping submittedAt to startedAt + timeLimitMins
            const finalSubmittedAt = elapsedMs > allowedMs
                ? new Date(startedAt.getTime() + quiz.timeLimitMins * 60 * 1000)
                : submittedAt;

            // Grade using persisted shuffledQuestions (server-side correctOption)
            const shuffledQuestionsData = Array.isArray(existingSubmission?.shuffledQuestions)
                ? (existingSubmission.shuffledQuestions as any[])
                : [];
            let totalScore = 0;
            const answerRecords: { questionId: string; selectedOption: string | null; isCorrect: boolean; marksObtained: number }[] = [];

            for (const q of shuffledQuestionsData) {
                const selected = answers[q.id] || null;
                const isCorrect = selected !== null && selected === q.correctOption;
                const marksObtained = isCorrect ? (q.marks || 1) : 0;
                totalScore += marksObtained;
                answerRecords.push({
                    questionId: q.id,
                    selectedOption: selected,
                    isCorrect,
                    marksObtained
                });
            }

            let submissionId: string;
            if (existingSubmission) {
                const updateResult = await tx.quizSubmission.updateMany({
                    where: { id: existingSubmission.id, submittedAt: null },
                    data: { score: totalScore, submittedAt: finalSubmittedAt, autoSavedAnswers: answers }
                });

                if (updateResult.count !== 1) {
                    throw new Error('QUIZ_ALREADY_SUBMITTED');
                }

                submissionId = existingSubmission.id;
            } else {
                const submission = await tx.quizSubmission.create({
                    data: { quizId, studentId, score: totalScore, startedAt, submittedAt: finalSubmittedAt, autoSavedAnswers: answers }
                });
                submissionId = submission.id;
            }

            await tx.quizAnswer.deleteMany({ where: { submissionId } });
            await tx.quizAnswer.createMany({
                data: answerRecords.map((answer) => ({
                    submissionId,
                    ...answer
                }))
            });

            return totalScore;
        });

        // Recalculate score for the response
        const finalSubmission = await prisma.quizSubmission.findUnique({
            where: { quizId_studentId: { quizId, studentId } },
            select: { score: true }
        });

        res.json({ success: true, score: finalSubmission?.score ?? 0, totalMarks: quiz.totalMarks });
    } catch (error: any) {
        if (error?.message === 'QUIZ_ALREADY_SUBMITTED') {
            res.status(400).json({ error: 'You have already submitted this quiz.' });
            return;
        }

        if (error?.message === 'QUIZ_TIME_EXPIRED') {
            res.status(400).json({ error: 'The quiz time limit has expired.' });
            return;
        }

        if (error?.message === 'QUIZ_LOCKED') {
            res.status(403).json({ error: 'Your quiz attempt has been locked due to integrity violations.' });
            return;
        }

        console.error('Error submitting quiz:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getOnlineQuizResult = async (req: Request, res: Response): Promise<void> => {
    try {
        const studentId = getStudentIdFromRequest(req, res);
        if (!studentId) return;

        const quizId = req.params.id as string;
        const submission = await prisma.quizSubmission.findUnique({
            where: { quizId_studentId: { quizId, studentId } },
            include: {
                quiz: {
                    select: { title: true, totalMarks: true, timeLimitMins: true }
                },
                answers: {
                    include: {
                        question: {
                            select: { questionText: true, options: true, correctOption: true, marks: true }
                        }
                    },
                    orderBy: { question: { orderIndex: 'asc' } }
                }
            }
        });

        if (!submission?.submittedAt) {
            res.status(404).json({ error: 'Quiz result not found' });
            return;
        }

        res.json(submission);
    } catch (error) {
        console.error('Error fetching quiz result:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const autoFinalizeExpiredSubmissions = async (quizId: string): Promise<void> => {
    try {
        const quiz = await prisma.onlineQuiz.findUnique({
            where: { id: quizId },
            select: { timeLimitMins: true }
        });
        if (!quiz || !quiz.timeLimitMins) return;

        const now = new Date();
        // Allow a 2 minute grace period for submissions to fly in safely
        const expirationCutoff = new Date(now.getTime() - (quiz.timeLimitMins + 2) * 60 * 1000);

        const expiredSubmissions = await prisma.quizSubmission.findMany({
            where: {
                quizId,
                submittedAt: null,
                startedAt: { lt: expirationCutoff }
            },
            include: {
                cheatingEvents: { select: { id: true } }
            }
        });

        if (expiredSubmissions.length === 0) return;

        for (const sub of expiredSubmissions) {
            const answers = (sub.autoSavedAnswers as Record<string, string>) || {};
            const shuffledQuestionsData = Array.isArray(sub.shuffledQuestions)
                ? (sub.shuffledQuestions as any[])
                : [];

            let totalScore = 0;
            const answerRecords: { questionId: string; selectedOption: string | null; isCorrect: boolean; marksObtained: number }[] = [];

            for (const q of shuffledQuestionsData) {
                const selected = answers[q.id] || null;
                const isCorrect = selected !== null && selected === q.correctOption;
                const marksObtained = isCorrect ? (q.marks || 1) : 0;
                totalScore += marksObtained;
                answerRecords.push({
                    questionId: q.id,
                    selectedOption: selected,
                    isCorrect,
                    marksObtained
                });
            }

            await prisma.$transaction(async (tx) => {
                // Set submittedAt to startedAt + timeLimitMins (so it matches their actual elapsed time)
                const submittedAt = new Date(sub.startedAt.getTime() + quiz.timeLimitMins * 60 * 1000);

                await tx.quizSubmission.update({
                    where: { id: sub.id },
                    data: {
                        score: totalScore,
                        submittedAt
                    }
                });

                await tx.quizAnswer.deleteMany({ where: { submissionId: sub.id } });
                await tx.quizAnswer.createMany({
                    data: answerRecords.map((answer) => ({
                        submissionId: sub.id,
                        ...answer
                    }))
                });
            });
        }
    } catch (err) {
        console.error('Error auto-finalizing expired submissions:', err);
    }
};
