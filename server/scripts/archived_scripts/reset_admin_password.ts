
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    const username = 'admin';
    const newPassword = 'admin';
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const admin = await prisma.admin.findUnique({
        where: { username }
    });

    if (!admin) {
        console.log(`Admin user '${username}' not found. Creating it...`);
        // Basic creation if missing
        await prisma.admin.create({
            data: {
                username,
                password: hashedPassword
            }
        });
        console.log(`Admin created with password: ${newPassword}`);
    } else {
        await prisma.admin.update({
            where: { username },
            data: { password: hashedPassword }
        });
        console.log(`Admin password updated to: ${newPassword}`);
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
