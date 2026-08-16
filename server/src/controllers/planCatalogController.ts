import type { Request, Response } from 'express';
import { publicPlanCatalogue } from '../domain/plans/planCatalog';

/** Public, server-authoritative billing catalogue. */
export function getPublicPlanCatalogue(_req: Request, res: Response) {
  return res.json({ success: true, data: publicPlanCatalogue() });
}
