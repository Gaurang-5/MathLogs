import { Request, Response } from 'express';
import { prisma } from '../prisma';
import PDFDocument from 'pdfkit';
import { addMathLogsHeader } from '../utils/pdfUtils';

export const createTest = async (req: Request, res: Response) => {
    const { name, subject, date, maxMarks, className } = req.body;
    const teacherId = (req as any).user?.id;
    const user = (req as any).user;
    const academicYearId = (req as any).user?.currentAcademicYearId;

    if (!teacherId) return res.status(401).json({ error: 'Unauthorized' });
    if (!user.instituteId) return res.status(401).json({ error: 'No institute assigned' });
    if (!academicYearId) return res.status(400).json({ error: 'No academic year selected' });

    try {
        const test = await prisma.test.create({
            data: {
                name,
                subject,
                className,
                date: new Date(date),
                maxMarks: parseFloat(maxMarks),
                teacherId,
                academicYearId,
                instituteId: user.instituteId  // ✅ SECURITY: Multi-tenant isolation
            }
        });
        res.json(test);
    } catch (e) {
        res.status(500).json({ error: 'Failed to create test' });
    }
};

export const getTests = async (req: Request, res: Response) => {
    try {
        const teacherId = (req as any).user?.id;
        const academicYearId = (req as any).user?.currentAcademicYearId;

        const tests = await prisma.test.findMany({
            where: {
                teacherId,
                academicYearId
            },
            orderBy: { date: 'desc' },
            include: {
                _count: {
                    select: { marks: true }
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
    const teacherId = (req as any).user?.id;

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
            select: { academicYearId: true, instituteId: true }
        });

        if (!student) return res.status(404).json({ error: 'Student not found' });

        // Ensure student belongs to same academic year as test
        if (student.academicYearId && test.academicYearId && student.academicYearId !== test.academicYearId) {
            return res.status(400).json({ error: 'Student belongs to a different academic year' });
        }

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
    const teacherId = (req as any).user?.id;
    const currentAcademicYearId = (req as any).user?.currentAcademicYearId;

    try {
        // FIX: Use findFirst with academicYearId filter due to composite unique constraint
        // @@unique([humanId, academicYearId]) means humanId alone is not unique
        const student = await prisma.student.findFirst({
            where: {
                humanId: String(humanId),
                academicYearId: currentAcademicYearId
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
    const teacherId = (req as any).user?.id;
    try {
        const test = await prisma.test.findUnique({
            where: { id: String(id) },
            include: {
                marks: {
                    include: { student: true }
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
    const teacherId = (req as any).user?.id;
    const currentAcademicYearId = (req as any).user?.currentAcademicYearId;

    try {
        const test = await prisma.test.findUnique({ where: { id: String(id) } });
        if (!test) return res.status(404).json({ error: 'Test not found' });
        if (test.teacherId && test.teacherId !== teacherId) return res.status(403).json({ error: 'Unauthorized' });

        // Academic year boundary check
        if (test.academicYearId && test.academicYearId !== currentAcademicYearId) {
            return res.status(400).json({ error: 'Cannot modify test from non-active academic year' });
        }

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
        res.status(500).json({ error: 'Failed to update test' });
    }
};

export const deleteTest = async (req: Request, res: Response) => {
    const { id } = req.params;
    const teacherId = (req as any).user?.id;
    const currentAcademicYearId = (req as any).user?.currentAcademicYearId;

    try {
        const test = await prisma.test.findUnique({ where: { id: String(id) } });
        if (!test) return res.status(404).json({ error: 'Test not found' });
        if (test.teacherId && test.teacherId !== teacherId) return res.status(403).json({ error: 'Unauthorized' });

        // Academic year boundary check
        if (test.academicYearId && test.academicYearId !== currentAcademicYearId) {
            return res.status(400).json({ error: 'Cannot delete test from non-active academic year' });
        }

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
    const teacherId = (req as any).user?.id;
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
    const teacherId = (req as any).user?.id;
    const currentAcademicYearId = (req as any).user?.currentAcademicYearId;

    try {
        // Fetch test details (lightweight query)
        const test = await prisma.test.findUnique({
            where: { id: String(id) },
            select: { teacherId: true, className: true } // Only fetch what's needed
        });

        if (!test) return res.status(404).json({ error: 'Test not found' });
        // Basic permission check
        if (test.teacherId && test.teacherId !== teacherId) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        // Find students:
        // 1. Same Academic Year
        // 2. Matching Class Name (via Batch)
        // 3. Approved status
        // 4. NO existing mark for this test (DB-level filtering)
        const students = await prisma.student.findMany({
            where: {
                academicYearId: currentAcademicYearId,
                batch: {
                    className: test.className || undefined
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

        const eligibleStudents = students.map((s: any) => ({
            id: s.id,
            name: s.name,
            batchName: s.batch?.name
        }));

        res.json(eligibleStudents);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to fetch eligible students' });
    }
}

export const sendTestResultsEmail = async (req: Request, res: Response) => {
    const { id } = req.params;
    const teacherId = (req as any).user?.id;
    const currentAcademicYearId = (req as any).user?.currentAcademicYearId;

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
                instituteId: true
            }
        });

        if (!test) return res.status(404).json({ error: 'Test not found' });
        if (test.teacherId && test.teacherId !== teacherId) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        // 2. Fetch All Relevant Students (Same Class & Academic Year)
        // We need students who are APPROVED
        const students = await prisma.student.findMany({
            where: {
                academicYearId: currentAcademicYearId,
                batch: {
                    className: test.className || undefined
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



        // WhatsApp Integration (Option A)
        const whatsappPromises: Promise<any>[] = [];
        const { sendExamResultWhatsapp } = await import('../utils/whatsappService');

        students.forEach(student => {
            if (student.parentWhatsapp) {
                // Clean number
                let phone = student.parentWhatsapp.replace(/[^0-9+]/g, '');
                if (!phone.startsWith('+')) {
                    if (phone.length === 10) phone = '+91' + phone;
                }

                const mark = student.marks[0];
                const score = mark ? mark.score : 0; // Default to 0 if absent (or handle absence differently)

                // Only send if present? Or template supports "Absent"?
                // Standard template sends score. If absent, maybe skip or send 0.
                if (mark) {
                    whatsappPromises.push(sendExamResultWhatsapp(
                        student.name,
                        test.name,
                        score,
                        test.maxMarks,
                        phone,
                        test.instituteId || undefined
                    ));
                }
            }
        });

        // Fire and forget WhatsApp (or await if critical)
        Promise.all(whatsappPromises).catch(err => console.error('WhatsApp Queue Error:', err));

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
