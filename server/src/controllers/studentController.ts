import { Request, Response } from 'express';
import { prisma } from '../prisma';
import logger from '../utils/logger';

// Helper to generate Course Code
const getCourseCode = (subject: string | null) => {
    if (!subject) return 'GEN'; // Generic
    const map: Record<string, string> = {
        'Mathematics': 'MTH', 'Maths': 'MTH', 'Math': 'MTH',
        'Physics': 'PHY',
        'Chemistry': 'CHE',
        'Biology': 'BIO',
        'English': 'ENG',
        'Science': 'SCI',
        'History': 'HIS',
        'Geography': 'GEO'
    };
    return map[subject] || subject.substring(0, 3).toUpperCase();
};

const generateHumanId = async (batch: any) => {
    const courseCode = getCourseCode(batch.subject || '');

    // Use Academic Year Start Date if available, else fallback to current year
    let year = new Date().getFullYear();
    if (batch.academicYearRef?.startDate) {
        year = new Date(batch.academicYearRef.startDate).getFullYear();
    }
    const yy = year.toString().slice(-2);

    // Prefix example: MTH26
    const prefix = `${courseCode}${yy}`;

    // Atomic Upsert: Increment if exists, create if not
    // This relies on the database to handle concurrency locks
    const counter = await prisma.idCounter.upsert({
        where: { prefix },
        update: { seq: { increment: 1 } },
        create: { prefix, seq: 1 },
    });

    return `${prefix}${counter.seq.toString().padStart(3, '0')}`;
};

const MAX_RETRIES = 15;

export const registerStudent = async (req: Request, res: Response) => {
    const { batchId, name, parentName, parentWhatsapp, parentEmail, schoolName } = req.body;
    const startTime = Date.now();

    try {
        // Log registration start
        logger.registration.started(batchId, name, parentWhatsapp);

        const batch = await prisma.batch.findUnique({
            where: { id: batchId },
            include: { academicYearRef: true }
        });
        if (!batch) return res.status(404).json({ error: 'Batch not found' });
        if (!batch.isRegistrationOpen || batch.isRegistrationEnded) {
            return res.status(403).json({ error: 'Registration for this batch is closed.' });
        }


        // Idempotency Check: Prevent duplicate registrations
        const existingStudent = await prisma.student.findFirst({
            where: {
                batchId,
                name,
                parentWhatsapp
            }
        });

        if (existingStudent) {
            logger.registration.idempotencyHit(batchId, name, existingStudent.humanId || existingStudent.id);
            return res.json(existingStudent);
        }

        let retries = 0;
        let success = false;
        let student;

        while (!success && retries < MAX_RETRIES) {
            try {
                const humanId = await generateHumanId(batch);
                student = await prisma.student.create({
                    data: {
                        batchId,
                        name,
                        parentName,
                        parentWhatsapp,
                        parentEmail,
                        schoolName,
                        status: 'APPROVED', // Auto-approve
                        humanId,
                        academicYearId: batch.academicYearId
                    }
                });
                success = true;
            } catch (error: any) {
                if (error.code === 'P2002') {
                    const target = error.meta?.target;
                    if (target?.includes('student_natural_key') || target?.includes('name_parentWhatsapp_batchId')) {
                        logger.registration.naturalKeyCollision(batchId, name, 'fetching_existing');
                        const existing = await prisma.student.findFirst({
                            where: { batchId, name, parentWhatsapp }
                        });
                        if (!existing) {
                            // Rare: Student was deleted between constraint violation and query
                            logger.registration.naturalKeyCollision(batchId, name, 'not_found_concurrent_deletion');
                            return res.status(409).json({
                                error: 'Concurrent modification detected. Please retry registration.'
                            });
                        }
                        return res.json(existing);
                    } else {
                        retries++;
                        const seq = error.meta?.target?.match(/\d+/)?.[0];
                        const prefix = getCourseCode(batch.subject || '') + new Date(batch.academicYearRef?.startDate || new Date()).getFullYear().toString().slice(-2); logger.registration.idCollision(prefix, parseInt(seq) || 0, retries, MAX_RETRIES);
                    }
                } else {
                    throw error;
                }
            }
        }

        if (!success) throw new Error('Failed to generate unique Human ID after retries');

        const latencyMs = Date.now() - startTime;
        logger.registration.success(batchId, student!.id, student!.humanId || '', latencyMs);

        // Log slow registrations
        if (latencyMs > 3000) {
            logger.performance.slow('student_registration', latencyMs, 3000, { batchId, studentId: student!.id });
        }

        res.json(student);
    } catch (e: any) {
        const latencyMs = Date.now() - startTime;
        logger.registration.error(batchId, name, e.code || 'UNKNOWN', e.message, undefined);
        res.status(500).json({ error: 'Registration failed' });
    }
};

