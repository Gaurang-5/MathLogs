
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma';
import { secureLogger } from '../utils/secureLogger';


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
        if (cleaned > 0) secureLogger.info(`[AUTH_CACHE] Cleaned ${cleaned} stale entries. Size: ${authCache.size}`);
    }, 5 * 60_000);
    cacheCleanupInterval.unref();
}

/** Call this when user changes password or critical settings */
export const invalidateAuthCache = (userId: string) => {
    authCache.delete(userId);
};

function isPageOnlyAllowedRequest(req: Request): boolean {
    const path = req.originalUrl.split('?')[0].replace(/\/$/, '');
    const method = req.method.toUpperCase();

    if (path === '/api/marketplace/admin/profile') {
        return method === 'GET' || method === 'PUT';
    }
    if (path === '/api/marketplace/admin/leads') {
        return method === 'GET';
    }
    if (/^\/api\/marketplace\/admin\/leads\/[^/]+$/.test(path)) {
        return method === 'PATCH';
    }
    if (path === '/api/institute/me') {
        return method === 'GET';
    }
    if (path === '/api/support/tickets' || /^\/api\/support\/tickets\/[^/]+(?:\/messages)?$/.test(path)) {
        return method === 'GET' || method === 'POST';
    }
    if (path === '/api/communication-preferences') {
        return method === 'GET' || method === 'PATCH';
    }
    if (path === '/api/billing/create' || path === '/api/billing/verify') {
        return method === 'POST';
    }
    if (path === '/api/billing/cancel') {
        return method === 'DELETE';
    }

    return false;
}

export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
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
            if (user.sessionId) {
                const activeSession = await prisma.adminSession.findFirst({
                    where: { id: user.sessionId, adminId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
                    select: { id: true }
                });
                if (!activeSession) {
                    res.sendStatus(403);
                    return;
                }
            }
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
                        passwordVersion: true,
                        instituteId: true,
                        role: true,
                        institute: {
                            select: {
                                planExpiryDate: true,
                                plan: true,
                                isQuizOnly: true,
                                quizCredits: true,
                                config: true
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
                secureLogger.warn(`[SECURITY] Token invalidated due to password change for user: ${user.username}`);
                authCache.delete(user.id); // Force re-fetch next time
                res.sendStatus(403);
                return;
            }

            const institute = dbUser.institute;
            const isQuizOnlyInst = institute?.isQuizOnly === true || (institute?.config as any)?.planName === 'QUIZ_ONLY' || (institute?.config as any)?.isQuizOnly === true;
            const isPageOnlyInst = ['PAGE_ONLY', 'listing'].includes((institute?.config as any)?.planName);

            if (isPageOnlyInst && dbUser.role !== 'SUPER_ADMIN' && !isPageOnlyAllowedRequest(req)) {
                return res.status(403).json({
                    error: 'PAGE_ONLY_ACCESS_RESTRICTED',
                    message: 'This account can access marketplace listing, leads, and upgrade features only.'
                });
            }

            // Quiz-Only accounts operate on a credit-based model (quizCredits) and must not be blocked by ERP plan expiry.
            if (institute && !isQuizOnlyInst && (institute.planExpiryDate || institute.plan === 'NO_PLAN')) {
                const expiry = institute.planExpiryDate ? new Date(institute.planExpiryDate) : new Date(0);
                const isNoPlan = institute.plan === 'NO_PLAN';
                const isExpired = expiry.getTime() < Date.now();

                if (isExpired || isNoPlan) {
                    // Allowed paths even when expired
                    const path = req.path;
                    const isExempt = path.startsWith('/billing') || path.startsWith('/auth') || path.startsWith('/institute') || path.startsWith('/tests/online') || path.startsWith('/tests/generate');
                    
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
