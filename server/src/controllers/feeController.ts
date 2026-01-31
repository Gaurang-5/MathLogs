import { Request, Response } from 'express';
import { prisma } from '../prisma';
import PDFDocument from 'pdfkit';
import nodemailer from 'nodemailer';

// Email Transporter (Reused logic)
const transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

const sendEmail = async (to: string, subject: string, text: string) => {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.warn("Email credentials missing");
        return false;
    }
    try {
        await transporter.sendMail({
            from: process.env.EMAIL_USER, // "Coaching Name <email>" ideally
            to,
            subject,
            text
        });
        return true;
    } catch (error) {
        console.error('Email error:', error);
        return false;
    }
};

export const downloadPendingFeesReport = async (req: Request, res: Response) => {
    try {
        const batchFilter = req.query.batch as string;
        const sortBy = req.query.sortBy as string;
        const teacherId = (req as any).user?.id;
        const currentAcademicYearId = (req as any).user?.currentAcademicYearId;

        const students = await prisma.student.findMany({
            where: {
                status: 'APPROVED',
                batch: { teacherId },
                academicYearId: currentAcademicYearId
            },
            include: {
                batch: { include: { feeInstallments: true } },
                fees: true,
                feePayments: true
            },
            orderBy: { name: 'asc' }
        });

        // Calculate dues and filter defaulters
        let defaulters = students.map((student: any) => {
            // Calculate Total Paid first to use for dynamic allocation
            const paidSimple = student.fees
                .filter((f: any) => f.status === 'PAID')
                .reduce((sum: number, fee: any) => sum + fee.amount, 0);

            // Available "generic" cash to cover installments
            let unallocatedCash = paidSimple;

            // Balance Calc
            const sortedInstallments = student.batch?.feeInstallments?.sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) || [];
            const installmentTotal = sortedInstallments.reduce((sum: number, i: any) => sum + i.amount, 0) || 0;
            const totalFee = installmentTotal > 0 ? installmentTotal : (student.batch?.feeAmount || 0);

            const paidInstallments = student.feePayments
                .reduce((sum: number, p: any) => sum + p.amountPaid, 0);

            const totalPaid = paidSimple + paidInstallments;
            const balance = totalFee - totalPaid;

            // Oldest Due Date Calc
            let oldestDue = new Date(); // Fallback
            if (sortedInstallments.length > 0) {
                let found = false;
                for (const inst of sortedInstallments) {
                    // Check if this specific installment is fully paid (including unallocated cash offset)
                    const payment = student.feePayments?.find((p: any) => p.installmentId === inst.id);
                    const paidDirectly = payment ? payment.amountPaid : 0;
                    let remainingCost = inst.amount - paidDirectly;

                    // Use unallocated cash if available
                    if (remainingCost > 0 && unallocatedCash > 0) {
                        const coverage = Math.min(remainingCost, unallocatedCash);
                        remainingCost -= coverage;
                        unallocatedCash -= coverage;
                    }

                    if (remainingCost > 0) {
                        oldestDue = new Date(inst.createdAt);
                        found = true;
                        break;
                    }
                }
                if (!found && balance > 0) oldestDue = new Date();
            } else {
                // Flat fee: use student creation date roughly or simply 'now'
                oldestDue = student.createdAt ? new Date(student.createdAt) : new Date();
            }

            return {
                name: student.name,
                batch: student.batch?.name || 'N/A',
                parentName: student.parentName || '-',
                phone: student.parentWhatsapp || '-',
                balance,
                oldestDue
            };
        }).filter((s: any) => s.balance > 0);

        // Filter
        if (batchFilter && batchFilter !== 'All') {
            defaulters = defaulters.filter((s: any) => s.batch === batchFilter);
        }

        // Sort
        if (sortBy === 'date') {
            // Sort by Oldest Due Date (Ascending: Oldest first)
            defaulters.sort((a: any, b: any) => a.oldestDue.getTime() - b.oldestDue.getTime());
        } else {
            // Default: Amount High -> Low
            defaulters.sort((a: any, b: any) => b.balance - a.balance);
        }

        // Generate PDF
        const doc = new PDFDocument({ margin: 50 });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=pending_fees_report.pdf');

        doc.pipe(res);

        // Header
        doc.fontSize(20).text('Fee Defaulters Report', { align: 'center' });
        doc.moveDown(0.5);
        doc.fontSize(10).fillColor('gray').text(`Sorted by: ${sortBy === 'date' ? 'Oldest Due First' : 'Highest Amount First'}`, { align: 'center' });
        doc.fillColor('black');
        doc.moveDown();
        doc.fontSize(9).text(`Generated on: ${new Date().toLocaleDateString()}`, { align: 'right' });
        doc.moveDown();

        // Table
        const startX = 50;
        let currentY = doc.y;

        // Table Headers
        doc.font('Helvetica-Bold');
        doc.text('Student Name', startX, currentY, { width: 140 });
        doc.text('Batch', startX + 140, currentY, { width: 90 });
        doc.text('Parent/Phone', startX + 230, currentY, { width: 140 });
        doc.text('Oldest Due', startX + 370, currentY, { width: 70 });
        doc.text('Amount', startX + 440, currentY, { width: 80, align: 'right' });

        doc.moveDown(0.5);
        doc.moveTo(startX, doc.y).lineTo(startX + 520, doc.y).stroke();
        doc.moveDown(0.5);

        // Rows
        doc.font('Helvetica');
        let totalPending = 0;

        defaulters.forEach((s) => {
            currentY = doc.y;

            // new page check
            if (currentY > 700) {
                doc.addPage();
                currentY = 50;
            }

            doc.text(s.name, startX, currentY, { width: 140, ellipsis: true });
            doc.text(s.batch, startX + 140, currentY, { width: 90, ellipsis: true });
            doc.text(`${s.parentName}\n${s.phone}`, startX + 230, currentY, { width: 140, ellipsis: true });
            doc.text(s.oldestDue.toLocaleDateString(), startX + 370, currentY, { width: 70 });
            doc.font('Helvetica-Bold').fillColor('red')
                .text(`Rs. ${s.balance.toLocaleString()}`, startX + 440, currentY, { width: 80, align: 'right' });

            doc.font('Helvetica').fillColor('black'); // Reset
            doc.moveDown(0.5);

            totalPending += s.balance;
        });

        doc.moveDown();
        doc.moveTo(startX, doc.y).lineTo(startX + 520, doc.y).stroke();
        doc.moveDown();

        // Total
        doc.font('Helvetica-Bold').fontSize(12);
        doc.text(`Total Pending Amount: Rs. ${totalPending.toLocaleString()}`, { align: 'right' });

        doc.end();

    } catch (error) {
        console.error("Error generating report:", error);
        res.status(500).json({ error: 'Failed to generate report' });
    }
};

