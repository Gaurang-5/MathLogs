
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();
const EXPORT_DIR = path.join(__dirname, '../../migration-data');

const IMPORT_ORDER = [
    'admin',
    'idCounter',
    'academicYear',
    'batch',
    'student',
    'test',
    'feeInstallment',
    'mark',
    'feePayment',
    'feeRecord'
];

async function importData() {
    console.log('🚀 Starting PostgreSQL Import...');

    if (!fs.existsSync(EXPORT_DIR)) {
        throw new Error(`Export directory not found: ${EXPORT_DIR}`);
    }

    // Read manifest
    const manifestPath = path.join(EXPORT_DIR, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
        throw new Error('Manifest file not found. Run export script first.');
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    console.log(`📋 Found export from: ${manifest.timestamp}`);

    // Special handling for Admin to break circular dependency
    const adminPath = path.join(EXPORT_DIR, 'admin.json');
    let adminUpdates: { id: string, currentAcademicYearId: string | null }[] = [];

    if (fs.existsSync(adminPath)) {
        console.log('📦 Preparing Admin data (breaking circular ref)...');
        const rawAdmin = fs.readFileSync(adminPath, 'utf-8');
        const admins = JSON.parse(rawAdmin);

        // Extract the academic years to update later
        adminUpdates = admins.map((a: any) => ({
            id: a.id,
            currentAcademicYearId: a.currentAcademicYearId
        }));

        // Nullify for initial insert
        const adminsToInsert = admins.map((a: any) => ({
            ...a,
            currentAcademicYearId: null
        }));

        if (adminsToInsert.length > 0) {
            await prisma.admin.createMany({
                data: adminsToInsert,
                skipDuplicates: true
            });
            console.log(`📦 Imported ${adminsToInsert.length} Admins (without active year)`);
        }
    }

    // Import others (skipping admin since we did it)
    for (const model of IMPORT_ORDER) {
        if (model === 'admin') continue; // Handled above

        const filePath = path.join(EXPORT_DIR, `${model}.json`);
        if (!fs.existsSync(filePath)) continue;

        const rawData = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(rawData, (key, value) => {
            if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
                return new Date(value);
            }
            return value;
        });

        console.log(`📦 Importing ${model} (${data.length} rows)...`);
        if (data.length === 0) continue;

        // @ts-ignore
        await prisma[model].createMany({
            data: data,
            skipDuplicates: true
        });
    }

    // Restore Admin Links
    console.log('🔗 Restoring Admin -> AcademicYear links...');
    for (const update of adminUpdates) {
        if (update.currentAcademicYearId) {
            await prisma.admin.update({
                where: { id: update.id },
                data: { currentAcademicYearId: update.currentAcademicYearId }
            });
        }
    }

    console.log('✅ Import Complete!');
}

importData()
    .catch(e => {
        console.error('❌ Import Failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
