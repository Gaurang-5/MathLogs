import 'dotenv/config';
import path from 'path';
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




const PORT = process.env.PORT || 3001;

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
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        exposedHeaders: ['Content-Disposition'],
        maxAge: 86400
    }));

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

    app.use(express.static(path.join(__dirname, '../../client/dist')));
    app.use('/api', apiRoutes);
    app.use('/api/student-portal', require('./routes/studentPortalRoutes').default);

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

    app.get(/.*/, (req, res) => {
        res.sendFile(path.join(__dirname, '../../client/dist/index.html'));
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
                    ssl: { rejectUnauthorized: false }
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

if (require.main === module && process.env.NODE_ENV !== 'test') {
    startServer();
}
