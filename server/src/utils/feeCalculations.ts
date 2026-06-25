export interface FeeInstallmentSnapshot {
    id: string;
    amount: number;
    createdAt: string | Date;
    studentId?: string | null;
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
    const paidInstallmentIds = new Set(student.feePayments.map((p) => p.installmentId));
    
    const isBatchInstallmentActive = (student.batch?.feeInstallments || []).some((fi) => !fi.studentId);
    
    // Valid installments: global ones after join date OR have payments, plus custom ones for this student
    const sortedInstallments = (student.batch?.feeInstallments || [])
        .filter((installment) => {
            if (installment.studentId) return true; // custom invoice
            const isAfterJoin = new Date(installment.createdAt) >= studentJoinDate;
            const hasPayment = paidInstallmentIds.has(installment.id);
            return isAfterJoin || hasPayment;
        })
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        
    const globalInstallmentsTotal = sortedInstallments
        .filter((fi) => !fi.studentId)
        .reduce((sum, fi) => sum + fi.amount, 0);
        
    const customInstallmentsTotal = sortedInstallments
        .filter((fi) => fi.studentId)
        .reduce((sum, fi) => sum + fi.amount, 0);

    const totalFee = (isBatchInstallmentActive ? globalInstallmentsTotal : (student.batch?.feeAmount || 0)) + customInstallmentsTotal;

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
