import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../prisma';
import { planSubscriptionProvider, type PlanSubscriptionProvider } from './planSubscriptionProvider';
import { provisionInstitute, type ProvisioningInput } from './accountProvisioningService';
import { cancelSatisfiedNotifications, scheduleLifecycleNotifications, type PlanNotificationEvent } from './planNotificationService';

export type SubscriptionEvent =
  | { kind: 'AUTHENTICATED'; providerSubscriptionId: string; startsAt?: Date; currentStart?: Date; currentEnd?: Date; rawEventId?: string; now?: Date }
  | { kind: 'ACTIVATED'; providerSubscriptionId: string; currentStart: Date; currentEnd: Date; rawEventId?: string; now?: Date }
  | { kind: 'CHARGED'; providerSubscriptionId: string; paymentId: string; amountPaise: number; providerPlanId?: string; currency?: string; feePaise?: number; taxPaise?: number; currentStart: Date; currentEnd: Date; rawEventId?: string; now?: Date }
  | { kind: 'PENDING'; providerSubscriptionId: string; paymentId?: string; amountPaise?: number; rawEventId?: string; now?: Date }
  | { kind: 'CHARGE_FAILED'; providerSubscriptionId: string; paymentId?: string; amountPaise?: number; rawEventId?: string; now?: Date }
  | { kind: 'HALTED'; providerSubscriptionId: string; rawEventId?: string; now?: Date }
  | { kind: 'CANCELLED'; providerSubscriptionId: string; cancelAtPeriodEnd: boolean; endedAt?: Date; rawEventId?: string; now?: Date }
  | { kind: 'COMPLETED'; providerSubscriptionId: string; endedAt?: Date; rawEventId?: string; now?: Date }
  | { kind: 'EXPIRED'; providerSubscriptionId: string; endedAt?: Date; rawEventId?: string; now?: Date };

export class PlanSubscriptionLifecycleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlanSubscriptionLifecycleError';
  }
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export interface PlanSubscriptionLifecycleService {
  applySubscriptionEvent(event: SubscriptionEvent): Promise<void>;
  cancelSubscriptionForInstitute(input: {
    instituteId: string;
    now?: Date;
  }): Promise<{ cancelled: boolean; cancelAtPeriodEnd: boolean; effectiveUntil: Date | null }>;
}

