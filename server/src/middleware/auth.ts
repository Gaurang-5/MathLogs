
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error('FATAL: JWT_SECRET environment variable must be set. Generate a secure secret with: openssl rand -base64 32');
}

// ─── PERF FIX (C1): Auth Cache ───────────────────────────────────────
// Previously, EVERY authenticated request hit the DB to fetch user data.
// At 100 req/s, this alone saturated the 10-connection pool.
//
// Now we cache user data for 60 seconds. Cache is invalidated on:
// - Password changes (passwordVersion mismatch)
// - Plan changes (TTL expiry forces re-fetch)
// - Manual invalidation via invalidateAuthCache()

interface CachedUser {
    data: any;
    fetchedAt: number;
}

const AUTH_CACHE_TTL_MS = 60_000; // 60 seconds
const AUTH_CACHE_MAX_SIZE = 500;
const authCache = new Map<string, CachedUser>();

// Cleanup stale entries every 5 minutes
if (process.env.NODE_ENV !== 'test') {
    const cacheCleanupInterval = setInterval(() => {
        const now = Date.now();
        let cleaned = 0;
        for (const [key, val] of authCache.entries()) {
            if (now - val.fetchedAt > AUTH_CACHE_TTL_MS * 2) {
                authCache.delete(key);
                cleaned++;
            }
        }
        if (cleaned > 0) console.log(`[AUTH_CACHE] Cleaned ${cleaned} stale entries. Size: ${authCache.size}`);
    }, 5 * 60_000);
    cacheCleanupInterval.unref();
}

/** Call this when user changes password or critical settings */
export const invalidateAuthCache = (userId: string) => {
    authCache.delete(userId);
};

export interface AuthRequest extends Request {
    user?: any;
}

export const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        res.sendStatus(401);
        return;
    }

    jwt.verify(token, JWT_SECRET, async (err: any, user: any) => {
        if (err) {
            res.sendStatus(403);
            return;
        }

        try {
            let dbUser: any;
            const cached = authCache.get(user.id);
            const now = Date.now();

            if (cached && (now - cached.fetchedAt < AUTH_CACHE_TTL_MS)) {
                // CACHE HIT — skip DB query entirely
                dbUser = cached.data;
            } else {
                // CACHE MISS — fetch from DB and cache
                dbUser = await prisma.admin.findUnique({
                    where: { id: user.id },
                    select: {
                        id: true,
                        username: true,
                        currentAcademicYearId: true,
                        passwordVersion: true,
                        instituteId: true,
                        role: true,
                        institute: {
                            select: {
                                planExpiryDate: true,
                                plan: true
                            }
                        }
                    }
                });

                if (dbUser) {
                    // Evict oldest entries if cache is full
                    if (authCache.size >= AUTH_CACHE_MAX_SIZE) {
                        const oldest = [...authCache.entries()]
                            .sort((a, b) => a[1].fetchedAt - b[1].fetchedAt)[0];
                        if (oldest) authCache.delete(oldest[0]);
                    }
                    authCache.set(user.id, { data: dbUser, fetchedAt: now });
                }
            }

            if (!dbUser) {
                res.sendStatus(403);
                return;
            }

            // Invalidate token if password was changed (version mismatch)
            // This also invalidates the cache since we re-check on every request
            if (user.passwordVersion !== undefined && dbUser.passwordVersion !== user.passwordVersion) {
                console.warn(`[SECURITY] Token invalidated due to password change for user: ${user.username}`);
                authCache.delete(user.id); // Force re-fetch next time
                res.sendStatus(403);
                return;
            }

            if (dbUser.institute && (dbUser.institute.planExpiryDate || dbUser.institute.plan === 'NO_PLAN')) {
                const expiry = dbUser.institute.planExpiryDate ? new Date(dbUser.institute.planExpiryDate) : new Date(0);
                const isNoPlan = dbUser.institute.plan === 'NO_PLAN';
                const isExpired = expiry.getTime() < Date.now();

                if (isExpired || isNoPlan) {
                    // Allowed paths even when expired
                    const path = req.path;
                    const isExempt = path.startsWith('/billing') || path.startsWith('/auth') || path.startsWith('/institute');
                    
                    if (!isExempt) {
                        // Grant "View Only" access: they can read and download PDFs (GET) but cannot create/update/delete (POST/PUT/DELETE)
                        if (req.method !== 'GET') {
                            return res.status(402).json({ error: 'View Only Mode Active: Actions are restricted. Please upgrade your plan.' });
                        }
                    }
                }
            }

            req.user = { ...user, ...dbUser };
            next();
        } catch (e) {
            console.error('Auth Middleware Error:', e);
            res.sendStatus(500);
        }
    });
};
