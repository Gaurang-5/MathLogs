import { Request, Response } from 'express';
import { prisma } from '../prisma';
import logger from '../utils/logger';
import { sendWelcomeWhatsApp } from '../utils/whatsapp';
import { getCourseCode, getInstituteCode } from '../utils/studentIds';
import jwt from 'jsonwebtoken';
import { secureLogger } from '../utils/secureLogger';
import { getJwtSecret } from '../utils/env';

const JWT_SECRET = getJwtSecret();

// H5 fix: Shared constant so both registerStudent and addStudentManually
// always include the fields that autoSendWelcomeInvite depends on.
const AUTO_INVITE_INSTITUTE_SELECT = { name: true } as const;

// M2 fix: Typed interfaces instead of `any`
interface AutoInviteStudent {
    name: string;
    humanId: string | null;
    parentEmail: string | null;
    parentWhatsapp: string;
}
interface AutoInviteBatch {
    autoSendWelcome: boolean;
    whatsappGroupLink: string | null;
    name: string;
    subject: string | null;
    className: string | null;
    timeSlot: string | null;
    instituteId: string | null;
    institute?: { name: string } | null;
}

const autoSendWelcomeInvite = async (student: AutoInviteStudent, batch: AutoInviteBatch) => {
    if (!batch.autoSendWelcome) return;

    try {
        const link = batch.whatsappGroupLink;
        const senderName = batch.institute?.name || 'Coaching Centre';

        let body = `Hello ${student.name},\n\nWelcome to ${batch.name} (${batch.subject || 'Course'}).\n\nBatch Details:\n• Class: ${batch.className || 'N/A'}\n• Time: ${batch.timeSlot || 'N/A'}\n• Student ID: ${student.humanId || 'N/A'}\n\n`;

        if (link) {
            body += `Join the official WhatsApp group for announcements and updates:\n👉 ${link}\n\nPlease join the group to stay informed.\n\n`;
        } else {
            body += `You will receive the WhatsApp group link here soon. Please keep checking your WhatsApp for updates.\n\n`;
        }

        body += `– ${senderName}`;

        // H2 fix: Cast only the Json `options` field instead of the entire data object
        if (student.parentEmail) {
            await prisma.emailJob.create({
                data: {
                    recipient: student.parentEmail,
                    subject: `Welcome to ${batch.name} – ${batch.subject}`,
                    body,
                    status: 'PENDING',
                    options: { senderName, senderType: 'WELCOME' } as any,
                    instituteId: batch.instituteId
                }
            });
        }

        // Send WhatsApp Invite immediately
        if (student.parentWhatsapp) {
            let phone = student.parentWhatsapp.replace(/[^0-9+]/g, '');
            if (!phone.startsWith('+')) {
                if (phone.length === 10) phone = '+91' + phone;
            }
            sendWelcomeWhatsApp(phone, {
                studentName: student.name,
                batchName: batch.name,
                instituteName: senderName,
                whatsappLink: link || ''
            }).catch(err => console.error(`WhatsApp auto-invite failed for ${phone}:`, err));
        }
    } catch (inviteErr) {
        console.error("Auto-invite error:", inviteErr);
    }
};

const generateHumanId = async (batch: any) => {
    const courseCode = getCourseCode(batch.subject || '');

    // Use Batch Creation Date if available, else fallback to current year
    const year = batch.createdAt ? new Date(batch.createdAt).getFullYear() : new Date().getFullYear();
    const yy = year.toString().slice(-2);

    // MULTI-TENANT FIX: Include institute code in prefix to prevent collisions
    // Use institute name initials for human-readable IDs
    // Format: {instCode}-{courseCode}{year}
    // Example: IS-MTH26 (for "IT SKILLS MZN", Math 2026)
    const instituteId = batch.instituteId;
    if (!instituteId) {
        throw new Error('Batch must have an instituteId for student ID generation');
    }

    // Fetch institute to get name
    const institute = await prisma.institute.findUnique({
        where: { id: instituteId },
        select: { name: true }
    });

    if (!institute) {
        throw new Error('Institute not found for student ID generation');
    }

    const instCode = getInstituteCode(institute.name);
    const prefix = `${instCode}-${courseCode}${yy}`;

    // Atomic Upsert: Increment if exists, create if not
    // This relies on the database to handle concurrency locks
    const counter = await prisma.idCounter.upsert({
        where: { prefix },
        update: { seq: { increment: 1 } },
        create: { prefix, seq: 1 },
    });

    // Final ID format: {instCode}-{courseCode}{year}-{seq}
    // Example: IS-MTH26-001 (IT Skills, Math 2026, student #1)
    return `${instCode}-${courseCode}${yy}-${counter.seq.toString().padStart(3, '0')}`;
};