export function createPlanSubscriptionLifecycleService(options?: {
  prisma?: PrismaClient;
  provider?: PlanSubscriptionProvider;
  notifications?: {
    schedule(input: { instituteId: string; event: PlanNotificationEvent; effectiveAt: Date; expiryAt?: Date | null; reference?: string }): Promise<unknown>;
    cancelSatisfied(instituteId: string, now?: Date): Promise<unknown>;
  };
}): PlanSubscriptionLifecycleService {
  const client = options?.prisma || defaultPrisma;
  const provider = options?.provider || planSubscriptionProvider;
  const notifications = options?.notifications || (client === defaultPrisma ? {
    schedule: scheduleLifecycleNotifications,
    cancelSatisfied: cancelSatisfiedNotifications
  } : null);

  async function executeTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await client.$transaction(fn, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 120_000,
          timeout: 120_000
        });
      } catch (error) {
        const retryable = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
        if (!retryable || attempt === 2) throw error;
      }
    }
    throw new PlanSubscriptionLifecycleError('TRANSACTION_RETRY_EXHAUSTED');
  }

  return {
    async applySubscriptionEvent(event: SubscriptionEvent): Promise<void> {
      const now = event.now || new Date();

      const transition = await executeTransaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${event.providerSubscriptionId}))`;
        const planSub = await tx.planSubscription.findUnique({
          where: { providerSubscriptionId: event.providerSubscriptionId }
        });

        if (!planSub) {
          throw new PlanSubscriptionLifecycleError('PLAN_SUBSCRIPTION_NOT_FOUND');
        }

        if (event.rawEventId) {
          await tx.billingWebhookEvent.updateMany({
            where: { providerEventId: event.rawEventId },
            data: { planSubscriptionId: planSub.id, instituteId: planSub.instituteId, status: 'PROCESSED', processedAt: now, processingError: null }
          });
        }

        switch (event.kind) {
          case 'AUTHENTICATED': {
            if (['AUTHENTICATED', 'ACTIVE'].includes(planSub.status)) {
              return { changed: false, previousStatus: planSub.status, wasFirstCharge: false };
            }

            const trialEndsAt = event.startsAt || planSub.intendedStartAt || addDays(now, 14);

            if (planSub.trialEligible) {
              if (planSub.instituteId) {
                const currentInst = await tx.institute.findUniqueOrThrow({
                  where: { id: planSub.instituteId }
                });

                await tx.institute.update({
                  where: { id: planSub.instituteId },
                  data: {
                    plan: planSub.plan,
                    billingCycle: 'MONTHLY',
                    planStartDate: now,
                    planExpiryDate: trialEndsAt,
                    trialStartedAt: now,
                    trialEndsAt,
                    trialUsedAt: now,
                    marketplaceAccessGrantedAt: currentInst.marketplaceAccessGrantedAt || now,
                    includedQuizCredits: 5,
                    quizCredits: 5 + (currentInst.lifetimeQuizCredits || 0),
                    includedQuizCreditsExpireAt: trialEndsAt,
                    quizCreditsRenewAt: trialEndsAt,
                    canonicalPlanMigratedAt: now,
                    razorpaySubscriptionId: planSub.providerSubscriptionId
                  }
                });

                try {
                  await tx.planTrialClaim.create({
                    data: {
                      instituteId: planSub.instituteId,
                      ownerIdentityHash: planSub.ownerIdentityHash,
                      plan: planSub.plan,
                      claimedAt: now,
                      endsAt: trialEndsAt
                    }
                  });
                } catch (err) {
                  if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) {
                    throw err;
                  }
                }
              } else if (planSub.provisioningData) {
                const provisioned = await provisionInstitute(
                  tx,
                  planSub.provisioningData as unknown as ProvisioningInput,
                  {
                    kind: 'TRIAL',
                    plan: planSub.plan as 'QUIZ' | 'ENTERPRISE',
                    startsAt: now,
                    endsAt: trialEndsAt,
                    ownerIdentityHash: planSub.ownerIdentityHash
                  }
                );

                await tx.planSubscription.update({
                  where: { id: planSub.id },
                  data: { instituteId: provisioned.instituteId }
                });
              }
            } else {
              // Not trial eligible
              if (planSub.instituteId) {
                await tx.institute.update({
                  where: { id: planSub.instituteId },
                  data: { razorpaySubscriptionId: planSub.providerSubscriptionId }
                });
              } else if (planSub.provisioningData) {
                const provisioned = await provisionInstitute(
                  tx,
                  planSub.provisioningData as unknown as ProvisioningInput,
                  {
                    kind: 'MARKETPLACE',
                    startsAt: now
                  }
                );

                await tx.planSubscription.update({
                  where: { id: planSub.id },
                  data: { instituteId: provisioned.instituteId }
                });
              }
            }

            await tx.planSubscription.update({
              where: { id: planSub.id },
              data: {
                status: 'AUTHENTICATED',
                trialClaimedAt: planSub.trialEligible ? now : null,
                currentPeriodStart: event.currentStart || null,
                currentPeriodEnd: event.currentEnd || null,
                nextChargeAt: trialEndsAt
              }
            });
            break;
          }

          case 'ACTIVATED': {
            if (planSub.lastChargedAt && event.currentEnd <= (planSub.currentPeriodEnd || planSub.lastChargedAt)) {
              return { changed: false, previousStatus: planSub.status, wasFirstCharge: false };
            }
            await tx.planSubscription.update({
              where: { id: planSub.id },
              data: {
                status: 'ACTIVE',
                currentPeriodStart: event.currentStart,
                currentPeriodEnd: event.currentEnd,
                nextChargeAt: event.currentEnd
              }
            });
            break;
          }

          case 'CHARGED': {
            if (
              event.amountPaise !== planSub.amountPaise ||
              event.currency !== planSub.currency ||
              event.providerPlanId !== planSub.providerPlanId
            ) {
              throw new PlanSubscriptionLifecycleError('SUBSCRIPTION_CHARGE_BINDING_MISMATCH');
            }

            const existingCharge = await tx.planSubscriptionCharge.findUnique({
              where: { providerPaymentId: event.paymentId }
            });

            if (existingCharge) {
              if (
                existingCharge.planSubscriptionId !== planSub.id ||
                existingCharge.amountPaise !== event.amountPaise ||
                existingCharge.currency !== event.currency ||
                existingCharge.periodStart.getTime() !== event.currentStart.getTime() ||
                existingCharge.periodEnd.getTime() !== event.currentEnd.getTime()
              ) {
                throw new PlanSubscriptionLifecycleError('SUBSCRIPTION_CHARGE_REPLAY_MISMATCH');
              }
              return { changed: false, previousStatus: planSub.status, wasFirstCharge: false };
            }

            if (planSub.currentPeriodEnd && event.currentEnd <= planSub.currentPeriodEnd) {
              throw new PlanSubscriptionLifecycleError('SUBSCRIPTION_CHARGE_PERIOD_REPLAY');
            }

            await tx.planSubscriptionCharge.create({
              data: {
                planSubscriptionId: planSub.id,
                providerPaymentId: event.paymentId,
                amountPaise: event.amountPaise,
                currency: event.currency,
                periodStart: event.currentStart,
                periodEnd: event.currentEnd,
                creditedAt: now
              }
            });

            let chargedInstituteId = planSub.instituteId;
            if (!chargedInstituteId) {
              if (!planSub.provisioningData) {
                throw new PlanSubscriptionLifecycleError('INSTITUTE_PROVISIONING_DATA_MISSING');
              }

              const provisioned = await provisionInstitute(
                tx,
                planSub.provisioningData as unknown as ProvisioningInput,
                {
                  kind: 'PAID',
                  plan: planSub.plan as 'QUIZ' | 'ENTERPRISE',
                  billingCycle: 'MONTHLY',
                  startsAt: event.currentStart,
                  endsAt: event.currentEnd
                }
              );
              chargedInstituteId = provisioned.instituteId;

              if (planSub.trialEligible) {
                try {
                  await tx.planTrialClaim.create({
                    data: {
                      instituteId: chargedInstituteId,
                      ownerIdentityHash: planSub.ownerIdentityHash,
                      plan: planSub.plan,
                      claimedAt: now,
                      endsAt: event.currentStart
                    }
                  });
                } catch (err) {
                  if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) {
                    throw err;
                  }
                }
              }
            }

            await tx.planSubscription.update({
              where: { id: planSub.id },
              data: {
                instituteId: chargedInstituteId,
                status: 'ACTIVE',
                firstChargedAt: planSub.firstChargedAt || now,
                lastChargedAt: now,
                currentPeriodStart: event.currentStart,
                currentPeriodEnd: event.currentEnd,
                nextChargeAt: event.currentEnd,
                graceEndsAt: null,
                paymentFailedAt: null
              }
            });

            if (chargedInstituteId) {
              const currentInst = await tx.institute.findUniqueOrThrow({
                where: { id: chargedInstituteId }
              });

              await tx.institute.update({
                where: { id: chargedInstituteId },
                data: {
                  plan: planSub.plan,
                  billingCycle: 'MONTHLY',
                  planStartDate: planSub.firstChargedAt || now,
                  planExpiryDate: event.currentEnd,
                  marketplaceAccessGrantedAt: currentInst.marketplaceAccessGrantedAt || now,
                  razorpaySubscriptionId: planSub.providerSubscriptionId,
                  includedQuizCredits: 5,
                  quizCredits: 5 + (currentInst.lifetimeQuizCredits || 0),
                  includedQuizCreditsExpireAt: event.currentEnd,
                  quizCreditsRenewAt: event.currentEnd,
                  canonicalPlanMigratedAt: now
                }
              });
            }
            break;
          }

          case 'PENDING':
          case 'CHARGE_FAILED': {
            if (planSub.lastChargedAt && now <= planSub.lastChargedAt) {
              return { changed: false, previousStatus: planSub.status, wasFirstCharge: false };
            }
            const failureGraceEnd = addDays(now, 3);
            const graceEndsAt = planSub.currentPeriodEnd && planSub.currentPeriodEnd > failureGraceEnd
              ? planSub.currentPeriodEnd
              : failureGraceEnd;

            await tx.planSubscription.update({
              where: { id: planSub.id },
              data: {
                status: 'PENDING',
                paymentFailedAt: now,
                graceEndsAt
              }
            });
            break;
          }

          case 'HALTED': {
            if (planSub.lastChargedAt && now <= planSub.lastChargedAt) {
              return { changed: false, previousStatus: planSub.status, wasFirstCharge: false };
            }
            await tx.planSubscription.update({
              where: { id: planSub.id },
              data: { status: 'HALTED' }
            });
            break;
          }

          case 'CANCELLED': {
            await tx.planSubscription.update({
              where: { id: planSub.id },
              data: {
                status: 'CANCELLED',
                cancelRequestedAt: now,
                cancelAtPeriodEnd: event.cancelAtPeriodEnd,
                cancelEffectiveAt: event.endedAt || (event.cancelAtPeriodEnd ? planSub.currentPeriodEnd : now),
                endedAt: event.endedAt || (event.cancelAtPeriodEnd ? planSub.currentPeriodEnd : now)
              }
            });
            break;
          }

          case 'COMPLETED':
          case 'EXPIRED': {
            await tx.planSubscription.update({
              where: { id: planSub.id },
              data: {
                status: event.kind,
                endedAt: event.endedAt || now
              }
            });
            break;
          }
        }
        return { changed: true, previousStatus: planSub.status, wasFirstCharge: !planSub.firstChargedAt };
      });

      const updated = (event.rawEventId || (transition.changed && notifications)) ? await client.planSubscription.findUnique({
        where: { providerSubscriptionId: event.providerSubscriptionId }
      }) : null;
      if (event.rawEventId && updated?.instituteId) {
        await client.billingWebhookEvent.updateMany({
          where: { providerEventId: event.rawEventId, planSubscriptionId: updated.id },
          data: { instituteId: updated.instituteId }
        });
      }
      if (!transition.changed || !notifications) return;
      if (!updated?.instituteId) return;
      const referenceBase = `autopay:${updated.id}`;
      const schedule = (notificationEvent: PlanNotificationEvent, effectiveAt: Date, suffix: string) =>
        notifications.schedule({
          instituteId: updated.instituteId!, event: notificationEvent, effectiveAt,
          reference: `${referenceBase}:${suffix}`
        }).catch(() => undefined);

      if (event.kind === 'AUTHENTICATED') {
        await schedule('AUTOPAY_AUTHORIZED', now, `authorized:${updated.intendedStartAt.toISOString()}`);
        const upcomingAt = new Date(updated.intendedStartAt.getTime() - 3 * 86_400_000);
        await schedule('AUTOPAY_CHARGE_UPCOMING', upcomingAt > now ? upcomingAt : now, `upcoming:${updated.intendedStartAt.toISOString()}`);
      } else if (event.kind === 'CHARGED') {
        await notifications.cancelSatisfied(updated.instituteId, now).catch(() => undefined);
        const notificationEvent: PlanNotificationEvent = ['PENDING', 'HALTED'].includes(transition.previousStatus)
          ? 'AUTOPAY_RECOVERED'
          : transition.wasFirstCharge ? 'AUTOPAY_ACTIVATED' : 'PAYMENT_SUCCEEDED';
        await schedule(notificationEvent, now, `charge:${event.paymentId}`);
        const upcomingAt = new Date(event.currentEnd.getTime() - 3 * 86_400_000);
        await schedule('AUTOPAY_CHARGE_UPCOMING', upcomingAt > now ? upcomingAt : now, `upcoming:${event.currentEnd.toISOString()}`);
      } else if (event.kind === 'PENDING' || event.kind === 'CHARGE_FAILED') {
        await schedule('PAYMENT_FAILED', now, `failed:${updated.graceEndsAt?.toISOString() || now.toISOString()}`);
        if (updated.graceEndsAt) {
          const warningAt = new Date(updated.graceEndsAt.getTime() - 86_400_000);
          await schedule('AUTOPAY_GRACE_ENDING', warningAt > now ? warningAt : now, `grace:${updated.graceEndsAt.toISOString()}`);
        }
      } else if (event.kind === 'CANCELLED') {
        await schedule('AUTOPAY_CANCELLED', now, `cancelled:${updated.cancelEffectiveAt?.toISOString() || now.toISOString()}`);
      } else if (event.kind === 'COMPLETED' || event.kind === 'EXPIRED') {
        await schedule('AUTOPAY_COMPLETED', now, `completed:${updated.endedAt?.toISOString() || now.toISOString()}`);
      }
    },

    async cancelSubscriptionForInstitute(input) {
      const now = input.now || new Date();

      const planSub = await client.planSubscription.findFirst({
        where: {
          instituteId: input.instituteId,
          status: { in: ['AUTHENTICATED', 'ACTIVE', 'PENDING', 'CANCELLED'] }
        },
        orderBy: { createdAt: 'desc' }
      });

      if (!planSub || !planSub.providerSubscriptionId) {
        throw new PlanSubscriptionLifecycleError('ACTIVE_SUBSCRIPTION_NOT_FOUND');
      }

      if (planSub.status === 'CANCELLED') {
        return {
          cancelled: true,
          cancelAtPeriodEnd: planSub.cancelAtPeriodEnd,
          effectiveUntil: planSub.cancelEffectiveAt || planSub.trialEndsAt || planSub.currentPeriodEnd || null
        };
      }

      const isTrial =
        Boolean(planSub.trialEndsAt && planSub.trialEndsAt.getTime() > now.getTime()) &&
        planSub.status === 'AUTHENTICATED';

      const cancelAtCycleEnd = !isTrial;

      await provider.cancel(planSub.providerSubscriptionId, cancelAtCycleEnd);

      const effectiveUntil = isTrial ? planSub.trialEndsAt : planSub.currentPeriodEnd;

      await client.planSubscription.update({
        where: { id: planSub.id },
        data: {
          status: 'CANCELLED',
          cancelRequestedAt: now,
          cancelAtPeriodEnd: cancelAtCycleEnd,
          cancelEffectiveAt: effectiveUntil,
          endedAt: isTrial ? now : planSub.currentPeriodEnd
        }
      });

      if (notifications) {
        await notifications.schedule({
          instituteId: input.instituteId,
          event: 'AUTOPAY_CANCELLED',
          effectiveAt: now,
          reference: `autopay:${planSub.id}:cancelled:${effectiveUntil?.toISOString() || now.toISOString()}`
        }).catch(() => undefined);
      }

      return {
        cancelled: true,
        cancelAtPeriodEnd: cancelAtCycleEnd,
        effectiveUntil: effectiveUntil || null
      };
    }
  };
}

export const planSubscriptionLifecycleService = createPlanSubscriptionLifecycleService();
