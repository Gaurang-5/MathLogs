import type { Request, Response } from 'express';
import {
  commitInstituteImport,
  commitInstituteOnboarding,
  getSuperAdminInstitute,
  InstituteServiceError,
  listSuperAdminInstitutes,
  previewInstituteImport,
  previewInstituteOnboarding,
  updateSuperAdminInstituteConfiguration,
  updateSuperAdminInstituteDetails
} from '../services/superAdminInstituteService';

const DETAIL_KEYS = new Set(['expectedUpdatedAt', 'reason', 'name', 'teacherName', 'phoneNumber', 'email']);
const CONFIG_KEYS = new Set(['expectedUpdatedAt', 'reason', 'allowedClasses', 'subjects', 'requiresGrades']);

function failure(res: Response, error: unknown) {
  if (!(error instanceof InstituteServiceError)) return res.status(500).json({ success: false, error: 'SUPERADMIN_INSTITUTE_FAILED' });
  if (error.message === 'INSTITUTE_NOT_FOUND') return res.status(404).json({ success: false, error: error.message });
  if (error.message === 'STALE_INSTITUTE') return res.status(409).json({ success: false, error: error.message, data: error.current });
  if (error.message === 'IDEMPOTENCY_KEY_REUSED') return res.status(409).json({ success: false, error: error.message });
  if (error.message === 'IDEMPOTENCY_IN_PROGRESS') return res.status(409).json({ success: false, error: error.message });
  if (error.message === 'ONBOARDING_INVALID') return res.status(400).json({ success: false, error: error.message, data: error.current });
  return res.status(400).json({ success: false, error: error.message });
}

function hasUnknownKeys(body: unknown, allowed: Set<string>): boolean {
  return !body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !allowed.has(key));
}

export async function listInstitutes(req: Request, res: Response) {
  const page = Math.max(1, Number.parseInt(String(req.query.page || '1'), 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(String(req.query.pageSize || '25'), 10) || 25));
  try {
    const data = await listSuperAdminInstitutes({
      q: String(req.query.q || '').trim() || undefined,
      status: String(req.query.status || '').trim().toUpperCase() || undefined,
      plan: String(req.query.plan || '').trim().toUpperCase() || undefined,
      ownershipStatus: String(req.query.ownershipStatus || '').trim().toUpperCase() || undefined,
      page,
      pageSize
    });
    return res.json({ success: true, data });
  } catch (error) {
    return failure(res, error);
  }
}

export async function getInstitute(req: Request, res: Response) {
  try {
    return res.json({ success: true, data: await getSuperAdminInstitute(String(req.params.id)) });
  } catch (error) {
    return failure(res, error);
  }
}

export async function updateInstituteDetails(req: Request, res: Response) {
  if (hasUnknownKeys(req.body, DETAIL_KEYS)) return res.status(400).json({ success: false, error: 'UNKNOWN_FIELD' });
  const changes = Object.fromEntries(['name', 'teacherName', 'phoneNumber', 'email']
    .filter(key => Object.prototype.hasOwnProperty.call(req.body, key))
    .map(key => [key, req.body[key]]));
  if (changes.name !== undefined && (typeof changes.name !== 'string' || changes.name.trim().length < 2 || changes.name.length > 160)) {
    return res.status(400).json({ success: false, error: 'INVALID_NAME' });
  }
  for (const key of ['teacherName', 'phoneNumber', 'email']) {
    const value = changes[key];
    if (value !== undefined && value !== null && (typeof value !== 'string' || value.length > 254)) {
      return res.status(400).json({ success: false, error: 'INVALID_FIELD' });
    }
  }
  try {
    const data = await updateSuperAdminInstituteDetails({
      instituteId: String(req.params.id), actorAdminId: req.user.id, correlationId: req.correlationId,
      expectedUpdatedAt: String(req.body.expectedUpdatedAt || ''), reason: String(req.body.reason || ''), changes
    });
    return res.json({ success: true, data });
  } catch (error) {
    return failure(res, error);
  }
}

export async function updateInstituteConfiguration(req: Request, res: Response) {
  if (hasUnknownKeys(req.body, CONFIG_KEYS)) return res.status(400).json({ success: false, error: 'UNKNOWN_FIELD' });
  const changes = Object.fromEntries(['allowedClasses', 'subjects', 'requiresGrades']
    .filter(key => Object.prototype.hasOwnProperty.call(req.body, key))
    .map(key => [key, req.body[key]]));
  try {
    const data = await updateSuperAdminInstituteConfiguration({
      instituteId: String(req.params.id), actorAdminId: req.user.id, correlationId: req.correlationId,
      expectedUpdatedAt: String(req.body.expectedUpdatedAt || ''), reason: String(req.body.reason || ''), changes
    });
    return res.json({ success: true, data });
  } catch (error) {
    return failure(res, error);
  }
}

export async function previewOnboarding(req: Request, res: Response) {
  const data = previewInstituteOnboarding(req.body);
  return res.status(data.valid ? 200 : 400).json({ success: data.valid, data });
}

export async function commitOnboarding(req: Request, res: Response) {
  try {
    const data = await commitInstituteOnboarding({
      value: req.body,
      idempotencyKey: String(req.header('Idempotency-Key') || ''),
      actorAdminId: req.user.id,
      correlationId: req.correlationId
    });
    return res.status(data.replay ? 200 : 201).json({ success: true, data: data.result, replay: data.replay });
  } catch (error) {
    return failure(res, error);
  }
}

export async function previewImport(req: Request, res: Response) {
  try {
    const data = previewInstituteImport(req.body?.rows);
    return res.json({ success: true, data: { totalRows: data.totalRows, validRows: data.validRows, invalidRows: data.invalidRows, errors: data.errors } });
  } catch (error) {
    return failure(res, error);
  }
}

export async function commitImport(req: Request, res: Response) {
  try {
    const data = await commitInstituteImport({
      rows: req.body?.rows,
      idempotencyKey: String(req.header('Idempotency-Key') || ''),
      actorAdminId: req.user.id,
      correlationId: req.correlationId
    });
    return res.json({ success: true, data: data.result, replay: data.replay });
  } catch (error) {
    return failure(res, error);
  }
}
