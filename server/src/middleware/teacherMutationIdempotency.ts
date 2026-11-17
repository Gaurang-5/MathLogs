import { createHash } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';

const KEY_PATTERN = /^[A-Za-z0-9._:-]{8,200}$/;
const PROCESSING_TIMEOUT_MS = 2 * 60 * 1000;

type ReceiptResult = {
  status: 'PROCESSING' | 'COMPLETED';
  actorId: string;
  requestHash: string;
  responseStatus?: number;
  response?: unknown;
};

function receiptResult(value: Prisma.JsonValue): ReceiptResult | null {
  if (!value || Array.isArray(value) || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.status !== 'PROCESSING' && candidate.status !== 'COMPLETED') return null;
  if (typeof candidate.actorId !== 'string' || typeof candidate.requestHash !== 'string') return null;
  return candidate as ReceiptResult;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

function requestHash(req: Request): string {
  return createHash('sha256')
    .update(JSON.stringify(stableValue({ method: req.method, path: req.path, body: req.body })))
    .digest('hex');
}

function isUniqueConflict(error: unknown): boolean {
  return (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
    || (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002');
}

type ReceiptStore = {
  create(args: any): Promise<any>;
  findUnique(args: any): Promise<any>;
  updateMany(args: any): Promise<{ count: number }>;
  update(args: any): Promise<any>;
  delete(args: any): Promise<any>;
};

export function teacherMutationIdempotency(
  action: string,
  receiptStore: ReceiptStore = prisma.enrollmentAction,
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const rawKey = req.header('Idempotency-Key');
    if (!rawKey) return next();

    const idempotencyKey = rawKey.trim();
    if (!KEY_PATTERN.test(idempotencyKey)) {
      return res.status(400).json({ error: 'INVALID_IDEMPOTENCY_KEY' });
    }

    const instituteId = req.user?.instituteId;
    const actorId = req.user?.id;
    if (!instituteId || !actorId) return res.status(401).json({ error: 'Unauthorized' });

    const fingerprint = requestHash(req);
    let receiptId: string;
    try {
      const receipt = await receiptStore.create({
        data: {
          instituteId,
          idempotencyKey,
          action: `OFFLINE_${action}`,
          result: { status: 'PROCESSING', actorId, requestHash: fingerprint },
        },
        select: { id: true },
      });
      receiptId = receipt.id;
    } catch (error) {
      if (!isUniqueConflict(error)) return next(error);
      const existing = await receiptStore.findUnique({
        where: { instituteId_idempotencyKey: { instituteId, idempotencyKey } },
      });
      if (!existing) return res.status(409).json({ error: 'IDEMPOTENCY_RETRY_REQUIRED' });
      const stored = receiptResult(existing.result);
      if (!stored || existing.action !== `OFFLINE_${action}` || stored.requestHash !== fingerprint) {
        return res.status(409).json({ error: 'IDEMPOTENCY_KEY_REUSED' });
      }
      if (stored.status === 'COMPLETED' && stored.responseStatus && stored.response !== undefined) {
        res.setHeader('Idempotency-Replayed', 'true');
        return res.status(stored.responseStatus).json(stored.response);
      }
      if (Date.now() - existing.createdAt.getTime() < PROCESSING_TIMEOUT_MS) {
        return res.status(409).json({ error: 'IDEMPOTENCY_REQUEST_IN_PROGRESS' });
      }
      const reclaimed = await receiptStore.updateMany({
        where: { id: existing.id, result: { equals: existing.result as Prisma.InputJsonValue } },
        data: { result: { status: 'PROCESSING', actorId, requestHash: fingerprint } },
      });
      if (reclaimed.count !== 1) return res.status(409).json({ error: 'IDEMPOTENCY_REQUEST_IN_PROGRESS' });
      receiptId = existing.id;
    }

    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      const responseStatus = res.statusCode;
      if (responseStatus >= 200 && responseStatus < 300) {
        void receiptStore.update({
          where: { id: receiptId },
          data: {
            result: {
              status: 'COMPLETED',
              actorId,
              requestHash: fingerprint,
              responseStatus,
              response: JSON.parse(JSON.stringify(body)),
            } as Prisma.InputJsonValue,
          },
        }).then(() => originalJson(body)).catch(next);
        return res;
      }
      void receiptStore.delete({ where: { id: receiptId } })
        .catch(() => undefined)
        .finally(() => originalJson(body));
      return res;
    }) as Response['json'];

    return next();
  };
}
