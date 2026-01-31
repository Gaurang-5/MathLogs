
import { prisma } from './src/prisma';

async function main() {
    const students = await prisma.student.findMany({
        where: { name: 'Gaurang Bhatia' },
        include: {
            feePayments: {
                include: { installment: true }
            },
            batch: {
                include: { feeInstallments: true }
            }
        }
    });

    console.log(`Found ${students.length} students named Gaurang Bhatia`);

    students.forEach(student => {
        console.log(`\n=== Student ID: ${student.id} ===`);
        console.log('Batch:', student.batch?.name || 'NONE');

        if (student.batch) {
            console.log('--- Installments ---');
            student.batch.feeInstallments.forEach(i => {
                console.log(`  ID: ${i.id} | Name: ${i.name} | Amount: ${i.amount}`);
            });
        }

        console.log('--- Payments ---');
        student.feePayments.forEach(p => {
            console.log(`  ID: ${p.id} | Amt: ${p.amountPaid} | LinkedTo: ${p.installment?.name} (${p.installmentId})`);
        });
    });
}
main().catch(console.error).finally(() => prisma.$disconnect());
