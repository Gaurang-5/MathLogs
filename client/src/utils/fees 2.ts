export interface LegacyFee {
    status: string;
    amount: number;
}

export interface FeeInstallment {
    id: string;
    amount: number;
    createdAt: string;
}

export interface FeePayment {
    installmentId: string;
    amountPaid: number;
}

export interface FeeAllocationStudent {
    createdAt?: string;
    fees: LegacyFee[];
    feePayments: FeePayment[];
}

export function getStudentJoinDate(createdAt?: string): number {
    return createdAt ? new Date(createdAt).setHours(0, 0, 0, 0) : 0;
}

export function getInstallmentPaidMap(student: FeeAllocationStudent, installments: FeeInstallment[]): Record<string, number> {
    const genericPaid = student.fees
        ?.filter((fee) => fee.status === 'PAID')
        .reduce((sum, fee) => sum + fee.amount, 0) || 0;

    let currentBuffer = genericPaid;
    const studentJoinDate = getStudentJoinDate(student.createdAt);
    const sortedInstallments = [...installments]
        .filter((installment) => new Date(installment.createdAt).setHours(0, 0, 0, 0) >= studentJoinDate)
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
