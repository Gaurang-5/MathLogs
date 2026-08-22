import { Request, Response } from 'express';
import path from 'path';
import crypto from 'crypto';
import { prisma } from '../prisma';
import { runPdfInWorker } from '../utils/pdfWorker';
import bwipjs from 'bwip-js';
import { secureLogger } from '../utils/secureLogger';
import { sendEmail } from '../utils/email';
import { getClientUrl } from '../utils/urlConfig';
import jwt from 'jsonwebtoken';
import { sendStudentInviteWhatsApp } from '../utils/whatsapp';
import { sendStudentAlertForStudent } from '../services/studentAlertRecipientService';
import { getJwtSecret } from '../utils/env';

const JWT_SECRET = getJwtSecret();

export const createBatch = async (req: Request, res: Response) => {
    const { timeSlot, feeAmount, className, batchNumber, subject, customName, name: bodyName, startDate, endDate } = req.body;
    const teacherId = req.user?.id;
    const user = req.user;

    if (!user.instituteId) return res.status(401).json({ error: 'Unauthorized: No institute assigned' });

    const batchName = (customName || bodyName || '').trim();
    if (!batchName) {
        return res.status(400).json({ error: 'Batch Name is required' });
    }

    // Fetch Institute Config
    const institute = await prisma.institute.findUnique({
        where: { id: user.instituteId },
        select: { config: true, coachingFeeMode: true }
    });

    if (!institute) return res.status(404).json({ error: 'Institute not found' });

    const usesMonthCoverage = institute.coachingFeeMode === 'MONTH_COVERAGE';
    if (usesMonthCoverage && (!startDate || !endDate)) {
        return res.status(400).json({ error: 'BATCH_DATES_REQUIRED' });
    }
    const parsedStartDate = startDate ? new Date(startDate) : null;
    const parsedEndDate = endDate ? new Date(endDate) : null;
    if (usesMonthCoverage && (
        !parsedStartDate || Number.isNaN(parsedStartDate.getTime())
        || !parsedEndDate || Number.isNaN(parsedEndDate.getTime())
        || parsedStartDate.getTime() > parsedEndDate.getTime()
    )) {
        return res.status(400).json({ error: 'INVALID_BATCH_DATE_RANGE' });
    }

    const config = (institute.config as any) || {
        requiresGrades: true,
        classes: [
            { name: 'Class 9', maxBatches: 2 },
            { name: 'Class 10', maxBatches: 3 }
        ]
    };

    const requiresGrades = config.requiresGrades !== false;

    // For grade-based institutes, validate className if required
    if (requiresGrades && className) {
        let classConfig;
        if (Array.isArray(config.allowedClasses)) {
            if (!config.allowedClasses.includes(className)) {
                return res.status(400).json({ error: `Class "${className}" is not allowed for this institute` });
            }
        } else if (config.classes) {
            classConfig = config.classes.find((c: any) => c.name === className);
            if (!classConfig) {
                return res.status(400).json({ error: `Class "${className}" is not allowed for this institute` });
            }
        }
    }

    const num = batchNumber ? parseInt(batchNumber) : null;
    const validNum = (num && !isNaN(num) && num > 0) ? num : null;

    try {
        // Check for duplicate batch name in the current institute
        const existing = await prisma.batch.findFirst({
            where: {
                name: batchName,
                className: requiresGrades ? (className || null) : null,
                instituteId: user.instituteId
            }
        });
        if (existing) {
            return res.status(400).json({ error: `Batch "${batchName}" already exists` });
        }

        const batch = await prisma.batch.create({
            data: {
                name: batchName,
                subject: subject || 'Mathematics',
                timeSlot,
                className: requiresGrades ? (className || null) : null,
                batchNumber: validNum,
                feeAmount: usesMonthCoverage ? 0 : (feeAmount ? parseFloat(feeAmount) : 0),
                ...(usesMonthCoverage ? { startDate: parsedStartDate, endDate: parsedEndDate } : {}),
                teacherId,
                instituteId: user.instituteId
            }
        });
        return res.json(batch);
    } catch (error) {
        console.error('Error creating batch:', error);
        return res.status(500).json({ error: 'Failed to create batch' });
    }
};

