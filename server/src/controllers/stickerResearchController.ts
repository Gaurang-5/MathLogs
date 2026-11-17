import { Request, Response } from 'express';
import { markStickerResearchOutcome } from '../services/stickerResearchService';

export async function updateStickerResearchOutcome(req: Request, res: Response) {
  const id = String(req.params.id || '');
  const outcome = String(req.body?.outcome || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return res.status(400).json({ error: 'Invalid research capture ID' });
  }
  if (!['RETAKE', 'CANCELLED'].includes(outcome)) {
    return res.status(400).json({ error: 'Invalid research outcome' });
  }
  await markStickerResearchOutcome({ id, teacherId: req.user.id, outcome });
  return res.json({ success: true });
}
