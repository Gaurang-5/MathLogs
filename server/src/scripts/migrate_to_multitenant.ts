import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
    console.log('Starting Multi-Tenant Migration...');

    // 1. Create Default Institute
    const existingInstitute = await prisma.institute.findFirst();
    let instituteId = existingInstitute?.id;

    if (!existingInstitute) {
        console.log('Creating Default Institute...');
        const institute = await prisma.institute.create({
            data: {
                name: 'My Coaching Institute (Legacy)',
            }
        });
        instituteId = institute.id;
        console.log(`Created Institute: ${institute.name} (${institute.id})`);
    } else {
        console.log(`Using existing Institute: ${existingInstitute.name}`);
    }

    if (!instituteId) throw new Error("Failed to get Institute ID");

    // 2. Migrate Admins
    const admins = await prisma.admin.findMany({ where: { instituteId: null } });
    console.log(`Found ${admins.length} orphan admins.`);

    for (const admin of admins) {
        await prisma.admin.update({
            where: { id: admin.id },
            data: {
                instituteId: instituteId,
                role: 'SUPER_ADMIN'
            }
        });
    }

    // 3. Migrate Academic Years
    const years = await prisma.academicYear.findMany({ where: { instituteId: null } });
    console.log(`Found ${years.length} orphan years.`);

    for (const year of years) {
        await prisma.academicYear.update({
            where: { id: year.id },
            data: { instituteId: instituteId }
        });
    }

    // 4. Migrate Batches
    const updateBatches = await prisma.batch.updateMany({
        where: { instituteId: null },
        data: { instituteId: instituteId }
    });
    console.log(`Updated ${updateBatches.count} batches.`);

    // 5. Migrate Students
    const updateStudents = await prisma.student.updateMany({
        where: { instituteId: null },
        data: { instituteId: instituteId }
    });
    console.log(`Updated ${updateStudents.count} students.`);

    // 6. Migrate Tests
    const updateTests = await prisma.test.updateMany({
        where: { instituteId: null },
        data: { instituteId: instituteId }
    });
    console.log(`Updated ${updateTests.count} tests.`);

    console.log('Migration Complete.');
}

main()
    .catch((e) => console.error(e))
    .finally(async () => await prisma.$disconnect());
