import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const students = await prisma.student.findMany({
    where: {
      name: {
        contains: 'rachit',
        mode: 'insensitive'
      }
    },
    include: {
      batch: true
    }
  });

  console.log("Found rachit:", JSON.stringify(students, null, 2));
}

main().finally(() => prisma.$disconnect());
