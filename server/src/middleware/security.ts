import { Express, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

export const configureSecurityHeaders = (app: Express) => {
    // Enhanced Helmet configuration with CSP
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles for React
                scriptSrc: ["'self'", "'unsafe-inline'"], // Allow inline scripts for React
                imgSrc: ["'self'", "data:", "blob:"],
                connectSrc: ["'self'"],
                fontSrc: ["'self'", "data:"],
                objectSrc: ["'none'"],
                mediaSrc: ["'self'"],
                frameSrc: ["'none'"]
            }
        },
        hsts: {
            maxAge: 31536000, // 1 year
            includeSubDomains: true,
            preload: true
        },
        frameguard: { action: 'deny' },
        noSniff: true,
        xssFilter: true,
        referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
    }));
};

// General API Rate Limiter
export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Limit each IP to 1000 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
    handler: (req: Request, res: Response) => {
        console.warn('[RATE_LIMIT_EXCEEDED]', {
            type: 'api',
            ip: req.ip,
            path: req.path,
            method: req.method,
            timestamp: new Date().toISOString()
        });
        res.status(429).json({ error: 'Too many requests, please try again later.' });
    }
});

// Stricter Limiter for Auth Routes
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // Limit each IP to 20 login attempts per windowMs
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many login attempts, please try again later.' },
    handler: (req: Request, res: Response) => {
        console.warn('[RATE_LIMIT_EXCEEDED]', {
            type: 'auth',
            ip: req.ip,
            path: req.path,
            method: req.method,
            timestamp: new Date().toISOString()
        });
        res.status(429).json({ error: 'Too many login attempts, please try again later.' });
    }
});

// Public Registration Rate Limiter (QR codes)
// Increased to 500/hour to handle classroom Wi-Fi (NAT) scenarios where many students share one IP.
export const publicLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many registration requests from this location. Please wait a few minutes and try again.' },
    handler: (req: Request, res: Response) => {
        const batchId = req.body?.batchId || req.params?.batchId || 'unknown';
        console.error('[RATE_LIMIT_EXCEEDED]', {
            type: 'public_registration',
            ip: req.ip,
            batchId,
            path: req.path,
            method: req.method,
            limit: 500,
            window: '1 hour',
            timestamp: new Date().toISOString(),
            message: 'This should NOT happen in normal classroom testing (75 students << 500 limit). Investigate for attack or misconfiguration.'
        });
        res.status(429).json({
            error: 'Too many registration requests from this location. Please wait a few minutes and try again.'
        });
    },
    // Log when approaching limit (80% threshold)
    skip: (req: Request) => {
        // This runs on every request, we can use it to log warnings
        return false; // Don't skip, process normally
    },
    skipSuccessfulRequests: false
});

// ✅ HIGH-2 FIX: Payment Endpoint Rate Limiter
// Prevents spam attacks on financial transactions
export const paymentLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 10, // Limit each user to 10 payment submissions per minute
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many payment submissions. Please wait a moment before trying again.' },
    handler: (req: Request, res: Response) => {
        const user = (req as any).user;
        console.warn('[RATE_LIMIT_EXCEEDED]', {
            type: 'payment',
            userId: user?.id || 'unknown',
            username: user?.username || 'unknown',
            ip: req.ip,
            path: req.path,
            method: req.method,
            timestamp: new Date().toISOString(),
            severity: 'MEDIUM',
            message: 'Payment endpoint rate limit hit - possible spam or attack'
        });
        res.status(429).json({
            error: 'Too many payment submissions. Please wait a moment before trying again.'
        });
    }
});

