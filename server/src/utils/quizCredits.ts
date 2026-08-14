import { prisma } from '../prisma';

export interface QuizCreditStatus {
    totalCredits: number;
    monthlyCredits: number;
    extraCredits: number;
}

export async function getOrResetQuizCredits(instituteId: string): Promise<QuizCreditStatus> {
    const institute = await prisma.institute.findUnique({
        where: { id: instituteId },
        select: { quizCredits: true }
    });

    const totalCredits = institute?.quizCredits ?? 0;

    return {
        totalCredits,
        monthlyCredits: totalCredits,
        extraCredits: 0
    };
}

export async function deductQuizCredit(instituteId: string): Promise<boolean> {
    const institute = await prisma.institute.findUnique({
        where: { id: instituteId },
        select: { quizCredits: true }
    });

    if (!institute || institute.quizCredits <= 0) {
        return false;
    }

    await prisma.institute.update({
        where: { id: instituteId },
        data: {
            quizCredits: {
                decrement: 1
            }
        }
    });

    return true;
}

export async function addPurchasedQuizCredits(instituteId: string, credits: number) {
    await prisma.institute.update({
        where: { id: instituteId },
        data: {
            quizCredits: {
                increment: credits
            }
        }
    });
}
