
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const admin = await prisma.admin.findUnique({
        where: { username: 'superadmin' }
    });
    console.log(admin);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
