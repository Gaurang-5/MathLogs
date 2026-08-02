import { PrismaClient } from '@prisma/client';
import { calculateStudentFeeSnapshot } from '../utils/feeCalculations';

const prisma = new PrismaClient();

async function run() {
    console.log('Comparing balances across fee calculation methods...');
    
    const students = await prisma.student.findMany({
        include: {
            batch: { include: { feeInstallments: true } },
            feePayments: true,
            fees: true
        }
    });

    let mismatchCount = 0;

    for (const student of students) {
        // 1. calculateStudentFeeSnapshot (utility function logic)
        const calcSnapshot = calculateStudentFeeSnapshot(student as any);
        const calcBalance = calcSnapshot.balance;

        // 2. getFeeSummary (controller logic inlined)
        const studentJoinDate = student.createdAt ? new Date(student.createdAt) : new Date(0);
        const allBatchInstallments = student.batch?.feeInstallments || [];
        const isBatchInstallmentActive = allBatchInstallments.some((inst: any) => !inst.studentId);
        
        const paidInstallmentIds = new Set(student.feePayments.map((p: any) => p.installmentId));
        
        const validInstallments = allBatchInstallments.filter((inst: any) => {
            if (inst.studentId) return inst.studentId === student.id;
            const isAfterJoin = new Date(inst.createdAt) >= studentJoinDate;
            return isAfterJoin || paidInstallmentIds.has(inst.id);
        });
        
        const validInstallmentIds = new Set(validInstallments.map((i: any) => i.id));
        
        const paidSimple = student.fees.filter((f: any) => f.status === 'PAID').reduce((sum: number, f: any) => sum + f.amount, 0);
        const validFeePayments = student.feePayments.filter((p: any) => validInstallmentIds.has(p.installmentId));
        const paidInstallments = validFeePayments.reduce((sum: number, p: any) => sum + p.amountPaid, 0);

        const globalInstallmentsTotal = validInstallments.filter((i: any) => !i.studentId).reduce((sum: number, i: any) => sum + i.amount, 0);
        const customInstallmentsTotal = validInstallments.filter((i: any) => i.studentId).reduce((sum: number, i: any) => sum + i.amount, 0);

        const totalFee = (isBatchInstallmentActive ? globalInstallmentsTotal : (student.batch?.feeAmount || 0)) + customInstallmentsTotal;
        const totalPaid = paidSimple + paidInstallments;
        
        // Controller explicitly clamps negatives to 0
        const contBalance = Math.max(0, totalFee - totalPaid);

        if (calcBalance !== contBalance) {
            const isOverpaymentDiff = (calcBalance < 0 && contBalance === 0);
            console.log(`Student ID: ${student.id} | Name: ${student.name}`);
            console.log(`  calculateStudentFeeSnapshot: ${calcBalance}`);
            console.log(`  getFeeSummary (clamped): ${contBalance}`);
            console.log(`  Is Expected Overpayment Difference?: ${isOverpaymentDiff ? 'YES' : 'NO - REAL BUG'}`);
            console.log('----------------------------------------------------');
            mismatchCount++;
        }
    }

    console.log(`\nTotal mismatches found: ${mismatchCount}`);
}

run().catch(console.error).finally(() => prisma.$disconnect());