export const getBatches = async (req: Request, res: Response) => {
    try {
        const user = req.user;

        const institute = await prisma.institute.findUnique({
            where: { id: user.instituteId },
            select: { coachingFeeMode: true, timezone: true },
        });

        const batches = await prisma.batch.findMany({
            where: {
                instituteId: user.instituteId
            },
            orderBy: [
                { className: 'desc' },
                { createdAt: 'desc' }
            ],
            include: {
                _count: {
                    select: { students: { where: { status: 'APPROVED' } } }
                }
            }
        });
        res.json(batches.map(batch => ({
            ...batch,
            coachingFeeMode: institute?.coachingFeeMode ?? 'CURRENT_DUE_BASED',
            timezone: institute?.timezone ?? 'Asia/Kolkata',
        })));
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch batches' });
    }
};

export const getBatchDetails = async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const teacherId = req.user?.id;

    try {
        // PERF: Use 'select' instead of 'include' to reduce payload by 80%
        // This reduces response from ~1MB to ~200KB for a 50-student batch
        const batch = await prisma.batch.findUnique({
            where: { id },
            select: {
                id: true,
                name: true,
                subject: true,
                className: true,
                timeSlot: true,
                feeAmount: true,
                startDate: true,
                endDate: true,
                whatsappGroupLink: true,
                autoSendWelcome: true,
                isRegistrationOpen: true,
                isRegistrationEnded: true,
                teacherId: true,
                instituteId: true,
                institute: { select: { config: true, coachingFeeMode: true, timezone: true } },
                feeInstallments: {
                    select: {
                        id: true,
                        name: true,
                        amount: true,
                        studentId: true,
                        createdAt: true
                    },
                    orderBy: { createdAt: 'asc' }
                },
                students: {
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
                        additionalData: true,
                        monthCoverageProfile: true,
                        feePayments: {
                            select: {
                                id: true,
                                amountPaid: true,
                                date: true,
                                installmentId: true
                            }
                        },
                        feeAssignments: {
                            select: {
                                installmentId: true
                            }
                        },
                        fees: {
                            select: {
                                id: true,
                                amount: true,
                                status: true,
                                date: true
                            }
                        },
                        marks: {
                            select: {
                                id: true,
                                score: true,
                                test: {
                                    select: {
                                        id: true,
                                        name: true,
                                        maxMarks: true,
                                        date: true,
                                        isQuiz: true
                                    }
                                }
                            }
                        }
                    },
                    orderBy: { name: 'asc' }
                },
                tests: {
                    select: {
                        id: true,
                        name: true,
                        maxMarks: true,
                        date: true,
                        subject: true,
                        isQuiz: true
                    },
                    orderBy: { date: 'asc' }
                },
                sharedTests: {
                    select: {
                        id: true,
                        name: true,
                        maxMarks: true,
                        date: true,
                        subject: true,
                        isQuiz: true
                    },
                    orderBy: { date: 'asc' }
                }
            }
        });

        if (!batch) return res.status(404).json({ error: 'Batch not found' });

        const user = req.user;
        if (batch.instituteId !== user.instituteId) {
            return res.status(403).json({ error: 'Unauthorized access to batch' });
        }

        // Merge direct tests + shared tests, deduplicated by id, sorted by date
        const seenTestIds = new Set<string>();
        const allTests = [...(batch.tests || []), ...((batch as any).sharedTests || [])]
            .filter(t => { if (seenTestIds.has(t.id)) return false; seenTestIds.add(t.id); return true; })
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        res.json({
            ...batch,
            coachingFeeMode: batch.institute?.coachingFeeMode ?? 'CURRENT_DUE_BASED',
            timezone: batch.institute?.timezone ?? 'Asia/Kolkata',
            tests: allTests,
            sharedTests: undefined,
        });
    } catch (e) {
        console.error('[getBatchDetails] Error:', e);
        res.status(500).json({ error: 'Failed to fetch batch details' });
    }
};


