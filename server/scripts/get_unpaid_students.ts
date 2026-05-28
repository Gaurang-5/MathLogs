import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const institute = await prisma.institute.findFirst({
        where: { name: { contains: 'manoj bhatia coaching classes', mode: 'insensitive' } }
    });

    if (!institute) {
        console.log('Institute not found');
        return;
    }

    const students = await prisma.student.findMany({
        where: {
            instituteId: institute.id
        },
        include: {
            batch: {
                include: {
                    feeInstallments: true
                }
            },
            feeInstallments: true // personal fee installments
        }
    });

    const studentsWithoutAnyInstallments = [];

    for (const student of students) {
        const studentJoinDate = new Date(student.createdAt);
        
        // Batch installments that were created on or after the student joined
        const validBatchInstallments = (student.batch?.feeInstallments || []).filter(inst => 
            new Date(inst.createdAt) >= studentJoinDate
        );
        
        // Personal installments
        const validPersonalInstallments = student.feeInstallments || [];

        if (validBatchInstallments.length === 0 && validPersonalInstallments.length === 0) {
            studentsWithoutAnyInstallments.push(student);
        }
    }

    if (studentsWithoutAnyInstallments.length === 0) {
        console.log('All students have at least one fee installment.');
        return;
    }

    // Group by batch name
    const grouped: Record<string, typeof studentsWithoutAnyInstallments> = {};
    for (const s of studentsWithoutAnyInstallments) {
        const batchName = s.batch?.name || 'No Batch';
        if (!grouped[batchName]) grouped[batchName] = [];
        grouped[batchName].push(s);
    }

    for (const [batch, batchStudents] of Object.entries(grouped)) {
        console.log(`\n### ${batch}`);
        for (const s of batchStudents) {
            console.log(`- ${s.name} (${s.parentWhatsapp})`);
        }
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
