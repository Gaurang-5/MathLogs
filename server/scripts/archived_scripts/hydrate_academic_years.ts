import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Starting migration of Academic Years...');

    const admins = await prisma.admin.findMany({
        include: {
            batches: true,
            tests: true,
        }
    });

    if (admins.length === 0) {
        console.log('No admins found. Skipping migration.');
        return;
    }

    for (const admin of admins) {
        console.log(`Processing admin: ${admin.username} (${admin.id})`);

        // 1. Get or create the academic year based on current string
        const yearName = admin.currentAcademicYear || "2024-2025";

        let academicYear = await prisma.academicYear.findUnique({
            where: {
                teacherId_name: {
                    teacherId: admin.id,
                    name: yearName
                }
            }
        });

        if (!academicYear) {
            console.log(`Creating Default Academic Year: ${yearName}`);
            academicYear = await prisma.academicYear.create({
                data: {
                    name: yearName,
                    teacherId: admin.id,
                    isDefault: true,
                    startDate: new Date('2024-04-01'),
                    endDate: new Date('2025-03-31'),
                }
            });
        }

        // 2. Set Admin's current academic year ID
        console.log(`Setting active academic year for admin to ${academicYear.id}`);
        await prisma.admin.update({
            where: { id: admin.id },
            data: { currentAcademicYearId: academicYear.id }
        });

        // 3. Update Batches
        console.log(`Migrating ${admin.batches.length} batches...`);
        for (const batch of admin.batches) {
            let targetYearId = academicYear.id;

            if (batch.academicYear && batch.academicYear !== yearName) {
                console.log(`Batch ${batch.name} has specific year ${batch.academicYear}`);
                let otherYear = await prisma.academicYear.findUnique({
                    where: { teacherId_name: { teacherId: admin.id, name: batch.academicYear } }
                });
                if (!otherYear) {
                    otherYear = await prisma.academicYear.create({
                        data: { name: batch.academicYear, teacherId: admin.id }
                    });
                }
                targetYearId = otherYear.id;
            }

            await prisma.batch.update({
                where: { id: batch.id },
                data: { academicYearId: targetYearId }
            });

            // Update students in this batch
            await prisma.student.updateMany({
                where: { batchId: batch.id },
                data: { academicYearId: targetYearId }
            });
        }

        // 4. Update Tests
        console.log(`Migrating ${admin.tests.length} tests...`);
        for (const test of admin.tests) {
            let targetYearId = academicYear.id;
            if (test.academicYear && test.academicYear !== yearName) {
                // handle similarly if needed, or just default
            }

            await prisma.test.update({
                where: { id: test.id },
                data: { academicYearId: targetYearId }
            });
        }

        // 5. Orphaned Students
        // Assign to the admin's default year
        const updatedOrphans = await prisma.student.updateMany({
            where: {
                batchId: null,
                academicYearId: null
            },
            data: { academicYearId: academicYear.id }
        });
        console.log(`Migrated ${updatedOrphans.count} orphaned students.`);

    }
    console.log('Migration complete.');
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