export const downloadBatchPDF = async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    try {
        const batch = await prisma.batch.findUnique({
            where: { id },
            include: {
                students: {
                    where: { status: 'APPROVED' },
                    orderBy: { name: 'asc' },
                    include: {
                        fees: { select: { amount: true, date: true, status: true } },
                        feePayments: { select: { amountPaid: true, date: true, installmentId: true } },
                        marks: { select: { score: true } }
                    }
                },
                feeInstallments: { orderBy: { createdAt: 'asc' } }
            }
        });

        if (!batch) return res.status(404).json({ error: 'Batch not found' });

        const user = req.user;
        if (batch.instituteId !== user.instituteId) return res.status(403).json({ error: 'Unauthorized' });

        // PERF FIX (P0-C): Run synchronous PDFKit in a worker thread.
        // PDFKit blocks the event loop for 200-500ms per PDF — catastrophic at scale.
        const ext = path.extname(__filename); // Returns .ts in dev, .js in prod
        const workerScript = path.resolve(__dirname, `../workers/batchPdfWorker${ext}`);
        const pdfBuffer = await runPdfInWorker(workerScript, { batch });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${batch.name}-fee-details.pdf"`);
        res.send(pdfBuffer);
    } catch (e) {
        console.error('[downloadBatchPDF]', e);
        res.status(500).json({ error: 'Failed to generate PDF' });
    }
};

export const toggleBatchRegistration = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { isOpen } = req.body;
    const teacherId = req.user?.id;

    try {
        const batch = await prisma.batch.findUnique({ where: { id: String(id) } });
        if (!batch) return res.status(404).json({ error: 'Batch not found' });

        const user = req.user;
        if (batch.instituteId !== user.instituteId) return res.status(403).json({ error: 'Unauthorized' });

        const updated = await prisma.batch.update({
            where: { id: String(id) },
            data: { isRegistrationOpen: isOpen }
        });
        res.json(updated);
    } catch (e) {
        res.status(500).json({ error: 'Failed to update registration status' });
    }
};

export const createFeeInstallment = async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const { name, amount, studentId } = req.body;
    const teacherId = req.user?.id;

    if (!name || amount === undefined) {
        return res.status(400).json({ error: 'Name and amount are required' });
    }

    // M5 fix: Guard against NaN or zero/negative amounts
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ error: 'Amount must be a positive number' });
    }

    try {
        // M6 fix: Fetch only the fields we need for fee reminders
        // H3 fix: Scope feePayments to only this batch's installments
        const batch = await prisma.batch.findUnique({ 
            where: { id },
            include: {
                institute: { select: { name: true, slug: true } },
                students: {
                    where: { status: 'APPROVED' },
                    select: {
                        id: true, // Needed for studentId match
                        name: true,
                        parentWhatsapp: true,
                        feePayments: {
                            where: { installment: { batchId: id } }
                        }
                    }
                },
                feeInstallments: { select: { id: true, name: true, amount: true } }
            }
        });
        if (!batch) return res.status(404).json({ error: 'Batch not found' });

        const user = req.user;
        if (batch.instituteId !== user.instituteId) return res.status(403).json({ error: 'Unauthorized' });

        if (studentId) {
            const studentExists = batch.students.find(s => s.id === studentId);
            if (!studentExists) return res.status(400).json({ error: 'Student not found in this batch' });
        }

        const installment = await prisma.feeInstallment.create({
            data: {
                batchId: id,
                name,
                amount: parsedAmount,
                studentId: studentId || null
            }
        });

        // Create explicit assignments for the created installment
        if (studentId) {
            await prisma.feeInstallmentAssignment.create({
                data: { studentId, installmentId: installment.id }
            });
        } else {
            const studentsToAssign = batch.students.map(s => ({
                studentId: s.id,
                installmentId: installment.id
            }));
            if (studentsToAssign.length > 0) {
                await prisma.feeInstallmentAssignment.createMany({
                    data: studentsToAssign
                });
            }
        }

        // --- Auto-Send Fee Reminder Logic (Background Queue) ---
        // Sending directly to DB queue, no throttling required.
        const { sendFeeReminderUpiWhatsApp } = await import('../utils/whatsapp');
        const instituteName = batch.institute?.name || 'Coaching Institute';
        const upiPaymentLink = batch.institute?.slug ? `https://mathlogs.app/pay/${batch.institute.slug}` : 'Please contact admin for payment details.';
        const allInstallments = [...batch.feeInstallments, installment];
        
        // Target only the specific student if a custom invoice, otherwise notify everyone
        const studentsToNotify = studentId 
            ? batch.students.filter(s => s.parentWhatsapp && s.id === studentId)
            : batch.students.filter(s => s.parentWhatsapp);

        // Fire in background — don't block the HTTP response
        setImmediate(async () => {
            let sent = 0, failed = 0;
            for (const student of studentsToNotify) {
                let totalDue = 0;
                const breakupLines: string[] = [];

                for (const inst of allInstallments) {
                    const payments = student.feePayments.filter(p => p.installmentId === inst.id);
                    const paidForInst = payments.reduce((sum, p) => sum + p.amountPaid, 0);
                    const dueForInst = inst.amount - paidForInst;
                    if (dueForInst > 0) {
                        totalDue += dueForInst;
                        breakupLines.push(`- ${inst.name}: ₹${dueForInst}`);
                    }
                }

                if (totalDue > 0) {
                    const phoneDigits = student.parentWhatsapp!.replace(/\D/g, '').slice(-10);
                    const personalizedUpiLink = batch.institute?.slug 
                        ? `https://mathlogs.app/pay/${batch.institute.slug}?phone=${phoneDigits}`
                        : 'Please contact admin for payment details.';

                    try {
                        const delivery = await sendStudentAlertForStudent(student.id, phone => sendFeeReminderUpiWhatsApp(phone, {
                            studentName: student.name,
                            batchName: batch.name,
                            feeBreakup: breakupLines.join(' | '),
                            totalAmount: totalDue.toString(),
                            instituteName,
                            upiPaymentLink: personalizedUpiLink
                        }));
                        sent += delivery.delivered;
                        failed += delivery.failed;
                    } catch (err) {
                        failed++;
                        console.error(`WhatsApp fee reminder failed for student ${student.id}:`, err);
                    }

                }
            }
            secureLogger.info(`[Fee Reminder] batch ${id}: ${sent} sent, ${failed} failed out of ${studentsToNotify.length}`);
        });

        res.json(installment);
    } catch (e) {
        console.error('Error creating installment:', e);
        res.status(500).json({ error: 'Failed to create fee installment' });
    }
};

