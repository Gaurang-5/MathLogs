import { Request, Response } from 'express';
import { prisma } from '../prisma';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import bwipjs from 'bwip-js';
import { secureLogger } from '../utils/secureLogger';
import { sendEmail } from '../utils/email';
import { addMathLogsHeader } from '../utils/pdfUtils';
import { getClientUrl } from '../utils/urlConfig';

export const createBatch = async (req: Request, res: Response) => {
    const { timeSlot, feeAmount, className, batchNumber, subject } = req.body;
    const teacherId = (req as any).user?.id;
    const user = (req as any).user;
    const academicYearId = (req as any).user?.currentAcademicYearId;

    if (!user.instituteId) return res.status(401).json({ error: 'Unauthorized: No institute assigned' });
    if (!academicYearId) return res.status(400).json({ error: 'No academic year selected' });

    if (!className || !batchNumber) {
        return res.status(400).json({ error: 'Class and Batch Number are required' });
    }

    // Validation
    const num = parseInt(batchNumber);
    if (isNaN(num)) return res.status(400).json({ error: 'Invalid Batch Number' });

    // Dynamic Validation based on Institute Config
    const institute = await prisma.institute.findUnique({
        where: { id: user.instituteId },
        select: { config: true }
    });

    if (!institute) return res.status(404).json({ error: 'Institute not found' });

    // Default Config if none exists
    const config = (institute.config as any) || {
        classes: [
            { name: 'Class 9', maxBatches: 2 },
            { name: 'Class 10', maxBatches: 3 }
        ]
    };

    // Simplify parsing if config is old format vs new format
    // Normalize config to array of objects
    let classConfig;
    if (Array.isArray(config.allowedClasses)) {
        // Migration support for simple array format
        if (!config.allowedClasses.includes(className)) {
            return res.status(400).json({ error: `Class "${className}" is not allowed for this institute` });
        }
        classConfig = { maxBatches: 5 }; // Default limit for simple array
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

    if (num < 1 || num > classConfig.maxBatches) {
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
                academicYearId: academicYearId
            }
        });
        if (existing) {
            return res.status(400).json({ error: `${className} - Batch ${num} already exists` });
        }

        const batch = await prisma.batch.create({
            data: {
                name: `${className} - Batch ${num}`,
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
    const teacherId = (req as any).user?.id;
    try {
        // Fetch batch with full student details
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

        const installments = batch.feeInstallments || [];
        const numInstallments = installments.length;

        // Create PDF in LANDSCAPE mode
        const doc = new PDFDocument({
            size: 'A4',
            layout: 'landscape',
            margin: 20
        });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${batch.name}-fee-details.pdf"`);
        doc.pipe(res);

        // Add MathLogs branding at top-left
        addMathLogsHeader(doc, 20);
        doc.moveDown(2);

        // Header
        doc.fontSize(16).font('Helvetica-Bold').text(`${batch.name} - Fee Payment Details`, { align: 'center' });
        doc.fontSize(9).font('Helvetica').text(`Subject: ${batch.subject} | Generated: ${new Date().toLocaleDateString()}`, { align: 'center' });
        doc.moveDown(0.8);

        // Dynamic column calculation (landscape A4: ~800pt usable width)
        const startX = 20;
        const nameWidth = 70;
        const schoolWidth = 60;
        const phoneWidth = 55;
        const avgWidth = 30;
        const feeDueWidth = 40;

        // Remaining width for installments
        const remainingWidth = 800 - nameWidth - schoolWidth - phoneWidth - avgWidth - feeDueWidth - 50;
        const installmentWidth = Math.max(40, Math.floor(remainingWidth / Math.max(numInstallments, 1)));

        // Helper function to draw headers
        const drawHeaders = (y: number) => {
            doc.font('Helvetica-Bold').fontSize(7);
            let x = startX;

            doc.text('Name', x, y, { width: nameWidth });
            x += nameWidth + 5;
            doc.text('School', x, y, { width: schoolWidth });
            x += schoolWidth + 5;
            doc.text('Phone', x, y, { width: phoneWidth });
            x += phoneWidth + 5;
            doc.text('Avg%', x, y, { width: avgWidth });
            x += avgWidth + 5;

            // Installment columns
            installments.forEach((inst, idx) => {
                const instName = inst.name.length > 8 ? inst.name.substring(0, 7) + '.' : inst.name;
                doc.text(instName, x, y, { width: installmentWidth, align: 'center' });
                x += installmentWidth + 2;
            });

            doc.text('Due', x, y, { width: feeDueWidth, align: 'center' });
        };

        // Draw initial headers
        let currentY = doc.y;
        drawHeaders(currentY);
        doc.moveDown(0.2);
        doc.moveTo(startX, doc.y).lineTo(startX + 780, doc.y).stroke();
        doc.moveDown(0.3);

        // Process each student
        batch.students.forEach((student: any) => {
            currentY = doc.y;

            // Pagination
            if (currentY > 510) {
                doc.addPage({ layout: 'landscape' });
                currentY = 40;
                drawHeaders(currentY);
                doc.moveDown(0.2);
                doc.moveTo(startX, doc.y).lineTo(startX + 780, doc.y).stroke();
                doc.moveDown(0.3);
                currentY = doc.y;
            }

            // Calculate average marks
            const avgMarks = student.marks.length > 0
                ? Math.round(student.marks.reduce((sum: number, m: any) => sum + m.score, 0) / student.marks.length)
                : 0;

            // Calculate total fee due
            let totalDue = 0;
            if (installments.length > 0) {
                const totalExpected = installments.reduce((sum, inst) => sum + inst.amount, 0);
                const totalPaidFromPayments = student.feePayments.reduce((sum: number, p: any) => sum + p.amountPaid, 0);
                const totalPaidFromFees = student.fees
                    .filter((f: any) => f.status === 'PAID')
                    .reduce((sum: number, f: any) => sum + f.amount, 0);
                totalDue = Math.max(0, totalExpected - totalPaidFromPayments - totalPaidFromFees);
            } else {
                const totalExpected = batch.feeAmount || 0;
                const totalPaid = student.fees
                    .filter((f: any) => f.status === 'PAID')
                    .reduce((sum: number, f: any) => sum + f.amount, 0) +
                    student.feePayments.reduce((sum: number, p: any) => sum + p.amountPaid, 0);
                totalDue = Math.max(0, totalExpected - totalPaid);
            }

            // Print basic info
            doc.font('Helvetica').fontSize(6.5).fillColor('black');
            let x = startX;

            doc.text(student.name || '-', x, currentY, { width: nameWidth, ellipsis: true });
            x += nameWidth + 5;
            doc.text(student.schoolName || 'N/A', x, currentY, { width: schoolWidth, ellipsis: true });
            x += schoolWidth + 5;
            doc.text(student.parentWhatsapp || '-', x, currentY, { width: phoneWidth });
            x += phoneWidth + 5;
            doc.text(avgMarks > 0 ? `${avgMarks}%` : '-', x, currentY, { width: avgWidth, align: 'center' });
            x += avgWidth + 5;

            // Installment columns
            if (installments.length > 0) {
                installments.forEach((inst) => {
                    const paymentsForThis = student.feePayments.filter((p: any) => p.installmentId === inst.id);
                    const totalPaid = paymentsForThis.reduce((sum: number, p: any) => sum + p.amountPaid, 0);
                    const due = inst.amount - totalPaid;

                    if (totalPaid >= inst.amount - 0.01) {
                        // Fully paid - show last payment date
                        const latestPayment = paymentsForThis.sort((a: any, b: any) =>
                            new Date(b.date).getTime() - new Date(a.date).getTime()
                        )[0];
                        const payDate = new Date(latestPayment.date);
                        const month = (payDate.getMonth() + 1).toString().padStart(2, '0');
                        const day = payDate.getDate().toString().padStart(2, '0');

                        doc.fillColor('green').text(`${day}/${month}`, x, currentY, {
                            width: installmentWidth,
                            align: 'center'
                        });
                    } else if (totalPaid > 0) {
                        // Partial payment - show due amount in yellow/orange
                        const latestPayment = paymentsForThis.sort((a: any, b: any) =>
                            new Date(b.date).getTime() - new Date(a.date).getTime()
                        )[0];
                        const payDate = new Date(latestPayment.date);
                        const month = (payDate.getMonth() + 1).toString().padStart(2, '0');
                        const day = payDate.getDate().toString().padStart(2, '0');

                        doc.fillColor('orange').fontSize(5.5).text(
                            `₹${Math.round(due)}`,
                            x,
                            currentY,
                            { width: installmentWidth, align: 'center' }
                        );
                        doc.fontSize(6.5).text(
                            `${day}/${month}`,
                            x,
                            currentY + 6,
                            { width: installmentWidth, align: 'center' }
                        );
                    } else {
                        // Not paid - show checkbox
                        doc.fillColor('black').text('☐', x, currentY, {
                            width: installmentWidth,
                            align: 'center'
                        });
                    }

                    x += installmentWidth + 2;
                });
            }

            // Total Due column
            doc.fillColor(totalDue > 0 ? 'red' : 'green').fontSize(6.5);
            doc.text(totalDue > 0 ? `₹${Math.round(totalDue)}` : '₹0', x, currentY, {
                width: feeDueWidth,
                align: 'center'
            });

            doc.moveDown(0.6);
        });

        // Footer
        doc.moveDown(0.5);
        doc.fontSize(7).fillColor('gray').text(
            `Total Students: ${batch.students.length} | Legend: ☐=Unpaid, Date=Paid, Orange=Partial | Generated by MathLogs`,
            { align: 'center' }
        );

        doc.end();
    } catch (e) {
        console.error(e);
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
    const teacherId = (req as any).user?.id;
    const currentAcademicYearId = (req as any).user?.currentAcademicYearId;

    try {
        const batch = await prisma.batch.findUnique({ where: { id: String(id) } });
        if (!batch) return res.status(404).json({ error: 'Batch not found' });

        const user = (req as any).user;
        if (batch.instituteId !== user.instituteId) return res.status(403).json({ error: 'Unauthorized' });

        // Academic year boundary check
        if (batch.academicYearId && batch.academicYearId !== currentAcademicYearId) {
            return res.status(400).json({ error: 'Cannot delete batch from non-active academic year. Switch to the correct year first.' });
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
        const teacherId = (req as any).user?.id;
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

        let sentCount = 0;

        // Process in background (conceptually) or await for small batches
        // For safely, we'll await sequentially or parallel with limit. 
        // Given constraint "Asynchronous sending (non-blocking)", we can respond early?
        // But for UI feedback "Invites sent to 58 students", we need to wait or return a "Processing" status.
        // The prompt says "UI feedback after sending: 'Invites sent to 58 students'". So we should await it.

        const senderName = batch.institute?.name || 'Coaching Centre';
        const replyTo = batch.institute?.email || undefined;

        // Queue emails asynchronously
        const jobs = batch.students
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

        if (jobs.length > 0) {
            await prisma.emailJob.createMany({ data: jobs as any });
        }

        res.json({ success: true, count: jobs.length, message: `Invites queued for ${jobs.length} students` });

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
    const teacherId = (req as any).user?.id;

    try {
        const batch = await prisma.batch.findUnique({ where: { id: String(id) } });
        if (!batch) return res.status(404).json({ error: 'Batch not found' });

        const user = (req as any).user;
        if (batch.instituteId !== user.instituteId) return res.status(403).json({ error: 'Unauthorized' });

        const doc = new PDFDocument({ size: 'A4', margin: 50 });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=QR-${batch.name.replace(/\s+/g, '-')}.pdf`);

        doc.pipe(res);

        // Add MathLogs branding
        addMathLogsHeader(doc, 30);
        doc.moveDown(2);

        // -- Content --
        // Header
        doc.fontSize(24).font('Helvetica-Bold').text(batch.name, { align: 'center' });
        doc.fontSize(14).font('Helvetica').text(batch.subject || 'Course', { align: 'center' });
        doc.moveDown(0.5);
        doc.fontSize(12).text(batch.className || '', { align: 'center' });

        doc.moveDown(2);

        // QR Code
        const registerUrl = `${getClientUrl(req)}/register/${batch.id}`;

        // Generate QR Buffer
        const qrPng = await bwipjs.toBuffer({
            bcid: 'qrcode',       // Barcode type
            text: registerUrl,    // Text to encode
            scale: 5,             // 3x scaling factor
            includetext: false,            // Show human-readable text
            textxalign: 'center', // Always good to set this
        });

        // Add QR to PDF (Centered)
        const pageWidth = doc.page.width;
        const pageHeight = doc.page.height;
        const qrSize = 300;

        doc.image(qrPng, (pageWidth - qrSize) / 2, (pageHeight - qrSize) / 2 - 50, { width: qrSize });

        // Instruction Text below QR
        doc.text('Scan to Register', (pageWidth - qrSize) / 2, (pageHeight - qrSize) / 2 + qrSize + 20, { width: qrSize, align: 'center' });

        // Footer
        doc.fillColor('grey').fontSize(10).text('Powered by ClassManager', 50, pageHeight - 50, { align: 'center', width: pageWidth - 100 });

        doc.end();

    } catch (e) {
        console.error('Error generating QR PDF:', e);
        res.status(500).json({ error: 'Failed to generate PDF' });
    }
};
