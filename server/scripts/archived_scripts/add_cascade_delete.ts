import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function addCascadeDelete() {
    console.log('🔧 Adding CASCADE delete to Mark foreign keys...');

    try {
        // Drop existing foreign key constraints
        await prisma.$executeRawUnsafe(`
      ALTER TABLE "Mark" DROP CONSTRAINT IF EXISTS "Mark_testId_fkey";
    `);

        await prisma.$executeRawUnsafe(`
      ALTER TABLE "Mark" DROP CONSTRAINT IF EXISTS "Mark_studentId_fkey";
    `);

        console.log('✅ Dropped existing constraints');

        // Re-add foreign key constraints with CASCADE delete
        await prisma.$executeRawUnsafe(`
      ALTER TABLE "Mark" ADD CONSTRAINT "Mark_testId_fkey" 
        FOREIGN KEY ("testId") REFERENCES "Test"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    `);

        await prisma.$executeRawUnsafe(`
      ALTER TABLE "Mark" ADD CONSTRAINT "Mark_studentId_fkey" 
        FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    `);

        console.log('✅ Added CASCADE delete constraints');
        console.log('🎉 Migration completed successfully!');
    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

addCascadeDelete()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    });
