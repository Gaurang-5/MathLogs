export interface FeeInstallmentSnapshot {
    id: string;
    amount: number;
    createdAt: string | Date;
}

export interface FeePaymentSnapshot {
    installmentId: string;
    amountPaid: number;
}

export interface LegacyFeeSnapshot {
    status: string;
    amount: number;
}

export interface StudentFeeSnapshotInput {
    createdAt?: string | Date | null;
    fees: LegacyFeeSnapshot[];
    feePayments: FeePaymentSnapshot[];
    batch?: {
        feeAmount?: number | null;
        feeInstallments?: FeeInstallmentSnapshot[] | null;
    } | null;
}

export interface StudentFeeSnapshot {
    balance: number;
    oldestDue: Date;
}

export function calculateStudentFeeSnapshot(student: StudentFeeSnapshotInput): StudentFeeSnapshot {
    const paidSimple = student.fees
        .filter((fee) => fee.status === 'PAID')
        .reduce((sum, fee) => sum + fee.amount, 0);

    let unallocatedCash = paidSimple;

    const studentJoinDate = student.createdAt ? new Date(student.createdAt) : new Date(0);
    const sortedInstallments = (student.batch?.feeInstallments || [])
        .filter((installment) => new Date(installment.createdAt) >= studentJoinDate)
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const installmentTotal = sortedInstallments.reduce((sum, installment) => sum + installment.amount, 0);
    const totalFee = installmentTotal > 0 ? installmentTotal : (student.batch?.feeAmount || 0);

    const paidInstallments = student.feePayments.reduce((sum, payment) => sum + payment.amountPaid, 0);
    const balance = totalFee - paidSimple - paidInstallments;

    const paymentsByInstallment = new Map<string, number>();
    student.feePayments.forEach((payment) => {
        const current = paymentsByInstallment.get(payment.installmentId) || 0;
        paymentsByInstallment.set(payment.installmentId, current + payment.amountPaid);
    });

    let oldestDue = new Date();
    if (sortedInstallments.length > 0) {
        let foundOutstandingInstallment = false;

        for (const installment of sortedInstallments) {
            const paidDirectly = paymentsByInstallment.get(installment.id) || 0;
            let remainingCost = installment.amount - paidDirectly;

            if (remainingCost > 0 && unallocatedCash > 0) {
                const coverage = Math.min(remainingCost, unallocatedCash);
                remainingCost -= coverage;
                unallocatedCash -= coverage;
            }

            if (remainingCost > 0) {
                oldestDue = new Date(installment.createdAt);
                foundOutstandingInstallment = true;
                break;
            }
        }

        if (!foundOutstandingInstallment && balance > 0) {
            oldestDue = new Date();
        }
    } else {
        oldestDue = student.createdAt ? new Date(student.createdAt) : new Date();
    }

    return { balance, oldestDue };
}
