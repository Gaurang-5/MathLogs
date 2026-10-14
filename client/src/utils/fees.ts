export interface LegacyFee {
    status: string;
    amount: number;
}

export interface FeeInstallment {
    id: string;
    studentId?: string | null;
    amount: number;
    createdAt: string;
}

export interface FeePayment {
    installmentId: string;
    amountPaid: number;
}

export interface FeeAllocationStudent {
    id?: string;
    feeDecision?: string;
    enrollmentStartedAt?: string;
    feeAssignments?: { installmentId: string }[];
    createdAt?: string;
    fees: LegacyFee[];
    feePayments: FeePayment[];
}

export function getStudentJoinDate(createdAt?: string): number {
    return createdAt ? new Date(createdAt).getTime() : 0;
}

export function getInstallmentPaidMap(student: FeeAllocationStudent, installments: FeeInstallment[]): Record<string, number> {
    const genericPaid = student.fees
        ?.filter((fee) => fee.status === 'PAID')
        .reduce((sum, fee) => sum + fee.amount, 0) || 0;

    let currentBuffer = genericPaid;
    const sortedInstallments = [...installments]
        .filter(installment => isFeeInstallmentApplicable(student, installment))
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    const installmentPaidMap: Record<string, number> = {};

    sortedInstallments.forEach((installment) => {
        const directPayments = student.feePayments?.filter((payment) => payment.installmentId === installment.id) || [];
        let paid = directPayments.reduce((sum, payment) => sum + payment.amountPaid, 0);
        const remaining = installment.amount - paid;

        if (remaining > 0 && currentBuffer > 0) {
            const coverage = Math.min(remaining, currentBuffer);
            paid += coverage;
            currentBuffer -= coverage;
        }

        installmentPaidMap[installment.id] = paid;
    });

    return installmentPaidMap;
}

export function isFeeInstallmentApplicable(student: FeeAllocationStudent, installment: FeeInstallment): boolean {
    if (installment.studentId) return installment.studentId === student.id;
    if (student.feeAssignments?.some(a => a.installmentId === installment.id) || student.feePayments?.some(p => p.installmentId === installment.id)) return true;
    if (student.feeDecision && student.feeDecision !== 'LEGACY') return false;
    return new Date(installment.createdAt).getTime() >= getStudentJoinDate(student.enrollmentStartedAt || student.createdAt);
}