export const getFeeSummary = async (req: Request, res: Response) => {
    try {
        const teacherId = (req as any).user?.id;
        const currentAcademicYearId = (req as any).user?.currentAcademicYearId;

        const students = await prisma.student.findMany({
            where: {
                status: 'APPROVED',
                batch: { teacherId },
                academicYearId: currentAcademicYearId
            },
            include: {
                batch: {
                    include: {
                        feeInstallments: { orderBy: { createdAt: 'asc' } }
                    }
                },
                fees: true,
                feePayments: true
            },
            orderBy: { name: 'asc' }
        });

        const summary = students.map((student: any) => {
            const installments = student.batch?.feeInstallments || [];

            // Calculate Total Paid & Unallocated Cash
            const paidSimple = student.fees
                .filter((f: any) => f.status === 'PAID')
                .reduce((sum: number, fee: any) => sum + fee.amount, 0);

            let unallocatedCash = paidSimple;

            const paidInstallments = student.feePayments
                .reduce((sum: number, p: any) => sum + p.amountPaid, 0);

            // Calculate Dues Breakdown with dynamic allocation
            const breakdown: { name: string, due: number }[] = [];
            let installmentTotal = 0;

            installments.forEach((inst: any) => {
                installmentTotal += inst.amount;
                const payment = student.feePayments.find((p: any) => p.installmentId === inst.id);

                // 1. Direct payment linked to this installment
                const paidDirectly = payment ? payment.amountPaid : 0;

                // 2. Remaining due on this installment
                let due = inst.amount - paidDirectly;

                // 3. Try to cover with generic/unallocated cash
                if (due > 0 && unallocatedCash > 0) {
                    const coverage = Math.min(due, unallocatedCash);
                    due -= coverage;
                    unallocatedCash -= coverage;
                }

                if (due > 0) {
                    breakdown.push({ name: inst.name, due });
                }
            });

            // Fallback for non-installment batches
            const totalFee = installmentTotal > 0 ? installmentTotal : (student.batch?.feeAmount || 0);

            const totalPaid = paidSimple + paidInstallments;
            const balance = totalFee - totalPaid;

            // Last Payment Date
            const dates = [
                ...student.fees.map((f: any) => f.date),
                ...student.feePayments.map((p: any) => p.date)
            ].sort((a: any, b: any) => new Date(b).getTime() - new Date(a).getTime());

            // Calculate Oldest Due
            let oldestDue = null;
            if (breakdown.length > 0) {
                const firstDueInst = installments.find((i: any) => i.name === breakdown[0].name);
                if (firstDueInst) oldestDue = firstDueInst.createdAt;
            } else if (balance > 0) {
                oldestDue = student.createdAt;
            }

            return {
                id: student.id,
                humanId: student.humanId,
                name: student.name,
                batchName: student.batch?.name || 'N/A',
                totalFee,
                totalPaid,
                balance,
                lastPaymentDate: dates.length > 0 ? dates[0] : null,
                oldestDue,
                breakdown // New field
            };
        });

        res.json(summary);
    } catch (error) {
        console.error("Error fetching fee summary:", error);
        res.status(500).json({ error: 'Failed to fetch fee summary' });
    }
};

