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
        'Geography': 'GEO',
        'Accounts': 'ACC', 'Accountancy': 'ACC',
        'Economics': 'ECO',
        'Business Studies': 'BUS',
        'Computer Science': 'CSC',
        'Abacus': 'ABA', 'Vedic Maths': 'VED',
        'C Programming': 'CPR', 'C++': 'CPP', 'Java': 'JAV', 'Python': 'PYT',
        'Tally': 'TAL',
        'Social Science': 'SST'
    };

    if (map[subject]) return map[subject];

    // Fallback: Remove non-alphanumeric, take first 3 chars uppercase
    const cleanSubject = subject.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    return cleanSubject.substring(0, 3) || 'GEN';
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

        // Multi-Tenant: Ensure Student inherits instituteId from Batch
        if (!batch.instituteId) return res.status(500).json({ error: 'Batch has no institute assigned' });


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
                        academicYearId: batch.academicYearId,
                        instituteId: batch.instituteId
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

        const user = (req as any).user;
        if (batch.instituteId !== user.instituteId) return res.status(403).json({ error: 'Unauthorized' });


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
                        academicYearId: batch.academicYearId,
                        instituteId: batch.instituteId
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
    const user = (req as any).user;

    try {
        const student = await prisma.student.findUnique({ where: { id: String(id) }, include: { batch: true } });

        if (!student) return res.status(404).json({ error: 'Student not found' });
        if (student.instituteId !== user.instituteId) return res.status(403).json({ error: 'Unauthorized' });

        // Update logic
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
        const user = (req as any).user;
        const students = await prisma.student.findMany({
            where: {
                status: 'PENDING',
                instituteId: user.instituteId,
                academicYearId: user.currentAcademicYearId
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

        const user = (req as any).user;
        if (studentToApprove?.instituteId && studentToApprove.instituteId !== user.instituteId) {
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
        const user = (req as any).user;

        const student = await prisma.student.findUnique({ where: { id: String(id) }, include: { batch: true } });
        if (!student) return res.status(404).json({ error: 'Student not found' });
        if (student.instituteId !== user.instituteId) return res.status(403).json({ error: 'Unauthorized' });

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
    try {
        const academicYearId = (req as any).user?.currentAcademicYearId;

        // Get academic year details to determine start month
        const academicYear = await prisma.academicYear.findUnique({
            where: { id: academicYearId }
        });

        const students = await prisma.student.findMany({
            where: {
                instituteId: (req as any).user.instituteId,
                ...(academicYearId && { academicYearId })
            },
            select: { createdAt: true },
            orderBy: { createdAt: 'asc' }
        });

        if (students.length === 0) {
            return res.json([{ name: 'Jan', students: 0 }]);
        }

        // Get the start date - use academic year start or default to start of current year
        const currentSysDate = new Date();
        const startRawDate = (academicYear?.startDate)
            ? new Date(academicYear.startDate)
            : new Date(currentSysDate.getFullYear(), 0, 1);

        // Normalize execution to IST (GMT+5:30)
        // We add offset to UTC timestamps so that getMonth() (which is UTC on server) reflects IST date
        const IST_OFFSET = 5.5 * 60 * 60 * 1000;

        // Iterate months safely by setting date to 1st
        const months: { name: string; year: number; monthIndex: number }[] = [];
        const tempDate = new Date(startRawDate);
        tempDate.setDate(1); // Force to 1st to avoid Jan 31 -> Mar 3 skip issue

        // Calculate end date (Today + IST Buffer)
        const endDate = new Date(Date.now() + IST_OFFSET);

        // Standardize loop comparison using YYYYMM
        const getMonthKey = (d: Date) => d.getFullYear() * 100 + d.getMonth();

        while (getMonthKey(tempDate) <= getMonthKey(endDate)) {
            months.push({
                name: tempDate.toLocaleString('default', { month: 'short' }),
                year: tempDate.getFullYear(),
                monthIndex: tempDate.getMonth()
            });
            tempDate.setMonth(tempDate.getMonth() + 1);
        }

        // Count students for each month (shifted to IST)
        const monthlyData: Record<string, number> = {};
        students.forEach(s => {
            // Shift UTC createdAt to IST
            const istDate = new Date(new Date(s.createdAt).getTime() + IST_OFFSET);
            const year = istDate.getFullYear();
            const monthIndex = istDate.getMonth();
            const key = `${year}-${monthIndex}`;
            monthlyData[key] = (monthlyData[key] || 0) + 1;
        });

        // Build cumulative data
        let cumulativeCount = 0;
        const data = months.map(month => {
            const key = `${month.year}-${month.monthIndex}`;
            cumulativeCount += monthlyData[key] || 0;
            return {
                name: month.name,
                students: cumulativeCount
            };
        });

        res.json(data);
    } catch (e) {
        console.error('Growth stats error:', e);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
};
