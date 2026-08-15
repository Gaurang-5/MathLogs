import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 3 },
  fileFilter: (_req, file, callback) => {
    callback(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype));
  }
});

export function parseSupportAttachments(req: Request, res: Response, next: NextFunction) {
  upload.array('attachments', 3)(req, res, error => {
    if (!error) return next();
    const code = error instanceof multer.MulterError ? error.code : 'INVALID_ATTACHMENT';
    return res.status(400).json({ success: false, error: code });
  });
}

export function hasValidImageSignature(file: Express.Multer.File) {
  const bytes = file.buffer;
  if (file.mimetype === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (file.mimetype === 'image/png') return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (file.mimetype === 'image/webp') return bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  return false;
}
