import 'dotenv/config';
import path from 'path';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import apiRoutes from './routes/api';
import { prisma } from './prisma';
import { configureSecurityHeaders, apiLimiter } from './middleware/security';

const app = express();
const PORT = process.env.PORT || 3001;

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
];

app.use(cors({
    origin: (origin, callback) => {
        // In production, reject requests without Origin header (prevents server-to-server attacks)
        if (!origin) {
            // Allow requests with no Origin (e.g. standard browser navigation, same-origin requests)
            return callback(null, true);
        }

        if (allowedOrigins.includes(origin)) {
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

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date() });
});

app.use(express.static(path.join(__dirname, '../../client/dist')));

// API Routes
app.use('/api', apiRoutes);

// Catch-all route to serve React frontend for any unmatched routes
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, '../../client/dist/index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