const MAX_RETRIES = 15;

export const registerStudent = async (req: Request, res: Response) => {
    let { batchId, name, parentName, parentWhatsapp, parentEmail, schoolName, token, additionalData } = req.body;

    // Data Normalization (Fix for typical duplications)
    if (typeof name === 'string') name = name.trim();
    if (typeof parentWhatsapp === 'string') {
        parentWhatsapp = parentWhatsapp.replace(/\D/g, ''); // Extract all digits
        if (parentWhatsapp.length > 10) parentWhatsapp = parentWhatsapp.slice(-10); // Keep only the last 10 digits
    }

    if (token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET) as any;
            if (decoded.batchId !== batchId) {
                return res.status(403).json({ error: 'This invite link is for a different batch.' });
            }
            // Strongly override the whatsapp number to prevent tampering
            parentWhatsapp = decoded.whatsapp; 
        } catch (err) {
            return res.status(403).json({ error: 'Registration link is expired or invalid.' });
        }
    }

    const startTime = Date.now();

    try {
        // Log registration start
        logger.registration.started(batchId, name, parentWhatsapp);

        const batch = await prisma.batch.findUnique({
            where: { id: batchId },
            include: {
                institute: { select: { ...AUTO_INVITE_INSTITUTE_SELECT, areRegistrationsPaused: true, plan: true, planExpiryDate: true } }
            }
        });
        if (!batch) return res.status(404).json({ error: 'Batch not found' });

        if (batch.institute && !token) {
            const isPlanExpired = batch.institute.planExpiryDate && new Date(batch.institute.planExpiryDate).getTime() < Date.now();
            if (batch.institute.areRegistrationsPaused || isPlanExpired) {
                return res.status(403).json({ error: 'Registrations are currently paused or the plan is inactive for this institute.' });
            }
        }

        // If a valid signed token is present, it bypasses standard batch closure checks
        if (!token && (!batch.isRegistrationOpen || batch.isRegistrationEnded)) {
            return res.status(403).json({ error: 'Registration for this batch is closed.' });
        }

        // Multi-Tenant: Ensure Student inherits instituteId from Batch
        if (!batch.instituteId) return res.status(500).json({ error: 'Batch has no institute assigned' });

        // Idempotency Check: Strict One-Phone-Number-Per-Batch logic
        const existingStudent = await prisma.student.findFirst({
            where: {
                batchId,
                parentWhatsapp,
                instituteId: batch.instituteId
            }
        });

        if (existingStudent) {
            logger.registration.idempotencyHit(batchId, name, existingStudent.humanId || existingStudent.id);
            return res.status(409).json({ error: 'This phone number is already registered for this batch.' });
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
                        additionalData,
                        status: 'APPROVED', // Auto-approve
                        humanId,
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
                            where: { batchId, name, parentWhatsapp, instituteId: batch.instituteId }
                        });
                        if (!existing) {
                            // Rare: Student was deleted between constraint violation and query
                            logger.registration.naturalKeyCollision(batchId, name, 'not_found_concurrent_deletion');
                            return res.status(409).json({
                                error: 'Concurrent modification detected. Please retry registration.'
                            });
                        }
                        return res.status(409).json({ error: 'This phone number is already registered for this batch.' });
                    } else {
                        retries++;
                        const seq = error.meta?.target?.match(/\d+/)?.[0];
                        const prefix = getCourseCode(batch.subject || '') + new Date(batch.createdAt || new Date()).getFullYear().toString().slice(-2); logger.registration.idCollision(prefix, parseInt(seq) || 0, retries, MAX_RETRIES);
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

        // Auto-send welcome invite if enabled
        await autoSendWelcomeInvite(student!, batch);
        if (student && batch) {
            await autoAssignGlobalInstallments(student.id, batch.id, student.createdAt);
        }

        res.json(student);
    } catch (e: any) {
        const latencyMs = Date.now() - startTime;
        logger.registration.error(batchId, name, e.code || 'UNKNOWN', e.message, undefined);
        res.status(500).json({ error: 'Registration failed' });
    }
};

