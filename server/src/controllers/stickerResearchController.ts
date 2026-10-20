import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { ownsTest } from '../services/testAccess';
import { ensureStickerResearchCapture, markStickerResearchOutcome, updateStickerResearchGeometry } from '../services/stickerResearchService';

export async function createStickerResearchCapture(req: Request, res: Response) {
  if (!req.file) return res.status(400).json({ error: 'Missing sticker photograph' });
  const test = await prisma.test.findUnique({ where: { id: String(req.body.testId || '') } });
  if (!test || !ownsTest(test, req.user)) return res.status(403).json({ error: 'Test is not available for this account' });
  const researchCaptureId = await ensureStickerResearchCapture({
    id: req.body.researchCaptureId, instituteId: req.user.instituteId, teacherId: req.user.id, teacherName: req.user.username,
    test, image: req.file.buffer, contentType: req.file.mimetype, captureSource: req.body.captureSource,
    clientPlatform: req.body.clientPlatform, imageWidth: req.body.imageWidth, imageHeight: req.body.imageHeight, qrCount: req.body.qrCount,
  });
  return res.json({ researchCaptureId });
}

export async function patchStickerResearchGeometry(req: Request, res: Response) {
  await updateStickerResearchGeometry({ id: req.params.id, teacherId: req.user.id, imageWidth: req.body.imageWidth, imageHeight: req.body.imageHeight, qrCount: req.body.qrCount });
  return res.json({ success: true });
}

export async function updateStickerResearchOutcome(req: Request, res: Response) {
  const id = String(req.params.id || ''), outcome = String(req.body?.outcome || '');
  if (!/^[0-9a-f-]{36}$/i.test(id) || !['RETAKE', 'CANCELLED'].includes(outcome)) return res.status(400).json({ error: 'Invalid research outcome' });
  await markStickerResearchOutcome({ id, teacherId: req.user.id, outcome });
  return res.json({ success: true });
}
