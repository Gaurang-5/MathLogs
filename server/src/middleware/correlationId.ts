import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const VALID_CORRELATION_ID = /^[A-Za-z0-9._:-]{1,128}$/;

export function correlationId(req: Request, res: Response, next: NextFunction) {
  const supplied = req.header('X-Correlation-Id')?.trim();
  req.correlationId = supplied && VALID_CORRELATION_ID.test(supplied)
    ? supplied
    : crypto.randomUUID();
  res.setHeader('X-Correlation-Id', req.correlationId);
  next();
}
