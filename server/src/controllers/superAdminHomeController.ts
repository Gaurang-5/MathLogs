import type { Request, Response } from 'express';
import { getSuperAdminHome, searchSuperAdminInstitutes } from '../services/superAdminHomeService';

export async function getHome(_req: Request, res: Response) {
  try {
    return res.json({ success: true, data: await getSuperAdminHome() });
  } catch {
    return res.status(500).json({ success: false, error: 'SUPERADMIN_HOME_FAILED' });
  }
}

export async function searchInstitutes(req: Request, res: Response) {
  try {
    const data = await searchSuperAdminInstitutes(String(req.query.q || ''));
    return res.json({ success: true, data });
  } catch (error) {
    if (error instanceof Error && error.message === 'SEARCH_QUERY_TOO_SHORT') {
      return res.status(400).json({ success: false, error: 'SEARCH_QUERY_TOO_SHORT' });
    }
    return res.status(500).json({ success: false, error: 'SUPERADMIN_SEARCH_FAILED' });
  }
}
