import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
    try {
        const students = await prisma.student.findMany({
            where: {
                status: 'APPROVED',
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

            const isBatchInstallmentActive = allBatchInstallments.some((inst: any) => !inst.studentId);

            const paidInstallmentIds = new Set(student.feePayments.map((p: any) => p.installmentId));

            const validInstallments = allBatchInstallments.filter((inst: any) => {
                if (inst.studentId) {
                    return inst.studentId === student.id;
                }
                const isAfterJoin = new Date(inst.createdAt) >= studentJoinDate;
                const hasPayment = paidInstallmentIds.has(inst.id);
                return isAfterJoin || hasPayment;
            });
            const validInstallmentIds = new Set(validInstallments.map((inst: any) => inst.id));

            const paidSimple = student.fees
                .filter((f: any) => f.status === 'PAID')
                .reduce((sum: number, fee: any) => sum + fee.amount, 0);

            let unallocatedCash = paidSimple;

            const validFeePayments = student.feePayments.filter((p: any) => validInstallmentIds.has(p.installmentId));
            const paidInstallments = validFeePayments
                .reduce((sum: number, p: any) => sum + p.amountPaid, 0);

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

            const totalFee = (isBatchInstallmentActive ? globalInstallmentsTotal : (student.batch?.feeAmount || 0)) + customInstallmentsTotal;

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
        console.log("Success! Generated summary for", summary.length, "students.");
    } catch (err) {
        console.error("Crash!", err);
    }
}
run();
