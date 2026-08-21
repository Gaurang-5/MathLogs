import type { CoachingFeeMode } from '@prisma/client';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { prisma } from '../prisma';

export type ModeLoader = (instituteId: string) => Promise<CoachingFeeMode | null>;

const defaultLoadMode: ModeLoader = async (instituteId) => {
    const institute = await prisma.institute.findUnique({
        where: { id: instituteId },
        select: { coachingFeeMode: true },
    });

    return institute?.coachingFeeMode ?? null;
};

export function requireCoachingFeeMode(
    expected: CoachingFeeMode,
    loadMode: ModeLoader = defaultLoadMode,
): RequestHandler {
    return async (req: Request, res: Response, next: NextFunction) => {
        const instituteId = req.user?.instituteId;
        if (!instituteId) return res.status(401).json({ error: 'Missing institute context' });

        const actual = await loadMode(instituteId);
        if (!actual) return res.status(404).json({ error: 'Institute not found' });
        if (actual !== expected) {
            return res.status(409).json({ error: 'FEE_MODE_MISMATCH', expected, actual });
        }

        next();
    };
}
