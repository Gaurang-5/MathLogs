
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('DATABASE_URL:', process.env.DATABASE_URL);
    const adminCount = await prisma.admin.count();
    const batchCount = await prisma.batch.count();
    const studentCount = await prisma.student.count();
    const feeInstallmentCount = await prisma.feeInstallment.count();

    console.log(`Admins: ${adminCount}`);
    console.log(`Batches: ${batchCount}`);
    console.log(`Students: ${studentCount}`);
    console.log(`Installments: ${feeInstallmentCount}`);
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
