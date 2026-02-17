import { Request, Response } from 'express';
import { prisma } from '../prisma';
import PDFDocument from 'pdfkit';
import { secureLogger } from '../utils/secureLogger';
import { sendEmail } from '../utils/email';
import { addMathLogsHeader } from '../utils/pdfUtils';

// Email handling moved to utils/email.ts

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

        // PERF OPTIMIZATION: Calculate dues and filter defaulters (O(n) instead of O(n²))
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

            // PERF: Pre-build payment lookup map - O(n) instead of O(n²)
            // This eliminates nested .find() which was causing O(n²) complexity
            const paymentsByInstallment = new Map<string, number>();
            student.feePayments?.forEach((p: any) => {
                const current = paymentsByInstallment.get(p.installmentId) || 0;
                paymentsByInstallment.set(p.installmentId, current + p.amountPaid);
            });

            // Oldest Due Date Calc (now O(n) with Map lookup)
            let oldestDue = new Date(); // Fallback
            if (sortedInstallments.length > 0) {
                let found = false;
                for (const inst of sortedInstallments) {
                    // O(1) map lookup instead of O(n) find()
                    const paidDirectly = paymentsByInstallment.get(inst.id) || 0;
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

        // Add MathLogs branding
        addMathLogsHeader(doc, 30);
        doc.moveDown(2);

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

export const getPaymentHistory = async (req: Request, res: Response) => {
    const { studentId } = req.params;
    const teacherId = (req as any).user?.id;

    try {
        const student = await prisma.student.findUnique({
            where: { id: String(studentId) },
            include: { batch: true }
        });

        if (!student) return res.status(404).json({ error: 'Student not found' });
        if (student.batch?.teacherId && student.batch.teacherId !== teacherId) return res.status(403).json({ error: 'Unauthorized' });

        const history = await prisma.feePayment.findMany({
            where: { studentId: String(studentId) },
            include: { installment: { select: { name: true } } },
            orderBy: { date: 'desc' }
        });

        res.json(history);
    } catch (e) {
        res.status(500).json({ error: 'Failed' });
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
            select: {
                id: true,
                humanId: true,
                name: true,
                createdAt: true, // Needed for oldestDue fallback
                batch: {
                    select: {
                        name: true,
                        feeAmount: true,
                        feeInstallments: {
                            select: {
                                id: true,
                                name: true,
                                amount: true,
                                createdAt: true
                            },
                            orderBy: { createdAt: 'asc' }
                        }
                    }
                },
                fees: {
                    select: {
                        amount: true,
                        status: true,
                        date: true
                    }
                },
                feePayments: {
                    select: {
                        amountPaid: true,
                        date: true,
                        installmentId: true
                    }
                }
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

                // BUG FIX: Sum ALL payments for this installment, not just one
                const paymentsForThis = student.feePayments.filter((p: any) => p.installmentId === inst.id);
                const paidDirectly = paymentsForThis.reduce((sum: number, p: any) => sum + p.amountPaid, 0);

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
        // BUG FIX: Must sum ALL payments for each installment, not just find one
        for (const inst of installments) {
            if (remainingAmount <= 0) break;

            // Calculate total paid for this installment across ALL payment records
            const paymentsForThisInstallment = student.feePayments.filter(p => p.installmentId === inst.id);
            const paidSoFar = paymentsForThisInstallment.reduce((sum, p) => sum + p.amountPaid, 0);
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

    secureLogger.debug('payInstallment called', { studentId, installmentId, amount, date });

    if (!studentId || !installmentId || amount === undefined || amount === null) {
        res.status(400).json({ error: 'Missing required fields' });
        return;
    }

    try {
        const teacherId = (req as any).user?.id;
        const user = (req as any).user;

        // Verify student ownership
        const student = await prisma.student.findUnique({
            where: { id: studentId },
            include: { batch: true }
        });

        secureLogger.debug('Student found', student ? { id: student.id, name: student.name, batchId: student.batchId, hasBatch: !!student.batch } : 'NOT FOUND');

        if (!student) return res.status(404).json({ error: 'Student not found' });

        // ✅ SECURITY: Defense-in-depth - validate instituteId directly
        if (!student.batch) {
            return res.status(400).json({ error: 'Student has no batch assigned' });
        }
        if (student.instituteId && student.instituteId !== user.instituteId) {
            return res.status(403).json({ error: 'Unauthorized: Cross-institute access denied' });
        }
        if (student.batch.teacherId && student.batch.teacherId !== teacherId) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

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

        console.log('[DEBUG] Payment created successfully:', {
            paymentId: payment.id,
            studentId: payment.studentId,
            installmentId: payment.installmentId,
            amount: payment.amountPaid,
            date: payment.date
        });

        // Payment recorded successfully (this will automatically appear in transaction reports)
        res.json(payment);
    } catch (error) {
        console.error('[ERROR] Error paying installment:', error);
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
                batch: { include: { feeInstallments: true, institute: true } },
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
            // BUG FIX: Sum ALL payments for this installment, not just one
            const paymentsForThis = student.feePayments.filter(p => p.installmentId === inst.id);
            const paidAmount = paymentsForThis.reduce((sum, p) => sum + p.amountPaid, 0);
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
        const senderName = student.batch?.institute?.name || 'Coaching Administration';
        const replyTo = student.batch?.institute?.email || undefined;

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
${senderName}`;

        await prisma.emailJob.create({
            data: {
                recipient: student.parentEmail,
                subject,
                body,
                status: 'PENDING',
                options: { senderName, replyTo, senderType: 'NOREPLY' },
                instituteId: student.batch?.instituteId
            } as any
        });

        // WhatsApp Integration (Option A)
        if (student.parentWhatsapp) {
            // Clean number: remove spaces, dashes, ensure country code (default to +91 if missing)
            let phone = student.parentWhatsapp.replace(/[^0-9+]/g, '');
            if (!phone.startsWith('+')) {
                if (phone.length === 10) phone = '+91' + phone; // India default
            }

            // Queue WhatsApp
            import('../utils/whatsappService').then(({ sendFeeReminderWhatsapp }) => {
                sendFeeReminderWhatsapp(
                    student.name,
                    totalPendingCalc,
                    phone,
                    new Date().toLocaleDateString(), // Due date (today/immediate)
                    student.batch?.instituteId || undefined
                );
            });
        }

        res.json({ success: true, message: 'Reminder queued successfully (Email + WhatsApp)' });

    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed' });
    }
};

export const getRecentTransactions = async (req: Request, res: Response) => {
    try {
        const teacherId = (req as any).user?.id;

        secureLogger.debug('Fetching recent transactions for teacher', { teacherId });

        // Fetch recent installment payments (NO academic year filter)
        const recentInstallments = await prisma.feePayment.findMany({
            where: {
                student: {
                    batch: { teacherId }
                }
            },
            take: 10,
            orderBy: { date: 'desc' },
            include: {
                student: { select: { name: true, batch: { select: { name: true } } } },
                installment: { select: { name: true } }
            }
        });

        secureLogger.debug('Found installment payments', { count: recentInstallments.length });

        // Fetch recent ad-hoc payments (FeeRecord)
        const recentRecords = await prisma.feeRecord.findMany({
            where: {
                student: {
                    batch: { teacherId }
                }
            },
            take: 10,
            orderBy: { date: 'desc' },
            include: {
                student: { select: { name: true, batch: { select: { name: true } } } }
            }
        });

        secureLogger.debug('Found ad-hoc payments', { count: recentRecords.length });

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

        secureLogger.debug('Returning combined transactions', { count: combined.length });

        res.json(combined);
    } catch (e) {
        console.error('[ERROR] Failed to fetch transactions:', e);
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

        // Add MathLogs branding
        addMathLogsHeader(doc, 20);
        doc.moveDown(2);

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
