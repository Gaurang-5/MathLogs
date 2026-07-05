import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
    datasources: {
        db: {
            // Pointing directly to production for the migration script to run
            url: process.env.DATABASE_URL || "postgres://u93j7a7r6pi9tp:p3854c4b384e27084ecff0309e17d343cf5ce9ef5310565d9449bb7526a274906@c9n6qtf5jru089.cluster-czrs8kj4isg7.us-east-1.rds.amazonaws.com:5432/d22tjukcfsunko?sslmode=require"
        }
    }
});

async function main() {
    console.log("Starting FeeInstallmentAssignment backfill migration...");

    // 1. Fetch all installments
    const installments = await prisma.feeInstallment.findMany({
        include: {
            batch: {
                include: {
                    students: true
                }
            },
            payments: true
        }
    });

    console.log(`Found ${installments.length} installments to process.`);
    
    let createdCount = 0;

    for (const inst of installments) {
        // If it's a custom invoice, assign ONLY to the specific student
        if (inst.studentId) {
            try {
                await prisma.feeInstallmentAssignment.upsert({
                    where: {
                        studentId_installmentId: {
                            studentId: inst.studentId,
                            installmentId: inst.id
                        }
                    },
                    update: {},
                    create: {
                        studentId: inst.studentId,
                        installmentId: inst.id
                    }
                });
                createdCount++;
            } catch (err) {
                console.error(`Failed to assign custom invoice ${inst.id} to student ${inst.studentId}:`, err);
            }
            continue;
        }

        // If it's a global invoice, assign to eligible students
        const studentsInBatch = inst.batch.students;
        
        for (const student of studentsInBatch) {
            // Replicate the previous date-based logic OR payment presence
            const joinedBeforeOrOn = new Date(student.createdAt) <= new Date(inst.createdAt);
            const hasPaid = inst.payments.some(p => p.studentId === student.id);

            if (joinedBeforeOrOn || hasPaid) {
                try {
                    await prisma.feeInstallmentAssignment.upsert({
                        where: {
                            studentId_installmentId: {
                                studentId: student.id,
                                installmentId: inst.id
                            }
                        },
                        update: {},
                        create: {
                            studentId: student.id,
                            installmentId: inst.id
                        }
                    });
                    createdCount++;
                } catch (err) {
                    console.error(`Failed to assign global invoice ${inst.id} to student ${student.id}:`, err);
                }
            }
        }
    }

    console.log(`Migration complete. Created/Verified ${createdCount} assignments.`);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
