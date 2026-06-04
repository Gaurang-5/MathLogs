import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    // 1. Find the institute
    const institute = await prisma.institute.findFirst({
        where: { name: { contains: 'Manoj Bhatia', mode: 'insensitive' } }
    });

    if (!institute) {
        console.log("Institute not found");
        return;
    }
    console.log(`Institute found: ${institute.name} (ID: ${institute.id})`);

    // 2. Find the quiz "linear equation in two variables"
    const test = await prisma.test.findFirst({
        where: {
            name: { contains: 'linear equation', mode: 'insensitive' },
            instituteId: institute.id
        }
    });

    if (!test) {
        console.log("Quiz not found in Test, checking OnlineQuiz...");
        const onlineQuiz = await prisma.onlineQuiz.findFirst({
            where: {
                title: { contains: 'linear', mode: 'insensitive' },
                instituteId: institute.id
            },
            include: { questions: true }
        });
        if (onlineQuiz) {
             console.log(`OnlineQuiz found: ${onlineQuiz.title}`);
             
             console.log("\nCorrect Answers for Quiz:");
             onlineQuiz.questions.forEach((q: any, index: number) => {
                 console.log(`Q${index + 1}: ${q.correctOption}`);
             });

             // find submission
             const student = await prisma.student.findFirst({
                 where: {
                     name: { contains: 'gaurang', mode: 'insensitive' },
                     instituteId: institute.id
                 }
             });
             
             if (student) {
                const submission = await prisma.quizSubmission.findFirst({
                     where: {
                         studentId: student.id,
                         quizId: onlineQuiz.id
                     }
                });
                
                if (submission) {
                     console.log(`Submission found! Score: ${submission.score}`);
                     await prisma.quizSubmission.delete({
                         where: { id: submission.id }
                     });
                     console.log("Submission deleted!");
                } else {
                     console.log("No submission found for this student");
                }
             }
        }
    } else {
        console.log(`Test found: ${test.name} (ID: ${test.id})`);
        
        const student = await prisma.student.findFirst({
            where: {
                name: { contains: 'gaurang', mode: 'insensitive' },
                instituteId: institute.id
            }
        });

        if (student) {
            console.log(`\nStudent found: ${student.name} (ID: ${student.id})`);
            const mark = await prisma.mark.findFirst({
                where: {
                    studentId: student.id,
                    testId: test.id,
                }
            });

            if (!mark) {
                console.log("No mark found for this student and test.");
            } else {
                console.log(`Mark found with score: ${mark.score} marks`);
                await prisma.mark.delete({
                    where: { id: mark.id }
                });
                console.log("Mark successfully deleted (reset).");
            }
        }
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
