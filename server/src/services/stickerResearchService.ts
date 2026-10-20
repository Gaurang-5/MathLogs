import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { secureLogger } from '../utils/secureLogger';
import { deleteStickerResearchImage, storeStickerResearchImage } from '../utils/stickerResearchStorage';

export const stickerResearchEnabled = () => process.env.STICKER_RESEARCH_COLLECTION_ENABLED === 'true';
const consentReference = () => process.env.STICKER_RESEARCH_CONSENT_REFERENCE?.trim() || 'owner-confirmed-2026-10-20';
const retentionDays = () => {
  const value = Number(process.env.STICKER_RESEARCH_RETENTION_DAYS || 365);
  return Number.isFinite(value) && value > 0 ? Math.min(Math.floor(value), 3650) : 365;
};
const validUuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const label = (value: unknown, fallback: string, max = 255) => ((typeof value === 'string' ? value.trim() : '') || fallback).slice(0, max);
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value ?? {}));

export function normalizeCaptureSource(value: unknown) {
  return ['web_camera', 'phone_camera', 'mobile_camera'].includes(String(value)) ? String(value) : 'unknown';
}
export function normalizeClientPlatform(value: unknown) {
  return ['web', 'ios', 'android'].includes(String(value)) ? String(value) : 'unknown';
}

export async function ensureStickerResearchCapture(input: {
  id?: unknown; instituteId: string; teacherId: string; teacherName: string;
  test: { id: string; name: string; maxMarks: number };
  image: Buffer; contentType: string; captureSource: unknown; clientPlatform: unknown;
  imageWidth?: unknown; imageHeight?: unknown; qrCount?: unknown;
}) {
  if (!stickerResearchEnabled()) return undefined;
  const id = validUuid(input.id) ? input.id : crypto.randomUUID();
  const existing = await prisma.stickerResearchCapture.findUnique({ where: { id } });
  if (existing) return existing.teacherId === input.teacherId && existing.testId === input.test.id ? existing.id : undefined;
  let storageKey: string | undefined;
  try {
    const institute = await prisma.institute.findUnique({ where: { id: input.instituteId }, select: { name: true } });
    if (!institute) return undefined;
    storageKey = await storeStickerResearchImage(input.image, input.contentType);
    const numberOrNull = (value: unknown, max: number) => Number.isInteger(Number(value)) && Number(value) > 0 ? Math.min(Number(value), max) : null;
    const row = await prisma.stickerResearchCapture.create({ data: {
      id, instituteId: input.instituteId, instituteName: label(institute.name, 'Unknown institute'),
      teacherId: input.teacherId, teacherName: label(input.teacherName, 'Unknown teacher'),
      testId: input.test.id, testName: label(input.test.name, 'Unknown test'), maxMarks: input.test.maxMarks,
      storageKey, imageSha256: crypto.createHash('sha256').update(input.image).digest('hex'), contentType: input.contentType,
      sizeBytes: input.image.length, imageWidth: numberOrNull(input.imageWidth, 20000), imageHeight: numberOrNull(input.imageHeight, 20000),
      qrCount: numberOrNull(input.qrCount, 100), captureSource: normalizeCaptureSource(input.captureSource),
      clientPlatform: normalizeClientPlatform(input.clientPlatform), consentReference: consentReference(),
      retentionUntil: new Date(Date.now() + retentionDays() * 86400000),
    } });
    return row.id;
  } catch (error) {
    if (storageKey) await deleteStickerResearchImage(storageKey).catch(() => undefined);
    secureLogger.error('[Sticker research] Capture record failed.', { error: error instanceof Error ? error.message : String(error) });
    return undefined;
  }
}

export async function updateStickerResearchGeometry(input: { id: unknown; teacherId: string; imageWidth: unknown; imageHeight: unknown; qrCount: unknown }) {
  if (!stickerResearchEnabled() || !validUuid(input.id)) return;
  const bounded = (value: unknown, max: number) => Number.isInteger(Number(value)) && Number(value) > 0 ? Math.min(Number(value), max) : undefined;
  await prisma.stickerResearchCapture.updateMany({ where: { id: input.id, teacherId: input.teacherId }, data: {
    imageWidth: bounded(input.imageWidth, 20000), imageHeight: bounded(input.imageHeight, 20000), qrCount: bounded(input.qrCount, 100),
  } });
}

