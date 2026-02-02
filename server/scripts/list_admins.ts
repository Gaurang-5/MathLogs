
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Checking Admin Users ---');
    const admins = await prisma.admin.findMany({
        select: { id: true, username: true, instituteId: true }
    });
    console.log(admins);
}

main()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