export const updateFeeInstallment = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { name, amount } = req.body;

    try {
        const installment = await prisma.feeInstallment.findUnique({
            where: { id: String(id) },
            include: { batch: true }
        });
        if (!installment) return res.status(404).json({ error: 'Installment not found' });

        const user = req.user;
        if (installment.batch.instituteId !== user.instituteId) return res.status(403).json({ error: 'Unauthorized' });

        const updated = await prisma.feeInstallment.update({
            where: { id: String(id) },
            data: {
                name: name !== undefined ? name : undefined,
                amount: amount !== undefined ? parseFloat(amount) : undefined,
            }
        });
        res.json(updated);
    } catch (e) {
        console.error('Error updating installment:', e);
        res.status(500).json({ error: 'Failed to update fee installment' });
    }
};

export const deleteFeeInstallment = async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
        const installment = await prisma.feeInstallment.findUnique({
            where: { id: String(id) },
            include: { batch: true, _count: { select: { payments: true } } }
        });
        if (!installment) return res.status(404).json({ error: 'Installment not found' });

        const user = req.user;
        if (installment.batch.instituteId !== user.instituteId) return res.status(403).json({ error: 'Unauthorized' });

        if (installment._count.payments > 0) {
            return res.status(400).json({ error: `Cannot delete fee column: ${installment._count.payments} payment(s) have already been made.` });
        }

        await prisma.feeInstallment.delete({ where: { id: String(id) } });
        res.json({ success: true });
    } catch (e) {
        console.error('Error deleting installment:', e);
        res.status(500).json({ error: 'Failed to delete fee installment' });
    }
};

const publicBatchCache = new Map<string, { data: any, timestamp: number }>();
const CACHE_TTL_MS = 30 * 1000; // 30 seconds

export const clearPublicBatchCache = () => {
    publicBatchCache.clear();
};

