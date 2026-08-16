import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { quizCache } from '../utils/redis';
// const PDFDocument = require('pdfkit');
import { addMathLogsHeader } from '../utils/pdfUtils';
import { generateTest, generateSingleQuestion, generateTestWithVariants, generateVariantQuestion } from '../utils/ai/test-generator';
import { sendQuizMarksBroadcast, sendQuizScheduleBroadcast } from '../utils/quizBroadcasts';
import { secureLogger } from '../utils/secureLogger';
import { QuizCreditWalletError, consumeQuizCreditsInTransaction } from '../services/quizCreditWalletService';

function normalizeCorrectAnswer(value: unknown): string | string[] {
    if (Array.isArray(value)) {
        return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
    }

    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) {
                return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
            }
        } catch {
            // Existing quizzes store a single plain string.
        }
    }

    return typeof value === 'string' ? value : '';
}

function formatCorrectAnswer(value: unknown): string {
    const normalized = normalizeCorrectAnswer(value);
    return Array.isArray(normalized) ? normalized.join(', ') : normalized;
}

export const createTest = async (req: Request, res: Response) => {
    const { name, subject, date, maxMarks, className, batchId, batchIds } = req.body;
    const teacherId = req.user?.id;
    const user = req.user;

    if (!teacherId) return res.status(401).json({ error: 'Unauthorized' });
    if (!user.instituteId) return res.status(401).json({ error: 'No institute assigned' });

    try {
        const test = await prisma.test.create({
            data: {
                name,
                subject,
                className,
                date: new Date(date),
                maxMarks: parseFloat(maxMarks),
                teacherId,
                instituteId: user.instituteId, // ✅ SECURITY: Multi-tenant isolation
                batchId: batchId || (batchIds && batchIds.length > 0 ? batchIds[0] : null),
                ...(batchIds && batchIds.length > 0 ? {
                    batches: { connect: batchIds.map((id: string) => ({ id })) }
                } : batchId ? {
                    batches: { connect: [{ id: batchId }] }
                } : {})
            }
        });
        res.json(test);
    } catch (e) {
        console.error("Error creating test/quiz:", e);
        res.status(500).json({ error: 'Failed to create test' });
    }
};

export const getTests = async (req: Request, res: Response) => {
    try {
        const teacherId = req.user?.id;

        const tests = await prisma.test.findMany({
            where: {
                teacherId
            },
            orderBy: { date: 'desc' },
            include: {
                _count: {
                    select: { marks: true }
                },
                batch: {
                    select: { name: true, className: true }
                },
                batches: {
                    select: { id: true, name: true, className: true }
                }
            }
        });
        res.json(tests);
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch tests' });
    }
}

export const submitMark = async (req: Request, res: Response) => {
    const { testId, studentId, score } = req.body;
    const teacherId = req.user?.id;

    try {
        // Verify test ownership
        const test = await prisma.test.findUnique({ where: { id: testId } });
        if (!test) return res.status(404).json({ error: 'Test not found' });
        if (test.teacherId && test.teacherId !== teacherId) return res.status(403).json({ error: 'Unauthorized' });

        // Validate score doesn't exceed maxMarks
        const numericScore = parseFloat(score);
        if (numericScore > test.maxMarks) {
            return res.status(400).json({
                error: `Score (${numericScore}) cannot exceed maximum marks (${test.maxMarks})`
            });
        }
        if (numericScore < 0) {
            return res.status(400).json({ error: 'Score cannot be negative' });
        }

        // Verify Student Eligibility (Security Check)
        const student = await prisma.student.findUnique({
            where: { id: studentId },
            select: { instituteId: true }
        });

        if (!student) return res.status(404).json({ error: 'Student not found' });

        // Ensure student belongs to same institute (redundant but safe)
        if (student.instituteId && test.instituteId && student.instituteId !== test.instituteId) {
            return res.status(403).json({ error: 'Student belongs to a different institute' });
        }

        // Upsert allows updating if already exists
        const mark = await prisma.mark.upsert({
            where: {
                studentId_testId: {
                    studentId,
                    testId
                }
            },
            update: { score: numericScore },
            create: {
                studentId,
                testId,
                score: numericScore
            },
            include: { student: true, test: true }
        });
        res.json(mark);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to save mark' });
    }
};

export const getStudentByHumanId = async (req: Request, res: Response) => {
    const { humanId } = req.params;
    const { testId } = req.query;
    const teacherId = req.user?.id;
    const user = req.user;

    try {
        // FIX: Use findFirst scoped to instituteId since composite constraint is now humanId_instituteId
        const student = await prisma.student.findFirst({
            where: {
                humanId: String(humanId),
                instituteId: user.instituteId
            },
            include: {
                batch: true,
                marks: testId ? { where: { testId: String(testId) } } : true
            }
        });

        if (!student) {
            res.status(404).json({ error: 'Student not found' });
            return;
        }
        if (student.batch?.teacherId && student.batch.teacherId !== teacherId) {
            res.status(403).json({ error: 'Unauthorized' });
            return;
        }
        res.json(student);
    } catch (e) {
        console.error('Student lookup error:', e);
        res.status(500).json({ error: 'Lookup failed' });
    }
};

export const getTestDetails = async (req: Request, res: Response) => {
    const { id } = req.params;
    const teacherId = req.user?.id;
    try {
        const test = await prisma.test.findUnique({
            where: { id: String(id) },
            include: {
                marks: {
                    include: { student: true }
                },
                batch: {
                    select: { name: true, className: true }
                },
                batches: {
                    select: { id: true, name: true, className: true }
                }
            }
        });
        if (!test) return res.status(404).json({ error: 'Test not found' });
        if (test.teacherId && test.teacherId !== teacherId) return res.status(403).json({ error: 'Unauthorized' });
        res.json(test);
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch test details' });
    }
};

export const updateTest = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { name, date, maxMarks } = req.body;
    const teacherId = req.user?.id;

    try {
        const test = await prisma.test.findUnique({ where: { id: String(id) } });
        if (!test) return res.status(404).json({ error: 'Test not found' });
        if (test.teacherId && test.teacherId !== teacherId) return res.status(403).json({ error: 'Unauthorized' });

        const updated = await prisma.test.update({
            where: { id: String(id) },
            data: {
                name,
                date: date ? new Date(date) : undefined,
                maxMarks: maxMarks ? parseFloat(maxMarks) : undefined
            }
        });
        res.json(updated);
    } catch (e) {
        console.error('Error updating test:', e);
        res.status(500).json({ error: 'Failed to update test' });
    }
};

export const deleteTest = async (req: Request, res: Response) => {
    const { id } = req.params;
    const teacherId = req.user?.id;

    try {
        const test = await prisma.test.findUnique({ where: { id: String(id) } });
        if (!test) return res.status(404).json({ error: 'Test not found' });
        if (test.teacherId && test.teacherId !== teacherId) return res.status(403).json({ error: 'Unauthorized' });

        await prisma.test.delete({
            where: { id: String(id) }
        });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Failed to delete test' });
    }
};