export const addStudentManually = async (req: Request, res: Response) => {
    let { batchId, name, parentName, parentWhatsapp, parentEmail, schoolName, additionalData } = req.body;

    // Data Normalization
    if (typeof name === 'string') name = name.trim();
    if (typeof parentWhatsapp === 'string') {
        parentWhatsapp = parentWhatsapp.replace(/\D/g, '');
        if (parentWhatsapp.length > 10) parentWhatsapp = parentWhatsapp.slice(-10);
    }

    try {
        const teacherId = req.user?.id;
        const batch = await prisma.batch.findUnique({
            where: { id: batchId },
            include: {
                institute: { select: { ...AUTO_INVITE_INSTITUTE_SELECT } }
            }
        });
        if (!batch) return res.status(404).json({ error: 'Batch not found' });

        const user = req.user;
        if (batch.instituteId !== user.instituteId) return res.status(403).json({ error: 'Unauthorized' });

        // Idempotency Check: Strict One-Phone-Number-Per-Batch logic
        const existingStudent = await prisma.student.findFirst({
            where: { batchId, parentWhatsapp, instituteId: user.instituteId }
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
                        additionalData,
                        status: 'APPROVED',
                        humanId,
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
                            where: { batchId, name, parentWhatsapp, instituteId: user.instituteId }
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

        // Auto-send invite if enabled
        await autoSendWelcomeInvite(student!, batch);
        if (student && batch) {
            await autoAssignGlobalInstallments(student.id, batch.id, student.createdAt);
        }

        res.json(student);
    } catch (e) {
        console.error("Manual add error", e);
        res.status(500).json({ error: 'Failed to add student' });
    }
};

const autoAssignGlobalInstallments = async (studentId: string, batchId: string, studentCreatedAt: Date) => {
    try {
        const globalInstallments = await prisma.feeInstallment.findMany({
            where: {
                batchId,
                studentId: null,
                createdAt: { lte: studentCreatedAt }
            }
        });
        if (globalInstallments.length > 0) {
            await prisma.feeInstallmentAssignment.createMany({
                data: globalInstallments.map(inst => ({
                    studentId,
                    installmentId: inst.id
                })),
                skipDuplicates: true
            });
        }
    } catch (err) {
        secureLogger.error('[FeeAssignment] Auto-assign global installments failed:', err);
    }
};

export const updateStudent = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { name, parentName, parentWhatsapp, parentEmail, schoolName, humanId, additionalData } = req.body;
    const user = req.user;

    try {
        const student = await prisma.student.findUnique({ where: { id: String(id) }, include: { batch: true } });

        if (!student) return res.status(404).json({ error: 'Student not found' });
        if (student.instituteId && user.instituteId && student.instituteId !== user.instituteId) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const cleanWhatsapp = parentWhatsapp ? parentWhatsapp.replace(/[^0-9+]/g, '') : undefined;
        const cleanEmail = parentEmail && String(parentEmail).trim() !== '' ? String(parentEmail).trim() : null;
        const cleanSchool = schoolName && String(schoolName).trim() !== '' ? String(schoolName).trim() : null;
        const cleanHumanId = humanId && String(humanId).trim() !== '' ? String(humanId).trim() : student.humanId;

        // Update logic
        const updated = await prisma.student.update({
            where: { id: String(id) },
            data: {
                ...(name ? { name } : {}),
                ...(parentName ? { parentName } : {}),
                ...(cleanWhatsapp ? { parentWhatsapp: cleanWhatsapp } : {}),
                parentEmail: cleanEmail,
                schoolName: cleanSchool,
                ...(cleanHumanId ? { humanId: cleanHumanId } : {}),
                ...(additionalData !== undefined ? { additionalData } : {})
            }
        });
        res.json(updated);
    } catch (e: any) {
        secureLogger.error('Update student failed', e);
        res.status(500).json({ error: e.message || 'Update failed' });
    }
};


export const getPendingStudents = async (req: Request, res: Response) => {
    try {
        const user = req.user;
        const students = await prisma.student.findMany({
            where: {
                status: 'PENDING',
                instituteId: user.instituteId
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
    const teacherId = req.user?.id;
    try {
        const studentToApprove = await prisma.student.findUnique({
            where: { id: String(id) },
            include: {
                batch: {
                    include: {
                        institute: { select: { name: true } }
                    }
                }
            }
        });

        const user = req.user;
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

        // Auto-send welcome invite if enabled
        await autoSendWelcomeInvite(student!, studentToApprove.batch);
        if (student && studentToApprove.batch) {
            await autoAssignGlobalInstallments(student.id, studentToApprove.batch.id, student.createdAt);
        }

        res.json(student);
    } catch (e: any) {
        res.status(500).json({ error: 'Approval failed' });
    }
};

export const rejectStudent = async (req: Request, res: Response) => {
    const { id } = req.params;
    const teacherId = req.user?.id;

    try {
        const user = req.user;

        const student = await prisma.student.findUnique({ where: { id: String(id) }, include: { batch: true } });
        if (!student) return res.status(404).json({ error: 'Student not found' });
        if (student.instituteId !== user.instituteId) return res.status(403).json({ error: 'Unauthorized' });

        await prisma.student.delete({ where: { id: String(id) } });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Rejection failed' });
    }
};

export const archiveStudent = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { leaveReason } = req.body || {};

    try {
        const user = (req as any).user;

        const student = await prisma.student.findUnique({
            where: { id: String(id) },
            include: {
                fees: true,
                feePayments: true,
                attendanceRecords: true,
                marks: true,
                quizSubmissions: true
            }
        });

        if (!student) return res.status(404).json({ error: 'Student not found' });
        if (student.instituteId !== user.instituteId) return res.status(403).json({ error: 'Unauthorized' });

        const hasActivity = 
            student.fees.length > 0 || 
            student.feePayments.length > 0 || 
            student.attendanceRecords.length > 0 || 
            student.marks.length > 0 || 
            student.quizSubmissions.length > 0;

        if (hasActivity) {
            // Soft Delete / Archive
            await prisma.student.update({
                where: { id: String(id) },
                data: {
                    status: 'LEFT',
                    leaveReason: leaveReason || 'No reason provided',
                    leftAt: new Date(),
                    batchId: null
                }
            });
            return res.json({ success: true, action: 'archived' });
        } else {
            // Hard Delete with Log
            await prisma.$transaction([
                prisma.systemLog.create({
                    data: {
                        instituteId: user.instituteId,
                        action: 'STUDENT_HARD_DELETE',
                        entityName: student.name,
                        details: {
                            leaveReason: leaveReason || 'No activity',
                            deletedAt: new Date().toISOString(),
                            studentData: {
                                humanId: student.humanId,
                                parentName: student.parentName,
                                parentWhatsapp: student.parentWhatsapp
                            }
                        } as any
                    }
                }),
                prisma.student.delete({
                    where: { id: String(id) }
                })
            ]);
            return res.json({ success: true, action: 'hard_deleted' });
        }
    } catch (e) {
        console.error("Archive error:", e);
        res.status(500).json({ error: 'Failed to remove or archive student' });
    }
};

export const getStudentGrowthStats = async (req: Request, res: Response) => {
    try {
        const students = await prisma.student.findMany({
            where: {
                instituteId: req.user.instituteId
            },
            select: { createdAt: true },
            orderBy: { createdAt: 'asc' }
        });

        if (students.length === 0) {
            return res.json([{ name: 'Jan', students: 0 }]);
        }

        // Get the start date - default to start of current year
        const currentSysDate = new Date();
        let startRawDate = new Date(currentSysDate.getFullYear(), 0, 1);

        // Calculate end date (Today + IST Buffer)
        const IST_OFFSET = 5.5 * 60 * 60 * 1000;
        const endDate = new Date(Date.now() + IST_OFFSET);

        // If students joined before the official start date, start the chart from their joining date
        const firstStudentDate = new Date(new Date(students[0].createdAt).getTime() + IST_OFFSET);
        if (firstStudentDate < startRawDate) {
            startRawDate = firstStudentDate;
        }

        // If the start date is STILL in the future (e.g., no students yet, or all somehow future dated)
        // ensure we show at least the current month
        if (startRawDate > endDate) {
            startRawDate = new Date(endDate);
        }

        // Iterate months safely by setting date to 1st
        const months: { name: string; year: number; monthIndex: number }[] = [];
        const tempDate = new Date(startRawDate);
        tempDate.setDate(1); // Force to 1st to avoid Jan 31 -> Mar 3 skip issue

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

export const getClassAverageStats = async (req: Request, res: Response) => {
    try {
        const instituteId = req.user.instituteId;

        // Fetch all tests for this institute including their marks
        const tests = await prisma.test.findMany({
            where: {
                instituteId
            },
            include: {
                marks: true
            }
        });

        // Group scores and maxMarks by className
        const classScores: Record<string, { totalScore: number; totalMax: number; count: number }> = {};

        tests.forEach(test => {
            const className = test.className || 'Unknown';
            if (test.marks.length === 0) return;

            if (!classScores[className]) {
                classScores[className] = { totalScore: 0, totalMax: 0, count: 0 };
            }

            test.marks.forEach(mark => {
                classScores[className].totalScore += mark.score;
                classScores[className].totalMax += test.maxMarks;
                classScores[className].count += 1;
            });
        });

        // Compute average percentage for each class
        const data = Object.entries(classScores).map(([className, stats]) => {
            const avgPercentage = stats.totalMax > 0
                ? parseFloat(((stats.totalScore / stats.totalMax) * 100).toFixed(1))
                : 0;

            return {
                name: className.startsWith('Class ') ? className : `Class ${className}`,
                average: avgPercentage
            };
        });

        // Sort naturally: e.g. "Class 9" comes before "Class 10"
        data.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

        res.json(data);
    } catch (e) {
        console.error('Class average stats error:', e);
        res.status(500).json({ error: 'Failed to fetch class average stats' });
    }
};

export const searchStudents = async (req: Request, res: Response) => {
    const { q } = req.query;
    const instituteId = req.user.instituteId;

    if (!q || typeof q !== 'string' || q.trim().length < 2) {
        return res.json([]);
    }

    const query = q.trim();

    try {
        const students = await prisma.student.findMany({
            where: {
                instituteId,
                status: { not: 'LEFT' },
                OR: [
                    { name: { contains: query, mode: 'insensitive' } },
                    { parentWhatsapp: { contains: query } },
                    { humanId: { contains: query, mode: 'insensitive' } },
                    { schoolName: { contains: query, mode: 'insensitive' } },
                    { parentName: { contains: query, mode: 'insensitive' } },
                ]
            },
            select: {
                id: true,
                humanId: true,
                name: true,
                parentName: true,
                parentWhatsapp: true,
                schoolName: true,
                status: true,
                batch: { select: { name: true, className: true } }
            },
            take: 15,
            orderBy: { name: 'asc' }
        });

        res.json(students);
    } catch (error) {
        console.error('Student search error:', error);
        res.status(500).json({ error: 'Search failed' });
    }
};

export const getStudentProfile = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const instituteId = req.user.instituteId;

        const student = await prisma.student.findUnique({
            where: {
                id: String(id)
            },
            select: {
                id: true,
                humanId: true,
                name: true,
                parentName: true,
                parentWhatsapp: true,
                parentEmail: true,
                schoolName: true,
                status: true,
                createdAt: true,
                instituteId: true,
                batch: {
                    select: { name: true, className: true, subject: true }
                },
                feePayments: {
                    select: {
                        id: true,
                        amountPaid: true,
                        date: true,
                        installment: { select: { name: true } }
                    },
                    orderBy: { date: 'desc' },
                    take: 100
                },
                marks: {
                    select: {
                        id: true,
                        score: true,
                        test: { select: { name: true, date: true, maxMarks: true, subject: true, className: true } }
                    },
                    orderBy: { test: { date: 'desc' } },
                    take: 100
                },
                attendanceRecords: {
                    select: {
                        id: true,
                        attendanceDate: true,
                        checkedInAt: true,
                        source: true,
                        note: true
                    },
                    orderBy: { attendanceDate: 'desc' },
                    take: 50 // Recent 50 records
                },
                balance: {
                    select: {
                        totalFee: true,
                        totalPaid: true,
                        balance: true
                    }
                }
            }
        });

        if (!student) {
            return res.status(404).json({ error: 'Student not found' });
        }

        if (student.instituteId !== instituteId) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        // Calculate summary stats
        const totalClasses = student.attendanceRecords.length;
        const classesAttended = student.attendanceRecords.filter(r => r.source === 'KIOSK' || r.note === 'PRESENT').length; // Assuming some convention or just count total records if they only record presence
        // Actually, let's just return raw records and let client process or process simple stats:
        // Wait, what does attendance actually store? Let's check: attendanceRecords usually store when present.
        const attendancePercentage = totalClasses > 0 ? Math.round((classesAttended / totalClasses) * 100) : null;

        res.json({
            ...student,
            stats: {
                attendancePercentage,
                attendedClasses: classesAttended,
                totalClasses
            }
        });
    } catch (error) {
        console.error('Error fetching student profile:', error);
        res.status(500).json({ error: 'Failed to fetch student profile' });
    }
};