export const addStudentManually = async (req: Request, res: Response) => {
    const { batchId, name, parentName, parentWhatsapp, parentEmail, schoolName } = req.body;
    try {
        const teacherId = (req as any).user?.id;
        const batch = await prisma.batch.findUnique({
            where: { id: batchId },
            include: { academicYearRef: true }
        });
        if (!batch) return res.status(404).json({ error: 'Batch not found' });
        if (batch.teacherId && batch.teacherId !== teacherId) return res.status(403).json({ error: 'Unauthorized' });


        // Idempotency Check
        const existingStudent = await prisma.student.findFirst({
            where: { batchId, name, parentWhatsapp }
        });
        if (existingStudent) return res.json(existingStudent);

        let retries = 0;
        let success = false;
        let student;

        while (!success && retries < MAX_RETRIES) {
            try {
                const humanId = await generateHumanId(batch);
                student = await prisma.student.create({
                    data: {
                        batchId,
                        name,
                        parentName,
                        parentWhatsapp,
                        parentEmail,
                        schoolName,
                        status: 'APPROVED',
                        humanId,
                        academicYearId: batch.academicYearId
                    }
                });
                success = true;
            } catch (error: any) {
                if (error.code === 'P2002') {
                    const target = error.meta?.target;
                    if (target?.includes('student_natural_key') || target?.includes('name_parentWhatsapp_batchId')) {
                        // Natural key collision - fetch existing student
                        const existing = await prisma.student.findFirst({
                            where: { batchId, name, parentWhatsapp }
                        });
                        if (!existing) {
                            console.error('[Idempotency] Natural key collision but student not found - concurrent deletion');
                            return res.status(409).json({
                                error: 'Concurrent modification detected. Please retry registration.'
                            });
                        }
                        return res.json(existing);
                    } else {
                        retries++;
                    }
                } else {
                    throw error;
                }
            }
        }

        if (!success) throw new Error('Failed to generate unique ID');
        res.json(student);
    } catch (e) {
        console.error("Manual add error", e);
        res.status(500).json({ error: 'Failed to add student' });
    }
};

export const updateStudent = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { name, parentName, parentWhatsapp, parentEmail, schoolName, humanId } = req.body;
    const teacherId = (req as any).user?.id;
    const currentAcademicYearId = (req as any).user?.currentAcademicYearId;

    try {
        const student = await prisma.student.findUnique({ where: { id: String(id) }, include: { batch: true } });
        if (!student) return res.status(404).json({ error: 'Student not found' });
        if (student.batch?.teacherId && student.batch.teacherId !== teacherId) return res.status(403).json({ error: 'Unauthorized' });

        // Academic year boundary check
        if (student.academicYearId && student.academicYearId !== currentAcademicYearId) {
            return res.status(400).json({ error: 'Cannot modify student from non-active academic year' });
        }

        const updated = await prisma.student.update({
            where: { id: String(id) },
            data: { name, parentName, parentWhatsapp, parentEmail, schoolName, humanId }
        });
        res.json(updated);
    } catch (e) {
        res.status(500).json({ error: 'Update failed' });
    }
};