export const recordPayment = async (req: Request, res: Response) => {
    const { studentId, amount } = req.body;
    let remainingAmount = parseFloat(amount);

    if (!studentId || !amount || isNaN(remainingAmount)) {
        res.status(400).json({ error: 'Invalid Payment Data' });
        return;
    }

    try {
        const teacherId = (req as any).user?.id;
        // 1. Fetch Student & Installments
        const student = await prisma.student.findUnique({
            where: { id: studentId },
            include: {
                batch: { include: { feeInstallments: { orderBy: { createdAt: 'asc' } } } },
                feePayments: true,
                fees: true
            }
        });

        if (student?.batch?.teacherId && student.batch.teacherId !== teacherId) return res.status(403).json({ error: 'Unauthorized' });

        if (!student) return res.status(404).json({ error: 'Student not found' });

        const installments = student.batch?.feeInstallments || [];

        // Validation: Prevent Overpayment
        const installmentSum = installments.reduce((sum, i) => sum + i.amount, 0);
        const totalFee = installmentSum > 0 ? installmentSum : (student.batch?.feeAmount || 0);

        const paidGeneric = student.fees
            .filter((f: any) => f.status === 'PAID')
            .reduce((sum: number, f: any) => sum + f.amount, 0);
        const paidLinked = student.feePayments.reduce((sum: number, p: any) => sum + p.amountPaid, 0);

        const currentBalance = totalFee - (paidGeneric + paidLinked);

        if (remainingAmount > currentBalance) {
            return res.status(400).json({ error: `Amount (Rs. ${remainingAmount}) exceeds outstanding balance (Rs. ${currentBalance})` });
        }

        // 2. Auto-Allocate to Installments
        for (const inst of installments) {
            if (remainingAmount <= 0) break;

            const existingPayment = student.feePayments.find(p => p.installmentId === inst.id);
            const paidSoFar = existingPayment ? existingPayment.amountPaid : 0;
            const pendingForThis = inst.amount - paidSoFar;

            if (pendingForThis > 0) {
                // Determine how much we can pay for this installment
                const allocate = Math.min(pendingForThis, remainingAmount);

                // Always create a NEW payment record to preserve transaction history
                await prisma.feePayment.create({
                    data: {
                        studentId,
                        installmentId: inst.id,
                        amountPaid: allocate,
                        date: new Date()
                    }
                });

                remainingAmount -= allocate;
            }
        }

        // 3. Stash Surplus (if any)
        if (remainingAmount > 0) {
            await prisma.feeRecord.create({
                data: {
                    studentId,
                    amount: remainingAmount,
                    status: 'PAID',
                    date: new Date()
                }
            });
        }

        res.json({ success: true, message: 'Payment recorded and allocated' });
    } catch (error) {
        console.error("Error recording payment:", error);
        res.status(500).json({ error: 'Failed to record payment' });
    }
};

