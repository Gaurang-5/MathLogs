import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const namesToFind = [
  "rachit goel",
  "tanya agarwal",
  "manan bansal",
  "nimish agarwal",
  "utsav garg"
];

async function main() {
  const students = await prisma.student.findMany({
    where: {
      OR: namesToFind.map(name => ({
        name: {
          contains: name.split(' ')[0], // Search by first name
          mode: 'insensitive'
        }
      }))
    },
    include: {
      batch: true
    }
  });

  console.log("Found students:", JSON.stringify(students, null, 2));
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
