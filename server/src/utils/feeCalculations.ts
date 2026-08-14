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
    id?: string;
    createdAt?: string | Date | null;
    fees: LegacyFeeSnapshot[];
    feePayments: FeePaymentSnapshot[];
    feeAssignments?: { installmentId: string }[];
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
    
    const assignedIds = new Set((student.feeAssignments || []).map((a) => a.installmentId));
    const sortedInstallments = (student.batch?.feeInstallments || [])
        .filter((installment) => {
            // Custom invoice: only applies to the specific student it was created for
            if (installment.studentId) return installment.studentId === (student.id ?? null);
            // Global installment: applicable when created on/after join date, or if there
            // is already a payment/explicit assignment for it (backwards compat)
            const instTime = new Date(installment.createdAt).getTime();
            const joinTime = studentJoinDate.getTime();
            return instTime >= joinTime || paidInstallmentIds.has(installment.id) || assignedIds.has(installment.id);
        })
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        
    const globalInstallmentsTotal = sortedInstallments
        .filter((fi) => !fi.studentId)
        .reduce((sum, fi) => sum + fi.amount, 0);
        
    const customInstallmentsTotal = sortedInstallments
        .filter((fi) => fi.studentId)
        .reduce((sum, fi) => sum + fi.amount, 0);

    const totalFee = (isBatchInstallmentActive ? globalInstallmentsTotal : (student.batch?.feeAmount || 0)) + customInstallmentsTotal;

    const validInstallmentIds = new Set(sortedInstallments.map((i) => i.id));
    const paidInstallments = student.feePayments
        .filter((payment) => validInstallmentIds.has(payment.installmentId))
        .reduce((sum, payment) => sum + payment.amountPaid, 0);
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
