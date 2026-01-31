
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verifyCounts() {
    console.log('🔍 Verifying Database Counts...');

    const models = [
        'admin',
        'academicYear',
        'batch',
        'student',
        'test',
        'feeInstallment',
        'mark',
        'feePayment',
        'feeRecord',
        'idCounter'
    ];

    const counts: Record<string, number> = {};

    for (const model of models) {
        // @ts-ignore
        const count = await prisma[model].count();
        counts[model] = count;
    }

    console.table(counts);
    return counts;
}

verifyCounts()
    .catch(console.error)
    .finally(async () => {
        await prisma.$disconnect();
    });