export const downloadTestReport = async (req: Request, res: Response) => {
    const { id } = req.params;
    const teacherId = req.user?.id;
    try {
        const test = await prisma.test.findUnique({
            where: { id: String(id) },
            include: {
                marks: {
                    include: { student: true },
                    orderBy: { score: 'desc' }
                }
            }
        });

        if (test?.teacherId && test?.teacherId !== teacherId) {
            res.status(403).send('Unauthorized');
            return;
        }

        if (!test) {
            res.status(404).send('Test not found');
            return;
        }

        const PDFDocument = require('pdfkit');
        const doc = new PDFDocument({ margin: 50 });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=${test.name}_Report.pdf`);
        doc.pipe(res);

        // Add MathLogs branding
        addMathLogsHeader(doc, 30);
        doc.moveDown(2);

        // Header
        doc.fontSize(20).text(`Test: ${test.name}`, { align: 'center' });
        doc.moveDown(0.5);
        doc.fontSize(12).text(`Subject: ${test.subject}    Class: ${test.className || 'N/A'}`, { align: 'center' });
        doc.text(`Date: ${new Date(test.date).toLocaleDateString()}    Max Marks: ${test.maxMarks}`, { align: 'center' });
        doc.moveDown(2);

        // Table Header
        const startX = 50;
        let y = doc.y;

        doc.font('Helvetica-Bold');
        doc.text('Rank', startX, y);
        doc.text('Student Name', startX + 50, y);
        doc.text('Score', startX + 300, y, { width: 50, align: 'right' });
        doc.text('Percentage', startX + 400, y, { width: 80, align: 'right' });

        doc.moveTo(startX, y + 15).lineTo(550, y + 15).stroke();
        y += 25;
        doc.font('Helvetica');

        // Rows
        test.marks.forEach((mark: any, index: number) => {
            if (y > 700) {
                doc.addPage();
                y = 50;
            }

            doc.text((index + 1).toString(), startX, y);
            doc.text(mark.student?.name || 'Unknown', startX + 50, y);
            doc.text(mark.score.toString(), startX + 300, y, { width: 50, align: 'right' });

            const per = ((mark.score / test.maxMarks) * 100).toFixed(1) + '%';
            doc.text(per, startX + 400, y, { width: 80, align: 'right' });

            y += 20;
        });

        doc.end();

    } catch (e) {
        console.error(e);
        res.status(500).send('Error generating report');
    }
};

export const getTestEligibleStudents = async (req: Request, res: Response) => {
    const { id } = req.params;
    const teacherId = req.user?.id;

    try {
        // Fetch test details (lightweight query)
        const test = await prisma.test.findUnique({
            where: { id: String(id) },
            select: { teacherId: true, batchId: true, className: true, batches: { select: { id: true } } } // Fetch batchId and batches
        });

        if (!test) return res.status(404).json({ error: 'Test not found' });
        // Basic permission check
        if (test.teacherId && test.teacherId !== teacherId) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const students = await prisma.test.findUnique({ where: { id: String(id) }, include: { batches: true } }).then(async (testData) => {
            if(!testData) return [];
            
            const linkedBatchIds = testData.batches?.map((b: any) => b.id) || [];
            if (testData.batchId && !linkedBatchIds.includes(testData.batchId)) {
                linkedBatchIds.push(testData.batchId);
            }

            // If test has specific batchIds, ONLY show students from those batches
            if (linkedBatchIds.length > 0) {
                return prisma.student.findMany({
                    where: {
                        batchId: { in: linkedBatchIds },
                        status: 'APPROVED',
                        marks: {
                            none: {
                                testId: String(id)
                            }
                        }
                    },
                    include: {
                        batch: {
                            select: { name: true }
                        }
                    },
                    orderBy: { name: 'asc' }
                });
            } else {
                // Fallback for older tests that only had className
                return prisma.student.findMany({
                    where: {
                        batch: {
                            className: testData.className || undefined
                        },
                        status: 'APPROVED',
                        marks: {
                            none: {
                                testId: String(id)
                            }
                        }
                    },
                    include: {
                        batch: {
                            select: { name: true }
                        }
                    },
                    orderBy: { name: 'asc' }
                });
            }
        });

        const eligibleStudents = students.map((s: any) => ({
            id: s.id,
            name: s.name,
            batchName: s.batch?.name,
            humanId: s.humanId,
            parentWhatsapp: s.parentWhatsapp
        }));

        res.json(eligibleStudents);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to fetch eligible students' });
    }
}

export const sendTestResultsEmail = async (req: Request, res: Response) => {
    const { id } = req.params;
    const teacherId = req.user?.id;

    try {
        // 1. Fetch Test Details
        const test = await prisma.test.findUnique({
            where: { id: String(id) },
            select: {
                id: true,
                name: true,
                subject: true,
                date: true,
                maxMarks: true,
                className: true,
                teacherId: true,
                instituteId: true,
                batchId: true,
                batches: { select: { id: true } },
                institute: { select: { name: true } }
            }
        });

        if (!test) return res.status(404).json({ error: 'Test not found' });
        if (test.teacherId && test.teacherId !== teacherId) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        let students = [];

        const testBatchIds = test.batches?.map(b => b.id) || [];
        if (test.batchId && !testBatchIds.includes(test.batchId)) {
            testBatchIds.push(test.batchId);
        }

        if (testBatchIds.length > 0) {
            // Precise batch scoped tests don't need marks to know who should get messages!
            students = await prisma.student.findMany({
                where: {
                    batchId: { in: testBatchIds },
                    status: 'APPROVED'
                },
                include: {
                    marks: {
                        where: { testId: test.id },
                        select: { score: true }
                    }
                }
            });
        } else {
            // Legacy tests without strict batchId bounding 
            // We have to trace backwards from who has marks to figure out which batches to message
            const testMarks = await prisma.mark.findMany({
                where: { testId: test.id },
                select: { student: { select: { batchId: true } } }
            });

            const fallbackBatchIds = Array.from(new Set(
                testMarks.map(m => m.student?.batchId).filter(Boolean)
            )) as string[];

            if (fallbackBatchIds.length === 0) {
                return res.status(400).json({ error: 'No marks found for this legacy test. Cannot determine batches to message.' });
            }

            students = await prisma.student.findMany({
                where: {
                    batchId: {
                        in: fallbackBatchIds
                    },
                    status: 'APPROVED'
                },
                include: {
                    marks: {
                        where: { testId: test.id },
                        select: { score: true }
                    }
                }
            });
        }

        if (students.length === 0) {
            return res.status(400).json({ error: 'No students found for this test.' });
        }

        // 3. Prepare Email Jobs
        const emailJobs = students
            .filter(student => student.parentEmail) // Only those with email
            .map(student => {
                const mark = student.marks[0]; // Can be undefined if absent
                const isAbsent = !mark;

                const subjectLine = `Test Result: ${test.name} (${test.subject})`;

                let body = `Dear Parent,\n\n`;
                body += `Here is the result for the test conducted on ${new Date(test.date).toLocaleDateString()}.\n\n`;
                body += `Test Name: ${test.name}\n`;
                body += `Subject: ${test.subject}\n`;
                body += `Student Name: ${student.name}\n`;

                if (isAbsent) {
                    body += `Status: ABSENT\n\n`;
                    body += `Your child was marked absent for this test. Please contact the teacher if this is an error.\n`;
                } else {
                    body += `Status: PRESENT\n`;
                    body += `Score: ${mark.score} / ${test.maxMarks}\n`;
                    const percentage = ((mark.score / test.maxMarks) * 100).toFixed(1);
                    body += `Percentage: ${percentage}%\n\n`;
                    body += `Great effort! Encourage them to keep improving.\n`;
                }

                body += `\nRegards,\nMathLogs Team`;

                return {
                    recipient: student.parentEmail!,
                    subject: subjectLine,
                    body: body,
                    status: 'PENDING',
                    instituteId: test.instituteId,
                    options: {
                        senderType: 'NOREPLY' // Use Notification sender
                    }
                };
            });

        if (emailJobs.length === 0) {
            return res.status(200).json({ message: 'No students had valid email addresses to send results to.' });
        }

        // 4. Batch Insert Jobs
        // Prisma createMany is only supported for some DBs, but Postgres supports it.
        // However, Prisma schema might have issues if options is Json. Let's check.
        // 'options' is Json? so it should be fine.

        // Note: createMany with 'any' cast to bypass strict typing if needed, 
        // but let's try to match the type.
        // JobStatus is an enum 'PENDING'.



        // WhatsApp Integration (Meta Graph API via DB Queue)
        // Enqueueing to DB happens rapidly without blocking or rate-limit concerns.
        const { sendTestMarksWhatsApp } = await import('../utils/whatsapp');
        let whatsappSent = 0;
        let whatsappFailed = 0;

        for (const student of students) {
            if (!student.parentWhatsapp) continue;

            let phone = student.parentWhatsapp.replace(/[^0-9+]/g, '');
            if (!phone.startsWith('+')) {
                if (phone.length === 10) phone = '+91' + phone;
            }

            const mark = student.marks[0];
            const scoreValue = mark ? String(mark.score) : "ABSENT";

            try {
                const result = await sendTestMarksWhatsApp(phone, {
                    studentName: student.name,
                    instituteName: (test as any).institute?.name || "our institute",
                    testName: test.name,
                    totalMarks: String(test.maxMarks),
                    marksObtained: scoreValue
                });
                if (result !== false) whatsappSent++;
                else whatsappFailed++;
            } catch (err) {
                whatsappFailed++;
                console.error(`WhatsApp failed for ${phone}:`, err);
            }

        }

        if (whatsappFailed > 0) {
            secureLogger.warn(`[Test Results WA] ${whatsappSent} sent, ${whatsappFailed} failed for test ${test.id}`);
        }

        await prisma.emailJob.createMany({
            data: emailJobs.map(job => ({
                ...job,
                status: 'PENDING'
            })) as any
        });

        res.json({
            success: true,
            message: `Queued ${emailJobs.length} emails for sending.`
        });

    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to send results' });
    }
};

import crypto from 'crypto';

// In-memory job store for long-running AI tasks
const aiJobs = new Map<string, { status: 'pending' | 'completed' | 'error'; result?: any; error?: string }>();

export const generateAITest = async (req: Request, res: Response) => {
    const { topic, grade, difficulty, questionCount, comments, withVariants } = req.body;
    const parsedQuestionCount = Number.parseInt(String(questionCount), 10);
    
    if (!topic || !grade || !difficulty || !Number.isFinite(parsedQuestionCount) || parsedQuestionCount < 1 || parsedQuestionCount > 50) {
        return res.status(400).json({ error: "Missing required fields: topic, grade, difficulty, questionCount" });
    }
    
    try {
        const warnings: string[] = [];
        const validFiles: Array<{ buffer: Buffer; mimetype: string }> = [];

        if (req.files && Array.isArray(req.files)) {
            const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain'];
            for (const file of req.files as any[]) {
                if (file.size > 10 * 1024 * 1024) {
                    warnings.push(`File "${file.originalname}" was ignored because it exceeds the 10MB limit.`);
                    continue;
                }
                if (!allowedTypes.includes(file.mimetype)) {
                    warnings.push(`File "${file.originalname}" was ignored because its file type (${file.mimetype}) is not supported.`);
                    continue;
                }
                validFiles.push({ buffer: file.buffer, mimetype: file.mimetype });
            }
        } else if (req.file) {
            const file = req.file as any;
            if (file.size > 10 * 1024 * 1024) {
                warnings.push(`File "${file.originalname}" was ignored because it exceeds the 10MB limit.`);
            } else {
                validFiles.push({ buffer: file.buffer, mimetype: file.mimetype });
            }
        }

        const filesArg = validFiles.length > 0 ? validFiles : undefined;

        const jobId = crypto.randomUUID();
        aiJobs.set(jobId, { status: 'pending' });

        // Return immediately to avoid Heroku 30s timeout
        res.json({ jobId });

        // Run background task
        (async () => {
            try {
                let testData;
                if (withVariants === true || withVariants === 'true') {
                    testData = await generateTestWithVariants(topic, grade, difficulty, parsedQuestionCount, filesArg, comments);
                } else {
                    // If a PDF/file is provided, do not force the AI to hallucinate double the questions.
                    const targetAICount = filesArg ? parsedQuestionCount : parsedQuestionCount * 2;
                    testData = await generateTest(topic, grade, difficulty, targetAICount, filesArg, comments);
                }
                aiJobs.set(jobId, { status: 'completed', result: { ...testData, warnings } });
            } catch (e: any) {
                console.error("AI Background Gen Error:", e);
                aiJobs.set(jobId, { status: 'error', error: e.message || 'Unknown generation error' });
            }
        })();

    } catch (e: any) {
        console.error("AI Test Gen Init Error:", e);
        res.status(500).json({ error: "Failed to initialize test generation", details: e.message });
    }
};

export const getAITestJobStatus = async (req: Request, res: Response) => {
    const jobId = req.params.jobId as string;
    const job = aiJobs.get(jobId);
    
    if (!job) {
        return res.status(404).json({ error: 'Job not found or expired' });
    }
    
    // Automatically clean up memory after job completes/fails
    if (job.status === 'completed' || job.status === 'error') {
        setTimeout(() => aiJobs.delete(jobId), 300000); // 5 mins cleanup buffer
    }
    
    res.json(job);
};

export const generateSingleQuestionRoute = async (req: Request, res: Response) => {
    const { topic, grade, difficulty, excludeQuestions, comments } = req.body;
    
    if (!topic || !grade || !difficulty) {
        return res.status(400).json({ error: "Missing required fields: topic, grade, difficulty" });
    }
    
    try {
        const question = await generateSingleQuestion(
            topic,
            grade,
            difficulty,
            Array.isArray(excludeQuestions) ? excludeQuestions.map(String) : [],
            undefined,
            comments
        );
        res.json(question);
    } catch (e: any) {
        console.error("Single Question AI Gen Error:", e);
        res.status(500).json({ error: "Failed to generate question", details: e.message });
    }
};

export const generateVariantQuestionRoute = async (req: Request, res: Response) => {
    const { topic, grade, difficulty, originalQuestion, comments } = req.body;
    
    if (!topic || !grade || !difficulty || !originalQuestion) {
        return res.status(400).json({ error: "Missing required fields: topic, grade, difficulty, originalQuestion" });
    }
    
    try {
        const question = await generateVariantQuestion(
            String(originalQuestion),
            topic,
            grade,
            difficulty,
            comments
        );
        res.json(question);
    } catch (e: any) {
        console.error("Variant Question AI Gen Error:", e);
        res.status(500).json({ error: "Failed to generate variant question", details: e.message });
    }
};

export const saveOnlineQuiz = async (req: Request, res: Response) => {
    try {
        const { title, topic, difficulty, timeLimitMins, totalMarks, batchId, batchIds, studentQuestionCount, questions, availableFrom, availableUntil, isPublic, isDraft } = req.body;
        const teacherId = req.user?.id;
        const instituteId = req.user?.instituteId;

        // Support either batchId or batchIds
        const finalBatchIds: string[] = Array.isArray(batchIds) ? batchIds : (batchId ? [batchId] : []);

        const institute = await prisma.institute.findUnique({ where: { id: instituteId } });
        if (!institute) return res.status(404).json({ error: 'Institute not found' });
        
        // Draft: only requires a title (everything else can be empty/incomplete)
        if (isDraft === true) {
            if (!title) {
                return res.status(400).json({ error: 'Please provide a quiz title to save as draft' });
            }
        } else {
            if (!title || (!isPublic && finalBatchIds.length === 0) || !Array.isArray(questions) || questions.length === 0 || !instituteId || !availableFrom || !availableUntil) {
                return res.status(400).json({ error: 'Missing required fields' });
            }
        }

        // Validate teacher ownership of any selected batches; drafts just do not require one.
        let batches: { id: string }[] = [];
        if (finalBatchIds.length > 0) {
            const batchRecords = await prisma.batch.findMany({
                where: {
                    id: { in: finalBatchIds },
                    teacherId,
                    instituteId
                },
                select: { id: true }
            });

            if (batchRecords.length !== finalBatchIds.length) {
                return res.status(404).json({ error: 'One or more batches not found or unauthorized' });
            }
            batches = batchRecords;
        }
        let availableFromDate: Date | null = null;
        let availableUntilDate: Date | null = null;

        if (!isDraft) {
            availableFromDate = new Date(availableFrom);
            availableUntilDate = new Date(availableUntil);

            if (Number.isNaN(availableFromDate.getTime()) || Number.isNaN((availableUntilDate as Date).getTime())) {
                return res.status(400).json({ error: 'Invalid quiz schedule' });
            }

            if ((availableUntilDate as Date) <= availableFromDate) {
                return res.status(400).json({ error: 'Quiz end time must be after start time' });
            }
        }

        const normalizedQuestions = isDraft && (!Array.isArray(questions) || questions.length === 0)
            ? []
            : (questions as any[]).map((q: any, index: number) => {
            const options = Array.isArray(q.options) ? q.options.filter((option: unknown) => typeof option === 'string' && option.trim()) : [];
            const correctOption = normalizeCorrectAnswer(q.correctAnswer || q.correctOption);

            const correctOptions = Array.isArray(correctOption) ? correctOption : [correctOption];
            if (!q.questionText || options.length < 2 || correctOptions.length === 0 || correctOptions.some(option => !options.includes(option))) {
                throw new Error(`Question ${index + 1} is missing text, options, or answer`);
            }

            const imageUrl = q.imageUrl || q.figureUrl || q.image || null;

            return {
                questionText: String(q.questionText),
                orderIndex: index,
                options,
                correctOption: Array.isArray(correctOption) ? JSON.stringify(correctOption) : correctOption,
                marks: Number(q.marks) > 0 ? Number(q.marks) : 1,
                ...(imageUrl ? { imageUrl: String(imageUrl) } : {}),
                ...(q.variantGroup ? { variantGroup: String(q.variantGroup) } : {})
            };
        });

        const computedTotalMarks = normalizedQuestions.reduce((sum, q) => sum + q.marks, 0);
        const sqCount = Number.isInteger(studentQuestionCount) ? studentQuestionCount : null;
        let finalTotalMarks = Number(totalMarks) > 0 ? Number(totalMarks) : computedTotalMarks;
        if (sqCount && sqCount < normalizedQuestions.length) {
            const avgMarks = computedTotalMarks / normalizedQuestions.length;
            finalTotalMarks = avgMarks * sqCount;
        }

        const quiz = await prisma.$transaction(async (tx) => {
            const createdQuiz = await tx.onlineQuiz.create({
                data: {
                    title,
                    topic,
                    difficulty,
                    timeLimitMins: Math.max(1, Number(timeLimitMins) || 30),
                    totalMarks: finalTotalMarks,
                    availableFrom: availableFromDate,
                    availableUntil: availableUntilDate,
                    isFinalized: isDraft !== true,
                    batchId: finalBatchIds.length > 0 ? finalBatchIds[0] : null, // Backwards compatibility field
                    teacherId,
                    instituteId,
                    isPublic: isPublic === true,
                    studentQuestionCount: sqCount,
                    batches: finalBatchIds.length > 0 ? {
                        connect: finalBatchIds.map(id => ({ id }))
                    } : undefined,
                    questions: {
                        create: normalizedQuestions
                    }
                },
                include: {
                    batch: { select: { id: true, name: true, className: true } },
                    batches: { select: { id: true, name: true, className: true } },
                    questions: true,
                    _count: { select: { submissions: true } }
                }
            });

            if (!isDraft) await consumeQuizCreditsInTransaction(tx, instituteId!, 1);

            return createdQuiz;
        });

        if (!isDraft && process.env.NODE_ENV !== 'test') {
            void sendQuizScheduleBroadcast(quiz.id).catch((error) => {
                console.error(`[Quiz Schedule Broadcast] Failed for quiz ${quiz.id}:`, error);
            });
        }

        res.json(quiz);
    } catch (e: any) {
        console.error("Save Online Quiz Error:", e);
        if (e instanceof QuizCreditWalletError) {
            const errorMessages: Record<string, string> = {
                QUIZ_PLAN_INACTIVE: 'Quiz access is inactive. Start or renew a Quiz or Enterprise plan to publish quizzes.',
                INSUFFICIENT_QUIZ_CREDITS: 'Insufficient quiz credits. Purchase extra credits or wait for your next monthly refresh.'
            };
            return res.status(403).json({ error: errorMessages[e.message] ?? e.message });
        }
        if (e.message?.startsWith('Question ')) {
            return res.status(400).json({ error: e.message });
        }
        res.status(500).json({ error: 'Failed to save online quiz', details: e.message });
    }
};

export const getOnlineQuizzes = async (req: Request, res: Response) => {
    try {
        const teacherId = req.user?.id;
        const instituteId = req.user?.instituteId;
        const quizzes = await prisma.onlineQuiz.findMany({
            where: { teacherId, instituteId },
            orderBy: { createdAt: 'desc' },
            include: {
                batch: {
                    select: {
                        id: true,
                        name: true,
                        className: true,
                        students: {
                            where: { status: 'APPROVED' },
                            select: {
                                id: true,
                                name: true,
                                humanId: true
                            }
                        }
                    }
                },
                batches: {
                    select: {
                        id: true,
                        name: true,
                        className: true,
                        students: {
                            where: { status: 'APPROVED' },
                            select: {
                                id: true,
                                name: true,
                                humanId: true
                            }
                        }
                    }
                },
                questions: {
                    select: {
                        id: true,
                        questionText: true,
                        orderIndex: true,
                        options: true,
                        correctOption: true,
                        marks: true,
                        variantGroup: true
                    }
                },
                submissions: {
                    select: {
                        id: true,
                        studentId: true,
                        startedAt: true,
                        submittedAt: true,
                        score: true,
                        shuffledQuestions: true,
                        student: {
                            select: {
                                id: true,
                                name: true,
                                humanId: true
                            }
                        },
                        answers: {
                            select: {
                                questionId: true,
                                selectedOption: true,
                                isCorrect: true,
                                marksObtained: true
                            }
                        }
                    }
                },
                _count: { select: { submissions: true } }
            }
        });
        res.json(quizzes);
    } catch (e: any) {
        console.error("Fetch quizzes error:", e);
        res.status(500).json({ error: 'Failed to fetch online quizzes' });
    }
};

export const updateOnlineQuiz = async (req: Request, res: Response) => {
    try {
        const quizId = String(req.params.id);
        const teacherId = req.user?.id;
        const instituteId = req.user?.instituteId;
        const { title, topic, difficulty, timeLimitMins, totalMarks, batchIds, studentQuestionCount, questions, availableFrom, availableUntil, isPublic, isDraft } = req.body;
        let normalizedQuestions: any[] | undefined = undefined;

        const quiz = await prisma.onlineQuiz.findFirst({
            where: { id: quizId, teacherId, instituteId },
            include: {
                questions: true,
                _count: { select: { submissions: true } }
            }
        });

        if (!quiz) {
            return res.status(404).json({ error: 'Quiz not found' });
        }

        const now = new Date();
        const tenMinutesFromNow = new Date(now.getTime() + 10 * 60 * 1000);
        if (quiz.availableFrom && quiz.availableFrom <= tenMinutesFromNow) {
            return res.status(400).json({ error: 'Cannot edit quiz within 10 minutes of its schedule time or after it has started' });
        }

        if (quiz._count.submissions > 0) {
            return res.status(400).json({ error: 'Cannot edit quiz after students have already started/submitted attempts' });
        }

        if (isDraft === true && !title) {
            return res.status(400).json({ error: 'Please provide a quiz title to save as draft' });
        }

        let availableFromDate: Date | null = null;
        let availableUntilDate: Date | null = null;

        if (!isDraft) {
            availableFromDate = new Date(availableFrom);
            availableUntilDate = new Date(availableUntil);

            if (Number.isNaN(availableFromDate.getTime()) || Number.isNaN(availableUntilDate.getTime())) {
                return res.status(400).json({ error: 'Invalid quiz schedule' });
            }

            // New start time must be at least 10 minutes from now
            const nowCheck = new Date();
            const tenMinsFromNow = new Date(nowCheck.getTime() + 10 * 60 * 1000);
            if (availableFromDate <= tenMinsFromNow) {
                return res.status(400).json({ error: 'New start time must be at least 10 minutes from now' });
            }

            if (availableUntilDate <= availableFromDate) {
                return res.status(400).json({ error: 'Quiz end time must be after start time' });
            }
        }

        let connectBatches: { id: string }[] = [];
        let finalBatchId = quiz.batchId;
        if (Array.isArray(batchIds) && batchIds.length > 0) {
            const targetBatches = await prisma.batch.findMany({
                where: {
                    id: { in: batchIds },
                    teacherId,
                    instituteId
                },
                select: { id: true }
            });
            if (targetBatches.length !== batchIds.length) {
                return res.status(404).json({ error: 'One or more selected batches were not found or unauthorized' });
            }
            connectBatches = batchIds.map(id => ({ id }));
            finalBatchId = batchIds[0];
        }

        if (Array.isArray(questions)) {
            normalizedQuestions = questions.map((q: any, index: number) => {
                const options = Array.isArray(q.options) ? q.options.filter((option: unknown) => typeof option === 'string' && option.trim()) : [];
                const correctOption = normalizeCorrectAnswer(q.correctAnswer || q.correctOption);

                const correctOptions = Array.isArray(correctOption) ? correctOption : [correctOption];
                if (!q.questionText || options.length < 2 || correctOptions.length === 0 || correctOptions.some(option => !options.includes(option))) {
                    throw new Error(`Question ${index + 1} is missing text, options, or answer`);
                }

                return {
                    questionText: String(q.questionText),
                    orderIndex: index,
                    options,
                    correctOption: Array.isArray(correctOption) ? JSON.stringify(correctOption) : correctOption,
                    marks: Number(q.marks) > 0 ? Number(q.marks) : 1,
                    ...(q.imageUrl ? { imageUrl: String(q.imageUrl) } : {}),
                    ...(q.variantGroup ? { variantGroup: String(q.variantGroup) } : {})
                };
            });
        }

        const sqCount = Number.isInteger(studentQuestionCount) ? studentQuestionCount : (studentQuestionCount === null ? null : quiz.studentQuestionCount);
        const activeQuestions = normalizedQuestions || quiz.questions;
        const computedTotalMarksPool = activeQuestions.reduce((sum: number, q: any) => sum + q.marks, 0);

        let finalTotalMarks = Number(totalMarks) > 0 ? Number(totalMarks) : (normalizedQuestions ? computedTotalMarksPool : quiz.totalMarks);
        if (sqCount && sqCount < activeQuestions.length) {
            const avgMarks = computedTotalMarksPool / activeQuestions.length;
            finalTotalMarks = avgMarks * sqCount;
        }

        const shouldConsumeCredit = !quiz.isFinalized && isDraft !== true;
        let updatedQuiz;
        if (normalizedQuestions) {
            updatedQuiz = await prisma.$transaction(async (tx) => {
                if (shouldConsumeCredit) {
                    const claimed = await tx.onlineQuiz.updateMany({ where: { id: quizId, teacherId, instituteId, isFinalized: false }, data: { isFinalized: true } });
                    if (claimed.count === 1) await consumeQuizCreditsInTransaction(tx, instituteId!, 1);
                }
                await tx.quizQuestion.deleteMany({ where: { quizId } });
                return await tx.onlineQuiz.update({
                    where: { id: quizId },
                    data: {
                        title,
                        topic,
                        difficulty,
                        timeLimitMins: Math.max(1, Number(timeLimitMins) || 30),
                        totalMarks: finalTotalMarks,
                        availableFrom: availableFromDate,
                        availableUntil: availableUntilDate,
                        isFinalized: isDraft !== true,
                        isPublic: typeof isPublic === 'boolean' ? isPublic : quiz.isPublic,
                        batchId: finalBatchId,
                        studentQuestionCount: sqCount,
                        ...(connectBatches.length > 0 ? {
                            batches: {
                                set: connectBatches
                            }
                        } : {}),
                        questions: {
                            create: normalizedQuestions
                        }
                    },
                    include: {
                        batch: { select: { id: true, name: true, className: true } },
                        batches: { select: { id: true, name: true, className: true } },
                        questions: true,
                        _count: { select: { submissions: true } }
                    }
                });
            }, { maxWait: 15000, timeout: 35000 });
        } else {
            updatedQuiz = await prisma.$transaction(async (tx) => {
                if (shouldConsumeCredit) {
                    const claimed = await tx.onlineQuiz.updateMany({ where: { id: quizId, teacherId, instituteId, isFinalized: false }, data: { isFinalized: true } });
                    if (claimed.count === 1) await consumeQuizCreditsInTransaction(tx, instituteId!, 1);
                }
                return tx.onlineQuiz.update({ where: { id: quizId }, data: {
                    title,
                    topic,
                    difficulty,
                    timeLimitMins: Math.max(1, Number(timeLimitMins) || 30),
                    totalMarks: finalTotalMarks,
                    availableFrom: availableFromDate,
                    availableUntil: availableUntilDate,
                    isFinalized: isDraft !== true,
                    isPublic: typeof isPublic === 'boolean' ? isPublic : quiz.isPublic,
                    batchId: finalBatchId,
                    studentQuestionCount: sqCount,
                    ...(connectBatches.length > 0 ? {
                        batches: {
                            set: connectBatches
                        }
                    } : {})
                },
                include: {
                    batch: { select: { id: true, name: true, className: true } },
                    batches: { select: { id: true, name: true, className: true } },
                    questions: true,
                    _count: { select: { submissions: true } }
                } });
            });
        }

        await quizCache.invalidate(quizId);
        res.json(updatedQuiz);
    } catch (e: any) {

        console.error("Update Online Quiz Error:", e);
        if (e instanceof QuizCreditWalletError) {
            return res.status(e.message === 'INSUFFICIENT_QUIZ_CREDITS' ? 402 : 403).json({ error: e.message });
        }
        if (e.message?.startsWith('Question ')) {
            return res.status(400).json({ error: e.message });
        }
        res.status(500).json({ error: 'Failed to update online quiz', details: e.message });
    }
};

export const deleteOnlineQuiz = async (req: Request, res: Response) => {
    try {
        const quizId = String(req.params.id);
        const teacherId = req.user?.id;
        const instituteId = req.user?.instituteId;

        const quiz = await prisma.onlineQuiz.findFirst({
            where: { id: quizId, teacherId, instituteId },
            include: { _count: { select: { submissions: true } } }
        });

        if (!quiz) {
            return res.status(404).json({ error: 'Quiz not found' });
        }

        const now = new Date();
        const tenMinutesFromNow = new Date(now.getTime() + 10 * 60 * 1000);
        if (quiz.availableFrom && quiz.availableFrom <= tenMinutesFromNow) {
            return res.status(400).json({ error: 'Cannot delete quiz within 10 minutes of its schedule time or after it has started' });
        }

        if (quiz._count.submissions > 0) {
            return res.status(400).json({ error: 'Cannot delete quiz after students have already started/submitted attempts' });
        }

        await prisma.onlineQuiz.delete({
            where: { id: quizId }
        });

        await quizCache.invalidate(quizId);
        res.json({ success: true, message: 'Quiz deleted successfully' });
    } catch (e: any) {
        console.error("Delete Online Quiz Error:", e);
        res.status(500).json({ error: 'Failed to delete online quiz', details: e.message });
    }
};

export const finalizeOnlineQuiz = async (req: Request, res: Response) => {
    try {
        const quizId = String(req.params.id);
        const teacherId = req.user?.id;
        const instituteId = req.user?.instituteId;

        const result = await prisma.$transaction(async (tx) => {
            const quiz = await tx.onlineQuiz.findFirst({
                where: { id: quizId, teacherId, instituteId },
                include: {
                    batch: {
                        select: {
                            id: true,
                            className: true
                        }
                    },
                    batches: {
                        select: {
                            id: true
                        }
                    },
                    submissions: {
                        where: {
                            submittedAt: { not: null },
                            score: { not: null }
                        },
                        select: {
                            studentId: true,
                            score: true
                        }
                    }
                }
            });

            if (!quiz) {
                throw new Error("QUIZ_NOT_FOUND");
            }

            if (quiz.isFinalized) {
                return { success: true, isFinalized: true, message: 'Quiz was already finalized.' };
            }

            const updated = await tx.onlineQuiz.update({
                where: { id: quizId },
                data: { isFinalized: true },
                select: { id: true, isFinalized: true }
            });

            const connectedBatchIds = quiz.batches.length > 0 ? quiz.batches.map(b => ({ id: b.id })) : (quiz.batchId ? [{ id: quiz.batchId }] : []);

            // Create mirrored manual Test record
            const mirroredTest = await tx.test.create({
                data: {
                    name: quiz.title,
                    subject: quiz.topic || "Quiz",
                    className: quiz.batch?.className || null,
                    date: quiz.availableFrom || quiz.createdAt,
                    maxMarks: quiz.totalMarks,
                    teacherId,
                    instituteId,
                    batchId: quiz.batchId,
                    isQuiz: true,
                    batches: {
                        connect: connectedBatchIds
                    }
                }
            });

            // Mirror completed scores as Marks
            for (const sub of quiz.submissions) {
                await tx.mark.upsert({
                    where: {
                        studentId_testId: {
                            studentId: sub.studentId,
                            testId: mirroredTest.id
                        }
                    },
                    update: {
                        score: sub.score ?? 0
                    },
                    create: {
                        testId: mirroredTest.id,
                        studentId: sub.studentId,
                        score: sub.score ?? 0
                    }
                });
            }

            return { success: true, ...updated };
        }, { maxWait: 20000, timeout: 60000 });

        if (process.env.NODE_ENV !== 'test') {
            void sendQuizMarksBroadcast(quizId).catch((error) => {
                console.error(`[Quiz Marks Broadcast] Failed for quiz ${quizId}:`, error);
            });
        }

        res.json(result);
    } catch (e: any) {
        console.error('Finalize Online Quiz Error:', e);
        if (e.message === "QUIZ_NOT_FOUND") {
            return res.status(404).json({ error: 'Quiz not found' });
        }
        res.status(500).json({ error: 'Failed to finalize quiz', details: e.message });
    }
};

function escapeCsv(value: unknown) {
    if (value === null || value === undefined) return '';
    const text = String(value);
    if (/[",\n\r]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
}

function formatCsvDate(value?: Date | null) {
    return value ? value.toISOString() : '';
}

export const downloadOnlineQuizReport = async (req: Request, res: Response) => {
    try {
        const quizId = String(req.params.id);
        const teacherId = req.user?.id;
        const instituteId = req.user?.instituteId;

        const quiz = await prisma.onlineQuiz.findFirst({
            where: { id: quizId, teacherId, instituteId },
            include: {
                submissions: {
                    include: {
                        student: {
                            select: { name: true, humanId: true, parentWhatsapp: true, parentEmail: true }
                        },
                        cheatingEvents: {
                            select: { eventType: true }
                        }
                    },
                    orderBy: { score: 'desc' }
                }
            }
        });

        if (!quiz) {
            return res.status(404).json({ error: 'Quiz not found' });
        }

        const headers = [
            'Rank',
            'Student Name',
            'Student ID',
            'Parent WhatsApp',
            'Parent Email',
            'Score',
            'Total Marks',
            'Percentage',
            'Started At',
            'Submitted At',
            'Status',
            'Integrity Flags',
            'Event Breakdown'
        ];

        const rows = quiz.submissions.map((submission, index) => {
            const score = Number(submission.score || 0);
            const percentage = quiz.totalMarks > 0 ? ((score / quiz.totalMarks) * 100).toFixed(1) : '0.0';
            const eventBreakdown = submission.cheatingEvents.reduce<Record<string, number>>((acc, event) => {
                acc[event.eventType] = (acc[event.eventType] || 0) + 1;
                return acc;
            }, {});

            return [
                index + 1,
                submission.student.name,
                submission.student.humanId,
                submission.student.parentWhatsapp,
                submission.student.parentEmail,
                score,
                quiz.totalMarks,
                `${percentage}%`,
                formatCsvDate(submission.startedAt),
                formatCsvDate(submission.submittedAt),
                submission.submittedAt ? 'Submitted' : 'Started',
                submission.cheatingEvents.length,
                Object.entries(eventBreakdown).map(([type, count]) => `${type}:${count}`).join('; ')
            ];
        });

        const csv = [headers, ...rows]
            .map((row) => row.map(escapeCsv).join(','))
            .join('\n');

        const fileSafeTitle = quiz.title.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'online_quiz';
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${fileSafeTitle}_report.csv"`);
        res.send(csv);
    } catch (e: any) {
        console.error('Download Online Quiz Report Error:', e);
        res.status(500).json({ error: 'Failed to generate online quiz report' });
    }
};

