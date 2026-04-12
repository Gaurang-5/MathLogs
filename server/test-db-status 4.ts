import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const jobs = await prisma.whatsappJob.findMany({ 
    orderBy: { createdAt: 'desc' },
    take: 10
  });
  console.table(jobs.map(j => ({ id: j.id.slice(0,8), template: j.templateId, status: j.status, err: j.error ? j.error.length : 0 })));
}
main().finally(() => prisma.$disconnect());
