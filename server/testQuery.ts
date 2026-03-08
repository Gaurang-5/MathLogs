import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
    const marks = await prisma.mark.findMany({
        where: { testId: 'some-test-id' },
        include: { student: true }
    });
    console.log(marks);
}
