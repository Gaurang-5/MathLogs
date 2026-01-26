
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    const password = 'password'; // Default password
    const hashedPassword = await bcrypt.hash(password, 10);

    const admin = await prisma.admin.findUnique({
        where: { username: 'admin' }
    });

    if (admin) {
        console.log('Updating existing admin password...');
        await prisma.admin.update({
            where: { username: 'admin' },
            data: { password: hashedPassword }
        });
        console.log('Admin password updated to "password" (hashed).');
    } else {
        console.log('Creating new admin...');
        await prisma.admin.create({
            data: { username: 'admin', password: hashedPassword }
        });
        console.log('Admin created with password "password".');
    }
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
