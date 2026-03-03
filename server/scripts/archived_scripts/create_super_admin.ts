
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    const username = 'superadmin';
    const password = 'SuperPassword2025!'; // Distinct, strong password

    console.log(`Checking for existing Super Admin: ${username}...`);

    const existing = await prisma.admin.findUnique({
        where: { username }
    });

    if (existing) {
        console.log('✅ Super Admin already exists.');

        // Optional: Reset role to ensure it is correct
        if (existing.role !== 'SUPER_ADMIN') {
            await prisma.admin.update({
                where: { id: existing.id },
                data: { role: 'SUPER_ADMIN' }
            });
            console.log('🔄 Updated user role to SUPER_ADMIN.');
        }
        return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const admin = await prisma.admin.create({
        data: {
            username,
            password: hashedPassword,
            role: 'SUPER_ADMIN',
            currentAcademicYear: '2025-2026',
            // Note: Super Admin might not belong to any institute, or a special 'Platform' institute
            // For now, we leave instituteId null if schema allows, or create a dummy one.
            // Based on schema, instituteId IS nullable for Admin.
        }
    });

    console.log(`
    🎉 Super Admin Created Successfully!
    -----------------------------------
    Username: ${username}
    Password: ${password}
    -----------------------------------
    Use these credentials to login at /login.
    `);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
