import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const now = new Date();
    // Set availableUntil to 2 hours from now
    const until = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    const quiz = await prisma.onlineQuiz.findFirst({
        where: { title: { contains: 'Python Basics' } },
        select: { id: true, title: true, availableFrom: true, availableUntil: true }
    });

    if (!quiz) {
        console.log('❌ No quiz found with title containing "Python Basics"');
        process.exit(1);
    }

    console.log(`Found quiz: "${quiz.title}" (${quiz.id})`);
    console.log(`  Old time: ${quiz.availableFrom} → ${quiz.availableUntil}`);

    const updated = await prisma.onlineQuiz.update({
        where: { id: quiz.id },
        data: {
            availableFrom: now,
            availableUntil: until,
        },
        select: { id: true, title: true, availableFrom: true, availableUntil: true }
    });

    console.log(`✅ Updated to: ${updated.availableFrom} → ${updated.availableUntil}`);
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
