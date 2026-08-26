import { PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../prisma';
import { planSubscriptionProvider, type PlanSubscriptionProvider } from './planSubscriptionProvider';
import {
  createPlanSubscriptionLifecycleService,
  type PlanSubscriptionLifecycleService
} from './planSubscriptionLifecycleService';
import { scheduleLifecycleNotifications } from './planNotificationService';

export interface PlanSubscriptionReconciliationService {
  reconcileStaleSubscriptions(options?: {
    now?: Date;
  }): Promise<{ reconciledCount: number; haltedCount: number }>;
  reconcileDueSubscriptions(options?: {
    now?: Date;
  }): Promise<{ reconciledCount: number; haltedCount: number }>;
}

export function createPlanSubscriptionReconciliationService(options?: {
  prisma?: PrismaClient;
  provider?: PlanSubscriptionProvider;
  lifecycle?: PlanSubscriptionLifecycleService;
}): PlanSubscriptionReconciliationService {
  const client = options?.prisma || defaultPrisma;
  const provider = options?.provider || planSubscriptionProvider;
  const lifecycle = options?.lifecycle || createPlanSubscriptionLifecycleService({ prisma: client, provider });

  async function reconcile(options?: { now?: Date }) {
      const now = options?.now || new Date();
      let reconciledCount = 0;
      let haltedCount = 0;

      // 1. Reconcile stale unconfirmed attempts (CREATING or PROVIDER_UNKNOWN created > 5 mins ago)
      const staleThreshold = new Date(now.getTime() - 5 * 60_000);
      const staleSubs = await client.planSubscription.findMany({
        where: {
          status: { in: ['CREATING', 'PROVIDER_UNKNOWN'] },
          createdAt: { lte: staleThreshold }
        }
      });

      for (const sub of staleSubs) {
        try {
          let foundSub: any = null;
          if (sub.providerSubscriptionId) {
            foundSub = await provider.fetchSubscription(sub.providerSubscriptionId).catch(() => null);
          }
          if (!foundSub) {
            const matches = await provider.findByAttemptId(sub.id).catch(() => []);
            if (matches.length === 1) {
              foundSub = matches[0];
            } else if (matches.length > 1) {
              await Promise.allSettled(matches.map(match => provider.cancel(match.id, false)));
              continue;
            }
          }

          if (foundSub) {
            if (foundSub.planId !== sub.providerPlanId) {
              await provider.cancel(foundSub.id, false).catch(() => undefined);
              continue;
            }
            await client.planSubscription.update({
              where: { id: sub.id },
              data: {
                providerSubscriptionId: foundSub.id,
                providerCreatedAt: foundSub.createdAt
              }
            });

            if (foundSub.status === 'authenticated') {
              await lifecycle.applySubscriptionEvent({
                kind: 'AUTHENTICATED',
                providerSubscriptionId: foundSub.id,
                startsAt: foundSub.startAt || undefined,
                currentStart: foundSub.currentStart || undefined,
                currentEnd: foundSub.currentEnd || undefined,
                now
              });
            } else if (foundSub.status === 'active') {
              await lifecycle.applySubscriptionEvent({
                kind: 'ACTIVATED',
                providerSubscriptionId: foundSub.id,
                currentStart: foundSub.currentStart || now,
                currentEnd: foundSub.currentEnd || new Date(now.getTime() + 30 * 86_400_000),
                now
              });
            } else if (foundSub.status === 'cancelled') {
              await lifecycle.applySubscriptionEvent({
                kind: 'CANCELLED',
                providerSubscriptionId: foundSub.id,
                cancelAtPeriodEnd: false,
                endedAt: foundSub.endedAt || now,
                now
              });
            } else {
              await client.planSubscription.update({
                where: { id: sub.id },
                data: { status: 'CREATED' }
              });
            }
            reconciledCount += 1;
          }
        } catch {
          // Continue with remaining records
        }
      }

      // 2. Halt subscriptions with expired grace period
      const expiredGraceSubs = await client.planSubscription.findMany({
        where: {
          status: { in: ['PENDING', 'HALTED'] },
          OR: [
            { graceEndsAt: { lte: now } },
            { currentPeriodEnd: { lte: now } },
            { trialEndsAt: { lte: now } }
          ]
        }
      });

      for (const sub of expiredGraceSubs) {
        if (sub.providerSubscriptionId) {
          const providerState = await provider.fetchSubscription(sub.providerSubscriptionId).catch(() => null);
          if (providerState?.planId && providerState.planId !== sub.providerPlanId) continue;
          if (providerState?.status === 'active') {
            await lifecycle.applySubscriptionEvent({
              kind: 'ACTIVATED', providerSubscriptionId: sub.providerSubscriptionId,
              currentStart: providerState.currentStart || now,
              currentEnd: providerState.currentEnd || sub.currentPeriodEnd || now,
              now
            });
            reconciledCount += 1;
            continue;
          }
          if (providerState?.status === 'authenticated') {
            await lifecycle.applySubscriptionEvent({
              kind: 'AUTHENTICATED', providerSubscriptionId: sub.providerSubscriptionId,
              startsAt: providerState.startAt || undefined,
              currentStart: providerState.currentStart || undefined,
              currentEnd: providerState.currentEnd || undefined,
              now
            });
            reconciledCount += 1;
            continue;
          }
        }

        const boundary = [sub.trialEndsAt, sub.currentPeriodEnd, sub.graceEndsAt]
          .filter((value): value is Date => Boolean(value))
          .reduce<Date | null>((latest, value) => !latest || value > latest ? value : latest, null);
        if (boundary && boundary > now) continue;

        await client.$transaction(async tx => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${sub.providerSubscriptionId || sub.id}))`;
          const current = await tx.planSubscription.findUniqueOrThrow({ where: { id: sub.id } });
          if (!['PENDING', 'HALTED'].includes(current.status)) return;
          if (sub.instituteId) {
            await tx.institute.update({
              where: { id: sub.instituteId },
              data: {
                plan: 'MARKETPLACE',
                billingCycle: 'ONE_TIME',
                planExpiryDate: null
              }
            });
          }

          await tx.planSubscription.update({
            where: { id: sub.id },
            data: { status: 'HALTED' }
          });
        });
        if (sub.instituteId && client === defaultPrisma) {
          await scheduleLifecycleNotifications({
            instituteId: sub.instituteId, event: 'MARKETPLACE_FALLBACK', effectiveAt: now,
            reference: `autopay:${sub.id}:fallback:${boundary?.toISOString() || now.toISOString()}`
          }).catch(() => undefined);
        }
        haltedCount += 1;
      }

      return { reconciledCount, haltedCount };
  }

  return {
    reconcileStaleSubscriptions: reconcile,
    reconcileDueSubscriptions: reconcile
  };
}

export const planSubscriptionReconciliationService = createPlanSubscriptionReconciliationService();
