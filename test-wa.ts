import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const jobs = await prisma.whatsappJob.findMany({ orderBy: { createdAt: 'desc' }, take: 10 });
  console.log(JSON.stringify(jobs, null, 2));
}
main().finally(() => prisma.$disconnect());
