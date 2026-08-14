import type { Prisma, SuperAdminAuditLog } from '@prisma/client';

type AuditClient = Pick<Prisma.TransactionClient, 'superAdminAuditLog'>;

export type SuperAdminAuditInput = {
  action: string;
  entityType: string;
  entityId?: string;
  actorAdminId: string;
  instituteId?: string;
  reason?: string;
  correlationId: string;
  supportSessionId?: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
};

const SECRET_KEY = /password|secret|token|otp|authorization|credential/i;

function redact(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value as Prisma.InputJsonValue;
  }
  if (Array.isArray(value)) return value.map(item => redact(item) ?? null) as Prisma.InputJsonValue;
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      SECRET_KEY.test(key) ? '[REDACTED]' : redact(item) ?? null
    ])) as Prisma.InputJsonValue;
  }
  return String(value);
}

export function writeSuperAdminAudit(client: AuditClient, input: SuperAdminAuditInput): Promise<SuperAdminAuditLog> {
  return client.superAdminAuditLog.create({
    data: {
      ...input,
      before: redact(input.before),
      after: redact(input.after),
      metadata: redact(input.metadata)
    }
  });
}
