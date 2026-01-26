
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    const hashedPassword = await bcrypt.hash('admin', 10);

    const admin = await prisma.admin.upsert({
        where: { username: 'admin' },
        update: {},
        create: {
            username: 'admin',
            password: hashedPassword,
        },
    });

    // Ensure default academic year exists
    if (!admin.currentAcademicYearId) {
        const currentYear = new Date().getFullYear();
        const yearName = `${currentYear}-${currentYear + 1}`;

        let academicYear = await prisma.academicYear.findUnique({
            where: {
                teacherId_name: {
                    teacherId: admin.id,
                    name: yearName
                }
            }
        });

        if (!academicYear) {
            academicYear = await prisma.academicYear.create({
                data: {
                    name: yearName,
                    teacherId: admin.id,
                    isDefault: true,
                    startDate: new Date(`${currentYear}-04-01`),
                    endDate: new Date(`${currentYear + 1}-03-31`)
                }
            });
        }

        await prisma.admin.update({
            where: { id: admin.id },
            data: { currentAcademicYearId: academicYear.id }
        });

        console.log(`Admin created: admin / admin with default year: ${yearName}`);
    } else {
        console.log('Admin already exists with academic year configured');
    }
}

main()
    .then(async () => {
        await prisma.$disconnect()
    })
    .catch(async (e) => {
        console.error(e)
        await prisma.$disconnect()
        process.exit(1)
    });
