
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const admins = await prisma.admin.findMany({
        select: { id: true, username: true, role: true }
    });
    console.table(admins);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