export const getBatchPublicStatus = async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const token = req.query.token as string | undefined;

    try {
        const now = Date.now();
        const cached = publicBatchCache.get(id);
        let safeBatchData;

        if (cached && now - cached.timestamp < CACHE_TTL_MS) {
            safeBatchData = cached.data;
        } else {
            const batch = await prisma.batch.findUnique({
                where: { id },
                select: {
                    name: true,
                    subject: true,
                    isRegistrationOpen: true,
                    isRegistrationEnded: true,
                    whatsappGroupLink: true,
                    autoSendWelcome: true,
                    institute: {
                        select: { name: true, areRegistrationsPaused: true, plan: true, planExpiryDate: true, config: true }
                    }
                }
            });

            if (!batch) return res.status(404).json({ error: 'Batch not found' });

            // Extract logo and registrationForm safely without sending whole config
            let logoUrl = null;
            let registrationForm = null;
            if (batch.institute && (batch.institute.config as any)) {
                logoUrl = (batch.institute.config as any).logo || null;
                registrationForm = (batch.institute.config as any).registrationForm || null;
            }

            safeBatchData = {
                ...batch,
                institute: {
                    ...batch.institute,
                    logoUrl,
                    config: { registrationForm } // Only expose safe config pieces
                }
            };

            // Overwrite so frontend disables registration natively if sub is cancelled or expired
            if (safeBatchData.institute) {
                const isPlanExpired = safeBatchData.institute.planExpiryDate && new Date(batch.institute!.planExpiryDate!).getTime() < Date.now();
                if (safeBatchData.institute.areRegistrationsPaused || isPlanExpired) {
                    safeBatchData.isRegistrationOpen = false;
                }
            }

            // Save to cache
            publicBatchCache.set(id, { data: safeBatchData, timestamp: now });
        }

        // Clean up old cache entries occasionally
        if (publicBatchCache.size > 100) {
            for (const [key, value] of publicBatchCache.entries()) {
                if (now - value.timestamp > CACHE_TTL_MS) publicBatchCache.delete(key);
            }
        }

        // Check if token (invite link) has already been used to register
        let isAlreadyRegistered = false;
        let registeredStudentData = null;

        let isTokenValid = false;
        let invitePhone: string | null = null;

        if (token) {
            try {
                const decoded = jwt.verify(token, JWT_SECRET) as any;
                if (decoded.batchId === id && decoded.whatsapp) {
                    isTokenValid = true;
                    invitePhone = decoded.whatsapp;
                    const existingStudent = await prisma.student.findFirst({
                        where: { batchId: id, parentWhatsapp: decoded.whatsapp }
                    });

                    if (existingStudent) {
                        isAlreadyRegistered = true;
                        registeredStudentData = {
                            id: existingStudent.id,
                            humanId: existingStudent.humanId,
                            name: existingStudent.name,
                            schoolName: existingStudent.schoolName,
                            batchId: existingStudent.batchId,
                            parentWhatsapp: existingStudent.parentWhatsapp
                        };
                    }
                }
            } catch (err) {
                // If token is invalid/expired, ignore it for now. The frontend /register route will block it.
            }
        }

        const responseData = {
            ...safeBatchData,
            alreadyRegistered: isAlreadyRegistered,
            registeredStudent: registeredStudentData
        };

        // If the teacher provided a valid token, we bypass all paused/closed restrictions
        if (isTokenValid) {
            responseData.isRegistrationOpen = true;
            responseData.isRegistrationEnded = false;
        }

        res.json(responseData);
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch status' });
    }
};

export const endBatchRegistration = async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const teacherId = req.user?.id;

    try {
        const batch = await prisma.batch.findUnique({ where: { id } });
        if (!batch) return res.status(404).json({ error: 'Batch not found' });

        const user = req.user;
        if (batch.instituteId !== user.instituteId) return res.status(403).json({ error: 'Unauthorized' });

        const updated = await prisma.batch.update({
            where: { id: String(id) },
            data: { isRegistrationEnded: true, isRegistrationOpen: false }
        });
        res.json(updated);
    } catch (e) {
        res.status(500).json({ error: 'Failed to end registration' });
    }
};

