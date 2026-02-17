import 'dotenv/config';
import path from 'path';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import apiRoutes from './routes/api';
import { prisma } from './prisma';
import { configureSecurityHeaders, apiLimiter } from './middleware/security';
import { initializeSentry } from './monitoring/sentry';
import { getHealthStatus, getSimpleHealth, getSystemMetrics, getDatabaseStats } from './monitoring/health';

const app = express();
const PORT = process.env.PORT || 3001;
import { emailWorker } from './utils/emailWorker';

// ✅ MONITORING: Initialize Sentry FIRST (before all other middleware)
initializeSentry(app);

configureSecurityHeaders(app);

app.set('trust proxy', 1); // Trust first proxy (necessary for rate limiting behind load balancers)

// PERF: Optimize compression for JSON API responses (70-80% size reduction)
app.use(compression({
    level: 9,  // Maximum compression - JSON compresses extremely well
    threshold: 1024,  // Only compress responses > 1KB
    filter: (req, res) => {
        // Always compress JSON API responses
        if (res.getHeader('Content-Type')?.toString().includes('json')) {
            return true;
        }
        return compression.filter(req, res);
    }
}));

// PERF: Request timing middleware for observability
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        if (duration > 1000) {  // Log slow requests
            console.warn(`[SLOW_REQUEST] ${req.method} ${req.path} took ${duration}ms`);
        }
    });
    next();
});

// CORS Configuration - Security hardened
const allowedOrigins = [
    process.env.CLIENT_URL || 'http://localhost:5173',
    'http://localhost:5173', // Development fallback
    'http://localhost:3000', // Alternative dev port
    'http://localhost:5174', // Vite default retry
    'http://localhost:5175', // Vite default retry
    'http://localhost:5176', // Vite default retry
    'http://localhost:5177', // Vite default retry
    'http://localhost:5178', // Vite default retry
    'http://localhost:5179', // Vite default retry
    'http://localhost:5180', // Vite default retry
    'http://localhost:5181', // Vite default retry
    'http://localhost:5182', // Vite default retry
    'http://localhost:5183', // Vite default retry
    'http://localhost:5184', // Vite default retry
    'http://localhost:5185', // Vite default retry
    'http://localhost:3001', // Allow self-referential requests (e.g. from server itself)
];

app.use(cors({
    origin: (origin, callback) => {
        // In production, reject requests without Origin header (prevents server-to-server attacks)
        if (!origin) {
            // Allow requests with no Origin (e.g. standard browser navigation, same-origin requests)
            return callback(null, true);
        }

        // Allow Heroku domains AND custom domain mathlogs.app
        if (allowedOrigins.includes(origin) || origin.endsWith('.herokuapp.com') || origin.endsWith('mathlogs.app') || origin.endsWith('mathlogs.in')) {
            callback(null, true);
        } else {
            console.warn(`[SECURITY] Blocked CORS request from unauthorized origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Disposition'], // For file downloads
    maxAge: 86400 // 24 hours
}));

app.use(express.json({ limit: '10mb' })); // Limit payload size

// Global API rate limiter (can be overridden/tightened in specific routes)
app.use('/api', apiLimiter);

// ✅ MONITORING: Health check endpoints
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

app.get('/metrics', async (req, res) => {
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

// Query performance stats endpoint (development/debugging)
app.get('/health/query-stats', async (req, res) => {
    const { getQueryStats, getTopSlowQueries } = await import('./middleware/queryMonitor');

    res.json({
        stats: getQueryStats(),
        slowestQueries: getTopSlowQueries(10),
        timestamp: new Date().toISOString()
    });
});

// Sentry test endpoint (only for testing error tracking)
app.get('/debug-sentry', (req, res) => {
    throw new Error('🧪 Sentry Test Error - If you see this in Sentry, it works!');
});


app.use(express.static(path.join(__dirname, '../../client/dist')));

// API Routes
app.use('/api', apiRoutes);

// Generic error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('[ERROR]', err);
    const statusCode = err.statusCode || 500;
    const message = process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message;
    res.status(statusCode).json({ error: message });
});

// Catch-all route to serve React frontend for any unmatched routes
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, '../../client/dist/index.html'));
});

app.listen(PORT, () => {
    // Initialize background workers
    emailWorker.start();

    // Start WhatsApp Worker (every 5 seconds)
    import('./utils/whatsappWorker').then(({ processWhatsappQueue }) => {
        console.log('✅ WhatsApp Worker Initialized');
        setInterval(processWhatsappQueue, 5000);
    });

    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`Detailed health: http://localhost:${PORT}/health/detailed`);
    console.log(`Metrics: http://localhost:${PORT}/metrics`);
});
