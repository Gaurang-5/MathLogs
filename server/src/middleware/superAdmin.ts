import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { prisma } from '../prisma';
import type { SuperAdminActionClass } from '../services/superAdminSecurityService';

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== 'SUPER_ADMIN') {
    res.status(403).json({ success: false, error: 'SUPERADMIN_REQUIRED' });
    return;
  }
  next();
}

export function requireSuperAdminReauth(actionClass: SuperAdminActionClass): RequestHandler {
  return async (req, res, next) => {
    const challengeId = req.header('X-Superadmin-Challenge')?.trim();
    if (!challengeId) {
      res.status(403).json({ success: false, error: 'REAUTH_REQUIRED' });
      return;
    }
    try {
      const consumed = await prisma.superAdminReauthChallenge.updateMany({
        where: {
          id: challengeId,
          adminId: req.user.id,
          actionClass,
          verifiedAt: { not: null },
          consumedAt: null,
          lockedAt: null,
          expiresAt: { gt: new Date() }
        },
        data: { consumedAt: new Date() }
      });
      if (consumed.count !== 1) {
        res.status(403).json({ success: false, error: 'REAUTH_REQUIRED' });
        return;
      }
      req.superAdminChallengeId = challengeId;
      next();
    } catch (error) {
      next(error);
    }
  };
}
