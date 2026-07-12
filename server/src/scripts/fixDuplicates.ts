import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const BACKDATE_TIME = new Date('2026-04-11T16:00:00.000Z');

const fixes = [
    {
        studentId: 'a8f51b86-fbc0-4f5e-a906-836a2fe99e22', // Ishi
        fakeInstallmentId: '703306a4-9d71-45ad-8d8f-e62fb119a7a5',
        globalInstallmentId: 'aac088ff-de48-4c19-91c7-f4c8330b89bd'
    },
    {
        studentId: 'e194a3ed-7f47-4ce6-96ac-30b9f23c0de7', // Siddhi
        fakeInstallmentId: '10c1f5db-e105-43ea-bca0-e88de9fca976',
        globalInstallmentId: 'aac088ff-de48-4c19-91c7-f4c8330b89bd'
    },
    {
        studentId: 'de88d8ad-9514-4ee7-8a29-a39336baa1b7', // Granth
        fakeInstallmentId: 'bac27e7d-38ca-476f-9c2c-70ab2ad99851',
        globalInstallmentId: '3c0af637-5061-4667-8c26-16ba79e06dc1'
    },
    {
        studentId: '1fdf20e7-4adf-4499-b37d-923656627364', // Arnav
        fakeInstallmentId: 'f13c6a6f-fc4b-4066-b07e-659d4ea69907',
        globalInstallmentId: '3c0af637-5061-4667-8c26-16ba79e06dc1'
    }
];

async function main() {
    console.log('--- Fixing Duplicate Custom Installments and Moving Payments ---');

    await prisma.$transaction(async (tx) => {
        // 1. Backdate all 4 students so they naturally qualify for the global April/May installment in UI and DB
        for (const fix of fixes) {
            await tx.student.update({
                where: { id: fix.studentId },
                data: { createdAt: BACKDATE_TIME }
            });
            console.log(`Backdated student ${fix.studentId} to ${BACKDATE_TIME.toISOString()}`);
        }

        // 2. Move any payments from the fake custom installment to the global one
        for (const fix of fixes) {
            const payments = await tx.feePayment.findMany({
                where: { installmentId: fix.fakeInstallmentId }
            });

            for (const pay of payments) {
                await tx.feePayment.update({
                    where: { id: pay.id },
                    data: { installmentId: fix.globalInstallmentId }
                });
                console.log(`Moved payment ${pay.id} (₹${pay.amountPaid}) to global installment ${fix.globalInstallmentId}`);
            }
        }

        // 3. Delete the fake custom installments now that they are orphaned
        for (const fix of fixes) {
            await tx.feeInstallment.deleteMany({
                where: { id: fix.fakeInstallmentId }
            });
            console.log(`Deleted fake installment ${fix.fakeInstallmentId}`);
        }

        // 4. Force a balance recalculation for these students to ensure absolute correctness
        console.log('\n--- Final Student Balances ---');
        for (const fix of fixes) {
            // Because of the triggers on FeeInstallment and FeePayment, the balances should already be correct,
            // but we fetch them here to verify.
            const balance = await tx.studentBalance.findUnique({
                where: { studentId: fix.studentId }
            });
            const student = await tx.student.findUnique({ where: { id: fix.studentId }});
            console.log(`Student ID: ${fix.studentId} (${student?.name}) - Total Fee: ₹${balance?.totalFee}, Total Paid: ₹${balance?.totalPaid}, Balance: ₹${balance?.balance}`);
        }
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
