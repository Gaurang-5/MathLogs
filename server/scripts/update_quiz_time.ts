import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const updated = await prisma.onlineQuiz.update({
    where: { id: '0c5c7d05-af7b-4a41-9318-1c1e1a511aa3' },
    data: { availableUntil: new Date('2026-05-30T15:30:00.000Z') }
  });
  console.log('Successfully updated quiz:', updated.title);
  console.log('New availableUntil:', updated.availableUntil);
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
