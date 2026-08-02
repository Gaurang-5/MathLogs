const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const studentIds = [
    'a8f51b86-fbc0-4f5e-a906-836a2fe99e22', // Ishi
    'e194a3ed-7f47-4ce6-96ac-30b9f23c0de7', // Siddhi
    'de88d8ad-9514-4ee7-8a29-a39336baa1b7', // Granth
    '1fdf20e7-4adf-4499-b37d-923656627364'  // Arnav
];

async function main() {
    for (const sid of studentIds) {
        const student = await prisma.student.findUnique({ where: { id: sid }});
        console.log('\n=======================================');
        console.log(`STUDENT: ${student.name} (${student.id})`);
        
        const balance = await prisma.studentBalance.findUnique({ where: { studentId: sid }});
        console.log(`  CURRENT BALANCE: ₹${balance.balance} (Total Fee: ₹${balance.totalFee}, Total Paid: ₹${balance.totalPaid})`);
        
        const installments = await prisma.feeInstallment.findMany({ where: { studentId: sid }});
        console.log(`  CUSTOM INSTALLMENTS:`);
        installments.forEach(i => console.log(`    - ID: ${i.id} | Name: ${i.name} | Amount: ₹${i.amount}`));
        
        const payments = await prisma.feePayment.findMany({ where: { studentId: sid }});
        console.log(`  ALL PAYMENTS:`);
        payments.forEach(p => console.log(`    - ID: ${p.id} | Amount: ₹${p.amountPaid} | For Installment: ${p.installmentId}`));
    }
}
main().catch(console.error).finally(()=>prisma.$disconnect());
