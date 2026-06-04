import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const quizzes = await prisma.onlineQuiz.findMany({
    where: {
      title: { contains: 'Introduction to Linear Polynomials', mode: 'insensitive' }
    },
    include: { batch: true }
  });
  console.log(JSON.stringify(quizzes, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
