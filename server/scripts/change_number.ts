import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const student = await prisma.student.findFirst({
    where: { humanId: 'MB-MTH26-269' }
  });

  if (!student) {
    console.log("Student not found");
    return;
  }

  const updated = await prisma.student.update({
    where: { id: student.id },
    data: { parentWhatsapp: '6398718088' }
  });

  console.log(`Successfully updated student ${updated.name} (${updated.humanId}). New number: ${updated.parentWhatsapp}`);
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
