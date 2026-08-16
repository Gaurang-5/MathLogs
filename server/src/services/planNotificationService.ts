import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';

export type PlanNotificationEvent = 'TRIAL_STARTED' | 'PLAN_ACTIVATED' | 'EXPIRY_APPROACHING' | 'PAYMENT_DUE' | 'PAYMENT_FAILED' | 'PAYMENT_SUCCEEDED' | 'MARKETPLACE_FALLBACK';
export type PlanTemplateVariables = {
  ownerName: string; instituteName: string; planLabel: string; cycle: string;
  amount: string; date: string; paymentLink: string; supportContact: string;
};

const renderText = (heading: string, values: PlanTemplateVariables) => `${heading}\n\nHello ${values.ownerName},\n\n${values.instituteName} — ${values.planLabel} (${values.cycle}). Amount: ${values.amount}. Date: ${values.date}.\n${values.paymentLink ? `Payment: ${values.paymentLink}\n` : ''}Support: ${values.supportContact}\n\n— MathLogs`;

export const PLAN_NOTIFICATION_TEMPLATES = {
  TRIAL_STARTED: { subject: 'Your MathLogs trial has started', whatsappEnvironmentKey: 'WHATSAPP_TEMPLATE_PLAN_TRIAL_STARTED', render: (v: PlanTemplateVariables) => renderText('Your 14-day trial is active with 5 quiz credits.', v) },
  PLAN_ACTIVATED: { subject: 'Your MathLogs plan is active', whatsappEnvironmentKey: 'WHATSAPP_TEMPLATE_PLAN_ACTIVATED', render: (v: PlanTemplateVariables) => renderText('Your plan is active.', v) },
  EXPIRY_APPROACHING: { subject: 'Your MathLogs plan expires soon', whatsappEnvironmentKey: 'WHATSAPP_TEMPLATE_PLAN_EXPIRY_APPROACHING', render: (v: PlanTemplateVariables) => renderText('Your plan expires soon.', v) },
  PAYMENT_DUE: { subject: 'Payment due for your MathLogs plan', whatsappEnvironmentKey: 'WHATSAPP_TEMPLATE_PLAN_PAYMENT_DUE', render: (v: PlanTemplateVariables) => renderText('Your plan payment is due.', v) },
  PAYMENT_FAILED: { subject: 'MathLogs payment needs attention', whatsappEnvironmentKey: 'WHATSAPP_TEMPLATE_PLAN_PAYMENT_FAILED', render: (v: PlanTemplateVariables) => renderText('We could not confirm your payment.', v) },
  PAYMENT_SUCCEEDED: { subject: 'MathLogs payment confirmed', whatsappEnvironmentKey: 'WHATSAPP_TEMPLATE_PLAN_PAYMENT_SUCCEEDED', render: (v: PlanTemplateVariables) => renderText('Your payment was confirmed.', v) },
  MARKETPLACE_FALLBACK: { subject: 'Your MathLogs Marketplace access continues', whatsappEnvironmentKey: 'WHATSAPP_TEMPLATE_PLAN_MARKETPLACE_FALLBACK', render: (v: PlanTemplateVariables) => renderText('Your paid features ended; Marketplace access remains active.', v) }
} as const;

export function lifecycleReminderSchedule(expiry: Date) {
  if (Number.isNaN(expiry.getTime())) throw new Error('INVALID_EXPIRY_DATE');
  return [-7, -3, -1, 0, 1, 3, 7].map(offsetDays => ({
    offsetDays,
    event: (offsetDays < 0 ? 'EXPIRY_APPROACHING' : 'PAYMENT_DUE') as PlanNotificationEvent,
    scheduledAt: new Date(expiry.getTime() + offsetDays * 86_400_000)
  }));
}

export async function scheduleLifecycleNotifications(input: {
  instituteId: string; event: PlanNotificationEvent; effectiveAt: Date; expiryAt?: Date | null; reference?: string;
}) {
  const items = input.expiryAt && ['PLAN_ACTIVATED', 'TRIAL_STARTED', 'PAYMENT_FAILED'].includes(input.event)
    ? [{ event: input.event, scheduledAt: input.effectiveAt, offsetDays: null }, ...lifecycleReminderSchedule(input.expiryAt)]
    : [{ event: input.event, scheduledAt: input.effectiveAt, offsetDays: null }];
  const results = [];
  for (const item of items) {
    const eventKey = `${input.reference ?? input.expiryAt?.toISOString() ?? input.effectiveAt.toISOString()}:${item.event}:${item.offsetDays ?? 'now'}`;
    for (const channel of ['EMAIL', 'WHATSAPP'] as const) {
      results.push(await prisma.planNotification.upsert({
        where: { instituteId_eventKey_channel: { instituteId: input.instituteId, eventKey, channel } },
        create: { instituteId: input.instituteId, event: item.event, eventKey, channel, scheduledAt: item.scheduledAt },
        update: {}
      }));
    }
  }
  return results;
}

