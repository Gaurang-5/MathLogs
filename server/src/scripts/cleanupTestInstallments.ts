import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const INSTALLMENT_IDS_TO_DELETE = [
    '703306a4-9d71-45ad-8d8f-e62fb119a7a5',
    '10c1f5db-e105-43ea-bca0-e88de9fca976',
    'f13c6a6f-fc4b-4066-b07e-659d4ea69907',
    'bac27e7d-38ca-476f-9c2c-70ab2ad99851'
];

async function main() {
    console.log('--- Starting Cleanup of Test Installments ---');

    await prisma.$transaction(async (tx) => {
        // Find all payments linked to these installments
        const payments = await tx.feePayment.findMany({
            where: {
                installmentId: { in: INSTALLMENT_IDS_TO_DELETE }
            }
        });

        console.log(`Found ${payments.length} FeePayment rows to delete.`);
        payments.forEach(p => console.log(`  - Payment ID: ${p.id}, Amount: ₹${p.amountPaid}, Student ID: ${p.studentId}, Installment ID: ${p.installmentId}`));

        // 1. Delete Payments explicitly
        if (payments.length > 0) {
            const paymentIds = payments.map(p => p.id);
            await tx.feePayment.deleteMany({
                where: { id: { in: paymentIds } }
            });
            console.log('Deleted payments successfully.');
        }

        // Find installments to get student IDs
        const installments = await tx.feeInstallment.findMany({
            where: { id: { in: INSTALLMENT_IDS_TO_DELETE } }
        });

        const studentIds = new Set(
            installments.map(i => i.studentId).filter(id => id !== null)
        );
        
        console.log(`Found ${installments.length} FeeInstallment rows to delete.`);

        // 2. Delete Installments explicitly
        if (installments.length > 0) {
            await tx.feeInstallment.deleteMany({
                where: { id: { in: INSTALLMENT_IDS_TO_DELETE } }
            });
            console.log('Deleted installments successfully.');
        }

        // Fetch balances (they should auto-update via triggers after the deletes within this tx)
        console.log('\n--- Student Balances After Cleanup ---');
        for (const sId of Array.from(studentIds)) {
            const balance = await tx.studentBalance.findUnique({
                where: { studentId: sId as string }
            });
            const student = await tx.student.findUnique({ where: { id: sId as string }});
            console.log(`Student ID: ${sId} (${student?.name}) - Total Fee: ₹${balance?.totalFee}, Total Paid: ₹${balance?.totalPaid}, Balance: ₹${balance?.balance}`);
        }
        
        console.log('\n--- Summary ---');
        console.log(`Successfully removed ${payments.length} payments and ${installments.length} installments.`);
    }, { maxWait: 5000, timeout: 20000 });
}

main()
    .catch(e => {
        console.error('Error during cleanup:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
