
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const adminUser = await prisma.admin.findUnique({
        where: { username: 'admin' },
        select: { id: true, username: true, role: true }
    });
    console.log('User details:', adminUser);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
