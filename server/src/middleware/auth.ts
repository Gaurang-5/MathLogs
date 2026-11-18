
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma';
import { secureLogger } from '../utils/secureLogger';
import { effectiveEntitlements } from '../domain/plans/entitlements';
import { productPlanAccess } from '../domain/plans/productPlan';


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

type ProCapability = 'aiQuizGeneration'
    | 'onlineQuizDelivery'
    | 'scanMarks'
    | 'whatsappInvites'
    | 'whatsappReminders'
    | 'whatsappGroupLinks';

type ProFeatureRequirement = {
    capability: ProCapability;
    feature: string;
    message: string;
};

export function proFeatureForRequest(req: Pick<Request, 'originalUrl' | 'method' | 'body'>): ProFeatureRequirement | null {
    const path = req.originalUrl.split('?')[0].replace(/\/$/, '');
    if (path === '/api/tests/generate' || path.startsWith('/api/tests/generate-') || path.startsWith('/api/tests/generate/status/')) {
        return { capability: 'aiQuizGeneration', feature: 'AI quiz generation', message: 'Upgrade to Pro to generate quizzes with AI.' };
    }
    if (path.startsWith('/api/quizzes') || path === '/api/tests/online' || path.startsWith('/api/tests/online/')) {
        return { capability: 'onlineQuizDelivery', feature: 'Online quizzes', message: 'Upgrade to Pro to publish and manage online quizzes.' };
    }
    if (path === '/api/scan-ocr') {
        return { capability: 'scanMarks', feature: 'Scan Marks', message: 'Upgrade to Pro to scan marks with online OCR.' };
    }
    if (path === '/api/fees/scan-receipt' || path === '/api/month-coverage/scan-receipt') {
        return { capability: 'scanMarks', feature: 'Receipt scanning', message: 'Upgrade to Pro to scan payment receipts.' };
    }
    if (path === '/api/fees/remind' || path === '/api/month-coverage/reminders') {
        return { capability: 'whatsappReminders', feature: 'WhatsApp reminders', message: 'Upgrade to Pro to send fee reminders.' };
    }
    if (
        /^\/api\/batches\/[^/]+\/(?:invite|whatsapp-invite)$/.test(path)
        || /^\/api\/students\/[^/]+\/whatsapp-invite$/.test(path)
    ) {
        return { capability: 'whatsappInvites', feature: 'WhatsApp student invitations', message: 'Upgrade to Pro to invite students through WhatsApp.' };
    }
    const changesBatch = req.method.toUpperCase() === 'POST' && path === '/api/batches'
        || req.method.toUpperCase() === 'PUT' && /^\/api\/batches\/[^/]+$/.test(path);
    if (changesBatch && typeof req.body?.whatsappGroupLink === 'string' && req.body.whatsappGroupLink.trim()) {
        return { capability: 'whatsappGroupLinks', feature: 'WhatsApp group links', message: 'Upgrade to Pro to add a WhatsApp group link to a batch.' };
    }
    return null;
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
                const productAccess = productPlanAccess(instituteAdmin.institute ?? {});
                req.user = { ...instituteAdmin, entitlements, productAccess, supportActorAdminId: session.adminId, supportSessionId: session.id, supportTicketId: session.ticketId, supportCaseId: session.caseId } as any;
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
            const productAccess = productPlanAccess(institute ?? {});

            const requiredProFeature = proFeatureForRequest(req);
            if (
                requiredProFeature
                && dbUser.role !== 'SUPER_ADMIN'
                && !productAccess.capabilities[requiredProFeature.capability]
            ) {
                return res.status(403).json({
                    error: 'PRO_PLAN_REQUIRED',
                    feature: requiredProFeature.feature,
                    capability: requiredProFeature.capability,
                    message: requiredProFeature.message,
                });
            }

            req.user = { ...user, ...dbUser, entitlements, productAccess };
            next();
        } catch (e) {
            console.error('Auth Middleware Error:', e);
            res.sendStatus(500);
        }
    });
};
