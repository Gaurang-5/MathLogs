import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    const phone = '9557940807';
    let admin = await prisma.admin.findUnique({
        where: { username: phone }
    });

    if (admin) {
        admin = await prisma.admin.update({
            where: { username: phone },
            data: { role: 'SUPER_ADMIN' }
        });
        console.log('Updated existing admin to SUPER_ADMIN:', admin.username);
    } else {
        const hashedPassword = await bcrypt.hash('default_superadmin_pass', 10);
        admin = await prisma.admin.create({
            data: {
                username: phone,
                password: hashedPassword,
                role: 'SUPER_ADMIN'
            }
        });
        console.log('Created new SUPER_ADMIN:', admin.username);
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
