
import { prisma } from '../prisma';

async function fixOrphanedData() {
    console.log('Checking for orphaned batches...');

    // 1. Get the main admin
    const admin = await prisma.admin.findFirst({
        where: { username: 'admin' }
    });

    if (!admin) {
        console.error('No admin found to assign data to!');
        return;
    }

    console.log(`Found admin: ${admin.username} (${admin.id})`);

    // 2. Update batches with null teacherId
    const { count } = await prisma.batch.updateMany({
        where: { teacherId: null },
        data: { teacherId: admin.id }
    });

    console.log(`Updated ${count} batches to belong to admin.`);

    // 3. Update tests with null teacherId (if any)
    const { count: testCount } = await prisma.test.updateMany({
        where: { teacherId: null },
        data: { teacherId: admin.id }
    });
    console.log(`Updated ${testCount} tests to belong to admin.`);

}

fixOrphanedData()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });
