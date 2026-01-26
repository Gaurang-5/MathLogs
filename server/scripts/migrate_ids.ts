
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const getCourseCode = (subject: string | null) => {
    if (!subject) return 'GEN';
    const map: Record<string, string> = {
        'Mathematics': 'MTH', 'Maths': 'MTH', 'Math': 'MTH',
        'Physics': 'PHY',
        'Chemistry': 'CHE',
        'Biology': 'BIO',
        'English': 'ENG',
        'Science': 'SCI',
        'History': 'HIS',
        'Geography': 'GEO'
    };
    return map[subject] || subject.substring(0, 3).toUpperCase();
};

async function main() {
    console.log('Starting migration...');
    // We fetch ALL students, but we only really care about those with batches for the ID logic.
    // However, we must rename ALL to temp to avoid collision if they occupy a slot we need? 
    // Yes.

    const students = await prisma.student.findMany({
        include: { batch: true },
        orderBy: { createdAt: 'asc' } // Critical: preserves chronological order
    });

    console.log(`Found ${students.length} students.`);

    // Step 1: Temporary Rename to avoid collision
    console.log('Backing up IDs...');
    for (const s of students) {
        if (s.humanId && !s.humanId.startsWith('TEMP_')) {
            await prisma.student.update({
                where: { id: s.id },
                data: { humanId: `TEMP_${s.id}` }
            });
        }
    }
    console.log('Temporary IDs assigned.');

    // Step 2: Assign new IDs
    const counters: Record<string, number> = {};

    for (const s of students) {
        if (!s.batch) {
            // If no batch, we can't generate proper ID. Leave as is (TEMP) or null?
            // Prompt says "please change existing ids also".
            // If they have no batch, we can't determine Subject.
            // We'll skip them or set to NULL.
            // But humanId is optional unique.
            // Let's print warning.
            console.warn(`Skipping student ${s.name} (No Batch)`);
            continue;
        }

        const subject = s.batch.subject || '';
        const code = getCourseCode(subject);
        // Use createdAt year for stability
        const yy = s.createdAt.getFullYear().toString().slice(-2);
        const prefix = `${code}${yy}`;

        if (!counters[prefix]) counters[prefix] = 1;
        const seq = counters[prefix]++;

        const newId = `${prefix}${seq.toString().padStart(3, '0')}`;

        console.log(`Updating ${s.name} -> ${newId}`);

        await prisma.student.update({
            where: { id: s.id },
            data: { humanId: newId }
        });
    }

    console.log('Migration complete.');
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
