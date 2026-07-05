import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
    try {
        const result = await prisma.$queryRaw<any[]>`SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'balance_non_negative';`;
        console.log(result);
    } catch(err) {
        console.error(err);
    } finally {
        await prisma.$disconnect();
    }
}
run();
