import { PrismaClient } from '@prisma/client';
import { calculateStudentFeeSnapshot } from '../src/utils/feeCalculations';

const prisma = new PrismaClient();

async function run() {
    try {
        console.log("=== 1. FeeInstallment null vs not null ===");
        const globalCount = await prisma.feeInstallment.count({ where: { studentId: null } });
        const customCount = await prisma.feeInstallment.count({ where: { studentId: { not: null } } });
        console.log(`Global Installments (studentId = null): ${globalCount}`);
        console.log(`Custom Installments (studentId != null): ${customCount}`);

        console.log("\n=== 2. Invalid FeePayment Rows ===");
        const payments = await prisma.feePayment.findMany();
        const installments = await prisma.feeInstallment.findMany();
        const installmentMap = new Map(installments.map(i => [i.id, i]));
        
        let missingInstallmentCount = 0;
        let invalidForStudentCount = 0;

        for (const p of payments) {
            const inst = installmentMap.get(p.installmentId);
            if (!inst) {
                missingInstallmentCount++;
            } else if (inst.studentId && inst.studentId !== p.studentId) {
                invalidForStudentCount++;
            }
        }
        console.log(`Payments with missing/deleted installment: ${missingInstallmentCount}`);
        console.log(`Payments for someone else's custom installment: ${invalidForStudentCount}`);

        console.log("\n=== 3. Balance Calculation Mismatch (feeCalculations vs feeController) ===");
        const students = await prisma.student.findMany({
            include: {
                batch: { include: { feeInstallments: true } },
                feePayments: true,
                fees: true
            }
        });

        let calcNegativeContZero = 0;
        let mismatchCount = 0;

        for (const student of students) {
            const calcSnapshot = calculateStudentFeeSnapshot(student as any);
            const calcBalance = calcSnapshot.balance;

            const studentJoinDate = student.createdAt ? new Date(student.createdAt) : new Date(0);
            const allBatchInstallments = student.batch?.feeInstallments || [];
            const isBatchInstallmentActive = allBatchInstallments.some(inst => !inst.studentId);
            const paidInstallmentIds = new Set(student.feePayments.map(p => p.installmentId));
            const validInstallments = allBatchInstallments.filter((inst) => {
                if (inst.studentId) return inst.studentId === student.id;
                const isAfterJoin = new Date(inst.createdAt) >= studentJoinDate;
                return isAfterJoin || paidInstallmentIds.has(inst.id);
            });
            const validInstallmentIds = new Set(validInstallments.map(i => i.id));
            
            const paidSimple = student.fees.filter(f => f.status === 'PAID').reduce((sum, f) => sum + f.amount, 0);
            const validFeePayments = student.feePayments.filter(p => validInstallmentIds.has(p.installmentId));
            const paidInstallments = validFeePayments.reduce((sum, p) => sum + p.amountPaid, 0);

            const globalInstallmentsTotal = validInstallments.filter(i => !i.studentId).reduce((sum, i) => sum + i.amount, 0);
            const customInstallmentsTotal = validInstallments.filter(i => i.studentId).reduce((sum, i) => sum + i.amount, 0);

            const totalFee = (isBatchInstallmentActive ? globalInstallmentsTotal : (student.batch?.feeAmount || 0)) + customInstallmentsTotal;
            const totalPaid = paidSimple + paidInstallments;
            const contBalance = Math.max(0, totalFee - totalPaid);

            if (calcBalance < 0 && contBalance === 0) {
                calcNegativeContZero++;
            } else if (calcBalance !== contBalance && !(calcBalance < 0 && contBalance === 0)) {
                mismatchCount++;
            }
        }
        console.log(`Students with negative calc balance but zero cont balance (overpaid): ${calcNegativeContZero}`);
        console.log(`Students with other balance mismatches: ${mismatchCount}`);

        console.log("\n=== 4. Large Unallocated FeeRecord Rows ===");
        const largeRecords = await prisma.feeRecord.findMany({
            where: { amount: { gt: 50000 } }
        });
        if (largeRecords.length === 0) {
            console.log("No unusually large FeeRecord rows (> 50,000) found.");
        } else {
            console.log(`Found ${largeRecords.length} unusually large records:`);
            largeRecords.forEach(r => {
                console.log(`  - Record ${r.id}: Rs. ${r.amount} (Student: ${r.studentId})`);
            });
        }
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

run();
