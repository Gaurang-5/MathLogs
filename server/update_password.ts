
import { prisma } from './src/prisma';
import bcrypt from 'bcryptjs';

async function main() {
    const username = 'admin';
    const newPassword = 'Radhey#2026';

    try {
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        const admin = await prisma.admin.upsert({
            where: { username },
            update: { password: hashedPassword },
            create: {
                username,
                password: hashedPassword
            }
        });

        console.log(`Successfully updated password for user: ${admin.username}`);
    } catch (e) {
        console.error('Error updating password:', e);
    }
}

main();