export async function recordStickerResearchOcrAttempt(input: {
  captureId: unknown; teacherId: string; mode: unknown; targets: unknown; image: Buffer; contentType: string;
  result: unknown; status: string; reason?: string; elapsedMs: number; cacheHit?: boolean;
}) {
  if (!stickerResearchEnabled() || !validUuid(input.captureId)) return;
  try {
    const capture = await prisma.stickerResearchCapture.findFirst({ where: { id: input.captureId, teacherId: input.teacherId }, select: { id: true } });
    if (!capture) return;
    await prisma.stickerResearchOcrAttempt.create({ data: {
      captureId: capture.id, mode: input.mode === 'multiple' ? 'multiple' : 'single', targets: input.targets == null ? undefined : json(input.targets),
      inputSha256: crypto.createHash('sha256').update(input.image).digest('hex'), contentType: input.contentType, sizeBytes: input.image.length,
      result: json(input.result), status: label(input.status, 'unknown', 40), reason: input.reason ? label(input.reason, '', 120) : null,
      elapsedMs: Math.max(0, Math.min(Math.round(input.elapsedMs), 120000)), cacheHit: !!input.cacheHit,
    } });
  } catch (error) {
    secureLogger.error('[Sticker research] OCR attempt record failed.', { error: error instanceof Error ? error.message : String(error) });
  }
}

export type ResearchMarkInput = {
  studentId: string; score: number; expectedScore: number | null; researchCaptureId?: string; researchStickerIndex?: number;
  researchOcrScore?: string; researchQrHumanId?: string; researchQrX?: number; researchQrY?: number;
  researchIdentitySource?: 'qr' | 'manual_picker'; researchReviewDurationMs?: number;
};

export async function finalizeStickerResearchItems(input: { teacherId: string; testId: string; marks: ResearchMarkInput[]; savedStudentIds: Set<string> }) {
  if (!stickerResearchEnabled()) return;
  const groups = new Map<string, ResearchMarkInput[]>();
  input.marks.filter(mark => validUuid(mark.researchCaptureId) && input.savedStudentIds.has(mark.studentId)).forEach(mark => {
    const list = groups.get(mark.researchCaptureId!) || []; list.push(mark); groups.set(mark.researchCaptureId!, list);
  });
  for (const [captureId, marks] of groups) {
    const capture = await prisma.stickerResearchCapture.findFirst({ where: { id: captureId, teacherId: input.teacherId, testId: input.testId } });
    if (!capture) continue;
    const students = await prisma.student.findMany({ where: { id: { in: marks.map(mark => mark.studentId) } }, include: { enrollments: { where: { status: 'ACTIVE' }, include: { batch: true } } } });
    const byId = new Map(students.map(student => [student.id, student]));
    for (const [position, mark] of marks.entries()) {
      const student = byId.get(mark.studentId); if (!student) continue;
      const ocrNumeric = typeof mark.researchOcrScore === 'string' && /^\d+(?:\.\d+)?$/.test(mark.researchOcrScore) ? Number(mark.researchOcrScore) : null;
      const enrollment = student.enrollments[0];
      await prisma.stickerResearchItem.upsert({ where: { captureId_stickerIndex: { captureId, stickerIndex: mark.researchStickerIndex ?? position } }, create: {
        captureId, stickerIndex: mark.researchStickerIndex ?? position, studentId: student.id, studentHumanId: student.humanId,
        studentName: student.name, batchId: enrollment?.batchId, batchName: enrollment?.batch?.name,
        qrHumanId: mark.researchQrHumanId, qrMatched: mark.researchQrHumanId ? mark.researchQrHumanId === student.humanId : null,
        qrX: mark.researchQrX, qrY: mark.researchQrY, identitySource: mark.researchIdentitySource || 'unknown', ocrScore: mark.researchOcrScore,
        finalScore: mark.score, reviewDurationMs: mark.researchReviewDurationMs,
        wasCorrected: ocrNumeric == null ? null : Math.abs(ocrNumeric - mark.score) > 1e-9, wasOverwrite: mark.expectedScore != null,
        outcome: ocrNumeric == null ? 'MANUAL_AFTER_UNREADABLE' : Math.abs(ocrNumeric - mark.score) <= 1e-9 ? 'OCR_ACCEPTED' : 'OCR_CORRECTED',
      }, update: {} });
    }
    await prisma.stickerResearchCapture.update({ where: { id: captureId }, data: { outcome: 'COMPLETED', completedAt: new Date() } });
  }
}

export async function markStickerResearchOutcome(input: { id: string; teacherId: string; outcome: string }) {
  if (!stickerResearchEnabled() || !['RETAKE', 'CANCELLED'].includes(input.outcome)) return;
  await prisma.stickerResearchCapture.updateMany({ where: { id: input.id, teacherId: input.teacherId, completedAt: null }, data: { outcome: input.outcome, completedAt: new Date() } });
}

export async function purgeExpiredStickerResearchCaptures() {
  if (!stickerResearchEnabled()) return;
  const expired = await prisma.stickerResearchCapture.findMany({ where: { retentionUntil: { lte: new Date() } }, select: { id: true, storageKey: true } });
  for (const row of expired) { await deleteStickerResearchImage(row.storageKey); await prisma.stickerResearchCapture.delete({ where: { id: row.id } }); }
}

if (process.env.NODE_ENV !== 'test') {
  const timer = setInterval(() => void purgeExpiredStickerResearchCaptures().catch(error => secureLogger.error('[Sticker research] Retention cleanup failed.', { error: String(error) })), 86400000);
  timer.unref();
}
