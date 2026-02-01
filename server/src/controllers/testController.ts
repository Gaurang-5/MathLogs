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
            include: { batch: true, marks: true }
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
