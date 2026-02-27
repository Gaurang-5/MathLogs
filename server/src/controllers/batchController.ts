import { Request, Response } from 'express';
import path from 'path';
import { prisma } from '../prisma';
import { runPdfInWorker } from '../utils/pdfWorker';
import bwipjs from 'bwip-js';
import { secureLogger } from '../utils/secureLogger';
import { sendEmail } from '../utils/email';
import { getClientUrl } from '../utils/urlConfig';

export const createBatch = async (req: Request, res: Response) => {
    const { timeSlot, feeAmount, className, batchNumber, subject, customName } = req.body;
    const teacherId = (req as any).user?.id;
    const user = (req as any).user;
    const academicYearId = (req as any).user?.currentAcademicYearId;

    if (!user.instituteId) return res.status(401).json({ error: 'Unauthorized: No institute assigned' });
    if (!academicYearId) return res.status(400).json({ error: 'No academic year selected' });

    // Fetch Institute Config
    const institute = await prisma.institute.findUnique({
        where: { id: user.instituteId },
        select: { config: true }
    });

    if (!institute) return res.status(404).json({ error: 'Institute not found' });

    // Default Config if none exists
    const config = (institute.config as any) || {
        requiresGrades: true,
        classes: [
            { name: 'Class 9', maxBatches: 2 },
            { name: 'Class 10', maxBatches: 3 }
        ]
    };

    const requiresGrades = config.requiresGrades !== false; // Default to true if not specified

    // Validate Global Limit (New Requirement)
    if (config.maxBatches) {
        const totalBatches = await prisma.batch.count({
            where: {
                instituteId: user.instituteId,
                academicYearId
            }
        });
        if (totalBatches >= config.maxBatches) {
            return res.status(400).json({ error: `Max total batches limit reached (${config.maxBatches}).` });
        }
    }

    // If institute doesn't require grades, skip className validation
    if (!requiresGrades) {
        // For non-grade-based institutes, just validate batch number
        if (!batchNumber) {
            return res.status(400).json({ error: 'Batch Number is required' });
        }

        const num = parseInt(batchNumber);
        if (isNaN(num) || num < 1) {
            return res.status(400).json({ error: 'Invalid Batch Number' });
        }

        // Check Max Batches per Subject Limit
        const maxBatchesPerSubject = config.maxBatchesPerClass || 5;
        const currentSubject = subject || 'General';


        const existingBatchesCount = await prisma.batch.count({
            where: {
                instituteId: user.instituteId,
                academicYearId: academicYearId,
                className: null,
                subject: currentSubject
            }
        });

        // Only enforce subject limit if Global Limit is NOT active
        if (!config.maxBatches && existingBatchesCount >= maxBatchesPerSubject) {
            return res.status(400).json({
                error: `Max limit of ${maxBatchesPerSubject} batches reached for subject: ${currentSubject}`
            });
        }

        try {
            // Check for duplicate batch number in the current academic year
            const existing = await prisma.batch.findFirst({
                where: {
                    batchNumber: num,
                    academicYearId: academicYearId,
                    className: null, // For non-grade institutes, className is null
                    instituteId: user.instituteId // Scoped to tenant!
                }
            });

            if (existing) {
                return res.status(400).json({ error: `Batch ${num} already exists (Batches must have unique numbers across all subjects)` });
            }

            const batch = await prisma.batch.create({
                data: {
                    name: customName || `${subject || 'Course'} - Batch ${num}`,
                    subject: subject || 'General',
                    timeSlot,
                    className: null, // No class/grade for this type of institute
                    batchNumber: num,
                    feeAmount: feeAmount ? parseFloat(feeAmount) : 0,
                    teacherId,
                    academicYearId,
                    instituteId: user.instituteId
                }
            });
            return res.json(batch);
        } catch (error) {
            console.error('Error creating batch:', error);
            return res.status(500).json({ error: 'Failed to create batch' });
        }
    }

    // For grade-based institutes, validate className
    if (!className || !batchNumber) {
        return res.status(400).json({ error: 'Class and Batch Number are required' });
    }

    // Validation
    const num = parseInt(batchNumber);
    if (isNaN(num)) return res.status(400).json({ error: 'Invalid Batch Number' });

    // Dynamic Validation based on Institute Config
    // Simplify parsing if config is old format vs new format
    // Normalize config to array of objects
    let classConfig;
    if (Array.isArray(config.allowedClasses)) {
        // Migration support for simple array format
        if (!config.allowedClasses.includes(className)) {
            return res.status(400).json({ error: `Class "${className}" is not allowed for this institute` });
        }
        classConfig = { maxBatches: config.maxBatchesPerClass || 5 }; // Use configured limit or default to 5
    } else if (config.classes) {
        // Robust object format
        classConfig = config.classes.find((c: any) => c.name === className);
        if (!classConfig) {
            return res.status(400).json({ error: `Class "${className}" is not allowed for this institute` });
        }
    } else {
        // Fallback for empty config
        if (className !== 'Class 9' && className !== 'Class 10') {
            return res.status(400).json({ error: 'Invalid Class (Default Rule)' });
        }
        classConfig = { maxBatches: className === 'Class 9' ? 2 : 3 };
    }

    if (num < 1) {
        return res.status(400).json({ error: 'Batch Number must be greater than 0' });
    }

    // Only enforce class limit if Global Limit is NOT active
    if (!config.maxBatches && num > classConfig.maxBatches) {
        return res.status(400).json({
            error: `${className} can only have up to ${classConfig.maxBatches} batches`
        });
    }

    try {
        // Check for duplicate
        // Check for duplicate in the current academic year
        const existing = await prisma.batch.findFirst({
            where: {
                className,
                batchNumber: num,
                academicYearId: academicYearId,
                instituteId: user.instituteId // Scoped to tenant!
            }
        });
        if (existing) {
            return res.status(400).json({ error: `${className} - Batch ${num} already exists` });
        }

        const batch = await prisma.batch.create({
            data: {
                name: customName || `${className} - Batch ${num}`,
                subject: subject || 'Mathematics',
                timeSlot,
                className,
                batchNumber: num,
                feeAmount: feeAmount ? parseFloat(feeAmount) : 0,

                teacherId,
                academicYearId,
                instituteId: user.instituteId
            }
        });
        res.json(batch);
    } catch (error) {
        console.error('Error creating batch:', error);
        res.status(500).json({ error: 'Failed to create batch' });
    }
};

