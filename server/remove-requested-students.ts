import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const studentIds = [
  "7a736f8f-f007-4103-bbbb-bc6575e7fe9c", // Rishit Goel (assuming Rachit Goel)
  "151ff7b6-e55e-4158-bc9f-bc21c5b4a261", // Tanya Aggarwal
  "1b2df25f-3b79-4484-9d91-1ff667c7120a", // Manan Bansal
  "959201b9-13b9-49bf-b022-536e374b14be", // Nimish Agarwal
  "2b1e00eb-9791-4ba4-9165-edc8bc326ce0"  // Utsav Garg
];

const leaveReason = "Requested by Admin to permanently remove data";

async function main() {
  for (const id of studentIds) {
    const student = await prisma.student.findUnique({
      where: { id },
      include: {
        fees: true,
        feePayments: true,
        attendanceRecords: true,
        marks: true,
        quizSubmissions: true
      }
    });

    if (!student) {
      console.log(`Student ${id} not found.`);
      continue;
    }

    const hasActivity = 
      student.fees.length > 0 || 
      student.feePayments.length > 0 || 
      student.attendanceRecords.length > 0 || 
      student.marks.length > 0 || 
      student.quizSubmissions.length > 0;

    if (hasActivity) {
      console.log(`Archiving ${student.name}... (Has financial/attendance data)`);
      await prisma.student.update({
        where: { id },
        data: {
          status: 'LEFT',
          leaveReason,
          leftAt: new Date(),
          batchId: null
        }
      });
    } else {
      console.log(`Hard Deleting ${student.name}...`);
      await prisma.$transaction([
        prisma.systemLog.create({
          data: {
            instituteId: student.instituteId || 'system',
            action: 'STUDENT_HARD_DELETE',
            entityName: student.name,
            details: {
              leaveReason,
              deletedAt: new Date(),
              studentData: {
                humanId: student.humanId,
                parentName: student.parentName,
                parentWhatsapp: student.parentWhatsapp
              }
            }
          }
        }),
        prisma.student.delete({
          where: { id }
        })
      ]);
    }
  }
  console.log("Process complete.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