export async function cancelSatisfiedNotifications(instituteId: string, now = new Date()) {
  return prisma.planNotification.updateMany({
    where: { instituteId, status: 'PENDING', scheduledAt: { gt: now }, event: { in: ['EXPIRY_APPROACHING', 'PAYMENT_DUE', 'PAYMENT_FAILED'] } },
    data: { status: 'CANCELLED' }
  });
}

function templateVariables(institute: any, notification: any): PlanTemplateVariables {
  const paymentLink = `${(process.env.CLIENT_URL || 'https://mathlogs.app').replace(/\/$/, '')}/billing`;
  return {
    ownerName: institute.teacherName || 'Institute owner', instituteName: institute.name,
    planLabel: String(institute.plan), cycle: String(institute.billingCycle || 'ONE_TIME'), amount: 'See billing page',
    date: notification.scheduledAt.toISOString().slice(0, 10), paymentLink,
    supportContact: process.env.SUPPORT_CONTACT || 'support@mathlogs.app'
  };
}

export async function dispatchDuePlanNotifications(now = new Date(), take = 50): Promise<number> {
  const due = await prisma.planNotification.findMany({ where: { status: 'PENDING', scheduledAt: { lte: now } }, orderBy: { scheduledAt: 'asc' }, take });
  let queued = 0;
  for (const notification of due) {
    const claimed = await prisma.planNotification.updateMany({ where: { id: notification.id, status: 'PENDING' }, data: { status: 'PROCESSING', attempts: { increment: 1 }, lastAttemptAt: now } });
    if (claimed.count !== 1) continue;
    const institute = await prisma.institute.findUnique({ where: { id: notification.instituteId }, include: { communicationPreference: true } });
    if (!institute) {
      await prisma.planNotification.update({ where: { id: notification.id }, data: { status: 'FAILED', failedAt: now, error: 'INSTITUTE_NOT_FOUND' } });
      continue;
    }
    const template = PLAN_NOTIFICATION_TEMPLATES[notification.event as PlanNotificationEvent];
    const values = templateVariables(institute, notification);
    try {
      let job: { id: string };
      if (notification.channel === 'EMAIL') {
        if (!institute.email || !institute.communicationPreference?.emailOperational) throw new Error('EMAIL_NOT_CONSENTED_OR_MISSING');
        job = await prisma.emailJob.create({ data: { recipient: institute.email, subject: template.subject, body: template.render(values), instituteId: institute.id, superAdminEntityType: 'PlanNotification', superAdminEntityId: notification.id, options: { senderType: 'NOREPLY', purpose: notification.event } } });
      } else {
        const templateId = process.env[template.whatsappEnvironmentKey]?.trim();
        if (!institute.phoneNumber || !institute.communicationPreference?.whatsappOperational) throw new Error('WHATSAPP_NOT_CONSENTED_OR_MISSING');
        if (!templateId) throw new Error('WHATSAPP_TEMPLATE_NOT_CONFIGURED');
        job = await prisma.whatsappJob.create({ data: { recipient: institute.phoneNumber, templateId, data: Object.values(values), instituteId: institute.id, superAdminEntityType: 'PlanNotification', superAdminEntityId: notification.id } });
      }
      await prisma.planNotification.update({ where: { id: notification.id }, data: { status: 'QUEUED', transportJobId: job.id, error: null } });
      queued += 1;
    } catch (error) {
      await prisma.planNotification.update({ where: { id: notification.id }, data: { status: 'FAILED', failedAt: now, error: (error instanceof Error ? error.message : 'DISPATCH_FAILED').slice(0, 200) } });
    }
  }
  return queued;
}

export async function retryPlanNotification(id: string) {
  const result = await prisma.planNotification.updateMany({ where: { id, status: 'FAILED' }, data: { status: 'PENDING', failedAt: null, error: null } });
  if (result.count !== 1) throw new Error('PLAN_NOTIFICATION_NOT_RETRYABLE');
  return prisma.planNotification.findUniqueOrThrow({ where: { id } });
}
