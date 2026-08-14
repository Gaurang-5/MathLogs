import 'dotenv/config'; // Updated marketplace schema
import path from 'path';
import fs from 'fs';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import apiRoutes from './routes/api';
import { prisma } from './prisma';
import { configureSecurityHeaders, apiLimiter } from './middleware/security';
import { authenticateToken } from './middleware/auth';
import { initializeSentry } from './monitoring/sentry';
import Sentry from './monitoring/sentry';
import { getHealthStatus, getSimpleHealth, getSystemMetrics, getDatabaseStats } from './monitoring/health';
import { emailWorker } from './utils/emailWorker';
import { Client } from 'pg';
import { secureLogger } from './utils/secureLogger';
import { correlationId } from './middleware/correlationId';




const PORT = process.env.PORT || 3001;
const PUBLIC_SITE_URL = 'https://mathlogs.app';

function escapeHtml(value: unknown): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function escapeXml(value: unknown): string {
    return escapeHtml(value);
}

function safeJsonLd(value: Record<string, unknown> | Record<string, unknown>[]): string {
    return JSON.stringify(value).replace(/</g, '\\u003c');
}

// CORS Configuration - Security hardened
// SECURITY: Strict allowlist — no substring matching (prevents evilmathlogs.app attacks)
const PRODUCTION_ORIGINS = new Set([
    'https://mathlogs.app',
    'https://www.mathlogs.app',
    'https://mathlogs.in',
    'https://www.mathlogs.in',
]);

