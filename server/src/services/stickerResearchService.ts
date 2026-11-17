import crypto from 'crypto';
import { prisma } from '../prisma';
import { secureLogger } from '../utils/secureLogger';
import { deleteStickerResearchImage, storeStickerResearchImage } from '../utils/stickerResearchStorage';

const enabled = () => process.env.STICKER_RESEARCH_COLLECTION_ENABLED === 'true';
const consentReference = () => process.env.STICKER_RESEARCH_CONSENT_REFERENCE?.trim() || 'owner-confirmed-2026-10-20';
const retentionDays = () => {
  const parsed = Number(process.env.STICKER_RESEARCH_RETENTION_DAYS || 365);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.floor(parsed), 3650) : 365;
};

const cleanLabel = (value: unknown, fallback: string, max = 255) => {
  const label = typeof value === 'string' ? value.trim() : '';
  return (label || fallback).slice(0, max);
};

export function normalizeCaptureSource(value: unknown) {
  return ['web_camera', 'phone_camera', 'mobile_camera'].includes(String(value)) ? String(value) : 'unknown';
}

export function normalizeClientPlatform(value: unknown) {
  return ['web', 'ios', 'android'].includes(String(value)) ? String(value) : 'unknown';
}

export async function recordStickerResearchCapture(input: {
  id?: string;
  instituteId: string;
  teacherId: string;
  teacherName: string;
  image: Buffer;
  contentType: string;
  captureSource: unknown;
  clientPlatform: unknown;
  ocrResult: any;
  ocrElapsedMs: number;
  cacheHit: boolean;
}) {
  if (!enabled()) return undefined;
  const id = typeof input.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.id)
    ? input.id : crypto.randomUUID();
  let storageKey: string | undefined;
  try {
    const institute = await prisma.institute.findUnique({ where: { id: input.instituteId }, select: { name: true } });
    if (!institute) return undefined;
    storageKey = await storeStickerResearchImage({ body: input.image, contentType: input.contentType });
    const retentionUntil = new Date(Date.now() + retentionDays() * 24 * 60 * 60 * 1000);
    const row = await prisma.stickerResearchCapture.create({ data: {
      id,
      instituteId: input.instituteId,
      instituteName: cleanLabel(institute.name, 'Unknown institute'),
      teacherId: input.teacherId,
      teacherName: cleanLabel(input.teacherName, 'Unknown teacher'),
      storageKey,
      imageSha256: crypto.createHash('sha256').update(input.image).digest('hex'),
      contentType: input.contentType,
      sizeBytes: input.image.length,
      captureSource: normalizeCaptureSource(input.captureSource),
      clientPlatform: normalizeClientPlatform(input.clientPlatform),
      ocrScore: typeof input.ocrResult?.score === 'string' ? input.ocrResult.score.slice(0, 40) : null,
      ocrStatus: cleanLabel(input.ocrResult?.status, 'unknown', 40),
      ocrReason: input.ocrResult?.reason ? cleanLabel(input.ocrResult.reason, '', 120) : null,
      ocrElapsedMs: Math.max(0, Math.min(Math.round(input.ocrElapsedMs), 120000)),
      cacheHit: input.cacheHit,
      consentReference: consentReference(),
      retentionUntil,
    } });
    return row.id;
  } catch (error) {
    if (storageKey) await deleteStickerResearchImage(storageKey).catch(() => undefined);
    secureLogger.error('[Sticker research] Capture record failed.', { error: error instanceof Error ? error.message : String(error) });
    return undefined;
  }
}

export async function finalizeStickerResearchCapture(input: {
  id: unknown;
  teacherId: string;
  student: { id: string; humanId: string | null; name: string; enrollments?: Array<{ batchId: string; batch: { name: string } }> };
  test: { id: string; name: string; maxMarks: number; batchId: string | null; batches?: Array<{ id: string }> };
  finalScore: number;
  reviewDurationMs: unknown;
  identitySource: unknown;
  wasOverwrite: boolean;
}) {
  if (!enabled() || typeof input.id !== 'string') return;
  const capture = await prisma.stickerResearchCapture.findFirst({ where: { id: input.id, teacherId: input.teacherId } });
  if (!capture || capture.completedAt) return;
  const ocrNumeric = capture.ocrScore != null && /^\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?$/.test(capture.ocrScore)
    ? Number(capture.ocrScore.split('/')[0]) : null;
  const allowedBatchIds = new Set([...(input.test.batches?.map(batch => batch.id) ?? []), ...(input.test.batchId ? [input.test.batchId] : [])]);
  const enrollment = input.student.enrollments?.find(item => allowedBatchIds.size === 0 || allowedBatchIds.has(item.batchId)) ?? input.student.enrollments?.[0];
  const duration = Number(input.reviewDurationMs);
  await prisma.stickerResearchCapture.update({ where: { id: capture.id }, data: {
    studentId: input.student.id,
    studentHumanId: input.student.humanId,
    studentName: cleanLabel(input.student.name, 'Unknown student'),
    testId: input.test.id,
    testName: cleanLabel(input.test.name, 'Unknown test'),
    maxMarks: input.test.maxMarks,
    batchId: enrollment?.batchId ?? input.test.batchId,
    batchName: enrollment?.batch?.name ? cleanLabel(enrollment.batch.name, 'Unknown batch') : null,
    identitySource: ['qr', 'manual_picker'].includes(String(input.identitySource)) ? String(input.identitySource) : 'unknown',
    finalScore: input.finalScore,
    reviewDurationMs: Number.isFinite(duration) ? Math.max(0, Math.min(Math.round(duration), 30 * 60 * 1000)) : null,
    wasCorrected: ocrNumeric == null ? null : Math.abs(ocrNumeric - input.finalScore) > 1e-9,
    wasOverwrite: input.wasOverwrite,
    outcome: ocrNumeric == null ? 'MANUAL_AFTER_UNREADABLE' : Math.abs(ocrNumeric - input.finalScore) <= 1e-9 ? 'OCR_ACCEPTED' : 'OCR_CORRECTED',
    completedAt: new Date(),
  } });
}

export async function markStickerResearchOutcome(input: { id: string; teacherId: string; outcome: string }) {
  if (!enabled() || !['RETAKE', 'CANCELLED'].includes(input.outcome)) return;
  await prisma.stickerResearchCapture.updateMany({
    where: { id: input.id, teacherId: input.teacherId, completedAt: null },
    data: { outcome: input.outcome, completedAt: new Date() },
  });
}

export async function purgeExpiredStickerResearchCaptures() {
  if (!enabled()) return;
  const expired = await prisma.stickerResearchCapture.findMany({ where: { retentionUntil: { lte: new Date() } }, select: { id: true, storageKey: true } });
  for (const row of expired) {
    await deleteStickerResearchImage(row.storageKey);
    await prisma.stickerResearchCapture.delete({ where: { id: row.id } });
  }
}

if (process.env.NODE_ENV !== 'test') {
  const timer = setInterval(() => void purgeExpiredStickerResearchCaptures().catch(error => secureLogger.error('[Sticker research] Retention cleanup failed.', { error: String(error) })), 24 * 60 * 60 * 1000);
  timer.unref();
}
