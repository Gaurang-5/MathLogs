import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';

type ClaimInput = {
  actorAdminId: string;
  scope: string;
  key: string;
  request: unknown;
};

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

function requestHash(request: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(canonical(request))).digest('hex');
}

export async function claimSuperAdminIdempotency(input: ClaimInput): Promise<
  { kind: 'CLAIMED'; recordId: string } | { kind: 'REPLAY'; response: unknown }
> {
  const hash = requestHash(input.request);
  const unique = { actorAdminId_scope_key: { actorAdminId: input.actorAdminId, scope: input.scope, key: input.key } };
  const evaluate = (existing: { requestHash: string; status: string; response: unknown }) => {
    if (existing.requestHash !== hash) throw new Error('IDEMPOTENCY_KEY_REUSED');
    if (existing.status !== 'COMPLETED') throw new Error('IDEMPOTENCY_IN_PROGRESS');
    return { kind: 'REPLAY' as const, response: existing.response };
  };
  const existingBeforeCreate = await prisma.superAdminIdempotencyRecord.findUnique({ where: unique });
  if (existingBeforeCreate) return evaluate(existingBeforeCreate);
  try {
    const record = await prisma.superAdminIdempotencyRecord.create({
      data: {
        actorAdminId: input.actorAdminId,
        scope: input.scope,
        key: input.key,
        requestHash: hash,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      }
    });
    return { kind: 'CLAIMED', recordId: record.id };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
  }

  const existing = await prisma.superAdminIdempotencyRecord.findUniqueOrThrow({ where: unique });
  return evaluate(existing);
}

export async function completeSuperAdminIdempotency(recordId: string, response: Prisma.InputJsonValue) {
  const updated = await prisma.superAdminIdempotencyRecord.updateMany({
    where: { id: recordId, status: 'PENDING' },
    data: { status: 'COMPLETED', response }
  });
  if (updated.count !== 1) throw new Error('IDEMPOTENCY_NOT_PENDING');
}