export function createApp() {
    const app = express();

    if (process.env.NODE_ENV !== 'test') {
        initializeSentry();
    }

    configureSecurityHeaders(app);

    app.set('trust proxy', 1);

    app.use(compression({
        level: 6,
        threshold: 1024,
        filter: (req, res) => {
            if (res.getHeader('Content-Type')?.toString().includes('json')) {
                return true;
            }
            return compression.filter(req, res);
        }
    }));

    app.use((req, res, next) => {
        const start = Date.now();
        res.on('finish', () => {
            const duration = Date.now() - start;
            if (duration > 1000) {
                secureLogger.warn(`[SLOW_REQUEST] ${req.method} ${req.path} took ${duration}ms`);
            }
        });
        next();
    });

    app.use(cors({
        origin: (origin, callback) => {
            if (!origin) {
                return callback(null, true);
            }

            const isDev = process.env.NODE_ENV !== 'production';
            const isCloudflareTunnel = origin.endsWith('.trycloudflare.com');
            const isLocalDev = /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+)(:\d+)?$/.test(origin);
            const isAllowed = PRODUCTION_ORIGINS.has(origin) || (isDev && (isLocalDev || isCloudflareTunnel));

            if (isAllowed) {
                callback(null, true);
            } else {
                secureLogger.warn(`[SECURITY] Blocked CORS request from unauthorized origin: ${origin}`);
                callback(new Error('Not allowed by CORS'));
            }
        },
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-Id', 'X-Superadmin-Challenge', 'Idempotency-Key'],
        exposedHeaders: ['Content-Disposition', 'X-Correlation-Id'],
        maxAge: 86400
    }));

    app.use(correlationId);
    app.use(express.json({ limit: '5mb' })); // Increased to 5MB to support base64 logo uploads
    app.use('/api', apiLimiter);

    app.get('/health', async (req, res) => {
        try {
            const health = await getSimpleHealth();
            res.status(health.status === 'ok' ? 200 : 503).json(health);
        } catch (error) {
            res.status(503).json({ status: 'error', timestamp: new Date().toISOString() });
        }
    });

    app.get('/health/detailed', async (req, res) => {
        try {
            const health = await getHealthStatus();
            const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;
            res.status(statusCode).json(health);
        } catch (error) {
            res.status(503).json({ status: 'unhealthy', error: 'Health check failed' });
        }
    });

    app.get('/metrics', authenticateToken as any, async (req, res) => {
        try {
            const [systemMetrics, dbStats] = await Promise.all([
                Promise.resolve(getSystemMetrics()),
                getDatabaseStats()
            ]);
            res.json({
                system: systemMetrics,
                database: dbStats,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch metrics' });
        }
    });

    app.get('/health/query-stats', authenticateToken as any, async (req, res) => {
        const { getQueryStats, getTopSlowQueries } = await import('./middleware/queryMonitor');

        res.json({
            stats: getQueryStats(),
            slowestQueries: getTopSlowQueries(10),
            timestamp: new Date().toISOString()
        });
    });

    if (process.env.NODE_ENV !== 'production') {
        app.get('/debug-sentry', (req, res) => {
            throw new Error('🧪 Sentry Test Error - If you see this in Sentry, it works!');
        });
    }

    let sitemapCache: { xml: string; expiresAt: number } | null = null;
    app.get('/sitemap.xml', async (_req, res) => {
        try {
            if (sitemapCache && sitemapCache.expiresAt > Date.now()) {
                res.type('application/xml').send(sitemapCache.xml);
                return;
            }

            const institutes = await prisma.institute.findMany({
                where: { isPubliclyListed: true, status: 'ACTIVE', slug: { not: null } },
                select: { slug: true, updatedAt: true },
                orderBy: { updatedAt: 'desc' }
            });
            const staticUrls = [
                ['/', '1.0', 'weekly'],
                ['/coaching', '0.9', 'daily'],
                ['/ai-quiz-generator', '0.9', 'weekly'],
                ['/onboarding', '0.7', 'monthly'],
                ['/about', '0.5', 'monthly'],
                ['/privacy-policy', '0.3', 'yearly'],
                ['/terms', '0.3', 'yearly']
            ];
            const urlEntries = staticUrls.map(([url, priority, changefreq]) =>
                `  <url><loc>${PUBLIC_SITE_URL}${url}</loc><changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`
            );
            institutes.forEach(item => {
                if (!item.slug) return;
                urlEntries.push(`  <url><loc>${PUBLIC_SITE_URL}/coaching/${escapeXml(item.slug)}</loc><lastmod>${item.updatedAt.toISOString()}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`);
            });

            const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlEntries.join('\n')}\n</urlset>`;
            sitemapCache = { xml, expiresAt: Date.now() + 60 * 60 * 1000 };
            res.type('application/xml').send(xml);
        } catch (error) {
            secureLogger.error('[SEO] Failed to generate sitemap', { error });
            const fallbackSitemap = path.join(__dirname, '../../client/dist/sitemap.xml');
            if (fs.existsSync(fallbackSitemap)) {
                res.type('application/xml').sendFile(fallbackSitemap);
                return;
            }
            res.status(500).type('text/plain').send('Unable to generate sitemap');
        }
    });

    // The marketplace currently serves Muzaffarnagar only. Keep one canonical
    // search page and permanently consolidate the former location URL into it.
    app.get('/coaching-in/:citySlug', (_req, res) => res.redirect(301, '/coaching'));

    app.use(express.static(path.join(__dirname, '../../client/dist')));
    app.use('/api', apiRoutes);
    app.use('/api/student-portal', require('./routes/studentPortalRoutes').default);
    app.use('/api/marketplace', require('./routes/marketplaceRoutes').default);

    // Sentry error handler MUST be registered after all routes and BEFORE other error handlers
    if (process.env.NODE_ENV !== 'test' && process.env.SENTRY_DSN) {
        Sentry.setupExpressErrorHandler(app);
    }

    app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
        console.error('[ERROR]', err);
        // Forward to Sentry if not already handled
        if (process.env.SENTRY_DSN) {
            Sentry.captureException(err);
        }
        const statusCode = err.statusCode || 500;
        const message = process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message;
        res.status(statusCode).json({ error: message });
    });

    app.get('/s/:code', async (req, res) => {
        try {
            const { code } = req.params;
            const record = await prisma.shortUrl.findUnique({
                where: { id: code }
            });
            if (!record) {
                return res.status(404).send('Invitation link not found or expired.');
            }
            res.redirect(record.longUrl);
        } catch (err) {
            console.error('Error redirecting short URL:', err);
            res.status(500).send('Internal server error');
        }
    });

    let cachedIndexHtml: string | null = null;

    app.get(/.*/, async (req, res) => {
        const indexPath = path.join(__dirname, '../../client/dist/index.html');
        if (!fs.existsSync(indexPath)) {
            return res.sendFile(indexPath);
        }

        if (!cachedIndexHtml || process.env.NODE_ENV !== 'production') {
            try {
                cachedIndexHtml = fs.readFileSync(indexPath, 'utf-8');
            } catch {
                return res.sendFile(indexPath);
            }
        }

        let title = 'MathLogs | Coaching Marketplace & AI Quiz Generator';
        let description = 'Find coaching institutes, generate AI-powered online quizzes, and manage attendance, fees, tests and parent communication with MathLogs.';
        let ogTitle = title;
        let ogDesc = description;
        let canonicalUrl = `${PUBLIC_SITE_URL}${req.path === '/' ? '/' : req.path.replace(/\/$/, '')}`;
        let robots = 'index, follow, max-image-preview:large';
        let structuredData: Record<string, unknown> | Record<string, unknown>[] | null = null;

        const pathUrl = req.path.toLowerCase();
        const privatePathPrefixes = [
            '/login', '/setup', '/dashboard', '/batches', '/tests', '/quizzes', '/scan',
            '/students', '/fees', '/settings', '/marketplace-settings', '/billing', '/approvals',
            '/super-admin', '/register/', '/kiosk/', '/check-status/', '/pay/'
        ];
        if (privatePathPrefixes.some(prefix => pathUrl === prefix || pathUrl.startsWith(prefix))) {
            robots = 'noindex, nofollow';
        }

        if (pathUrl.includes('/student/quiz/') || pathUrl.includes('/take-quiz')) {
            title = "Online Quiz & Test - MathLogs Student Portal";
            description = "Attempt your assigned online quiz, submit answers, and receive instant score analytics on MathLogs.";
            ogTitle = "Online Quiz & Test | MathLogs";
            ogDesc = description;
        } else if (pathUrl.endsWith('/student') || pathUrl.includes('/student/dashboard') || pathUrl.includes('/student-portal')) {
            title = "Student Portal - MathLogs";
            description = "Log in to your student portal to access your batch schedule, test marks, fee receipts, and online quizzes on MathLogs.";
            ogTitle = "Student Portal | MathLogs";
            ogDesc = description;
        } else if (pathUrl === '/ai-quiz-generator') {
            title = 'AI Quiz Generator for Teachers & Coaching Institutes | MathLogs';
            description = 'Create MCQ quizzes with AI, publish online tests, automatically grade answers, and analyze student performance. Built for teachers and coaching institutes.';
            ogTitle = title;
            ogDesc = description;
            structuredData = {
                '@context': 'https://schema.org',
                '@type': 'SoftwareApplication',
                name: 'MathLogs AI Quiz Generator',
                applicationCategory: 'EducationalApplication',
                operatingSystem: 'Web',
                url: canonicalUrl,
                description
            };
        } else if (pathUrl.startsWith('/coaching/')) {
            const rawSlug = req.path.slice('/coaching/'.length);
            let slug = rawSlug;
            try { slug = decodeURIComponent(rawSlug); } catch { /* Keep the raw slug for a safe no-match lookup. */ }
            try {
                const institute = await prisma.institute.findFirst({
                    where: { OR: [{ slug }, { id: slug }], isPubliclyListed: true, status: 'ACTIVE' },
                    select: {
                        name: true, slug: true, city: true, area: true, address: true, tagline: true,
                        aboutUs: true, logoUrl: true, publicPhone: true, phoneNumber: true,
                        subjectsOffered: true, googleMapsUrl: true, googleRating: true, googleReviewCount: true
                    }
                });
                if (institute) {
                    const city = institute.city || 'India';
                    title = `${institute.name} in ${city} | Reviews, Courses & Contact`;
                    description = `${institute.name}${institute.area ? ` in ${institute.area}` : ''}, ${city}. View subjects, classes, ratings, student reviews, batch details and direct contact information.`;
                    ogTitle = title;
                    ogDesc = description;
                    canonicalUrl = `${PUBLIC_SITE_URL}/coaching/${institute.slug || slug}`;
                    structuredData = {
                        '@context': 'https://schema.org',
                        '@type': 'EducationalOrganization',
                        name: institute.name,
                        url: canonicalUrl,
                        description: institute.tagline || institute.aboutUs || description,
                        image: institute.logoUrl || `${PUBLIC_SITE_URL}/logo-64.webp`,
                        telephone: institute.publicPhone || institute.phoneNumber || undefined,
                        address: {
                            '@type': 'PostalAddress',
                            streetAddress: institute.address || institute.area || undefined,
                            addressLocality: city,
                            addressCountry: 'IN'
                        },
                        areaServed: city,
                        knowsAbout: institute.subjectsOffered,
                        sameAs: institute.googleMapsUrl ? [institute.googleMapsUrl] : undefined,
                        ...(institute.googleRating && institute.googleReviewCount ? {
                            aggregateRating: {
                                '@type': 'AggregateRating', ratingValue: institute.googleRating,
                                reviewCount: institute.googleReviewCount, bestRating: 5, worstRating: 1
                            }
                        } : {})
                    };
                } else {
                    robots = 'noindex, follow';
                }
            } catch (error) {
                secureLogger.warn('[SEO] Profile metadata lookup failed', { slug, error });
            }
        } else if (pathUrl === '/coaching') {
            title = 'Best Coaching Institutes in Muzaffarnagar | Reviews & Contact';
            description = 'Find and compare coaching institutes in Muzaffarnagar. Explore subjects, classes, verified profiles, student reviews, ratings, locations and direct contact details.';
            ogTitle = title;
            ogDesc = description;
            structuredData = { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Best coaching institutes in Muzaffarnagar', url: canonicalUrl, description, about: { '@type': 'City', name: 'Muzaffarnagar' } };
        }

        let html = cachedIndexHtml
            .replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`)
            .replace(/<meta\s+name="title"[^>]*>/i, `<meta name="title" content="${escapeHtml(title)}" />`)
            .replace(/<meta\s+name="description"[^>]*>/i, `<meta name="description" content="${escapeHtml(description)}" />`)
            .replace(/<meta\s+property="og:title"[^>]*>/i, `<meta property="og:title" content="${escapeHtml(ogTitle)}" />`)
            .replace(/<meta\s+property="og:description"[^>]*>/i, `<meta property="og:description" content="${escapeHtml(ogDesc)}" />`)
            .replace(/<meta\s+property="og:url"[^>]*>/i, `<meta property="og:url" content="${escapeHtml(canonicalUrl)}" />`)
            .replace(/<meta\s+property="twitter:title"[^>]*>/i, `<meta property="twitter:title" content="${escapeHtml(ogTitle)}" />`)
            .replace(/<meta\s+property="twitter:description"[^>]*>/i, `<meta property="twitter:description" content="${escapeHtml(ogDesc)}" />`)
            .replace(/<meta\s+property="twitter:url"[^>]*>/i, `<meta property="twitter:url" content="${escapeHtml(canonicalUrl)}" />`)
            .replace(/<link\s+rel="canonical"[^>]*>/i, `<link rel="canonical" href="${escapeHtml(canonicalUrl)}" />`)
            .replace(/<meta\s+name="robots"[^>]*>/i, `<meta name="robots" content="${robots}" />`)
            .replace('</head>', `${structuredData ? `<script type="application/ld+json">${safeJsonLd(structuredData)}</script>` : ''}</head>`);

        res.setHeader('Content-Type', 'text/html');
        res.send(html);
    });

    return app;
}

