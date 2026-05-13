import { prisma } from '../src/prisma';
import { sendFeeReminderUpiWhatsApp } from '../src/utils/whatsapp';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
    const instituteId = "43061add-0e7a-4d76-afe2-260e1b587b14";
    
    // Get institute to pass its name
    const institute = await prisma.institute.findUnique({
        where: { id: instituteId }
    });

    if (!institute) {
        console.error("Institute not found");
        return;
    }

    const students = await prisma.student.findMany({
        where: {
            instituteId,
            status: "APPROVED",
            balance: {
                balance: {
                    gt: 1000
                }
            }
        },
        include: {
            balance: true,
            batch: {
                include: { feeInstallments: true, institute: true }
            },
            feePayments: true
        }
    });

    console.log(`Found ${students.length} students total with balance > 1000`);
    
    let sentCount = 0;
    for (const student of students) {
        // Calculate breakdown
        const studentJoinDate = student.createdAt ? new Date(student.createdAt) : new Date(0);
        const paidInstallmentIds = new Set(student.feePayments.map((p: any) => p.installmentId));
        const installments = (student.batch?.feeInstallments || []).filter((inst: any) => {
            if (inst.studentId) {
                return inst.studentId === student.id;
            }
            const isAfterJoin = new Date(inst.createdAt) >= studentJoinDate;
            const hasPayment = paidInstallmentIds.has(inst.id);
            return isAfterJoin || hasPayment;
        });
        
        const breakdownLines: string[] = [];
        let totalPendingCalc = 0;

        installments.forEach(inst => {
            const paymentsForThis = student.feePayments.filter(p => p.installmentId === inst.id);
            const paidAmount = paymentsForThis.reduce((sum, p) => sum + p.amountPaid, 0);
            const remaining = inst.amount - paidAmount;

            if (remaining > 0) {
                breakdownLines.push(`- ${inst.name}: Rs. ${remaining}`);
                totalPendingCalc += remaining;
            }
        });

        const amountDue = student.balance?.balance || 0;
        if (installments.length === 0 && amountDue > 0) {
            breakdownLines.push(`- Outstanding Balance: Rs. ${amountDue}`);
            totalPendingCalc = amountDue; // Fallback to provided amount
        }

        const feeBreakupText = breakdownLines.join(' | ');
        const phoneDigits = student.parentWhatsapp!.replace(/\D/g, '').slice(-10);
        // Fallback to mathlogs.app
        const frontendUrl = process.env.FRONTEND_URL || 'https://mathlogs.app';
        const upiLink = `${frontendUrl}/pay/${student.batch?.institute?.slug}?phone=${phoneDigits}`;

        console.log(`Sending reminder to ${student.name} (${student.parentWhatsapp}) for balance ${totalPendingCalc}`);
        
        await sendFeeReminderUpiWhatsApp(student.parentWhatsapp, {
            studentName: student.name,
            batchName: student.batch?.name || "the batch",
            feeBreakup: feeBreakupText || "• Balance Due",
            totalAmount: totalPendingCalc.toLocaleString(),
            instituteName: institute.name,
            upiPaymentLink: upiLink,
            instituteId: institute.id
        });
        sentCount++;
    }
    
    console.log(`Successfully enqueued ${sentCount} detailed reminders.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
