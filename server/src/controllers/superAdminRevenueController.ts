import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../prisma';
import { requireSuperAdminReauth } from '../middleware/superAdmin';
import {
  billingActionClass,
  findBillingOperationReplay,
  getInstituteBillingHistory,
  getRevenueOverview,
  listRevenueSubscriptions,
  previewBillingOperation,
  retryBillingOperation,
  RevenueServiceError,
  submitBillingOperation
} from '../services/superAdminRevenueService';

function failure(res: Response, error: unknown) {
  if (!(error instanceof RevenueServiceError)) return res.status(500).json({ success: false, error: 'SUPERADMIN_REVENUE_FAILED' });
  if (['INSTITUTE_NOT_FOUND', 'BILLING_OPERATION_NOT_FOUND'].includes(error.message)) return res.status(404).json({ success: false, error: error.message });
  if (['IDEMPOTENCY_KEY_REUSED', 'IDEMPOTENCY_IN_PROGRESS', 'BILLING_OPERATION_NOT_RETRYABLE'].includes(error.message)) return res.status(409).json({ success: false, error: error.message });
  return res.status(400).json({ success: false, error: error.message });
}

export async function requireBillingReauth(req: Request, res: Response, next: NextFunction) {
  const key = String(req.header('Idempotency-Key') || '').trim();
  if (!key) return res.status(400).json({ success: false, error: 'IDEMPOTENCY_KEY_REQUIRED' });
  try {
    const replay = await findBillingOperationReplay({ actorAdminId: req.user.id, idempotencyKey: key, value: req.body });
    if (replay) return next();
    const actionClass = billingActionClass(String(req.body?.type || '').toUpperCase());
    if (!actionClass) return next();
    return requireSuperAdminReauth(actionClass)(req, res, next);
  } catch (error) {
    return failure(res, error);
  }
}

export async function revenueOverview(_req: Request, res: Response) {
  try { return res.json({ success: true, data: await getRevenueOverview() }); }
  catch (error) { return failure(res, error); }
}

export async function revenueSubscriptions(req: Request, res: Response) {
  const page = Math.max(1, Number.parseInt(String(req.query.page || '1'), 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(String(req.query.pageSize || '25'), 10) || 25));
  try {
    return res.json({ success: true, data: await listRevenueSubscriptions({
      q: String(req.query.q || '').trim() || undefined,
      plan: String(req.query.plan || '').trim().toUpperCase() || undefined,
      page, pageSize
    }) });
  } catch (error) { return failure(res, error); }
}

export async function billingHistory(req: Request, res: Response) {
  try { return res.json({ success: true, data: await getInstituteBillingHistory(String(req.params.id)) }); }
  catch (error) { return failure(res, error); }
}

export async function billingPreview(req: Request, res: Response) {
  try { return res.json({ success: true, data: await previewBillingOperation(String(req.params.id), req.body) }); }
  catch (error) { return failure(res, error); }
}

export async function createBillingOperation(req: Request, res: Response) {
  try {
    const data = await submitBillingOperation({
      instituteId: String(req.params.id), actorAdminId: req.user.id,
      idempotencyKey: String(req.header('Idempotency-Key') || ''), value: req.body
    });
    return res.status(data.operation.status === 'PENDING' ? 202 : 200).json({ success: true, data: data.operation, replay: data.replay });
  } catch (error) { return failure(res, error); }
}

export async function retryOperation(req: Request, res: Response) {
  const operation = await prisma.superAdminBillingOperation.findUnique({ where: { id: String(req.params.operationId) }, select: { type: true } });
  if (!operation) return res.status(404).json({ success: false, error: 'BILLING_OPERATION_NOT_FOUND' });
  const actionClass = billingActionClass(operation.type);
  const execute = async () => {
    try {
      return res.json({ success: true, data: await retryBillingOperation({
        operationId: String(req.params.operationId), actorAdminId: req.user.id,
        idempotencyKey: String(req.header('Idempotency-Key') || '')
      }) });
    } catch (error) { return failure(res, error); }
  };
  if (!actionClass) return execute();
  return requireSuperAdminReauth(actionClass)(req, res, error => error ? failure(res, error) : void execute());
}