export const payInstallment = async (req: Request, res: Response) => {
    const { studentId, installmentId, amount, date } = req.body;

    // Log payment attempt (PII sanitized)

    if (!studentId || !installmentId || amount === undefined || amount === null) {
        res.status(400).json({ error: 'Missing required fields' });
        return;
    }

    try {
        const teacherId = (req as any).user?.id;

        // Verify student ownership
        const student = await prisma.student.findUnique({
            where: { id: studentId },
            include: { batch: true }
        });
        if (!student) return res.status(404).json({ error: 'Student not found' });
        if (student.batch?.teacherId && student.batch.teacherId !== teacherId) return res.status(403).json({ error: 'Unauthorized' });

        // Calculate total already paid for this installment
        const existingPayments = await prisma.feePayment.findMany({
            where: { studentId, installmentId }
        });

        const totalPaidSoFar = existingPayments.reduce((sum, p) => sum + p.amountPaid, 0);

        // Find the installment details to get the max amount
        const installment = await prisma.feeInstallment.findUnique({
            where: { id: installmentId }
        });

        if (!installment) {
            return res.status(404).json({ error: 'Installment not found' });
        }

        const remainingBalance = installment.amount - totalPaidSoFar;
        const newPaymentAmount = parseFloat(String(amount));

        // Precision check (handle floating point tiny differences)
        if (remainingBalance <= 0.01) {
            return res.status(400).json({ error: 'Installment is already fully paid' });
        }

        if (newPaymentAmount > remainingBalance + 0.01) {
            return res.status(400).json({
                error: `Payment amount (₹${newPaymentAmount}) exceeds remaining balance (₹${remainingBalance})`
            });
        }

        // Create payment record
        const payment = await prisma.feePayment.create({
            data: {
                studentId,
                installmentId,
                amountPaid: newPaymentAmount,
                date: date ? new Date(date) : new Date(),
            }
        });

        // Payment recorded successfully
        res.json(payment);
    } catch (error) {
        console.error("Error paying installment:", error);
        res.status(500).json({ error: 'Failed to record payment' });
    }
};

