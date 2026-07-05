import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: "postgres://u93j7a7r6pi9tp:p3854c4b384e27084ecff0309e17d343cf5ce9ef5310565d9449bb7526a274906@c9n6qtf5jru089.cluster-czrs8kj4isg7.us-east-1.rds.amazonaws.com:5432/d22tjukcfsunko"
        }
    }
});

async function main() {
    const targetStudentIds = [
        'a8f51b86-fbc0-4f5e-a906-836a2fe99e22',
        'e194a3ed-7f47-4ce6-96ac-30b9f23c0de7',
        '1fdf20e7-4adf-4499-b37d-923656627364',
        'de88d8ad-9514-4ee7-8a29-a39336baa1b7'
    ];

    const targetInstallmentIds = [
        '703306a4-9d71-45ad-8d8f-e62fb119a7a5',
        '10c1f5db-e105-43ea-bca0-e88de9fca976',
        'f13c6a6f-fc4b-4066-b07e-659d4ea69907',
        'bac27e7d-38ca-476f-9c2c-70ab2ad99851'
    ];

    for (const studentId of targetStudentIds) {
        const student = await prisma.student.findUnique({
            where: { id: studentId },
            include: {
                batch: {
                    include: { 
                        feeInstallments: {
                            orderBy: { createdAt: 'asc' }
                        }
                    }
                },
                feePayments: true,
                fees: true
            }
        });

        if (!student) {
            console.log(`Student ${studentId} not found.`);
            continue;
        }

        console.log(`\n===========================================`);
        console.log(`Student: ${student.name} (ID: ${studentId})`);
        
        const allBatchInstallments = student.batch?.feeInstallments || [];
        const globalAprilMay = allBatchInstallments.find(i => i.studentId === null && i.name.toLowerCase().includes('april'));
        
        if (globalAprilMay) {
            const studentJoinDate = student.createdAt ? new Date(student.createdAt) : new Date(0);
            const isAfterJoin = new Date(globalAprilMay.createdAt) >= studentJoinDate;
            const studentTotalPaid = student.feePayments.filter(p => p.installmentId === globalAprilMay.id).reduce((sum, p) => sum + p.amountPaid, 0);
            const hasPriorPayment = studentTotalPaid > 0;
            const isEligible = isAfterJoin || hasPriorPayment;

            console.log(`Global Installment ID: ${globalAprilMay.id} ("${globalAprilMay.name}")`);
            console.log(`- Is Eligible for Global? ${isEligible ? 'YES (Double-Charge Risk)' : 'NO'}`);
        } else {
            console.log(`- No Global April-May installment found in this batch.`);
        }

        // --- CALC FEE SUMMARY LOGIC (same as getFeeSummary) ---
        const studentJoinDate = student.createdAt ? new Date(student.createdAt) : new Date(0);
        const paidInstallmentIds = new Set(student.feePayments.map(p => p.installmentId));

        const validInstallments = allBatchInstallments.filter(inst => {
            if (inst.studentId) return inst.studentId === student.id;
            const isAfterJoin = new Date(inst.createdAt) >= studentJoinDate;
            const hasPayment = paidInstallmentIds.has(inst.id);
            return isAfterJoin || hasPayment;
        });

        const validInstallmentIds = new Set(validInstallments.map(inst => inst.id));

        const paidSimple = student.fees
            .filter(f => f.status === 'PAID')
            .reduce((sum, fee) => sum + fee.amount, 0);

        let unallocatedCash = paidSimple;
        const validFeePayments = student.feePayments.filter(p => validInstallmentIds.has(p.installmentId));
        const paidInstallments = validFeePayments.reduce((sum, p) => sum + p.amountPaid, 0);

        const breakdown: any[] = [];
        let installmentTotal = 0;

        validInstallments.forEach(inst => {
            installmentTotal += inst.amount;

            const paymentsForThis = validFeePayments.filter(p => p.installmentId === inst.id);
            const paidDirectly = paymentsForThis.reduce((sum, p) => sum + p.amountPaid, 0);

            let due = inst.amount - paidDirectly;
            if (due > 0 && unallocatedCash > 0) {
                const coverage = Math.min(due, unallocatedCash);
                due -= coverage;
                unallocatedCash -= coverage;
            }

            if (due > 0.01) {
                breakdown.push({ name: inst.name, id: inst.id, due, amount: inst.amount, paid: paidDirectly });
            }
        });

        const totalFee = student.batch?.feeAmount ? student.batch.feeAmount : installmentTotal;
        const totalPaid = student.batch?.feeAmount ? paidSimple : (paidSimple + paidInstallments);
        const isBatchInstallmentActive = allBatchInstallments.some(inst => !inst.studentId);
        let balance = 0;
        
        if (!isBatchInstallmentActive && student.batch?.feeAmount) {
            balance = student.batch.feeAmount - totalPaid;
        } else {
            balance = breakdown.reduce((sum, item) => sum + item.due, 0);
            balance -= unallocatedCash; // subtract remaining overpayment
        }

        console.log(`\nFee Summary:`);
        console.log(`- Total Fee: ₹${totalFee}`);
        console.log(`- Total Paid: ₹${totalPaid}`);
        console.log(`- Balance: ₹${balance}`);
        console.log(`- Breakdown:`);
        breakdown.forEach(b => {
            const isTarget = targetInstallmentIds.includes(b.id);
            const tag = isTarget ? '  <--- SUSPICIOUS INSTALLMENT' : '';
            console.log(`  * ${b.name} (ID: ${b.id}): Fee ₹${b.amount}, Paid ₹${b.paid}, Due ₹${b.due}${tag}`);
        });

        // 2. Check if they were created today during session
        console.log(`\nSuspicious Installments for this student:`);
        targetInstallmentIds.forEach(targetId => {
            const target = allBatchInstallments.find(i => i.id === targetId);
            if (target) {
                console.log(`- ${target.name} (ID: ${target.id}): Created At: ${target.createdAt.toISOString()}`);
                const relatedPayments = student.feePayments.filter(p => p.installmentId === target.id);
                if (relatedPayments.length > 0) {
                    console.log(`  Payments:`);
                    relatedPayments.forEach(p => console.log(`  - Amount: ₹${p.amountPaid}, Date: ${p.createdAt.toISOString()}`));
                } else {
                    console.log(`  Payments: None`);
                }
            }
        });
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
