
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Fixing roles...');

    // 1. Demote 'admin' to INSTITUTE_ADMIN
    try {
        const legacyAdmin = await prisma.admin.findUnique({ where: { username: 'admin' } });
        if (legacyAdmin) {
            await prisma.admin.update({
                where: { username: 'admin' },
                data: { role: 'INSTITUTE_ADMIN' }
            });
            console.log('✅ Demoted "admin" to INSTITUTE_ADMIN.');
        } else {
            console.log('ℹ️ User "admin" not found.');
        }
    } catch (e) {
        console.error('Error updating admin:', e);
    }

    // 2. Ensure 'superadmin' is SUPER_ADMIN
    try {
        const superAdmin = await prisma.admin.findUnique({ where: { username: 'superadmin' } });
        if (superAdmin) {
            if (superAdmin.role !== 'SUPER_ADMIN') {
                await prisma.admin.update({
                    where: { username: 'superadmin' },
                    data: { role: 'SUPER_ADMIN' }
                });
                console.log('✅ Promoted "superadmin" to SUPER_ADMIN.');
            } else {
                console.log('✅ "superadmin" is already SUPER_ADMIN.');
            }
        } else {
            console.log('ℹ️ User "superadmin" not found.');
        }
    } catch (e) {
        console.error('Error updating superadmin:', e);
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