export const downloadOnlineQuizQuestionsPdf = async (req: Request, res: Response) => {
    const { id } = req.params;
    const teacherId = req.user?.id;
    const instituteId = req.user?.instituteId;

    try {
        const quiz = await prisma.onlineQuiz.findFirst({
            where: { id: String(id), teacherId, instituteId },
            include: {
                questions: {
                    orderBy: { orderIndex: 'asc' }
                }
            }
        });

        if (!quiz) {
            return res.status(404).send('Quiz not found');
        }

        const PDFDocument = require('pdfkit');
        const doc = new PDFDocument({ margin: 50, size: 'A4' });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${quiz.title.replace(/[^a-zA-Z0-9-_]/g, '_')}_Questions.pdf"`);
        doc.pipe(res);

        // Add MathLogs branding
        addMathLogsHeader(doc, 30);
        doc.moveDown(1.5);

        // Title Block
        doc.font('Helvetica-Bold').fontSize(22).fillColor('#000000').text(quiz.title, { align: 'left' });
        doc.moveDown(0.2);

        // Sub-bar
        doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(1.5).strokeColor('#000000').stroke();
        doc.moveDown(0.8);

        // Metadata grid (2 columns)
        const currentY = doc.y;
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#333333');
        doc.text('Topic:', 50, currentY);
        doc.font('Helvetica').text(quiz.topic || 'N/A', 130, currentY);

        doc.font('Helvetica-Bold').text('Difficulty:', 300, currentY);
        doc.font('Helvetica').text(quiz.difficulty || 'N/A', 380, currentY);

        doc.moveDown(0.5);
        const currentY2 = doc.y;
        doc.font('Helvetica-Bold').text('Time Limit:', 50, currentY2);
        doc.font('Helvetica').text(`${quiz.timeLimitMins} mins`, 130, currentY2);

        doc.font('Helvetica-Bold').text('Total Marks:', 300, currentY2);
        doc.font('Helvetica').text(`${quiz.totalMarks}`, 380, currentY2);

        doc.moveDown(0.5);
        const currentY3 = doc.y;
        doc.font('Helvetica-Bold').text('Student Question Limit:', 50, currentY3);
        doc.font('Helvetica').text(quiz.studentQuestionCount ? `${quiz.studentQuestionCount} of ${quiz.questions.length}` : `All (${quiz.questions.length})`, 180, currentY3);

        const fromStr = quiz.availableFrom ? new Date(quiz.availableFrom).toLocaleString() : 'N/A';
        const untilStr = quiz.availableUntil ? new Date(quiz.availableUntil).toLocaleString() : 'N/A';
        doc.font('Helvetica-Bold').text('Schedule:', 300, currentY3);
        doc.font('Helvetica').fontSize(9).text(`${fromStr} to ${untilStr}`, 380, currentY3);

        doc.moveDown(1.5);
        doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(0.5).strokeColor('#cccccc').stroke();
        doc.moveDown(1.5);

        // Questions header
        doc.font('Helvetica-Bold').fontSize(14).fillColor('#000000').text('Question Pool List');
        doc.moveDown(1);

        // Loop questions
        quiz.questions.forEach((q, index) => {
            if (doc.y > 650) {
                doc.addPage();
                addMathLogsHeader(doc, 30);
                doc.moveDown(1.5);
            }

            // Question number & Marks
            doc.font('Helvetica-Bold').fontSize(11).fillColor('#000000');
            doc.text(`Q${index + 1}.`, 50, doc.y, { continued: true });
            doc.font('Helvetica').text(` (${q.marks} Mark${q.marks > 1 ? 's' : ''})`, { continued: true });
            doc.text(' - ', { continued: true });
            doc.font('Helvetica-Bold').text(q.questionText);
            doc.moveDown(0.5);

            // Options
            const options = Array.isArray(q.options) ? (q.options as any[]) : [];
            options.forEach((opt: any, optIndex: number) => {
                const prefix = String.fromCharCode(65 + optIndex) + ') ';
                doc.font('Helvetica').fontSize(10).fillColor('#444444').text(`      ${prefix}${opt}`);
                doc.moveDown(0.2);
            });

            doc.moveDown(0.4);

            const boxY = doc.y;
            doc.rect(50, boxY, 495, 22).fillColor('#f5f5f5').fill();
            doc.fillColor('#000000').font('Helvetica-Bold').fontSize(9.5).text(`Correct Answer: ${formatCorrectAnswer(q.correctOption)}`, 65, boxY + 6);
            doc.moveDown(1.5);
        });

        doc.end();

    } catch (error: any) {
        console.error("PDF generation error:", error);
        res.status(500).send("Failed to generate PDF");
    }
};