export const app = createApp();

function startServer() {
    process.on('unhandledRejection', (reason: any) => {
        console.error('[FATAL] Unhandled Promise Rejection:', reason?.message || reason);
        Sentry.captureException(reason, { tags: { type: 'unhandled_rejection' } });
    });

    process.on('uncaughtException', (error) => {
        console.error('[FATAL] Uncaught Exception:', error);
        Sentry.captureException(error, { tags: { type: 'uncaught_exception' } });
        setTimeout(() => process.exit(1), 2000);
    });

    app.listen(PORT, () => {
        // Initialize background workers
        emailWorker.start();

        if (process.env.NODE_ENV === 'production' || process.env.WHATSAPP_ACCESS_TOKEN) {
            import('./utils/whatsappWorker').then(({ processWhatsappQueue }) => {
                secureLogger.info('✅ WhatsApp Worker Initialized');

                const cleanConnStr = (process.env.DATABASE_URL || '').replace(/([?&])sslmode=[^&]*/, '$1').replace(/\?$/, '');
                const pgClient = new Client({
                    connectionString: cleanConnStr,
                    ssl: { rejectUnauthorized: false },
                    connectionTimeoutMillis: 5000
                });
                let isProcessing = false;

                const triggerProcess = async () => {
                    if (isProcessing) return;
                    isProcessing = true;
                    try {
                        let processedCount = 0;
                        do {
                            processedCount = await processWhatsappQueue() || 0;
                        } while (processedCount > 0);
                    } catch (err) {
                        console.error('[WhatsApp Worker] Error:', err);
                    } finally {
                        isProcessing = false;
                    }
                };

                pgClient.connect().then(() => {
                    secureLogger.info('✅ PostgreSQL LISTEN connected for WhatsApp worker');
                    pgClient.query('LISTEN whatsapp_job_insert');
                    
                    pgClient.on('notification', (msg: any) => {
                        if (msg.channel === 'whatsapp_job_insert') {
                            triggerProcess();
                        }
                    });
                    
                    // Initial run to clear any pending jobs
                    triggerProcess();
                }).catch((err: unknown) => {
                    console.error('❌ Failed to connect PG LISTEN:', err);
                    // Fallback to polling
                    const pollQueue = async () => {
                        try {
                            const processedCount = await processWhatsappQueue();
                            setTimeout(pollQueue, processedCount && processedCount > 0 ? 100 : 5000);
                        } catch (err: unknown) {
                            setTimeout(pollQueue, 5000);
                        }
                    };
                    pollQueue();
                });
            });
        } else {
            secureLogger.info('⏭️  WhatsApp Worker skipped (no WHATSAPP_ACCESS_TOKEN configured)');
        }

        secureLogger.info(`Server running on http://localhost:${PORT}`);
        secureLogger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
        secureLogger.info(`Health check: http://localhost:${PORT}/health`);
        secureLogger.info(`Detailed health: http://localhost:${PORT}/health/detailed`);
        secureLogger.info(`Metrics: http://localhost:${PORT}/metrics`);
    });
}
// tsx runs as CJS but require.main may be undefined in some loader modes.
// Safe check: start server unless we're in test mode or explicitly imported as a library.
if (process.env.NODE_ENV !== 'test') {
    startServer();
}
