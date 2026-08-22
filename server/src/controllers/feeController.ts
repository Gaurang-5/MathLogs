import { Request, Response } from 'express';
import { prisma } from '../prisma';
// const PDFDocument = require('pdfkit');
import { secureLogger } from '../utils/secureLogger';
import { sendEmail } from '../utils/email';
import { calculateStudentFeeSnapshot } from '../utils/feeCalculations';
import { deletePaymentScreenshot, encodePaymentScreenshotKey, signPaymentScreenshotKey } from '../utils/paymentStorage';
import { processReceiptScreenshot } from '../utils/ai/receipt-scanner';
import { streamPendingFeesReportPdf, streamTransactionsReportPdf } from '../services/receiptPdfService';
import { sendStudentAlertForStudent } from '../services/studentAlertRecipientService';

// Email handling moved to utils/email.ts

export const downloadPendingFeesReport = async (req: Request, res: Response) => {
    try {
        const batchFilter = req.query.batch as string;
        const sortBy = req.query.sortBy as string;
        
        const user = (req as any).user;
        const teacherId = user?.id;
        const instituteId = user?.instituteId;
        const role = user?.role;

        const whereClause: any = {
            status: 'APPROVED',
        };

        if (instituteId) {
            whereClause.instituteId = instituteId;
        }

        if (role !== 'SUPER_ADMIN') {
            whereClause.batch = { teacherId };
        }

        const students = await prisma.student.findMany({
            where: whereClause,
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

        // Stream PDF Report via receiptPdfService
        streamPendingFeesReportPdf(res, defaulters, sortBy);
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

export const getFeeInstallmentsList = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const teacherId = user?.id;
        const instituteId = user?.instituteId;
        const role = user?.role;

        const whereClause: any = {
            batch: {
                ...(instituteId ? { instituteId } : {}),
                ...(role !== 'SUPER_ADMIN' ? { teacherId } : {})
            }
        };

        const installments = await prisma.feeInstallment.findMany({
            where: whereClause,
            select: { name: true },
            orderBy: { name: 'asc' }
        });

        const uniqueNames = Array.from(new Set(installments.map(i => i.name.trim()).filter(Boolean)));
        res.json(uniqueNames);
    } catch (error) {
        console.error('Error fetching fee installments list:', error);
        res.status(500).json({ error: 'Failed to fetch fee installments list' });
    }
};

export const getFeeSummary = async (req: Request, res: Response) => {
    try {
        const user = (req as any).user;
        const teacherId = user?.id;
        const instituteId = user?.instituteId;
        const role = user?.role;
        const installmentFilter = (req.query.installment as string) || 'All';

        const whereClause: any = {
            status: 'APPROVED',
        };

        if (instituteId) {
            whereClause.instituteId = instituteId;
        }

        if (role !== 'SUPER_ADMIN') {
            whereClause.batch = { teacherId };
        }

        const students = await prisma.student.findMany({
            where: whereClause,
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
                },
                feeAssignments: {
                    select: {
                        installmentId: true
                    }
                }
            },
            orderBy: { name: 'asc' }
        });

        // Collect all distinct installment names across all students
        const allInstallmentNamesSet = new Set<string>();
        students.forEach((s: any) => {
            (s.batch?.feeInstallments || []).forEach((inst: any) => {
                if (inst.name) allInstallmentNamesSet.add(inst.name.trim());
            });
        });

        const summary = students.map((student: any) => {
            const studentJoinDate = student.createdAt ? new Date(student.createdAt) : new Date(0);
            const allBatchInstallments = student.batch?.feeInstallments || [];

            const isBatchInstallmentActive = allBatchInstallments.some((inst: any) => !inst.studentId);

            // Build a set of installment IDs that have existing payments for this student
            const paidInstallmentIds = new Set(student.feePayments.map((p: any) => p.installmentId));

            // Build a set of explicit assignments for this student
            const assignedIds = new Set((student.feeAssignments || []).map((a: any) => a.installmentId));

            // Filter installments: include global ones (no studentId) that are after join date OR have payments OR are explicitly assigned,
            // plus student-specific ones that belong to THIS student
            let validInstallments = allBatchInstallments.filter((inst: any) => {
                if (inst.studentId) {
                    return inst.studentId === student.id;
                }
                const isAfterJoin = new Date(inst.createdAt) >= studentJoinDate;
                const hasPayment = paidInstallmentIds.has(inst.id);
                const isAssigned = assignedIds.has(inst.id);
                return isAfterJoin || hasPayment || isAssigned;
            });

            // If a specific installment filter is selected, filter validInstallments to only matching ones
            if (installmentFilter !== 'All') {
                validInstallments = validInstallments.filter((inst: any) => inst.name.trim() === installmentFilter.trim());
            }

            const validInstallmentIds = new Set(validInstallments.map((inst: any) => inst.id));

            // Calculate adhoc/generic cash payments (FeeRecords) - only if 'All' is selected
            const paidSimple = (installmentFilter === 'All')
                ? student.fees
                    .filter((f: any) => f.status === 'PAID')
                    .reduce((sum: number, fee: any) => sum + fee.amount, 0)
                : 0;

            let unallocatedCash = paidSimple;

            // Only count FeePayments that are linked to VALID installments
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

                let due = inst.amount - paidDirectly;

                if (due > 0 && unallocatedCash > 0) {
                    const coverage = Math.min(due, unallocatedCash);
                    due -= coverage;
                    unallocatedCash -= coverage;
                }

                if (due > 0) {
                    breakdown.push({ name: inst.name, due });
                }
            });

            const globalInstallmentsTotal = validInstallments
                .filter((inst: any) => !inst.studentId)
                .reduce((sum: number, inst: any) => sum + inst.amount, 0);

            const customInstallmentsTotal = validInstallments
                .filter((inst: any) => inst.studentId)
                .reduce((sum: number, inst: any) => sum + inst.amount, 0);

            let totalFee = 0;
            if (installmentFilter !== 'All') {
                totalFee = globalInstallmentsTotal + customInstallmentsTotal;
            } else {
                totalFee = (isBatchInstallmentActive ? globalInstallmentsTotal : (student.batch?.feeAmount || 0)) + customInstallmentsTotal;
            }

            const totalPaid = paidSimple + paidInstallments;
            const balance = Math.max(0, totalFee - totalPaid);

            const dates = [
                ...student.fees.map((f: any) => f.date),
                ...student.feePayments.map((p: any) => p.date)
            ].sort((a: any, b: any) => new Date(b).getTime() - new Date(a).getTime());

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
                breakdown
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
                void sendStudentAlertForStudent(result.id, phone => sendPaymentReceiptWhatsApp(phone, {
                    studentName: result.name,
                    amountPaid: `Rs. ${parsedAmount.toLocaleString()}`,
                    installmentName: allocatedInstallments,
                    instituteName: result.batch?.institute?.name || 'our institute',
                    instituteId: result.instituteId || undefined
                })).catch(err => console.error('WhatsApp Payment Receipt Error:', err));
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
            include: {
                batch: { include: { institute: true } },
                feeAssignments: { select: { installmentId: true } }
            }
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

        const isSameBatch = installment.batchId === student.batchId;
        const isAssigned = student.feeAssignments?.some((assignment) => assignment.installmentId === installment.id) ?? false;
        const isExistingPayment = existingPayments.length > 0;
        const isAfterJoin = new Date(installment.createdAt).getTime() >= new Date(student.createdAt).getTime();
        const isValidCustomInstallment = Boolean(installment.studentId) && installment.studentId === student.id && isSameBatch;
        const isValidBatchInstallment = !installment.studentId && isSameBatch && (isAfterJoin || isExistingPayment || isAssigned);

        if (!isValidCustomInstallment && !isValidBatchInstallment) {
            return res.status(403).json({ error: 'Forbidden: Installment is not valid for this student' });
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

        if (student.instituteId) {
            try {
                await prisma.systemLog.create({
                    data: {
                        instituteId: student.instituteId,
                        action: 'FEE_COLLECTED',
                        entityId: student.id,
                        entityName: student.name,
                        details: { amount: newPaymentAmount, installmentName: installment.name }
                    }
                });
            } catch (logError) {
                console.warn('[WARN] Failed to write fee collection audit log:', logError);
            }
        }

        console.log('[DEBUG] Payment created successfully:', {
            paymentId: payment.id,
            studentId: payment.studentId,
            installmentId: payment.installmentId,
            amount: payment.amountPaid,
            date: payment.date
        });

        // Send WhatsApp receipt to parent (fire-and-forget)
        if (student.parentWhatsapp) {
            import('../utils/whatsapp').then(({ sendPaymentReceiptWhatsApp }) => {
                void sendStudentAlertForStudent(student.id, phone => sendPaymentReceiptWhatsApp(phone, {
                    studentName: student.name,
                    amountPaid: `Rs. ${newPaymentAmount.toLocaleString()}`,
                    installmentName: installment.name,
                    instituteName: student.batch?.institute?.name || 'our institute',
                    instituteId: student.instituteId || undefined
                })).catch(err => console.error('WhatsApp Payment Receipt Error:', err));
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
    const { studentId } = req.body;

    try {
        const teacherId = (req as any).user?.id;
        const student = await prisma.student.findUnique({
            where: { id: studentId },
            include: {
                batch: { include: { feeInstallments: true, institute: true } },
                feePayments: true,
                feeAssignments: { select: { installmentId: true } },
                fees: true
            }
        });

        if (student?.batch?.teacherId && student.batch.teacherId !== teacherId) return res.status(403).json({ error: 'Unauthorized' });

        if (!student || !student.parentEmail) {
            return res.status(400).json({ error: 'Student email not found' });
        }

        const snapshot = calculateStudentFeeSnapshot(student);
        const totalPendingCalc = Math.max(0, snapshot.balance);
        if (totalPendingCalc <= 0) {
            return res.status(400).json({ error: 'Student has no pending balance. Reminder skipped.' });
        }
        const breakdownLines = [`- Outstanding Balance: Rs. ${totalPendingCalc.toLocaleString()}`];

        const subject = `Fee Payment Reminder for ${student.name}`;
        const senderName = student.batch?.institute?.name || 'Coaching Administration';
        const replyTo = student.batch?.institute?.email || undefined;

        const body = `Dear ${student.parentName || 'Parent/Guardian'},

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
            import('../utils/whatsapp').then(({ sendFeeReminderUpiWhatsApp }) => {
                // WhatsApp templates reject newline (\n) characters inside variables.
                const feeBreakupText = breakdownLines.join(' | ');

                const phoneDigits = student.parentWhatsapp!.replace(/\D/g, '').slice(-10);
                const upiLink = `${process.env.FRONTEND_URL || 'https://mathlogs.com'}/pay/${student.batch?.institute?.slug}?phone=${phoneDigits}`;

                void sendStudentAlertForStudent(student.id, phone => sendFeeReminderUpiWhatsApp(phone, {
                        studentName: student.name,
                        batchName: student.batch?.name || "the batch",
                        feeBreakup: feeBreakupText,
                        totalAmount: totalPendingCalc.toLocaleString(),
                        instituteName: student.batch?.institute?.name || "our institute",
                        upiPaymentLink: upiLink,
                        instituteId: student.instituteId || undefined
                    }
                )).catch(err => console.error("WhatsApp Fee Update Error:", err));
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
        const user = (req as any).user;
        const teacherId = user?.id;
        const instituteId = user?.instituteId;
        const role = user?.role;

        const studentWhereClause: any = {};
        if (instituteId) {
            studentWhereClause.instituteId = instituteId;
        }
        if (role !== 'SUPER_ADMIN') {
            studentWhereClause.batch = { teacherId };
        }

        secureLogger.debug('Fetching recent transactions', { teacherId, instituteId });

        // Fetch recent installment payments (NO academic year filter)
        const recentInstallments = await prisma.feePayment.findMany({
            where: {
                student: studentWhereClause
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
                student: studentWhereClause
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

        // Determine accurate IST (Asia/Kolkata) boundaries mapped to UTC for database queries
        // Start of month IST is Year-Month-01 00:00:00 -> UTC offset is -5:30
        const startDate = new Date(Date.UTC(yearNum, monthIdx, 1, -5, -30, 0, 0));
        // End of month IST is Year-(Month+1)-01 00:00:00 minus 1 ms
        const endDate = new Date(Date.UTC(yearNum, monthIdx + 1, 1, -5, -30, 0, -1));

        // Fetch Installment Payments
        const instituteId = (req as any).user?.instituteId;
        const teacherId = (req as any).user?.id;

        const payments = await prisma.feePayment.findMany({
            where: {
                student: {
                    instituteId: instituteId,
                    status: 'APPROVED',
                    batch: { teacherId }
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
                status: 'PAID',
                student: {
                    instituteId: instituteId,
                    status: 'APPROVED',
                    batch: { teacherId }
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

        // Stream PDF Report via receiptPdfService
        streamTransactionsReportPdf(res, allTx, startDate, month as string, year as string);
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
                    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

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
                import('../utils/whatsapp').then(({ sendPaymentReceiptWhatsApp }) => {
                    void sendStudentAlertForStudent(verification.student.id, phone => sendPaymentReceiptWhatsApp(phone, {
                        studentName: verification.student.name,
                        amountPaid: `Rs. ${verification.amount.toLocaleString()}`,
                        installmentName: verification.installment?.name || 'Fee Payment',
                        instituteName: verification.student.batch?.institute?.name || 'our institute',
                        instituteId: instituteId || undefined
                    })).catch(err => console.error('WhatsApp Payment Receipt Error:', err));
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
            const link = `https://mathlogs.com/pay/${verification.student.batch.institute.slug}`;

            import('../utils/whatsapp').then(({ sendPaymentRejectionWhatsApp }) => {
                void sendStudentAlertForStudent(verification.student.id, phone => sendPaymentRejectionWhatsApp(phone, {
                    studentName: verification.student.name,
                    reason: reason || 'Screenshot unclear or mismatched amount',
                    paymentPortalLink: link,
                    instituteName: verification.student.batch.institute.name,
                    instituteId: instituteId || undefined
                })).catch(err => console.error('WhatsApp Reject Notification Error:', err));
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
        const instituteId = (req as any).user?.instituteId;

        const invoices = await prisma.feeInstallment.findMany({
            where: {
                studentId: { not: null },
                student: {
                    instituteId: instituteId,
                    status: 'APPROVED'
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

export const createCustomInvoice = async (req: Request, res: Response) => {
    try {
        const { studentId, installmentId, name, amount, markAsPaid } = req.body;
        const user = (req as any).user;
        const teacherId = user?.id;
        const instituteId = user?.instituteId;

        const student = await prisma.student.findUnique({
            where: { id: String(studentId) },
            include: {
                batch: {
                    select: {
                        id: true,
                        teacherId: true,
                        instituteId: true,
                        name: true,
                        institute: {
                            select: {
                                name: true,
                                slug: true
                            }
                        }
                    }
                }
            }
        });

        if (!student) return res.status(404).json({ error: 'Student not found' });
        if (!student.batch) return res.status(400).json({ error: 'Student has no batch assigned' });
        if (student.instituteId && student.instituteId !== instituteId) {
            return res.status(403).json({ error: 'Unauthorized: Cross-institute access denied' });
        }
        if (student.batch.instituteId !== instituteId || student.batch.teacherId !== teacherId) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        let invoiceName = String(name || '').trim();
        let invoiceAmount = amount !== undefined ? parseFloat(String(amount)) : NaN;

        if (installmentId) {
            const sourceInstallment = await prisma.feeInstallment.findFirst({
                where: {
                    id: String(installmentId),
                    batchId: student.batch.id
                }
            });

            if (!sourceInstallment) {
                return res.status(404).json({ error: 'Global installment not found for this student batch' });
            }

            invoiceName = sourceInstallment.name;
            invoiceAmount = sourceInstallment.amount;
        }

        if (!invoiceName || isNaN(invoiceAmount) || invoiceAmount <= 0) {
            return res.status(400).json({ error: 'Invoice name and a positive amount are required' });
        }

        const existingAssignment = await prisma.feeInstallment.findFirst({
            where: {
                batchId: student.batch.id,
                studentId: student.id,
                name: invoiceName,
                amount: invoiceAmount
            }
        });

        if (existingAssignment) {
            return res.status(409).json({ error: 'This invoice is already assigned to the student' });
        }

        const installment = await prisma.feeInstallment.create({
            data: {
                batchId: student.batch.id,
                name: invoiceName,
                amount: invoiceAmount,
                studentId: student.id
            }
        });

        await prisma.feeInstallmentAssignment.create({
            data: {
                studentId: student.id,
                installmentId: installment.id
            }
        }).catch(err => console.error('Assignment error in custom invoice:', err));

        let payment = null;
        if (markAsPaid) {
            payment = await prisma.feePayment.create({
                data: {
                    studentId: student.id,
                    installmentId: installment.id,
                    amountPaid: invoiceAmount,
                    date: new Date()
                }
            });

            if (student.instituteId) {
                try {
                    await prisma.systemLog.create({
                        data: {
                            instituteId: student.instituteId,
                            action: 'FEE_COLLECTED',
                            entityId: student.id,
                            entityName: student.name,
                            details: { amount: invoiceAmount, installmentName: invoiceName }
                        }
                    });
                } catch (logError) {
                    console.warn('[WARN] Failed to write custom invoice audit log:', logError);
                }
            }
        }

        if (student.parentWhatsapp) {
            const instituteName = student.batch.institute?.name || 'our institute';
            try {
                const whatsapp = await import('../utils/whatsapp');
                if (markAsPaid) {
                    await sendStudentAlertForStudent(student.id, phone => whatsapp.sendPaymentReceiptWhatsApp(phone, {
                        studentName: student.name,
                        amountPaid: `Rs. ${invoiceAmount.toLocaleString()}`,
                        installmentName: invoiceName,
                        instituteName,
                        instituteId: student.instituteId || undefined
                    }));
                } else {
                    const baseUrl = process.env.FRONTEND_URL || 'https://mathlogs.com';
                    const instituteSlug = student.batch.institute?.slug;
                    const batchName = student.batch.name || 'the batch';
                    await sendStudentAlertForStudent(student.id, phone => whatsapp.sendFeeReminderUpiWhatsApp(phone, {
                        studentName: student.name,
                        batchName,
                        feeBreakup: `- ${invoiceName}: Rs. ${invoiceAmount.toLocaleString()} (Due)`,
                        totalAmount: invoiceAmount.toLocaleString(),
                        instituteName,
                        upiPaymentLink: instituteSlug ? `${baseUrl}/pay/${instituteSlug}?phone=${phone}` : 'Please contact admin for payment details.',
                        instituteId: student.instituteId || undefined
                    }));
                }
            } catch (waError) {
                console.error('WhatsApp Custom Invoice Notification Error:', waError);
            }
        }

        res.status(201).json({ installment, payment });
    } catch (error) {
        console.error('Error creating custom invoice:', error);
        res.status(500).json({ error: 'Failed to create custom invoice' });
    }
};

export const scanReceipt = async (req: Request, res: Response) => {
    try {
        let imageBuffer: Buffer | string | undefined;

        if ((req as any).file) {
            imageBuffer = (req as any).file.buffer;
        } else if (req.body.image) {
            imageBuffer = req.body.image;
        }

        if (!imageBuffer) {
            return res.status(400).json({ error: "Missing image data" });
        }

        const data = await processReceiptScreenshot(imageBuffer);
        res.json(data);
    } catch (error: any) {
        console.error("❌ Receipt Scan Error:", error);
        res.status(500).json({ error: "Receipt Scan Failed", details: error.message });
    }
};

export const assignFeeInstallment = async (req: Request, res: Response) => {
    try {
        const { studentId, installmentId } = req.body;
        const user = (req as any).user;

        const student = await prisma.student.findUnique({
            where: { id: String(studentId) },
            include: { batch: true }
        });

        if (!student) return res.status(404).json({ error: 'Student not found' });
        if (student.instituteId && user?.instituteId && student.instituteId !== user.instituteId) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const installment = await prisma.feeInstallment.findUnique({
            where: { id: String(installmentId) }
        });

        if (!installment) return res.status(404).json({ error: 'Installment not found' });
        if (installment.batchId !== student.batchId) {
            return res.status(400).json({ error: 'Installment does not belong to student batch' });
        }

        const assignment = await prisma.feeInstallmentAssignment.upsert({
            where: {
                studentId_installmentId: {
                    studentId: String(studentId),
                    installmentId: String(installmentId)
                }
            },
            update: {},
            create: {
                studentId: String(studentId),
                installmentId: String(installmentId)
            }
        });

        return res.json({ success: true, assignment });
    } catch (error: any) {
        secureLogger.error('Error assigning fee installment:', error);
        return res.status(500).json({ error: error.message || 'Failed to assign fee' });
    }
};
