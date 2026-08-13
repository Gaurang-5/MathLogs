import { prisma } from '../prisma';

export interface QuizCreditStatus {
  monthlyCredits: number;
  purchasedCredits: number;
  totalCredits: number;
}

/**
 * Helper to ensure monthly reset happens once per calendar month YYYY-MM.
 * Every institute receives 5 monthly quiz credits per month.
 * Purchased credits are lifetime valid and never reset.
 */
export async function getOrResetQuizCredits(instituteId: string): Promise<QuizCreditStatus> {
  const institute = await prisma.institute.findUnique({ where: { id: instituteId } });
  if (!institute) return { monthlyCredits: 0, purchasedCredits: 0, totalCredits: 0 };

  const currentMonth = new Date().toISOString().slice(0, 7); // e.g., "2026-08"
  const config = (institute.config as any) || {};

  let monthlyCredits = typeof config.monthlyQuizCredits === 'number' ? config.monthlyQuizCredits : 5;
  let purchasedCredits = typeof config.purchasedQuizCredits === 'number' ? config.purchasedQuizCredits : (institute.quizCredits || 0);
  const lastResetMonth = config.lastCreditResetMonth;

  let needsUpdate = false;

  // Monthly reset: if new month or reset not tracked yet
  if (lastResetMonth !== currentMonth) {
    monthlyCredits = 5;
    config.lastCreditResetMonth = currentMonth;
    config.monthlyQuizCredits = monthlyCredits;
    config.purchasedQuizCredits = purchasedCredits;
    needsUpdate = true;
  }

  const totalCredits = monthlyCredits + purchasedCredits;

  if (needsUpdate || institute.quizCredits !== totalCredits) {
    await prisma.institute.update({
      where: { id: instituteId },
      data: {
        config: config,
        quizCredits: totalCredits
      }
    });
  }

  return { monthlyCredits, purchasedCredits, totalCredits };
}

/**
 * Deducts 1 quiz credit when a quiz is published (non-draft).
 * Deducts from monthly credits first, then purchased lifetime credits.
 */
export async function deductQuizCredit(instituteId: string): Promise<{ success: boolean; totalCredits: number; error?: string }> {
  const status = await getOrResetQuizCredits(instituteId);
  if (status.totalCredits <= 0) {
    return {
      success: false,
      totalCredits: 0,
      error: 'Insufficient quiz credits. You receive 5 free quiz credits every month, or you can purchase lifetime credit top-ups.'
    };
  }

  const institute = await prisma.institute.findUnique({ where: { id: instituteId } });
  if (!institute) return { success: false, totalCredits: 0, error: 'Institute not found' };

  const config = (institute.config as any) || {};
  let monthlyCredits = status.monthlyCredits;
  let purchasedCredits = status.purchasedCredits;

  if (monthlyCredits > 0) {
    monthlyCredits -= 1;
  } else if (purchasedCredits > 0) {
    purchasedCredits -= 1;
  }

  config.monthlyQuizCredits = monthlyCredits;
  config.purchasedQuizCredits = purchasedCredits;
  const newTotal = monthlyCredits + purchasedCredits;

  await prisma.institute.update({
    where: { id: instituteId },
    data: {
      config: config,
      quizCredits: newTotal
    }
  });

  return { success: true, totalCredits: newTotal };
}

/**
 * Adds purchased lifetime credits (valid for life).
 */
export async function addPurchasedQuizCredits(instituteId: string, addedCredits: number): Promise<QuizCreditStatus> {
  const status = await getOrResetQuizCredits(instituteId);
  const institute = await prisma.institute.findUnique({ where: { id: instituteId } });
  if (!institute) return status;

  const config = (institute.config as any) || {};
  const newPurchased = status.purchasedCredits + addedCredits;
  config.purchasedQuizCredits = newPurchased;
  const newTotal = status.monthlyCredits + newPurchased;

  await prisma.institute.update({
    where: { id: instituteId },
    data: {
      config: config,
      quizCredits: newTotal
    }
  });

  return { monthlyCredits: status.monthlyCredits, purchasedCredits: newPurchased, totalCredits: newTotal };
}