export const updateBatch = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { name, subject, timeSlot, feeAmount, className, whatsappGroupLink, autoSendWelcome, startDate, endDate } = req.body;
    const teacherId = req.user?.id;

    try {
        const batch = await prisma.batch.findUnique({
            where: { id: String(id) },
            include: { institute: { select: { coachingFeeMode: true } } },
        });
        if (!batch) return res.status(404).json({ error: 'Batch not found' });

        const user = req.user;
        if (batch.instituteId !== user.instituteId) return res.status(403).json({ error: 'Unauthorized' });

        const usesMonthCoverage = batch.institute?.coachingFeeMode === 'MONTH_COVERAGE';
        const nextStartDate = startDate ? new Date(startDate) : batch.startDate;
        const nextEndDate = endDate ? new Date(endDate) : batch.endDate;
        if (usesMonthCoverage && (!nextStartDate || !nextEndDate)) {
            return res.status(400).json({ error: 'BATCH_DATES_REQUIRED' });
        }
        if (usesMonthCoverage && (
            Number.isNaN(nextStartDate!.getTime()) || Number.isNaN(nextEndDate!.getTime())
            || nextStartDate!.getTime() > nextEndDate!.getTime()
        )) {
            return res.status(400).json({ error: 'INVALID_BATCH_DATE_RANGE' });
        }

        const updated = await prisma.batch.update({
            where: { id: String(id) },
            data: {
                name,
                subject,
                timeSlot,
                className,
                feeAmount: usesMonthCoverage ? 0 : (feeAmount !== undefined ? parseFloat(feeAmount) : undefined),
                startDate: usesMonthCoverage && startDate ? nextStartDate : undefined,
                endDate: usesMonthCoverage && endDate ? nextEndDate : undefined,
                whatsappGroupLink,
                autoSendWelcome: autoSendWelcome !== undefined ? autoSendWelcome === true : undefined
            }
        });
        res.json(updated);
    } catch (e) {
        console.error('Error updating batch:', e);
        res.status(500).json({ error: 'Failed to update batch' });
    }
};

export const deleteBatch = async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
        const batch = await prisma.batch.findUnique({
            where: { id: String(id) },
            include: {
                _count: {
                    select: { feeInstallments: true }
                }
            }
        });
        if (!batch) return res.status(404).json({ error: 'Batch not found' });

        const user = req.user;
        if (batch.instituteId !== user.instituteId) return res.status(403).json({ error: 'Unauthorized' });

        // FINANCIAL SAFETY GUARD (P1-A): Prevent destruction of payment history.
        // Hard-deleting a batch with payments cascades and wipes the entire financial ledger.
        // Admins must archive/soft-delete instead if payment records exist.
        const paymentCount = await prisma.feePayment.count({
            where: { installment: { batchId: String(id) } }
        });
        if (paymentCount > 0) {
            return res.status(409).json({
                error: `Cannot delete batch with ${paymentCount} existing payment record(s). This would permanently destroy financial history. Please contact support to archive this batch instead.`
            });
        }

        await prisma.batch.delete({ where: { id: String(id) } });
        res.json({ success: true });
    } catch (e) {
        console.error('Error deleting batch:', e);
        res.status(500).json({ error: 'Failed to delete batch' });
    }
};

// --- WhatsApp Invitation Feature ---

// Real Email Service with Nodemailer

// Email handling moved to utils/email.ts