export const sendFeeReminder = async (req: Request, res: Response) => {
    const { studentId, amountDue } = req.body;

    try {
        const teacherId = (req as any).user?.id;
        const student = await prisma.student.findUnique({
            where: { id: studentId },
            include: {
                batch: { include: { feeInstallments: true } },
                feePayments: true
            }
        });

        if (student?.batch?.teacherId && student.batch.teacherId !== teacherId) return res.status(403).json({ error: 'Unauthorized' });

        if (!student || !student.parentEmail) {
            return res.status(400).json({ error: 'Student email not found' });
        }

        // Calculate breakdown
        const installments = student.batch?.feeInstallments || [];
        const breakdownLines: string[] = [];
        let totalPendingCalc = 0;

        // Check Installments
        installments.forEach(inst => {
            const payment = student.feePayments.find(p => p.installmentId === inst.id);
            const paidAmount = payment ? payment.amountPaid : 0;
            const remaining = inst.amount - paidAmount;

            if (remaining > 0) {
                breakdownLines.push(`- ${inst.name}: Rs. ${remaining} (Due)`);
                totalPendingCalc += remaining;
            }
        });

        // If no installments but there is a due amount (legacy flat fee)
        if (installments.length === 0 && amountDue > 0) {
            breakdownLines.push(`- Outstanding Balance: Rs. ${amountDue}`);
            totalPendingCalc = amountDue; // Fallback to provided amount
        }

        const subject = `Fee Payment Reminder for ${student.name}`;
        const body = `Dear ${student.parentName},

We hope you are doing well.

This is a gentle reminder regarding the pending fee for your child, ${student.name} (${student.batch?.name || 'Class'}).

Fee Breakdown:
${breakdownLines.join('\n')}

--------------------------------------
Total Pending Amount: Rs. ${totalPendingCalc.toLocaleString()}
--------------------------------------

Please create the payment at your earliest convenience.

Regards,
Coaching Administration`;

        const sent = await sendEmail(student.parentEmail, subject, body);
        if (sent) {
            res.json({ success: true, message: 'Reminder sent' });
        } else {
            res.status(500).json({ error: 'Failed to send email' });
        }

    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed' });
    }
};

export const getRecentTransactions = async (req: Request, res: Response) => {
    try {
        const teacherId = (req as any).user?.id;
        const currentAcademicYearId = (req as any).user?.currentAcademicYearId;

        // Fetch recent installment payments
        const recentInstallments = await prisma.feePayment.findMany({
            where: {
                student: {
                    batch: { teacherId },
                    academicYearId: currentAcademicYearId
                }
            },
            take: 10,
            orderBy: { date: 'desc' },
            include: {
                student: { select: { name: true, batch: { select: { name: true } } } },
                installment: { select: { name: true } }
            }
        });

        // Fetch recent ad-hoc payments (FeeRecord)
        const recentRecords = await prisma.feeRecord.findMany({
            where: {
                student: {
                    batch: { teacherId },
                    academicYearId: currentAcademicYearId
                }
            },
            take: 10,
            orderBy: { date: 'desc' },
            include: {
                student: { select: { name: true, batch: { select: { name: true } } } }
            }
        });

        // Combine and Sort
        const combined = [
            ...recentInstallments.map(p => ({
                id: p.id,
                studentName: p.student.name,
                batchName: p.student.batch?.name,
                amount: p.amountPaid,
                date: p.date,
                type: `Installment: ${p.installment.name}`
            })),
            ...recentRecords.map(r => ({
                id: r.id,
                studentName: r.student.name,
                batchName: r.student.batch?.name,
                amount: r.amount,
                date: r.date,
                type: 'Ad-hoc Payment'
            }))
        ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 10);

        res.json(combined);
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch transactions' });
    }
};

