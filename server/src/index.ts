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
app.use(compression());

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
            if (process.env.NODE_ENV === 'production') {
                console.warn('[SECURITY] Blocked request with no Origin header in production');
                return callback(new Error('Not allowed by CORS'));
            }
            // Allow in development for testing tools (curl, Postman)
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