export const sendBatchWhatsappInvite = async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
        const batch = await prisma.batch.findUnique({
            where: { id: String(id) },
            include: {
                students: { where: { status: 'APPROVED' } },
                institute: true
            }
        });

        const user = req.user;
        if (batch?.instituteId && batch.instituteId !== user.instituteId) return res.status(403).json({ error: 'Unauthorized' });

        if (!batch) return res.status(404).json({ error: 'Batch not found' });
        if (!batch.whatsappGroupLink) return res.status(400).json({ error: 'No WhatsApp group link configured for this batch' });

        const link = batch.whatsappGroupLink;
        if (!link.includes('chat.whatsapp.com')) {
            return res.status(400).json({ error: 'Invalid WhatsApp Group Link' });
        }

        const senderName = batch.institute?.name || 'Coaching Centre';
        const replyTo = batch.institute?.email || undefined;

        // 1. Queue email invites for students who have an email
        const emailJobs = batch.students
            .filter(student => student.parentEmail)
            .map(student => {
                const body = `Hello ${student.name},\n\nWelcome to ${batch.name} (${batch.subject || 'Course'}).\n\nBatch Details:\n• Class: ${batch.className || 'N/A'}\n• Time: ${batch.timeSlot || 'N/A'}\n• Student ID: ${student.humanId || 'N/A'}\n\nJoin the official WhatsApp group for announcements and updates:\n👉 ${link}\n\nPlease join the group to stay informed.\n\n– ${senderName}`;
                return {
                    recipient: student.parentEmail!,
                    subject: `Welcome to ${batch.name} – ${batch.subject}`,
                    body,
                    status: 'PENDING',
                    options: { senderName, replyTo, senderType: 'WELCOME' },
                    instituteId: batch.instituteId
                };
            });

        if (emailJobs.length > 0) {
            await prisma.emailJob.createMany({ data: emailJobs as any });
        }

        // 2. Send Welcome WhatsApp API via Meta (Queue) for students with phone numbers
        const { sendWelcomeWhatsApp } = await import('../utils/whatsapp');
        let whatsappCount = 0;
        let whatsappFailed = 0;

        for (const student of batch.students) {
            if (!student.parentWhatsapp) continue;

            try {
                const delivery = await sendStudentAlertForStudent(student.id, phone => sendWelcomeWhatsApp(phone, {
                    studentName: student.name,
                    batchName: batch.name,
                    instituteName: senderName,
                    whatsappLink: link
                }));
                whatsappCount += delivery.delivered;
                whatsappFailed += delivery.failed;
            } catch (err) {
                whatsappFailed++;
                console.error(`Failed to send Welcome WhatsApp for student ${student.id}`, err);
            }

        }

        if (whatsappFailed > 0) {
            secureLogger.warn(`[Batch Invite WA] ${whatsappCount} sent, ${whatsappFailed} failed for batch ${id}`);
        }

        res.json({
            success: true,
            emailCount: emailJobs.length,
            whatsappCount,
            message: `Invites processed — ${emailJobs.length} email(s) + ${whatsappCount} WhatsApp message(s) sent`
        });

    } catch (e) {
        console.error('Error sending invites:', e);
        res.status(500).json({ error: 'Failed to send invites' });
    }
};

// Check env on load (Debug)
secureLogger.info('Email service configured', {
    user: process.env.EMAIL_USER ? '***SET***' : 'NOT SET'
});

export const sendStudentWhatsappInvite = async (req: Request, res: Response) => {
    const { id } = req.params; // Student ID

    try {
        const teacherId = req.user?.id;
        const student = await prisma.student.findUnique({
            where: { id: String(id) },

            include: {
                batch: {
                    include: { institute: true }
                }
            }
        });

        const user = req.user;
        if (student?.batch?.instituteId && student.batch.instituteId !== user.instituteId) return res.status(403).json({ error: 'Unauthorized' });

        if (!student) return res.status(404).json({ error: 'Student not found' });
        if (!student.batch) return res.status(400).json({ error: 'Student is not assigned to a batch' });
        if (!student.batch.whatsappGroupLink) return res.status(400).json({ error: 'Batch has no WhatsApp link' });
        if (!student.parentEmail) return res.status(400).json({ error: 'Student has no parent email' });

        const batch = student.batch;
        const link = batch.whatsappGroupLink;

        const senderName = batch.institute?.name || 'Coaching Centre';
        const replyTo = batch.institute?.email || undefined;

        const body = `Hello ${student.name},

Welcome to ${batch.name} (${batch.subject || 'Course'}).

Batch Details:
• Class: ${batch.className || 'N/A'}
• Time: ${batch.timeSlot || 'N/A'}
• Student ID: ${student.humanId || 'N/A'}

Join the official WhatsApp group for announcements and updates:
👉 ${link}

Please join the group to stay informed.

– ${senderName}`;

        await prisma.emailJob.create({
            data: {
                recipient: student.parentEmail,
                subject: `Welcome to ${batch.name} – ${batch.subject}`,
                body,
                status: 'PENDING',
                options: { senderName, replyTo, senderType: 'WELCOME' },
                instituteId: student.batch.instituteId
            } as any
        });

        // Also send WhatsApp if parent has a phone number
        if (student.parentWhatsapp) {
            const { sendWelcomeWhatsApp } = await import('../utils/whatsapp');
            void sendStudentAlertForStudent(student.id, phone => sendWelcomeWhatsApp(phone, {
                studentName: student.name,
                batchName: batch.name,
                instituteName: senderName,
                whatsappLink: link || ''
            })).catch(err => console.error(`WhatsApp invite failed for student ${student.id}:`, err));
        }

        res.json({ success: true, message: 'Invite sent (Email + WhatsApp)' });

    } catch (e) {
        console.error('Error sending invite:', e);
        res.status(500).json({ error: 'Failed to send invite' });
    }
};

