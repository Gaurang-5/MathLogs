import { Request, Response } from 'express';
import { prisma } from '../prisma';
import PDFDocument from 'pdfkit';
import { secureLogger } from '../utils/secureLogger';
import { sendEmail } from '../utils/email';
import { addMathLogsHeader } from '../utils/pdfUtils';
import { calculateStudentFeeSnapshot } from '../utils/feeCalculations';
import { deletePaymentScreenshot, encodePaymentScreenshotKey, signPaymentScreenshotKey } from '../utils/paymentStorage';

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
            const { balance, oldestDue } = calculateStudentFeeSnapshot(student);

            return {
                humanId: student.humanId || '-',
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
        const doc = new PDFDocument({ margin: 30, size: 'A4' });

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=pending_fees_report.pdf');

        doc.pipe(res);

        // Add MathLogs branding
        addMathLogsHeader(doc, 30);
        doc.moveDown(2);

        // Header
        doc.fontSize(18).text('Fee Defaulters Report', { align: 'center' });
        doc.moveDown(0.5);
        const dateString = new Date().toLocaleDateString();
        doc.fontSize(10).fillColor('gray').text(`Generated on: ${dateString} | Sorted by: ${sortBy === 'date' ? 'Oldest Due First' : 'Highest Amount First'}`, { align: 'center' });
        doc.fillColor('black');
        doc.moveDown(1.5);

        // Table Constants
        const startX = 30;
        const rowHeight = 25;
        let currentY = doc.y;

        const drawPendingFeesHeader = (y: number) => {
            doc.save();
            doc.fillColor('#E5E7EB');
            // Background rect for header
            doc.rect(startX, y - 5, 535, rowHeight).fill();
            doc.restore();

            doc.font('Helvetica-Bold').fontSize(10).fillColor('black');
            doc.text('Student ID', startX + 5, y + 2, { width: 75 });
            doc.text('Student Name', startX + 90, y + 2, { width: 110 });
            doc.text('Batch', startX + 210, y + 2, { width: 95 });
            doc.text('Parent Phone', startX + 315, y + 2, { width: 65 });
            doc.text('Oldest Due', startX + 390, y + 2, { width: 60 });
            doc.text('Amount', startX + 460, y + 2, { width: 70, align: 'right' });
            
            drawPendingBorders(y - 5);
        };
        
        const drawPendingBorders = (rectY: number) => {
            doc.save();
            doc.lineWidth(0.5).strokeColor('#D1D5DB');
            doc.rect(startX, rectY, 535, rowHeight).stroke();
            // Vertical lines: 85, 120, 105, 75, 70, 80 total 535
            doc.moveTo(startX + 85, rectY).lineTo(startX + 85, rectY + rowHeight).stroke();
            doc.moveTo(startX + 205, rectY).lineTo(startX + 205, rectY + rowHeight).stroke();
            doc.moveTo(startX + 310, rectY).lineTo(startX + 310, rectY + rowHeight).stroke();
            doc.moveTo(startX + 385, rectY).lineTo(startX + 385, rectY + rowHeight).stroke();
            doc.moveTo(startX + 455, rectY).lineTo(startX + 455, rectY + rowHeight).stroke();
            doc.restore();
        };

        drawPendingFeesHeader(currentY);
        currentY += rowHeight;

        // Rows
        let totalPending = 0;

        defaulters.forEach((s) => {
            if (currentY > 750) {
                doc.addPage({ margin: 30, size: 'A4' });
                currentY = 40;
                drawPendingFeesHeader(currentY);
                currentY += rowHeight;
            }

            doc.font('Helvetica').fontSize(9).fillColor('black');
            doc.text(s.humanId, startX + 5, currentY + 7, { width: 75, ellipsis: true });
            doc.text(s.name, startX + 90, currentY + 7, { width: 110, ellipsis: true });
            doc.text(s.batch, startX + 210, currentY + 7, { width: 95, ellipsis: true });
            doc.text(s.phone, startX + 315, currentY + 7, { width: 65, ellipsis: true });
            doc.text(s.oldestDue.toLocaleDateString(), startX + 390, currentY + 7, { width: 60, ellipsis: true });
            doc.font('Helvetica-Bold').fillColor('red')
                .text(`Rs. ${s.balance.toLocaleString()}`, startX + 460, currentY + 7, { width: 70, align: 'right', ellipsis: true });

            drawPendingBorders(currentY);
            currentY += rowHeight;
            totalPending += s.balance;
        });

        doc.moveDown(1.5);
        currentY = doc.y;

        // Total Footer Row
        if (currentY + rowHeight + 5 > 800) {
            doc.addPage({ margin: 30, size: 'A4' });
            currentY = 40;
        }

        doc.save();
        doc.fillColor('#FEF2F2');
        doc.rect(startX, currentY, 535, rowHeight + 5).fill();
        doc.lineWidth(0.5).strokeColor('#EF4444');
        doc.rect(startX, currentY, 535, rowHeight + 5).stroke();
        doc.restore();

        doc.font('Helvetica-Bold').fontSize(12).fillColor('#B91C1C'); // Dark red
        doc.text(`Total Pending Amount: Rs. ${totalPending.toLocaleString()}`, startX + 10, currentY + 8, { width: 515, align: 'right' });

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
                parentWhatsapp: true,
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
                                studentId: true,
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
            const studentJoinDate = student.createdAt ? new Date(student.createdAt) : new Date(0);
            const allBatchInstallments = student.batch?.feeInstallments || [];
            
            // Build a set of installment IDs that have existing payments for this student
            const paidInstallmentIds = new Set(student.feePayments.map((p: any) => p.installmentId));
            
            // Filter installments: include global ones (no studentId) that are after join date OR have payments,
            // plus student-specific ones that belong to THIS student
            const validInstallments = allBatchInstallments.filter((inst: any) => {
                if (inst.studentId) {
                    // Student-specific installment: only include if it belongs to this student
                    return inst.studentId === student.id;
                }
                // Global installment: include if after join date OR student has payments for it
                const isAfterJoin = new Date(inst.createdAt) >= studentJoinDate;
                const hasPayment = paidInstallmentIds.has(inst.id);
                return isAfterJoin || hasPayment;
            });
            const validInstallmentIds = new Set(validInstallments.map((inst: any) => inst.id));

            // Calculate adhoc/generic cash payments (FeeRecords)
            const paidSimple = student.fees
                .filter((f: any) => f.status === 'PAID')
                .reduce((sum: number, fee: any) => sum + fee.amount, 0);

            let unallocatedCash = paidSimple;

            // Only count FeePayments that are linked to VALID installments (after join date)
            const validFeePayments = student.feePayments.filter((p: any) => validInstallmentIds.has(p.installmentId));
            const paidInstallments = validFeePayments
                .reduce((sum: number, p: any) => sum + p.amountPaid, 0);

            // Calculate Dues Breakdown with dynamic allocation
            const breakdown: { name: string, due: number }[] = [];
            let installmentTotal = 0;

            validInstallments.forEach((inst: any) => {
                installmentTotal += inst.amount;

                const paymentsForThis = validFeePayments.filter((p: any) => p.installmentId === inst.id);
                const paidDirectly = paymentsForThis.reduce((sum: number, p: any) => sum + p.amountPaid, 0);

                // Remaining due on this installment
                let due = inst.amount - paidDirectly;

                // Try to cover with generic/unallocated cash
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
            const batchHasInstallments = allBatchInstallments.length > 0;
            const totalFee = batchHasInstallments ? installmentTotal : (student.batch?.feeAmount || 0);

            const totalPaid = paidSimple + paidInstallments;
            // Clamp balance: negative means overpaid — show as 0 (no dues)
            const balance = Math.max(0, totalFee - totalPaid);

            // Last Payment Date
            const dates = [
                ...student.fees.map((f: any) => f.date),
                ...student.feePayments.map((p: any) => p.date)
            ].sort((a: any, b: any) => new Date(b).getTime() - new Date(a).getTime());

            // Calculate Oldest Due
            let oldestDue = null;
            if (breakdown.length > 0) {
                const firstDueInst = validInstallments.find((i: any) => i.name === breakdown[0].name);
                if (firstDueInst) oldestDue = firstDueInst.createdAt;
            } else if (balance > 0) {
                oldestDue = student.createdAt;
            }

            return {
                id: student.id,
                humanId: student.humanId,
                name: student.name,
                phone: student.parentWhatsapp,
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
    const parsedAmount = parseFloat(amount);

    if (!studentId || !amount || isNaN(parsedAmount)) {
        res.status(400).json({ error: 'Invalid Payment Data' });
        return;
    }

    try {
        const teacherId = (req as any).user?.id;

        // CONCURRENCY FIX: Wrap entire read-validate-write in a serializable transaction.
        // Previously, two concurrent payments could both pass the balance check
        // (both see balance = Rs. 5000) and create duplicate payments (total Rs. 10000).
        // With serializable isolation, the second request will see the updated balance
        // after the first transaction commits.
        const result = await prisma.$transaction(async (tx) => {
            // 1. Fetch Student & Installments (inside transaction for consistency)
            const student = await tx.student.findUnique({
                where: { id: studentId },
                include: {
                    batch: { include: { feeInstallments: { orderBy: { createdAt: 'asc' } }, institute: true } },
                    feePayments: true,
                    fees: true
                }
            });

            if (student?.batch?.teacherId && student.batch.teacherId !== teacherId) {
                throw { statusCode: 403, message: 'Unauthorized' };
            }

            if (!student) {
                throw { statusCode: 404, message: 'Student not found' };
            }

            const studentJoinDate = student.createdAt ? new Date(student.createdAt) : new Date(0);
            const allBatchInstallments = student.batch?.feeInstallments || [];
            const paidInstallmentIds = new Set(student.feePayments.map((p: any) => p.installmentId));
            const installments = allBatchInstallments.filter((inst: any) => {
                if (inst.studentId) {
                    return inst.studentId === studentId;
                }
                const isAfterJoin = new Date(inst.createdAt) >= studentJoinDate;
                const hasPayment = paidInstallmentIds.has(inst.id);
                return isAfterJoin || hasPayment;
            });
            const validInstallmentIds = new Set(installments.map(i => i.id));

            // Validation: Prevent Overpayment
            const batchHasInstallments = allBatchInstallments.length > 0;
            const installmentSum = installments.reduce((sum, i) => sum + i.amount, 0);
            const totalFee = batchHasInstallments ? installmentSum : (student.batch?.feeAmount || 0);

            const paidGeneric = student.fees
                .filter((f: any) => f.status === 'PAID')
                .reduce((sum: number, f: any) => sum + f.amount, 0);
            // Only count payments for valid installments
            const paidLinked = student.feePayments
                .filter((p: any) => validInstallmentIds.has(p.installmentId))
                .reduce((sum: number, p: any) => sum + p.amountPaid, 0);

            const currentBalance = Math.max(0, totalFee - (paidGeneric + paidLinked));

            if (parsedAmount > currentBalance) {
                throw { statusCode: 400, message: `Amount (Rs. ${parsedAmount}) exceeds outstanding balance (Rs. ${currentBalance})` };
            }

            let remainingAmount = parsedAmount;

            // 2. Auto-Allocate to Installments
            for (const inst of installments) {
                if (remainingAmount <= 0) break;

                const paymentsForThisInstallment = student.feePayments.filter(p => p.installmentId === inst.id);
                const paidSoFar = paymentsForThisInstallment.reduce((sum, p) => sum + p.amountPaid, 0);
                const pendingForThis = inst.amount - paidSoFar;

                if (pendingForThis > 0) {
                    const allocate = Math.min(pendingForThis, remainingAmount);

                    await tx.feePayment.create({
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
                await tx.feeRecord.create({
                    data: {
                        studentId,
                        amount: remainingAmount,
                        status: 'PAID',
                        date: new Date()
                    }
                });
            }

            await tx.systemLog.create({
                data: {
                    instituteId: student.instituteId!,
                    action: 'FEE_COLLECTED',
                    entityId: student.id,
                    entityName: student.name,
                    details: { amount: parsedAmount, type: 'Automated Allocation' }
                }
            });

            return student; // Return for WhatsApp notification
        }, {
            isolationLevel: 'Serializable', // Prevents phantom reads / double-payment
            timeout: 15000 // 15s timeout for the transaction
        });

        // Send WhatsApp receipt OUTSIDE transaction (fire-and-forget)
        if (result.parentWhatsapp) {
            let phone = result.parentWhatsapp.replace(/[^0-9+]/g, '');
            if (phone.length === 10) phone = '+91' + phone;

            const studentJoinDate = result.createdAt ? new Date(result.createdAt) : new Date(0);
            const installments = (result.batch?.feeInstallments || []).filter((inst: any) => new Date(inst.createdAt) >= studentJoinDate);
            const allocatedInstallments = installments
                .filter(inst => {
                    const paidBefore = result.feePayments.filter(p => p.installmentId === inst.id).reduce((s, p) => s + p.amountPaid, 0);
                    return inst.amount - paidBefore > 0;
                })
                .map(inst => inst.name)
                .join(', ') || 'Fee Payment';

            import('../utils/whatsapp').then(({ sendPaymentReceiptWhatsApp }) => {
                sendPaymentReceiptWhatsApp(phone, {
                    studentName: result.name,
                    amountPaid: `Rs. ${parsedAmount.toLocaleString()}`,
                    installmentName: allocatedInstallments,
                    instituteName: result.batch?.institute?.name || 'our institute',
                    instituteId: result.instituteId || undefined
                }).catch(err => console.error('WhatsApp Payment Receipt Error:', err));
            });
        }

        res.json({ success: true, message: 'Payment recorded and allocated' });
    } catch (error: any) {
        // Handle structured errors from within the transaction
        if (error.statusCode) {
            return res.status(error.statusCode).json({ error: error.message });
        }
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
            include: { batch: { include: { institute: true } } }
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

        await prisma.systemLog.create({
            data: {
                instituteId: student.instituteId!,
                action: 'FEE_COLLECTED',
                entityId: student.id,
                entityName: student.name,
                details: { amount: newPaymentAmount, installmentName: installment.name }
            }
        });

        console.log('[DEBUG] Payment created successfully:', {
            paymentId: payment.id,
            studentId: payment.studentId,
            installmentId: payment.installmentId,
            amount: payment.amountPaid,
            date: payment.date
        });

        // Send WhatsApp receipt to parent (fire-and-forget)
        if (student.parentWhatsapp) {
            let phone = student.parentWhatsapp.replace(/[^0-9+]/g, '');
            if (phone.length === 10) phone = '+91' + phone;

            import('../utils/whatsapp').then(({ sendPaymentReceiptWhatsApp }) => {
                sendPaymentReceiptWhatsApp(phone, {
                    studentName: student.name,
                    amountPaid: `Rs. ${newPaymentAmount.toLocaleString()}`,
                    installmentName: installment.name,
                    instituteName: student.batch?.institute?.name || 'our institute',
                    instituteId: student.instituteId || undefined
                }).catch(err => console.error('WhatsApp Payment Receipt Error:', err));
            });
        }

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
        const studentJoinDate = student.createdAt ? new Date(student.createdAt) : new Date(0);
        const paidInstallmentIds = new Set(student.feePayments.map((p: any) => p.installmentId));
        const installments = (student.batch?.feeInstallments || []).filter((inst: any) => {
            if (inst.studentId) {
                return inst.studentId === studentId;
            }
            const isAfterJoin = new Date(inst.createdAt) >= studentJoinDate;
            const hasPayment = paidInstallmentIds.has(inst.id);
            return isAfterJoin || hasPayment;
        });
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

        // WhatsApp Integration
        if (student.parentWhatsapp) {
            let phone = student.parentWhatsapp.replace(/[^0-9+]/g, '');
            if (phone.length === 10) phone = '+91' + phone;

            import('../utils/whatsapp').then(({ sendFeeReminderUpiWhatsApp }) => {
                // WhatsApp templates reject newline (\n) characters inside variables.
                const feeBreakupText = breakdownLines.join(' | ');
                
                const phoneDigits = student.parentWhatsapp!.replace(/\D/g, '').slice(-10);
                const upiLink = `${process.env.FRONTEND_URL || 'https://mathlogs.com'}/pay/${student.batch?.institute?.slug}?phone=${phoneDigits}`;

                sendFeeReminderUpiWhatsApp(
                    phone,
                    {
                        studentName: student.name,
                        batchName: student.batch?.name || "the batch",
                        feeBreakup: feeBreakupText,
                        totalAmount: totalPendingCalc.toLocaleString(),
                        instituteName: student.batch?.institute?.name || "our institute",
                        upiPaymentLink: upiLink,
                        instituteId: student.instituteId || undefined
                    }
                ).catch(err => console.error("WhatsApp Fee Update Error:", err));
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
        const dateString = `${startDate.toLocaleString('default', { month: 'long' })} ${year}`;
        doc.fontSize(18).text(`Fee Transactions Report`, { align: 'center' });
        doc.moveDown(0.5);
        
        const totalCollected = allTx.reduce((sum, tx) => sum + tx.amount, 0);
        doc.fontSize(10).fillColor('gray').text(`Period: ${dateString} | Total Transactions: ${allTx.length} | Total Collected: Rs. ${totalCollected.toLocaleString()}`, { align: 'center' });
        doc.fillColor('black');
        doc.moveDown(1.5);

        // Table Constants
        const startX = 30;
        const rowHeight = 25;
        let currentY = doc.y;

        const drawTableHeader = (y: number) => {
            doc.save();
            doc.fillColor('#E5E7EB');
            // Background rect for header
            doc.rect(startX, y - 5, 535, rowHeight).fill();
            doc.restore();

            doc.font('Helvetica-Bold').fontSize(10).fillColor('black');
            doc.text('Date', startX + 5, y + 2, { width: 60 });
            doc.text('ID', startX + 75, y + 2, { width: 75 });
            doc.text('Name', startX + 160, y + 2, { width: 105 });
            doc.text('Batch', startX + 275, y + 2, { width: 95 });
            doc.text('Type', startX + 380, y + 2, { width: 80 });
            doc.text('Amount', startX + 470, y + 2, { width: 60, align: 'right' });
            
            drawTableBorders(y - 5);
        };
        
        const drawTableBorders = (rectY: number) => {
            doc.save();
            doc.lineWidth(0.5).strokeColor('#D1D5DB');
            doc.rect(startX, rectY, 535, rowHeight).stroke();
            // Vertical lines: 70, 85, 115, 105, 90, 70 = 535
            doc.moveTo(startX + 70, rectY).lineTo(startX + 70, rectY + rowHeight).stroke();
            doc.moveTo(startX + 155, rectY).lineTo(startX + 155, rectY + rowHeight).stroke();
            doc.moveTo(startX + 270, rectY).lineTo(startX + 270, rectY + rowHeight).stroke();
            doc.moveTo(startX + 375, rectY).lineTo(startX + 375, rectY + rowHeight).stroke();
            doc.moveTo(startX + 465, rectY).lineTo(startX + 465, rectY + rowHeight).stroke();
            doc.restore();
        };

        // Draw Initial Header
        drawTableHeader(currentY);
        currentY += rowHeight;

        allTx.forEach((tx, i) => {
            if (currentY > 750) {
                doc.addPage({ margin: 30, size: 'A4' });
                currentY = 40;
                drawTableHeader(currentY);
                currentY += rowHeight;
            }

            doc.font('Helvetica').fontSize(9).fillColor('black');
            
            doc.text(new Date(tx.date).toLocaleDateString(), startX + 5, currentY + 7, { width: 60, ellipsis: true });
            doc.text(tx.id, startX + 75, currentY + 7, { width: 75, ellipsis: true });
            doc.text(tx.name, startX + 160, currentY + 7, { width: 105, ellipsis: true });
            doc.text(tx.batch, startX + 275, currentY + 7, { width: 95, ellipsis: true });
            doc.text(tx.type, startX + 380, currentY + 7, { width: 80, ellipsis: true });
            doc.font('Helvetica-Bold').fillColor('#059669') // green-600
                .text(`Rs.${tx.amount}`, startX + 470, currentY + 7, { width: 60, align: 'right', ellipsis: true });
            doc.fillColor('black');

            drawTableBorders(currentY);
            currentY += rowHeight;
        });
        
        doc.moveDown(1.5);
        currentY = doc.y;

        // Total Footer Row
        if (currentY + rowHeight + 5 > 800) {
            doc.addPage({ margin: 30, size: 'A4' });
            currentY = 40;
        }

        doc.save();
        doc.fillColor('#ECFDF5'); // Light green bg for total
        doc.rect(startX, currentY, 535, rowHeight + 5).fill();
        doc.lineWidth(0.5).strokeColor('#10B981');
        doc.rect(startX, currentY, 535, rowHeight + 5).stroke();
        doc.restore();

        doc.font('Helvetica-Bold').fontSize(12).fillColor('#047857'); // Dark green text
        doc.text(`Total Collected: Rs. ${totalCollected.toLocaleString()}`, startX + 10, currentY + 8, { width: 515, align: 'right' });

        doc.end();

    } catch (e) {
        console.error(e);
        res.status(500).json({ error: 'Failed to generate report' });
    }
};

export const getUpiVerifications = async (req: Request, res: Response) => {
    try {
        const teacherId = (req as any).user?.id;
        const instituteId = (req as any).user?.instituteId;
        const nowEpoch = Math.floor(Date.now() / 1000);

        const verifications = await prisma.upiPaymentVerification.findMany({
            where: {
                instituteId,
                status: 'PENDING',
                student: {
                    batch: {
                        teacherId
                    }
                }
            },
            include: {
                student: {
                    select: {
                        name: true,
                        parentWhatsapp: true,
                        batch: { select: { name: true } }
                    }
                },
                installment: {
                    select: { name: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        // Return short-lived signed screenshot URLs instead of raw storage keys.
        const response = verifications.map((verification: any) => {
            const exp = nowEpoch + 5 * 60; // 5 minutes
            const encodedKey = encodePaymentScreenshotKey(verification.storageKey);
            const sig = signPaymentScreenshotKey(verification.storageKey, exp);
            const { storageKey, ...rest } = verification;
            return {
                ...rest,
                screenshotPath: `/public/payment-screenshot/${encodedKey}?exp=${exp}&sig=${sig}`
            };
        });
        res.json(response);
    } catch (e) {
        console.error('Failed to get UPI verifications:', e);
        res.status(500).json({ error: 'Failed to list verification requests' });
    }
};

class AlreadyProcessedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AlreadyProcessedError';
    }
}

class PaymentValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'PaymentValidationError';
    }
}

export const approveUpiVerification = async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const teacherId = (req as any).user?.id;
        const instituteId = (req as any).user?.instituteId;

        const rawVerification = await prisma.upiPaymentVerification.findUnique({
            where: { id },
            include: {
                student: { include: { batch: { include: { institute: true } } } },
                installment: true
            }
        });
        const verification = rawVerification as any;

        if (!verification || verification.instituteId !== instituteId) {
            return res.status(404).json({ error: 'Verification not found' });
        }
        if (verification.student.batch?.teacherId && verification.student.batch.teacherId !== teacherId) {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        if (verification.status !== 'PENDING') {
            return res.status(400).json({ error: `This payment has already been ${verification.status.toLowerCase()}.`, alreadyProcessed: true });
        }

        // Inside a transaction to approve and pay
        await prisma.$transaction(async (tx) => {
            // VERIFICATION: Check the materialized balance to absolutely prevent double-logging
            const studentBalance = await tx.studentBalance.findUnique({
                where: { studentId: verification.studentId }
            });
            const pendingAmount = studentBalance?.balance || 0;
            
            if (pendingAmount <= 0) {
                throw new PaymentValidationError("Cannot approve! This student has no pending fee. The payment was likely logged directly by another method.");
            }
            if (verification.amount > pendingAmount) {
                throw new PaymentValidationError(`Cannot approve! The receipt amount (₹${verification.amount}) is greater than the student's current due balance (₹${pendingAmount}).`);
            }

            // Atomically claim this verification row so concurrent approvers cannot double-collect.
            const claimed = await tx.upiPaymentVerification.updateMany({
                where: {
                    id,
                    status: 'PENDING'
                },
                data: { status: 'APPROVED' }
            });
            if (claimed.count !== 1) {
                throw new AlreadyProcessedError('This payment has already been processed.');
            }

            // Create fee payment
            if (verification.installmentId) {
                await tx.feePayment.create({
                    data: {
                        studentId: verification.studentId,
                        installmentId: verification.installmentId,
                        amountPaid: verification.amount,
                        date: new Date()
                    }
                });
            } else {
                // If it was custom amount without installment, intelligently waterfall allocate
                const studentData = await tx.student.findUnique({
                    where: { id: verification.studentId },
                    include: { feePayments: true, batch: { include: { feeInstallments: true } } }
                });

                if (!studentData || !studentData.batch) {
                    throw new Error("Student data missing during allocation.");
                }

                let remainingAmount = verification.amount;
                const studentJoinDate = studentData.createdAt ? new Date(studentData.createdAt) : new Date(0);
                const installments = studentData.batch.feeInstallments
                    .filter(inst => new Date(inst.createdAt) >= studentJoinDate)
                    .sort((a,b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

                for (const inst of installments) {
                    if (remainingAmount <= 0) break;
                    
                    const paidSoFar = studentData.feePayments.filter(p => p.installmentId === inst.id).reduce((sum, p) => sum + p.amountPaid, 0);
                    const pendingForThis = inst.amount - paidSoFar;

                    if (pendingForThis > 0) {
                        const allocate = Math.min(pendingForThis, remainingAmount);

                        await tx.feePayment.create({
                            data: {
                                studentId: verification.studentId,
                                installmentId: inst.id,
                                amountPaid: allocate,
                                date: new Date()
                            }
                        });

                        remainingAmount -= allocate;
                    }
                }

                if (remainingAmount > 0) {
                    await tx.feeRecord.create({
                        data: {
                            studentId: verification.studentId,
                            amount: remainingAmount,
                            status: 'PAID',
                            date: new Date()
                        }
                    });
                }
            }

            // System log
            await tx.systemLog.create({
                data: {
                    instituteId,
                    action: 'FEE_COLLECTED',
                    entityId: verification.studentId,
                    entityName: verification.student.name,
                    details: { amount: verification.amount, type: 'UPI Verification' }
                }
            });
        });

        // Send success response FIRST — transaction is committed, don't let side-effects cause 500
        res.json({ success: true, message: 'Payment approved successfully!' });

        // Fire-and-forget side effects (won't affect response)
        try {
            // 1. Delete the physical screenshot (Space saving)
            deletePaymentScreenshot(verification.storageKey).catch(e => console.error('Failed to delete screenshot after approval:', e));

            // 2. WhatsApp Notification
            const phoneRaw = verification.student.parentWhatsapp;
            if (phoneRaw) {
                let phone = phoneRaw.replace(/[^0-9+]/g, '');
                if (phone.length === 10) phone = '+91' + phone;

                import('../utils/whatsapp').then(({ sendPaymentReceiptWhatsApp }) => {
                    sendPaymentReceiptWhatsApp(phone, {
                        studentName: verification.student.name,
                        amountPaid: `Rs. ${verification.amount.toLocaleString()}`,
                        installmentName: verification.installment?.name || 'Fee Payment',
                        instituteName: verification.student.batch?.institute?.name || 'our institute',
                        instituteId: instituteId || undefined
                    }).catch(err => console.error('WhatsApp Payment Receipt Error:', err));
                }).catch(err => console.error('WhatsApp import error:', err));
            }
        } catch (sideEffectErr) {
            console.error('Post-approval side-effect error (non-critical):', sideEffectErr);
        }
    } catch (e: any) {
        if (e instanceof AlreadyProcessedError) {
            return res.status(400).json({ error: e.message, alreadyProcessed: true });
        }
        if (e instanceof PaymentValidationError) {
            return res.status(400).json({ error: e.message });
        }
        console.error('Approve UPI Payment Error:', e?.message, e?.stack);
        res.status(500).json({ error: 'Failed to approve payment', detail: e?.message });
    }
};

export const rejectUpiVerification = async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const reason = typeof req.body?.reason === 'string' ? req.body.reason : '';
        const teacherId = (req as any).user?.id;
        const instituteId = (req as any).user?.instituteId;

        const rawVerification = await prisma.upiPaymentVerification.findUnique({
            where: { id },
            include: { student: { include: { batch: { include: { institute: true } } } } }
        });
        const verification = rawVerification as any;

        if (!verification || verification.instituteId !== instituteId) {
            return res.status(404).json({ error: 'Verification not found' });
        }
        if (verification.student.batch?.teacherId && verification.student.batch.teacherId !== teacherId) {
            return res.status(403).json({ error: 'Unauthorized' });
        }
        if (verification.status !== 'PENDING') {
            return res.status(400).json({ error: 'Verification is not pending' });
        }

        await prisma.upiPaymentVerification.update({
            where: { id },
            data: { 
                status: 'REJECTED',
                rejectionReason: reason || 'Screenshot unclear or mismatched amount' 
            }
        });

        // Delete the physical screenshot (Space saving)
        await deletePaymentScreenshot(verification.storageKey).catch(e => console.error('Failed to delete screenshot after rejection:', e));

        // Send a WhatsApp text saying it was rejected
        const phoneRaw = verification.student.parentWhatsapp;
        if (phoneRaw && verification.student.batch?.institute?.slug) {
            let phone = phoneRaw.replace(/[^0-9+]/g, '');
            if (phone.length === 10) phone = '+91' + phone;
            const link = `https://mathlogs.com/pay/${verification.student.batch.institute.slug}`;
            
            import('../utils/whatsapp').then(({ sendPaymentRejectionWhatsApp }) => {
                sendPaymentRejectionWhatsApp(phone, {
                    studentName: verification.student.name,
                    reason: reason || 'Screenshot unclear or mismatched amount',
                    paymentPortalLink: link,
                    instituteName: verification.student.batch.institute.name,
                    instituteId: instituteId || undefined
                }).catch(err => console.error('WhatsApp Reject Notification Error:', err));
            });
        }
        res.json({ success: true, message: 'Payment rejected.' });
    } catch (e) {
        console.error('Reject UPI Payment Error:', e);
        res.status(500).json({ error: 'Failed to reject payment' });
    }
};

export const getCustomInvoices = async (req: Request, res: Response) => {
    try {
        const teacherId = (req as any).user?.id;
        const currentAcademicYearId = (req as any).user?.currentAcademicYearId;

        const invoices = await prisma.feeInstallment.findMany({
            where: {
                studentId: { not: null },
                batch: { teacherId },
                student: {
                    academicYearId: currentAcademicYearId
                }
            },
            include: {
                student: {
                    select: {
                        id: true,
                        name: true,
                        humanId: true,
                        parentWhatsapp: true
                    }
                },
                batch: {
                    select: {
                        id: true,
                        name: true
                    }
                },
                payments: {
                    select: {
                        id: true,
                        amountPaid: true,
                        date: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        const result = invoices.map(inv => {
            const totalPaid = inv.payments.reduce((sum, p) => sum + p.amountPaid, 0);
            return {
                id: inv.id,
                name: inv.name,
                amount: inv.amount,
                createdAt: inv.createdAt,
                studentId: inv.studentId,
                studentName: inv.student?.name || 'Unknown',
                studentHumanId: inv.student?.humanId || null,
                batchId: inv.batch?.id || null,
                batchName: inv.batch?.name || 'N/A',
                totalPaid,
                isPaid: totalPaid >= inv.amount,
                lastPaymentDate: inv.payments.length > 0
                    ? inv.payments.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0].date
                    : null
            };
        });

        res.json(result);
    } catch (error) {
        console.error('Error fetching custom invoices:', error);
        res.status(500).json({ error: 'Failed to fetch custom invoices' });
    }
};
