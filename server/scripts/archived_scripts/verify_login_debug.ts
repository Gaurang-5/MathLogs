
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    const admin = await prisma.admin.findUnique({
        where: { username: 'admin' }
    });

    if (!admin) {
        console.log('Admin user not found!');
        return;
    }

    console.log('Admin found:', admin.username);
    const isMatch = await bcrypt.compare('admin', admin.password);
    console.log('Password "admin" matches:', isMatch);
}

main()
    .catch(e => console.error(e))
    .finally(() => prisma.$disconnect());
