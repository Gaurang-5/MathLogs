const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const jobs = await prisma.whatsappJob.findMany({
    orderBy: { createdAt: 'desc' },
    take: 4,
    select: { id: true, status: true, templateId: true, error: true }
  });
  console.log(jobs);
}

main().finally(() => prisma.$disconnect());
