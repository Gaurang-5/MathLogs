import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const studentNames = [
        "rachit goel",
        "tanya agg", // Tanya Aggarwal
        "tanya agar",
        "manan bansal",
        "nimish agarwal",
        "utsav garg"
    ];

    console.log("Looking for students to remove...");

    for (const name of studentNames) {
        const students = await prisma.student.findMany({
            where: {
                name: {
                    contains: name,
                    mode: 'insensitive'
                }
            },
            include: {
                fees: true,
                feePayments: true,
                attendanceRecords: true,
                marks: true,
                quizSubmissions: true,
                institute: true
            }
        });

        if (students.length === 0) {
            console.log(`❌ No student found with name containing: ${name}`);
            continue;
        }

        for (const student of students) {
            const hasActivity = 
                student.fees.length > 0 || 
                student.feePayments.length > 0 || 
                student.attendanceRecords.length > 0 || 
                student.marks.length > 0 || 
                student.quizSubmissions.length > 0;

            if (hasActivity) {
                await prisma.student.update({
                    where: { id: student.id },
                    data: {
                        status: 'LEFT',
                        leaveReason: 'Admin requested permanent removal but activity existed',
                        leftAt: new Date(),
                        batchId: null
                    }
                });
                console.log(`📦 Archived student ${student.name} (has activity)`);
            } else {
                await prisma.$transaction([
                    prisma.systemLog.create({
                        data: {
                            instituteId: student.instituteId,
                            action: 'STUDENT_HARD_DELETE',
                            entityName: student.name,
                            details: {
                                leaveReason: 'Admin requested permanent removal',
                                deletedAt: new Date().toISOString(),
                                studentData: {
                                    humanId: student.humanId,
                                    parentName: student.parentName,
                                    parentWhatsapp: student.parentWhatsapp
                                }
                            } as any
                        }
                    }),
                    prisma.student.delete({
                        where: { id: student.id }
                    })
                ]);
                console.log(`🗑️  Hard deleted student ${student.name} (no activity)`);
            }
        }
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