export const downloadOnlineQuizReportPdf = async (req: Request, res: Response) => {
    const { id } = req.params;
    const teacherId = req.user?.id;
    const instituteId = req.user?.instituteId;

    try {
        const quiz = await prisma.onlineQuiz.findUnique({
            where: { id: String(id) },
            include: {
                questions: {
                    select: {
                        id: true,
                        marks: true
                    }
                },
                submissions: {
                    include: {
                        student: {
                            select: {
                                name: true,
                                humanId: true
                            }
                        },
                        cheatingEvents: {
                            select: {
                                id: true
                            }
                        }
                    },
                    orderBy: [
                        { score: 'desc' },
                        { submittedAt: 'desc' }
                    ]
                }
            }
        });

        if (!quiz) {
            return res.status(404).send('Quiz not found');
        }

        if (quiz.teacherId && quiz.teacherId !== teacherId) {
            return res.status(403).send('Unauthorized');
        }

        const completedSubmissions = quiz.submissions.filter(s => s.submittedAt !== null);
        const totalSubmissions = quiz.submissions.length;
        const completedCount = completedSubmissions.length;

        let avgScore = 0;
        let highScore = 0;
        let passCount = 0;
        let flaggedCount = 0;

        if (completedCount > 0) {
            const scores = completedSubmissions.map(s => s.score || 0);
            avgScore = scores.reduce((sum, s) => sum + s, 0) / completedCount;
            highScore = Math.max(...scores);

            const passingScore = quiz.totalMarks * 0.5;
            passCount = completedSubmissions.filter(s => (s.score || 0) >= passingScore).length;
        }

        flaggedCount = quiz.submissions.filter(s => s.cheatingEvents.length > 0).length;

        const passRate = completedCount > 0 ? (passCount / completedCount) : 0;
        const flagRate = totalSubmissions > 0 ? (flaggedCount / totalSubmissions) : 0;

        const PDFDocument = require('pdfkit');
        const doc = new PDFDocument({ margin: 50, size: 'A4' });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${quiz.title.replace(/[^a-zA-Z0-9-_]/g, '_')}_Report.pdf"`);
        doc.pipe(res);

        // Add MathLogs branding
        addMathLogsHeader(doc, 30);
        doc.moveDown(1.5);

        // Header
        doc.font('Helvetica-Bold').fontSize(20).fillColor('#000000').text('Quiz Submission Report', { align: 'left' });
        doc.font('Helvetica').fontSize(11).fillColor('#4b5563').text(`Quiz: ${quiz.title}  |  Topic: ${quiz.topic || 'N/A'}`);
        doc.moveDown(0.5);

        doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(1.5).strokeColor('#111827').stroke();
        doc.moveDown(1);

        // KPI Cards Y position
        const cardsY = doc.y;
        const cardWidth = 113;
        const cardHeight = 45;
        const spacing = 14;

        const kpis = [
            { label: 'Total Attempts', val: totalSubmissions.toString() },
            { label: 'Average Score', val: `${avgScore.toFixed(1)} / ${quiz.totalMarks}` },
            { label: 'Highest Score', val: `${highScore} / ${quiz.totalMarks}` },
            { label: 'Pass Rate', val: `${(passRate * 100).toFixed(1)}%` }
        ];

        kpis.forEach((kpi, idx) => {
            const cardX = 50 + idx * (cardWidth + spacing);
            doc.roundedRect(cardX, cardsY, cardWidth, cardHeight, 4).fillColor('#f9fafb').fill();
            doc.roundedRect(cardX, cardsY, cardWidth, cardHeight, 4).lineWidth(1).strokeColor('#e5e7eb').stroke();

            // Text
            doc.font('Helvetica-Bold').fontSize(8).fillColor('#6b7280').text(kpi.label.toUpperCase(), cardX + 10, cardsY + 10);
            doc.font('Helvetica-Bold').fontSize(12).fillColor('#111827').text(kpi.val, cardX + 10, cardsY + 23);
        });

        doc.y = cardsY + cardHeight + 15;

        // Performance & Integrity section
        doc.font('Helvetica-Bold').fontSize(11).fillColor('#111827').text('Performance & Integrity Summary');
        doc.moveDown(0.5);

        // Pass Rate Bar
        const passBarY = doc.y;
        doc.font('Helvetica').fontSize(9).fillColor('#4b5563').text(`Pass Rate: ${(passRate * 100).toFixed(1)}% (Passing Score: >= ${(quiz.totalMarks * 0.5).toFixed(1)})`, 50, passBarY);

        const trackX = 50;
        const trackWidth = 495;
        const trackHeight = 10;
        const trackY = passBarY + 14;

        // Draw track
        doc.roundedRect(trackX, trackY, trackWidth, trackHeight, 3).fillColor('#e5e7eb').fill();
        if (passRate > 0) {
            const fillWidth = trackWidth * passRate;
            doc.roundedRect(trackX, trackY, fillWidth, trackHeight, 3).fillColor('#111827').fill();
        }

        // Integrity Flag Rate Bar
        const integrityY = trackY + 22;
        doc.font('Helvetica').fontSize(9).fillColor('#4b5563').text(`Integrity Flag Rate: ${(flagRate * 100).toFixed(1)}% (${flaggedCount} of ${totalSubmissions} flagged for cheating warnings)`, 50, integrityY);

        const integrityTrackY = integrityY + 14;
        doc.roundedRect(trackX, integrityTrackY, trackWidth, trackHeight, 3).fillColor('#e5e7eb').fill();
        if (flagRate > 0) {
            const fillWidth = trackWidth * flagRate;
            doc.roundedRect(trackX, integrityTrackY, fillWidth, trackHeight, 3).fillColor('#6b7280').fill();
        }

        doc.y = integrityTrackY + 25;
        doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(0.5).strokeColor('#e5e7eb').stroke();
        doc.moveDown(1.2);

        // Submissions Title
        doc.font('Helvetica-Bold').fontSize(12).fillColor('#111827').text('Student Submissions');
        doc.moveDown(0.8);

        // Submissions Table
        const drawTableHeader = (y: number) => {
            doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#1f2937');
            doc.text('Rank', 50, y);
            doc.text('Student Name', 90, y);
            doc.text('Student ID', 265, y);
            doc.text('Score', 335, y, { width: 65, align: 'right' });
            doc.text('%', 405, y, { width: 50, align: 'right' });
            doc.text('Warnings', 460, y, { width: 85, align: 'center' });

            // Bottom border
            doc.moveTo(50, y + 14).lineTo(545, y + 14).lineWidth(1).strokeColor('#374151').stroke();
            return y + 22;
        };

        let currentY = doc.y;
        currentY = drawTableHeader(currentY);

        quiz.submissions.forEach((submission: any, index: number) => {
            if (currentY > 730) {
                doc.addPage();
                addMathLogsHeader(doc, 30);
                doc.moveDown(1.5);
                currentY = doc.y;
                currentY = drawTableHeader(currentY);
            }

            const isLocked = submission.cheatingEvents.length >= 5;
            const statusStr = isLocked 
                ? 'LOCKED' 
                : (submission.submittedAt ? 'Done' : 'Active');

            const name = submission.student?.name || 'Unknown';
            const humanId = submission.student?.humanId || 'N/A';
            const scoreVal = submission.score !== null ? `${submission.score} / ${quiz.totalMarks}` : 'In Progress';
            const percentageStr = submission.score !== null 
                ? `${((submission.score / quiz.totalMarks) * 100).toFixed(1)}%` 
                : 'N/A';
            const warningsCount = submission.cheatingEvents.length;

            if (index % 2 === 0) {
                doc.rect(50, currentY - 2, 495, 20).fillColor('#f9fafb').fill();
            }

            doc.font('Helvetica').fontSize(9).fillColor('#374151');
            doc.text((index + 1).toString(), 50, currentY);
            doc.text(name, 90, currentY, { width: 165, height: 12, ellipsis: true });
            doc.text(humanId, 265, currentY, { width: 65, height: 12, ellipsis: true });
            doc.text(scoreVal, 335, currentY, { width: 65, align: 'right' });
            doc.text(percentageStr, 405, currentY, { width: 50, align: 'right' });

            if (warningsCount > 0) {
                const color = warningsCount >= 5 ? '#dc2626' : '#d97706';
                doc.font('Helvetica-Bold').fillColor(color).text(`${warningsCount} flagged (${statusStr})`, 460, currentY, { width: 85, align: 'center' });
            } else {
                doc.fillColor('#9ca3af').text('0', 460, currentY, { width: 85, align: 'center' });
            }

            currentY += 20;
        });

        doc.end();

    } catch (error: any) {
        console.error("PDF generation error:", error);
        res.status(500).send("Failed to generate PDF");
    }
};
