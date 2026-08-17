import type { NextFunction, Request, Response } from 'express';
import { isSupportFeatureEnabled } from '../config/featureFlags';

export function requireSupportFeature(_req: Request, res: Response, next: NextFunction): Response | void {
  if (!isSupportFeatureEnabled()) {
    return res.status(404).json({ success: false, error: 'NOT_FOUND' });
  }
  next();
}
