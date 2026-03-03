
import { prisma } from '../prisma';

async function seedCounters() {
    console.log('Starting IdCounter seeding...');

    // 1. Fetch all students with a humanId
    const students = await prisma.student.findMany({
        where: { humanId: { not: null } },
        select: { humanId: true }
    });

    console.log(`Found ${students.length} students with humanId.`);

    const maxCounts: Record<string, number> = {};

    // 2. Parse and find max seq for each prefix
    // Format: PRE(3 chars) + YEAR(2 chars) + SEQ(3 digits) e.g., MTH26005
    const regex = /^([A-Z]{3}\d{2})(\d{3})$/;

    for (const s of students) {
        if (!s.humanId) continue;
        const match = s.humanId.match(regex);
        if (match) {
            const prefix = match[1];
            const num = parseInt(match[2], 10);

            if (!maxCounts[prefix] || num > maxCounts[prefix]) {
                maxCounts[prefix] = num;
            }
        }
    }

    // 3. Update IdCounter
    for (const [prefix, maxSeq] of Object.entries(maxCounts)) {
        console.log(`Setting ${prefix} to seq: ${maxSeq}`);
        await prisma.idCounter.upsert({
            where: { prefix },
            update: { seq: { set: maxSeq } }, // Use set to ensure we don't just increment
            create: { prefix, seq: maxSeq }
        });
    }

    // 4. Ensure counters exist for known prefixes if not already (optional, but good for safety)
    // If no students exist for a subject, we don't need to seed it (it will start at 1 automatically via logic).

    console.log('Seeding completed.');
}

seedCounters()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });
