import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const students = await prisma.student.findMany({
    where: {
      OR: [
        { name: { contains: 'goel', mode: 'insensitive' } },
        { name: { contains: 'goyal', mode: 'insensitive' } }
      ]
    },
    include: {
      batch: true
    }
  });

  console.log("Found goel/goyal:", JSON.stringify(students, null, 2));
}

main().finally(() => prisma.$disconnect());
