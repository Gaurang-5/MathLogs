import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    const res = await prisma.$queryRaw`SELECT event_object_table, trigger_name, action_statement FROM information_schema.triggers WHERE event_object_table = 'FeePayment';`;
    console.log(res);
}
main().finally(() => prisma.$disconnect());
