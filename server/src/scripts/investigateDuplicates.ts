import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: "postgres://u93j7a7r6pi9tp:p3854c4b384e27084ecff0309e17d343cf5ce9ef5310565d9449bb7526a274906@c9n6qtf5jru089.cluster-czrs8kj4isg7.us-east-1.rds.amazonaws.com:5432/d22tjukcfsunko"
        }
    }
});

async function main() {
    const installments = await prisma.feeInstallment.findMany({
        where: {
            OR: [
                { name: { contains: 'April', mode: 'insensitive' } },
                { name: { contains: 'May', mode: 'insensitive' } }
            ]
        },
        include: {
            payments: true,
            batch: {
                include: {
                    students: true
                }
            }
        },
        orderBy: {
            createdAt: 'asc'
        }
    });

    console.log(`Found ${installments.length} installments matching 'April' or 'May':\n`);

    for (const inst of installments) {
        console.log(`--- Installment ID: ${inst.id} ---`);
        console.log(`Name: "${inst.name}"`);
        console.log(`Amount: ${inst.amount}`);
        console.log(`Batch ID: ${inst.batchId}`);
        console.log(`Student ID: ${inst.studentId || 'null (global)'}`);
        console.log(`Created At: ${inst.createdAt.toISOString()}`);
        
        const paymentCount = inst.payments.length;
        const totalAmountPaid = inst.payments.reduce((sum, p) => sum + p.amountPaid, 0);
        console.log(`Payments: ${paymentCount} rows, Total Paid: ₹${totalAmountPaid}`);

        const validStudents = inst.batch.students.filter(student => {
            const isCustomInstallment = inst.studentId === student.id;
            const isBatchInstallment = inst.studentId === null && inst.batchId === student.batchId;
            const studentJoinDate = student.createdAt ? new Date(student.createdAt) : new Date(0);
            const isAfterJoin = new Date(inst.createdAt) >= studentJoinDate;
            const studentTotalPaid = inst.payments.filter(p => p.studentId === student.id).reduce((sum, p) => sum + p.amountPaid, 0);
            const hasPriorPayment = studentTotalPaid > 0;
            const isEligibleBatchInstallment = isBatchInstallment && (isAfterJoin || hasPriorPayment);

            return isCustomInstallment || isEligibleBatchInstallment;
        });

        console.log(`Valid for ${validStudents.length} students.\n`);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
