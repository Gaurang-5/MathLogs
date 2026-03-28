import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
    console.log("Creating test student and fee record...");
    const admin = await prisma.admin.findFirst();
    if (!admin || !admin.instituteId) {
        console.log("No valid admin found.");
        return;
    }
    
    // Make sure we have a batch
    let batch = await prisma.batch.findFirst({ where: { instituteId: admin.instituteId } });
    if (!batch) {
        batch = await prisma.batch.create({
            data: {
                name: "Test Batch",
                course: "Testing 101",
                feeAmount: 10000,
                instituteId: admin.instituteId
            }
        });
    }

    const student = await prisma.student.create({
        data: {
            name: "Concurrency Test Student",
            phone: "9999999999",
            batchIds: [batch.id],
            instituteId: admin.instituteId
        }
    });

    const fee = await prisma.feeRecord.create({
        data: {
            studentId: student.id,
            totalAmount: 10000,
            dueDate: new Date(),
            status: 'PENDING',
            month: 'March 2026',
            instituteId: admin.instituteId
        }
    });

    console.log(`Student ID: ${student.id}`);
    console.log(`FeeRecord ID: ${fee.id}`);
    
    // Automatically trigger the main test script
    const { execSync } = require('child_process');
    try {
        console.log("\n--- TRIGGERING STRESS TEST ---");
        execSync(`npx ts-node src/scripts/concurrencyTest.ts ${student.id} ${fee.id}`, { stdio: 'inherit' });
    } catch (e: any) {
        console.error("Stress test failed", e.message);
    }
    
    // Cleanup
    console.log("\n--- CLEANUP ---");
    await prisma.installment.deleteMany({ where: { feeRecordId: fee.id } }); // Delete installments spawned by the test
    await prisma.feeRecord.delete({ where: { id: fee.id } });
    await prisma.student.delete({ where: { id: student.id } });
    console.log("Database restored.");
}

run();