export const getBatches = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;

        const batches = await prisma.batch.findMany({
            where: {
                instituteId: user.instituteId,
                academicYearId: user.currentAcademicYearId // Filter by active year
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
        res.json(batches);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch batches' });
    }
};

export const getBatchDetails = async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const teacherId = (req as any).user?.id;

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
                whatsappGroupLink: true,
                isRegistrationOpen: true,
                isRegistrationEnded: true,
                teacherId: true,
                instituteId: true,
                feeInstallments: {
                    select: {
                        id: true,
                        name: true,
                        amount: true,
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
                        feePayments: {
                            select: {
                                id: true,
                                amountPaid: true,
                                date: true,
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
                                        maxMarks: true
                                    }
                                }
                            }
                        }
                    },
                    orderBy: { name: 'asc' }
                }
            }
        });

        if (!batch) return res.status(404).json({ error: 'Batch not found' });

        const user = (req as any).user;
        if (batch.instituteId !== user.instituteId) {
            return res.status(403).json({ error: 'Unauthorized access to batch' });
        }
        res.json(batch);
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

        const user = (req as any).user;
        if (batch.instituteId !== user.instituteId) return res.status(403).json({ error: 'Unauthorized' });

        // PERF FIX (P0-C): Run synchronous PDFKit in a worker thread.
        // PDFKit blocks the event loop for 200-500ms per PDF — catastrophic at scale.
        const workerScript = path.resolve(__dirname, '../workers/batchPdfWorker.js');
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
    const teacherId = (req as any).user?.id;

    try {
        const batch = await prisma.batch.findUnique({ where: { id: String(id) } });
        if (!batch) return res.status(404).json({ error: 'Batch not found' });

        const user = (req as any).user;
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
    const { name, amount } = req.body;
    const teacherId = (req as any).user?.id;

    if (!name || amount === undefined) {
        return res.status(400).json({ error: 'Name and amount are required' });
    }

    try {
        const batch = await prisma.batch.findUnique({ where: { id } });
        if (!batch) return res.status(404).json({ error: 'Batch not found' });

        const user = (req as any).user;
        if (batch.instituteId !== user.instituteId) return res.status(403).json({ error: 'Unauthorized' });

        const installment = await prisma.feeInstallment.create({
            data: {
                batchId: id,
                name,
                amount: parseFloat(amount)
            }
        });
        res.json(installment);
    } catch (e) {
        console.error('Error creating installment:', e);
        res.status(500).json({ error: 'Failed to create fee installment' });
    }
};