export const downloadBatchQRPDF = async (req: Request, res: Response) => {
    const { id } = req.params;

    try {
        const batch = await prisma.batch.findUnique({ where: { id: String(id) } });
        if (!batch) return res.status(404).json({ error: 'Batch not found' });

        const user = req.user;
        if (batch.instituteId !== user.instituteId) return res.status(403).json({ error: 'Unauthorized' });

        // Dynamically import pdfkit and pdfUtils to avoid top-level import of removed unused vars
        // bwip-js and PDFDocument are kept local to this function
        const PDFDocument = (await import('pdfkit')).default;
        const { addMathLogsHeader } = await import('../utils/pdfUtils');

        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const chunks: Buffer[] = [];
        doc.on('data', (chunk: Buffer) => chunks.push(chunk));

        const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            // Add MathLogs branding
            addMathLogsHeader(doc, 30);
            doc.moveDown(2);

            // Header
            doc.fontSize(24).font('Helvetica-Bold').text(batch.name, { align: 'center' });
            doc.fontSize(14).font('Helvetica').text(batch.subject || 'Course', { align: 'center' });
            doc.moveDown(0.5);
            doc.fontSize(12).text(batch.className || '', { align: 'center' });
            doc.moveDown(2);

            // QR Code (generate async, then finish PDF)
            const registerUrl = `${getClientUrl(req)}/register/${batch.id}`;
            bwipjs.toBuffer({
                bcid: 'qrcode',
                text: registerUrl,
                scale: 5,
                includetext: false,
                textxalign: 'center',
            }).then(qrPng => {
                const pageWidth = doc.page.width;
                const pageHeight = doc.page.height;
                const qrSize = 300;
                doc.image(qrPng, (pageWidth - qrSize) / 2, (pageHeight - qrSize) / 2 - 50, { width: qrSize });
                doc.text('Scan to Register', (pageWidth - qrSize) / 2, (pageHeight - qrSize) / 2 + qrSize + 20, { width: qrSize, align: 'center' });
                doc.fillColor('grey').fontSize(10).text('Powered by MathLogs', 50, pageHeight - 50, { align: 'center', width: pageWidth - 100 });
                doc.end();
            }).catch(reject);
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=QR-${batch.name.replace(/\s+/g, '-')}.pdf`);
        res.send(pdfBuffer);

    } catch (e) {
        console.error('Error generating QR PDF:', e);
        res.status(500).json({ error: 'Failed to generate PDF' });
    }
};

export const inviteStudentToBatch = async (req: Request, res: Response) => {
    const { id } = req.params;
    let { whatsappNumber } = req.body;

    if (!whatsappNumber) {
        return res.status(400).json({ error: "WhatsApp number is required" });
    }

    if (typeof whatsappNumber === 'string') {
        whatsappNumber = whatsappNumber.replace(/\D/g, '');
        if (whatsappNumber.length > 10) whatsappNumber = whatsappNumber.slice(-10);
    }

    try {
        const batch = await prisma.batch.findUnique({
            where: { id: String(id) },
            include: { institute: true }
        });

        if (!batch) return res.status(404).json({ error: 'Batch not found' });

        const user = req.user;
        if (batch.instituteId !== user.instituteId) return res.status(403).json({ error: 'Unauthorized' });

        const payload = {
            batchId: String(id),
            whatsapp: whatsappNumber,
            exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 7) // 7 days expiration
        };
        const token = jwt.sign(payload, JWT_SECRET);
        const fullUrl = `${getClientUrl(req)}/register/${batch.id}?token=${token}`;

        const shortCode = crypto.randomBytes(4).toString('hex');
        await prisma.shortUrl.create({
            data: {
                id: shortCode,
                longUrl: fullUrl
            }
        });
        const registrationLink = `${getClientUrl(req)}/s/${shortCode}`;

        // Send via WhatsApp
        await sendStudentInviteWhatsApp(whatsappNumber, {
            instituteName: batch.institute?.name || "Education Center",
            batchName: batch.name,
            registrationLink
        });

        res.json({ success: true, message: "Registration link sent successfully to WhatsApp." });
    } catch (error) {
        console.error("Error creating student invite:", error);
        res.status(500).json({ error: "Failed to send invite link" });
    }
};