export const getPendingStudents = async (req: Request, res: Response) => {
    try {
        const teacherId = (req as any).user?.id;
        const students = await prisma.student.findMany({
            where: {
                status: 'PENDING',
                academicYearId: (req as any).user?.currentAcademicYearId
            },
            include: { batch: true },
            orderBy: { createdAt: 'desc' }
        });
        res.json(students);
    } catch (e) {
        res.status(500).json({ error: 'Failed' });
    }
};

export const approveStudent = async (req: Request, res: Response) => {
    // Kept for backward compatibility if any legacy pending students exist
    const { id } = req.params;
    const teacherId = (req as any).user?.id;
    try {
        const studentToApprove = await prisma.student.findUnique({
            where: { id: String(id) },
            include: {
                batch: {
                    include: { academicYearRef: true }
                }
            }
        });

        if (studentToApprove?.batch?.teacherId && studentToApprove.batch.teacherId !== teacherId) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        if (!studentToApprove) return res.status(404).json({ error: 'Student not found' });
        if (!studentToApprove.batch) return res.status(400).json({ error: 'Student has no batch' });

        // Idempotency: If already approved and has humanId, do nothing or return existing
        if (studentToApprove.status === 'APPROVED' && studentToApprove.humanId) {
            return res.json(studentToApprove);
        }

        let retries = 0;
        let success = false;
        let student;

        while (!success && retries < MAX_RETRIES) {
            try {
                const humanId = await generateHumanId(studentToApprove.batch);
                student = await prisma.student.update({
                    where: { id: String(id) },
                    data: { status: 'APPROVED', humanId }
                });
                success = true;
            } catch (error: any) {
                if (error.code === 'P2002') {
                    const target = error.meta?.target;
                    if (target?.includes('student_natural_key') || target?.includes('name_parentWhatsapp_batchId')) {
                        // Natural key collision during approval - return existing
                        return res.json(studentToApprove);
                    } else {
                        retries++;
                    }
                } else {
                    throw error;
                }
            }
        }

        if (!success) throw new Error('Collision');
        res.json(student);
    } catch (e: any) {
        res.status(500).json({ error: 'Approval failed' });
    }
};

export const rejectStudent = async (req: Request, res: Response) => {
    const { id } = req.params;
    const teacherId = (req as any).user?.id;
    const currentAcademicYearId = (req as any).user?.currentAcademicYearId;

    try {
        const student = await prisma.student.findUnique({ where: { id: String(id) }, include: { batch: true } });
        if (!student) return res.status(404).json({ error: 'Student not found' });
        if (student.batch?.teacherId && student.batch.teacherId !== teacherId) return res.status(403).json({ error: 'Unauthorized' });

        // Academic year boundary check
        if (student.academicYearId && student.academicYearId !== currentAcademicYearId) {
            return res.status(400).json({ error: 'Cannot reject student from non-active academic year' });
        }

        await prisma.student.delete({ where: { id: String(id) } });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Rejection failed' });
    }
};

export const getStudentGrowthStats = async (req: Request, res: Response) => {
    const teacherId = (req as any).user?.id;
    try {
        const academicYearId = (req as any).user?.currentAcademicYearId;
        const students = await prisma.student.findMany({
            where: {
                batch: { teacherId },
                academicYearId
            },
            select: { createdAt: true },
            orderBy: { createdAt: 'asc' }
        });

        // Group students by month
        const monthlyStats: Record<string, number> = {};
        students.forEach(s => {
            const month = new Date(s.createdAt).toLocaleString('default', { month: 'short' });
            monthlyStats[month] = (monthlyStats[month] || 0) + 1;
        });

        // Convert to cumulative growth data
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        let cumulativeCount = 0;
        const data = months.map(month => {
            cumulativeCount += monthlyStats[month] || 0;
            return {
                name: month,
                students: cumulativeCount
            };
        });

        // Only return months that have data (non-zero cumulative count)
        const filteredData = data.filter((d, i) => {
            // Include this month if it has students, or if a later month has students
            return data.slice(i).some(laterMonth => laterMonth.students > 0);
        });

        res.json(filteredData.length > 0 ? filteredData : [{ name: 'Jan', students: 0 }]);
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
};

