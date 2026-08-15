
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma';
import { secureLogger } from '../utils/secureLogger';
import { effectiveEntitlements } from '../domain/plans/entitlements';


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

function isMarketplaceOnlyAllowedRequest(req: Request): boolean {
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

function supportSessionActionForbidden(req: Request) {
    const path = req.originalUrl.split('?')[0];
    if (path.startsWith('/api/super-admin') || path.startsWith('/api/auth') || path.startsWith('/api/billing')) return true;
    if (/^\/api\/institutes\/[^/]+(?:\/plan|\/config|\/suspend)?$/.test(path)) return true;
    if (req.method === 'DELETE') return true;
    return false;
}

function normalizedSupportRoute(req: Request) {
    return req.originalUrl.split('?')[0].replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id');
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
            if (user.kind === 'SUPPORT_SESSION') {
                if (supportSessionActionForbidden(req)) return res.status(403).json({ success: false, error: 'SUPPORT_SESSION_ACTION_FORBIDDEN' });
                const session = await prisma.superAdminSupportSession.findFirst({
                    where: { id: user.sessionId, adminId: user.actorAdminId, instituteId: user.instituteId, endedAt: null, expiresAt: { gt: new Date() } },
                    select: { id: true, adminId: true, instituteId: true, ticketId: true, caseId: true, expiresAt: true }
                });
                if (!session) return res.status(403).json({ success: false, error: 'SUPPORT_SESSION_EXPIRED' });
                const instituteAdmin = await prisma.admin.findFirst({ where: { instituteId: session.instituteId, role: 'INSTITUTE_ADMIN' }, select: { id: true, username: true, passwordVersion: true, instituteId: true, role: true, institute: { select: { planExpiryDate: true, plan: true, trialEndsAt: true, marketplaceAccessGrantedAt: true, includedQuizCredits: true, lifetimeQuizCredits: true } } } });
                if (!instituteAdmin) return res.status(403).json({ success: false, error: 'SUPPORT_SESSION_INSTITUTE_ADMIN_MISSING' });
                const entitlements = effectiveEntitlements(instituteAdmin.institute ?? {});
                req.user = { ...instituteAdmin, entitlements, supportActorAdminId: session.adminId, supportSessionId: session.id, supportTicketId: session.ticketId, supportCaseId: session.caseId } as any;
                if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
                    res.once('finish', () => {
                        void prisma.superAdminAuditLog.create({ data: { action: 'SUPPORT_MUTATION', entityType: 'SupportSessionRequest', entityId: normalizedSupportRoute(req), actorAdminId: session.adminId, instituteId: session.instituteId, correlationId: req.correlationId, supportSessionId: session.id, metadata: { method: req.method, route: normalizedSupportRoute(req), responseStatus: res.statusCode } } }).catch(() => undefined);
                    });
                }
                next();
                return;
            }
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
                                trialEndsAt: true,
                                marketplaceAccessGrantedAt: true,
                                includedQuizCredits: true,
                                lifetimeQuizCredits: true
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
            const entitlements = effectiveEntitlements(institute ?? {});
            const marketplaceOnly = entitlements.marketplace && !entitlements.quiz && !entitlements.enterprise;

            if (marketplaceOnly && dbUser.role !== 'SUPER_ADMIN' && !isMarketplaceOnlyAllowedRequest(req)) {
                return res.status(403).json({
                    error: 'PAGE_ONLY_ACCESS_RESTRICTED',
                    message: 'This account can access marketplace listing, leads, and upgrade features only.'
                });
            }

            req.user = { ...user, ...dbUser, entitlements };
            next();
        } catch (e) {
            console.error('Auth Middleware Error:', e);
            res.sendStatus(500);
        }
    });
};
