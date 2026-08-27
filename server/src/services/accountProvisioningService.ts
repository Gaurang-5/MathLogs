import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { includedCreditPeriod } from '../domain/plans/entitlements';
import { requireMarketplaceCity } from '../domain/marketplace/location';

export type ProvisioningInput = {
  kind: 'PUBLIC' | 'INVITE';
  onboardingLinkId?: string;
  instituteName: string;
  ownerName: string;
  phone: string;
  email: string;
  marketplace?: {
    listed?: boolean;
    city?: string;
    area?: string;
    subjects?: string[];
    googleMapsUrl?: string;
  };
};

export type ProvisioningActivation =
  | { kind: 'TRIAL'; plan: 'QUIZ' | 'ENTERPRISE'; startsAt: Date; endsAt: Date; ownerIdentityHash: string }
  | { kind: 'PAID'; plan: 'QUIZ' | 'ENTERPRISE'; billingCycle: 'MONTHLY' | 'YEARLY'; startsAt: Date; endsAt: Date }
  | { kind: 'MARKETPLACE'; startsAt: Date };

export class AccountProvisioningError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccountProvisioningError';
  }
}

function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-');
}

async function createUniqueSlug(tx: Prisma.TransactionClient, name: string): Promise<string> {
  let baseSlug = slugify(name);
  if (!baseSlug) baseSlug = 'coaching';
  let uniqueSlug = baseSlug;
  let count = 1;
  while (await tx.institute.findUnique({ where: { slug: uniqueSlug } })) {
    uniqueSlug = `${baseSlug}-${count++}`;
  }
  return uniqueSlug;
}

export async function provisionInstitute(
  tx: Prisma.TransactionClient,
  input: ProvisioningInput,
  activation: ProvisioningActivation
): Promise<{ instituteId: string; inviteToken: string | null; isExisting: boolean }> {
  const now = activation.startsAt || new Date();

  // Check for existing institute with same phone
  if (input.phone) {
    const existing = await tx.institute.findFirst({
      where: { phoneNumber: input.phone },
      include: {
        invites: {
          where: { isUsed: false, expiresAt: { gt: new Date() } },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (existing) {
      let inviteToken = existing.invites[0]?.token ?? null;
      if (!inviteToken) {
        const tokenString = crypto.randomBytes(24).toString('hex');
        const invite = await tx.inviteToken.create({
          data: {
            token: tokenString,
            instituteId: existing.id,
            expiresAt: new Date(Date.now() + 7 * 86_400_000)
          }
        });
        inviteToken = invite.token;
      }
      return { instituteId: existing.id, inviteToken, isExisting: true };
    }
  }

  if (input.kind === 'INVITE' && input.onboardingLinkId) {
    const linkClaim = await tx.adminOnboardingLink.updateMany({
      where: {
        id: input.onboardingLinkId,
        status: 'PENDING',
        expiresAt: { gt: now }
      },
      data: {
        status: 'PROCESSING'
      }
    });
    if (linkClaim.count !== 1) {
      throw new AccountProvisioningError('ONBOARDING_LINK_NOT_AVAILABLE');
    }
  }

  const uniqueSlug = await createUniqueSlug(tx, input.instituteName);

  let planData: Record<string, any>;

  if (activation.kind === 'TRIAL') {
    const period = includedCreditPeriod({ planStartDate: now }, now);
    planData = {
      plan: activation.plan,
      billingCycle: 'MONTHLY',
      planStartDate: now,
      planExpiryDate: activation.endsAt,
      trialStartedAt: now,
      trialEndsAt: activation.endsAt,
      trialUsedAt: now,
      marketplaceAccessGrantedAt: now,
      includedQuizCredits: 5,
      quizCredits: 5,
      lifetimeQuizCredits: 0,
      includedQuizCreditsExpireAt: period.includedQuizCreditsExpireAt,
      quizCreditsRenewAt: period.quizCreditsRenewAt,
      canonicalPlanMigratedAt: now
    };
  } else if (activation.kind === 'PAID') {
    const period = includedCreditPeriod({ planStartDate: now }, now);
    planData = {
      plan: activation.plan,
      billingCycle: activation.billingCycle,
      planStartDate: now,
      planExpiryDate: activation.endsAt,
      trialStartedAt: null,
      trialEndsAt: null,
      marketplaceAccessGrantedAt: now,
      includedQuizCredits: 5,
      quizCredits: 5,
      lifetimeQuizCredits: 0,
      includedQuizCreditsExpireAt: period.includedQuizCreditsExpireAt,
      quizCreditsRenewAt: period.quizCreditsRenewAt,
      canonicalPlanMigratedAt: now
    };
  } else {
    // MARKETPLACE
    planData = {
      plan: 'MARKETPLACE',
      billingCycle: 'ONE_TIME',
      planStartDate: now,
      planExpiryDate: null,
      trialStartedAt: null,
      trialEndsAt: null,
      marketplaceAccessGrantedAt: now,
      includedQuizCredits: 0,
      quizCredits: 0,
      lifetimeQuizCredits: 0,
      canonicalPlanMigratedAt: now
    };
  }

  const institute = await tx.institute.create({
    data: {
      name: input.instituteName,
      teacherName: input.ownerName || '',
      phoneNumber: input.phone || '',
      publicPhone: input.phone || null,
      whatsappPhone: input.phone || null,
      email: input.email || null,
      slug: uniqueSlug,
      isPubliclyListed: false,
      isExclusive: false,
      city: input.marketplace?.city ? requireMarketplaceCity(input.marketplace.city) : null,
      area: input.marketplace?.area ? input.marketplace.area.trim() : null,
      subjectsOffered: Array.isArray(input.marketplace?.subjects) ? input.marketplace.subjects : [],
      googleMapsUrl: input.marketplace?.googleMapsUrl ? input.marketplace.googleMapsUrl.trim() : null,
      config: {
        requiresGrades: true,
        allowedClasses: ['Class 6', 'Class 7', 'Class 8', 'Class 9', 'Class 10', 'Class 11', 'Class 12'],
        subjects: ['Mathematics', 'Science', 'Physics', 'Chemistry', 'Biology', 'English']
      },
      ...planData
    }
  });

  if (activation.kind === 'TRIAL') {
    try {
      await tx.planTrialClaim.create({
        data: {
          instituteId: institute.id,
          ownerIdentityHash: activation.ownerIdentityHash,
          plan: activation.plan,
          claimedAt: now,
          endsAt: activation.endsAt
        }
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AccountProvisioningError('TRIAL_ALREADY_USED');
      }
      throw error;
    }
  }

  const tokenString = crypto.randomBytes(24).toString('hex');
  const invite = await tx.inviteToken.create({
    data: {
      token: tokenString,
      instituteId: institute.id,
      expiresAt: new Date(Date.now() + 7 * 86_400_000)
    }
  });

  if (input.kind === 'INVITE' && input.onboardingLinkId) {
    await tx.adminOnboardingLink.update({
      where: { id: input.onboardingLinkId },
      data: {
        status: 'USED',
        instituteId: institute.id
      }
    });
  }

  return { instituteId: institute.id, inviteToken: invite.token, isExisting: false };
}