export const downloadMonthlyReport = async (req: Request, res: Response) => {
    try {
        const { month, year } = req.query;
        if (!month || !year) return res.status(400).json({ error: 'Month and Year required' });

        const monthIdx = parseInt(month as string) - 1; // 1-based to 0-based
        const yearNum = parseInt(year as string);

        const startDate = new Date(yearNum, monthIdx, 1);
        const endDate = new Date(yearNum, monthIdx + 1, 0, 23, 59, 59);

        // Fetch Installment Payments
        const teacherId = (req as any).user?.id;
        const currentAcademicYearId = (req as any).user?.currentAcademicYearId;

        const payments = await prisma.feePayment.findMany({
            where: {
                student: {
                    batch: { teacherId },
                    academicYearId: currentAcademicYearId
                },
                date: {
                    gte: startDate,
                    lte: endDate
                }
            },
            include: {
                student: { select: { name: true, humanId: true, batch: { select: { name: true } } } },
                installment: { select: { name: true } }
            },
            orderBy: { date: 'desc' }
        });

        // Fetch Ad-hoc (Surplus) Records
        const records = await prisma.feeRecord.findMany({
            where: {
                student: {
                    batch: { teacherId },
                    academicYearId: currentAcademicYearId
                },
                date: {
                    gte: startDate,
                    lte: endDate
                }
            },
            include: {
                student: { select: { name: true, humanId: true, batch: { select: { name: true } } } }
            },
            orderBy: { date: 'desc' }
        });

        const allTx = [
            ...payments.map(p => ({
                date: p.date,
                id: p.student.humanId || '-',
                name: p.student.name,
                batch: p.student.batch?.name || '-',
                amount: p.amountPaid,
                type: `Installment: ${p.installment.name}`
            })),
            ...records.map(r => ({
                date: r.date,
                id: r.student.humanId || '-',
                name: r.student.name,
                batch: r.student.batch?.name || '-',
                amount: r.amount,
                type: 'Ad-hoc Payment'
            }))
        ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        if (allTx.length === 0) {
            return res.status(404).json({ error: 'No transactions found for this period' });
        }

        // Generate PDF
        const doc = new PDFDocument({ margin: 30, size: 'A4' });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Transactions_${month}_${year}.pdf`);
        doc.pipe(res);

        // Header
        doc.fontSize(18).text(`Transaction Report`, { align: 'center' });
        doc.fontSize(12).text(`${startDate.toLocaleString('default', { month: 'long' })} ${year}`, { align: 'center' });
        doc.moveDown();

        // Stats
        const totalCollected = allTx.reduce((sum, tx) => sum + tx.amount, 0);
        doc.fontSize(10).text(`Total Collected: Rs. ${totalCollected.toLocaleString()}`, { align: 'right' });
        doc.text(`Total Transactions: ${allTx.length}`, { align: 'right' });
        doc.moveDown();

        // Table Constants
        const startX = 30;
        let currentY = doc.y;

        const drawTableHeader = (y: number) => {
            doc.font('Helvetica-Bold').fontSize(9);
            doc.text('Date', startX, y, { width: 60 });
            doc.text('ID', startX + 60, y, { width: 60 });
            doc.text('Name', startX + 120, y, { width: 120 });
            doc.text('Batch', startX + 240, y, { width: 100 });
            doc.text('Type', startX + 340, y, { width: 120 });
            doc.text('Amount', startX + 460, y, { width: 70, align: 'right' });

            doc.moveTo(startX, y + 15).lineTo(565, y + 15).stroke();
        };

        // Draw Initial Header
        drawTableHeader(currentY);
        currentY += 25;

        doc.font('Helvetica').fontSize(9);

        allTx.forEach((tx, i) => {
            if (currentY > 750) {
                doc.addPage();
                currentY = 40;
                drawTableHeader(currentY);
                currentY += 25;
                doc.font('Helvetica').fontSize(9); // Reset font
            }

            // Zebra striping (optional, keeps code clean if omitted, but helps readability)
            if (i % 2 === 1) {
                doc.save();
                doc.fillColor('#F9FAFB');
                doc.rect(startX, currentY - 5, 535, 20).fill();
                doc.restore();
            }

            doc.text(new Date(tx.date).toLocaleDateString(), startX, currentY, { width: 60 });
            doc.text(tx.id, startX + 60, currentY, { width: 60 });
            doc.text(tx.name, startX + 120, currentY, { width: 120, ellipsis: true });
            doc.text(tx.batch, startX + 240, currentY, { width: 100, ellipsis: true });
            doc.text(tx.type, startX + 340, currentY, { width: 120, ellipsis: true });
            doc.font('Helvetica-Bold').text(`Rs.${tx.amount}`, startX + 460, currentY, { width: 70, align: 'right' });
            doc.font('Helvetica');

            currentY += 20;
        });

        doc.end();

    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to generate report' });
    }
};
