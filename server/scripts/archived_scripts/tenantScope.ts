/**
 * tenantScope.ts
 *
 * FIX (P0-D): Multi-tenant isolation enforcement middleware.
 *
 * The Prisma schema uses `instituteId String?` (nullable) for all models because
 * of an ongoing migration. This means ANY query without a `where: { instituteId }` clause
 * will accidentally return all records across all institutes.
 *
 * This middleware:
 * 1. Blocks requests from admins who have no instituteId (unless they are SUPER_ADMIN)
 * 2. Exposes a typed `requireOwnInstitute(id)` helper controllers can call to verify
 *    that a fetched resource belongs to the current user's institute before returning it.
 *
 * Usage in routes:
 *    router.get('/batches/:id', authenticateToken, requireInstituteScope, handler)
 *
 * Usage in controllers:
 *    const user = req.user as AuthenticatedUser;
 *    if (!user.assertOwns(batch.instituteId)) return res.status(403).json(...)
 */

import { Request, Response, NextFunction } from 'express';

export interface AuthenticatedUser {
    id: string;
    username: string;
    role: string;
    instituteId: string | null;
    currentAcademicYearId: string | null;
    passwordVersion: number;
    /** Returns true if the resource's instituteId matches the user's own. SuperAdmins always pass. */
    assertOwns: (resourceInstituteId: string | null | undefined) => boolean;
}

/**
 * Middleware that attaches a type-safe `assertOwns()` helper to the authenticated user
 * and blocks institute-scoped routes from being called by users with no instituteId
 * (unless they are SUPER_ADMIN, who operates across all institutes).
 */
export const requireInstituteScope = (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;

    if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    // Attach an assertOwns helper that enforces tenant boundaries
    user.assertOwns = (resourceInstituteId: string | null | undefined): boolean => {
        // SuperAdmins can read/modify any institute's data
        if (user.role === 'SUPER_ADMIN') return true;
        // For regular admins: resource must belong to their institute
        if (!user.instituteId) return false;
        if (!resourceInstituteId) return false; // Orphaned resource — deny by default
        return user.instituteId === resourceInstituteId;
    };

    // Block institute_admins who somehow have no institute assigned
    // (covers accounts created during broken onboarding flows)
    if (user.role !== 'SUPER_ADMIN' && !user.instituteId) {
        console.warn(`[SECURITY] Blocked tenantless access attempt by user: ${user.username} (${user.id})`);
        return res.status(403).json({
            error: 'Your account is not associated with any institute. Please contact support.'
        });
    }

    next();
};

/**
 * Middleware for SUPER_ADMIN only routes.
 * Rejects requests from any non-superadmin role with 403.
 */
export const requireSuperAdmin = (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (!user || user.role !== 'SUPER_ADMIN') {
        console.warn(`[SECURITY] Non-superadmin attempted superadmin route: ${user?.username} on ${req.path}`);
        return res.status(403).json({ error: 'SuperAdmin access required' });
    }
    next();
};