export const getBatchPublicStatus = async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    try {
        const batch = await prisma.batch.findUnique({
            where: { id },
            select: {
                id: true,
                name: true,
                subject: true,
                isRegistrationOpen: true,
                isRegistrationEnded: true
            }
        });
        if (!batch) return res.status(404).json({ error: 'Batch not found' });
        res.json(batch);
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch status' });
    }
};

export const endBatchRegistration = async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const teacherId = (req as any).user?.id;

    try {
        const batch = await prisma.batch.findUnique({ where: { id } });
        if (!batch) return res.status(404).json({ error: 'Batch not found' });

        const user = (req as any).user;
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
    const { name, subject, timeSlot, feeAmount, className, whatsappGroupLink } = req.body;
    const teacherId = (req as any).user?.id;
    const currentAcademicYearId = (req as any).user?.currentAcademicYearId;

    try {
        const batch = await prisma.batch.findUnique({ where: { id: String(id) } });
        if (!batch) return res.status(404).json({ error: 'Batch not found' });

        const user = (req as any).user;
        if (batch.instituteId !== user.instituteId) return res.status(403).json({ error: 'Unauthorized' });

        // Academic year boundary check
        if (batch.academicYearId && batch.academicYearId !== currentAcademicYearId) {
            return res.status(400).json({ error: 'Cannot modify batch from non-active academic year. Switch to the correct year first.' });
        }

        const updated = await prisma.batch.update({
            where: { id: String(id) },
            data: {
                name,
                subject,
                timeSlot,
                className,
                feeAmount: feeAmount !== undefined ? parseFloat(feeAmount) : undefined,
                whatsappGroupLink
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
    const currentAcademicYearId = (req as any).user?.currentAcademicYearId;

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

        const user = (req as any).user;
        if (batch.instituteId !== user.instituteId) return res.status(403).json({ error: 'Unauthorized' });

        // Academic year boundary check
        if (batch.academicYearId && batch.academicYearId !== currentAcademicYearId) {
            return res.status(400).json({ error: 'Cannot delete batch from non-active academic year. Switch to the correct year first.' });
        }

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

        const user = (req as any).user;
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

        // 2. Queue WhatsApp invites for students who have a parent phone number
        // Template: batch_whatsapp_invite_v1
        // Body: "Hello {{1}}, you have been enrolled in {{2}} at {{3}}. Join the WhatsApp group here: {{4}}"
        const { queueWhatsappMessage } = await import('../utils/whatsappService');
        let whatsappCount = 0;

        for (const student of batch.students) {
            if (!student.parentWhatsapp) continue;

            let phone = student.parentWhatsapp.replace(/[^0-9+]/g, '');
            if (!phone.startsWith('+')) {
                if (phone.length === 10) phone = '+91' + phone;
            }

            await queueWhatsappMessage(
                phone,
                'batch_whatsapp_invite_v1',
                [student.name, batch.name, senderName, link],
                batch.instituteId || undefined
            );
            whatsappCount++;
        }

        res.json({
            success: true,
            emailCount: emailJobs.length,
            whatsappCount,
            message: `Invites queued — ${emailJobs.length} email(s) + ${whatsappCount} WhatsApp message(s)`
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
        const teacherId = (req as any).user?.id;
        const student = await prisma.student.findUnique({
            where: { id: String(id) },

            include: {
                batch: {
                    include: { institute: true }
                }
            }
        });

        const user = (req as any).user;
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

        res.json({ success: true, message: 'Invite queued successfully' });

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

        const user = (req as any).user;
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

