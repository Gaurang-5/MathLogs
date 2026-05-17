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
import * as Sentry from '@sentry/node';
import { getHealthStatus, getSimpleHealth, getSystemMetrics, getDatabaseStats } from './monitoring/health';
import { emailWorker } from './utils/emailWorker';



const PORT = process.env.PORT || 3001;

// CORS Configuration - Security hardened
// SECURITY: Strict allowlist — no substring matching (prevents evilmathlogs.app attacks)
const PRODUCTION_ORIGINS = new Set([
    'https://mathlogs.app',
    'https://www.mathlogs.app',
    'https://mathlogs.in',
    'https://www.mathlogs.in',
]);

const DEVELOPMENT_ORIGINS = new Set([
    'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:5176',
    'http://localhost:5177',
    'http://localhost:5178',
    'http://localhost:5179',
    'http://localhost:5180',
    'http://localhost:5181',
    'http://localhost:5182',
    'http://localhost:5183',
    'http://localhost:5184',
    'http://localhost:5185',
    'http://localhost:3001',
    'http://localhost:8081',
    'http://10.100.3.216:8081',
]);

export function createApp() {
    const app = express();

    if (process.env.NODE_ENV !== 'test') {
        initializeSentry();
    }

    configureSecurityHeaders(app);

    app.set('trust proxy', 1);

    app.use(compression({
        level: 9,
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
                console.warn(`[SLOW_REQUEST] ${req.method} ${req.path} took ${duration}ms`);
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
            const isAllowed = PRODUCTION_ORIGINS.has(origin) || (isDev && (DEVELOPMENT_ORIGINS.has(origin) || isCloudflareTunnel));

            if (isAllowed) {
                callback(null, true);
            } else {
                console.warn(`[SECURITY] Blocked CORS request from unauthorized origin: ${origin}`);
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

        if (process.env.NODE_ENV === 'production') {
            import('./utils/whatsappWorker').then(({ processWhatsappQueue }) => {
                console.log('✅ WhatsApp Worker Initialized');

                const pollQueue = async () => {
                    try {
                        const processedCount = await processWhatsappQueue();
                        setTimeout(pollQueue, processedCount && processedCount > 0 ? 100 : 2000);
                    } catch (err) {
                        setTimeout(pollQueue, 5000);
                    }
                };

                pollQueue();
            });
        } else {
            console.log('⏭️  WhatsApp Worker skipped (development mode)');
        }

        console.log(`Server running on http://localhost:${PORT}`);
        console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`Health check: http://localhost:${PORT}/health`);
        console.log(`Detailed health: http://localhost:${PORT}/health/detailed`);
        console.log(`Metrics: http://localhost:${PORT}/metrics`);
    });
}

if (require.main === module && process.env.NODE_ENV !== 'test') {
    startServer();
}
