
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();
const EXPORT_DIR = path.join(__dirname, '../../migration-data');

async function exportData() {
    console.log('🚀 Starting SQLite Export...');

    if (!fs.existsSync(EXPORT_DIR)) {
        fs.mkdirSync(EXPORT_DIR, { recursive: true });
    }

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
        console.log(`📦 Exporting ${model}...`);
        // @ts-ignore
        const data = await prisma[model].findMany();
        counts[model] = data.length;

        fs.writeFileSync(
            path.join(EXPORT_DIR, `${model}.json`),
            JSON.stringify(data, null, 2)
        );
    }

    // Save metadata/manifest
    fs.writeFileSync(
        path.join(EXPORT_DIR, 'manifest.json'),
        JSON.stringify({ timestamp: new Date(), counts }, null, 2)
    );

    console.log('✅ Export Complete!');
    console.table(counts);
}

exportData()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
