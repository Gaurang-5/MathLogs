import {
  QuizCreditWalletError,
  consumeQuizCredits,
  getQuizCreditWallet,
  grantLifetimeQuizCredits,
  type QuizCreditWallet
} from '../services/quizCreditWalletService';

/**
 * Compatibility facade for callers that still use the former monthly/purchased
 * terminology. New code should use quizCreditWalletService directly.
 */
export interface QuizCreditStatus {
  monthlyCredits: number;
  purchasedCredits: number;
  includedCredits: number;
  lifetimeCredits: number;
  totalCredits: number;
  totalUsableCredits: number;
  includedCreditsExpireAt: Date | null;
  quizCreditsRenewAt: Date | null;
}

function toStatus(wallet: QuizCreditWallet): QuizCreditStatus {
  return {
    monthlyCredits: wallet.includedCredits,
    purchasedCredits: wallet.lifetimeCredits,
    includedCredits: wallet.includedCredits,
    lifetimeCredits: wallet.lifetimeCredits,
    totalCredits: wallet.totalUsableCredits,
    totalUsableCredits: wallet.totalUsableCredits,
    includedCreditsExpireAt: wallet.includedCreditsExpireAt,
    quizCreditsRenewAt: wallet.quizCreditsRenewAt
  };
}

export async function getOrResetQuizCredits(instituteId: string): Promise<QuizCreditStatus> {
  return toStatus(await getQuizCreditWallet(instituteId));
}

export async function deductQuizCredit(instituteId: string): Promise<{ success: boolean; totalCredits: number; error?: string }> {
  try {
    const wallet = await consumeQuizCredits(instituteId, 1);
    return { success: true, totalCredits: wallet.totalUsableCredits };
  } catch (error) {
    if (error instanceof QuizCreditWalletError) {
      const errorMessages: Record<string, string> = {
        QUIZ_PLAN_INACTIVE: 'Quiz access is inactive. Start or renew a Quiz or Enterprise plan to use quiz credits.',
        INSUFFICIENT_QUIZ_CREDITS: 'Insufficient quiz credits. Purchase extra credits or wait for your next monthly refresh.'
      };
      return { success: false, totalCredits: 0, error: errorMessages[error.message] ?? error.message };
    }
    throw error;
  }
}

export async function addPurchasedQuizCredits(instituteId: string, addedCredits: number): Promise<QuizCreditStatus> {
  return toStatus(await grantLifetimeQuizCredits({ instituteId, amount: addedCredits, source: 'MANUAL' }));
}
