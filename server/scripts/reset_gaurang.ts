import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const quizzes = await prisma.onlineQuiz.findMany({
        where: { title: { contains: 'linear equation', mode: 'insensitive' } }
    });
    console.log("Found quizzes:", quizzes.map(q => q.title));
    
    if (quizzes.length === 0) return console.log("No quiz found");

    const students = await prisma.student.findMany({
        where: { name: { contains: 'gaurang', mode: 'insensitive' } }
    });
    console.log("Found students:", students.map(s => s.name));
    
    if (students.length === 0) return console.log("No student found");

    const submissions = await prisma.quizSubmission.findMany({
        where: {
            studentId: { in: students.map(s => s.id) },
            quizId: { in: quizzes.map(q => q.id) },
            score: 3
        },
        include: {
            student: true,
            quiz: true
        }
    });

    console.log("Found submissions:", submissions.length);
    for (const sub of submissions) {
        console.log(`Deleting submission for ${sub.student.name} on ${sub.quiz.title} (Score: ${sub.score})`);
        await prisma.quizSubmission.delete({
            where: { id: sub.id }
        });
        console.log("Deleted.");
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
