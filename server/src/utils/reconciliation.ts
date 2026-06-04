import { prisma } from '../prisma';
import { calculateStudentFeeSnapshot } from './feeCalculations';
import { secureLogger } from './secureLogger';

export async function runNightlyReconciliation() {
    try {
        secureLogger.info('[Reconciliation] Starting nightly StudentBalance reconciliation...');
        let driftCount = 0;

        // Fetch all active/approved students
        const students = await prisma.student.findMany({
            where: { status: 'APPROVED' },
            include: {
                balance: true,
                fees: { where: { status: 'PAID' } },
                feePayments: true,
                batch: {
                    include: {
                        feeInstallments: true
                    }
                }
            }
        });

        for (const student of students) {
            if (!student.balance) continue;

            const snapshot = calculateStudentFeeSnapshot(student as any);
            const rawBalance = snapshot.balance;
            const dbBalance = student.balance.balance;

            const drift = Math.abs(rawBalance - dbBalance);
            if (drift > 1) {
                driftCount++;
                console.error(`[Reconciliation] DRIFT DETECTED for Student ${student.id} (${student.name}): DB Balance = ${dbBalance}, Raw Sum = ${rawBalance}, Drift = ${drift}`);
                
                // Optionally trigger the DB function to fix it
                await prisma.$executeRaw`SELECT calculate_student_balance(${student.id})`;
            }
        }

        secureLogger.info(`[Reconciliation] Finished. Found ${driftCount} accounts with drift.`);
    } catch (err) {
        console.error('[Reconciliation] Error running nightly job:', err);
    }
}
