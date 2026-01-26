
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Students ---');
    const students = await prisma.student.findMany({
        where: { status: 'APPROVED' },
        include: {
            batch: true,
            fees: true,
            feePayments: {
                include: {
                    installment: true
                }
            }
        }
    });
    console.log(`Found ${students.length} approved students.`);

    students.forEach(s => {
        console.log(`Student: ${s.name} (${s.id})`);
        console.log(`  Batch: ${s.batch?.name}, FeeAmount: ${s.batch?.feeAmount}`);
        console.log(`  FeeRecords (Simple): ${s.fees.length} records, Total: ${s.fees.reduce((sum, f) => sum + f.amount, 0)}`);
        console.log(`  FeePayments (Installments): ${s.feePayments.length} records, Total: ${s.feePayments.reduce((sum, f) => sum + f.amountPaid, 0)}`);
    });

    console.log('\n--- Batches & Installments ---');
    const batches = await prisma.batch.findMany({
        include: {
            feeInstallments: true
        }
    });
    batches.forEach(b => {
        console.log(`Batch: ${b.name}, Fee: ${b.feeAmount}`);
        console.log(`  Installments: ${b.feeInstallments.length}`);
        b.feeInstallments.forEach(i => {
            console.log(`    - ${i.name}: ${i.amount}`);
        });
    });
}

main()
    .then(async () => {
        await prisma.$disconnect()
    })
    .catch(async (e) => {
        console.error(e)
        await prisma.$disconnect()
        process.exit(1)
    });
