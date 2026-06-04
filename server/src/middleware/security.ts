import { Express, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redis } from '../utils/redis';
import { secureLogger } from '../utils/secureLogger';


export const configureSecurityHeaders = (app: Express) => {
    // Hardened Helmet configuration with strict CSP
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc: [
                    "'self'",
                    "'unsafe-inline'", // Required for React inline styles & Razorpay modal
                    "https://fonts.googleapis.com"
                ],
                scriptSrc: [
                    "'self'",
                    "'unsafe-inline'",                // Required: Razorpay injects inline scripts
                    "https://checkout.razorpay.com",
                    "https://checkout-static-next.razorpay.com",
                    "https://*.razorpay.com"
                ],
                imgSrc: ["'self'", "data:", "blob:", "https://*.razorpay.com"],
                connectSrc: [
                    "'self'",
                    "data:",
                    "https://fonts.googleapis.com",
                    "https://fonts.gstatic.com",
                    "https://checkout-static-next.razorpay.com",
                    "https://*.razorpay.com",         // Razorpay API calls
                    "https://api.razorpay.com",
                    "https://lumberjack.razorpay.com", // Razorpay analytics
                    "https://o4510811766718464.ingest.us.sentry.io"
                ],
                fontSrc: [
                    "'self'",
                    "data:",
                    "https://fonts.googleapis.com",
                    "https://fonts.gstatic.com"
                ],
                objectSrc: ["'none'"],
                mediaSrc: ["'self'", "blob:"],
                frameSrc: [
                    "https://api.razorpay.com",       // Razorpay payment iframe
                    "https://*.razorpay.com"
                ],
                workerSrc: ["'self'", "blob:"],
                childSrc: ["'self'", "blob:"],
                baseUri: ["'self'"],
                formAction: ["'self'"],
                frameAncestors: ["'self'"],
                scriptSrcAttr: ["'none'"],
                upgradeInsecureRequests: []
            }
        },
        hsts: {
            maxAge: 31536000,
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
    store: new RedisStore({
        sendCommand: (...args: string[]) => (redis as any).call(...args),
        prefix: 'rl:api:',
    }),
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Limit each IP to 1000 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
    handler: (req: Request, res: Response) => {
        secureLogger.warn('[RATE_LIMIT_EXCEEDED]', {
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
    store: new RedisStore({
        sendCommand: (...args: string[]) => (redis as any).call(...args),
        prefix: 'rl:auth:',
    }),
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.NODE_ENV === 'production' ? 20 : 500, // 500 in dev to prevent lockouts during hot reloads
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many login attempts, please try again later.' },
    handler: (req: Request, res: Response) => {
        secureLogger.warn('[RATE_LIMIT_EXCEEDED]', {
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
    store: new RedisStore({
        sendCommand: (...args: string[]) => (redis as any).call(...args),
        prefix: 'rl:public:',
    }),
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
    store: new RedisStore({
        sendCommand: (...args: string[]) => (redis as any).call(...args),
        prefix: 'rl:payment:',
    }),
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 10, // Limit each user to 10 payment submissions per minute
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many payment submissions. Please wait a moment before trying again.' },
    handler: (req: Request, res: Response) => {
        const user = req.user;
        secureLogger.warn('[RATE_LIMIT_EXCEEDED]', {
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

// ✅ HIGH-1: Dedicated Limiter for UPI Payment Flows
export const upiPaymentLimiter = rateLimit({
    store: new RedisStore({
        sendCommand: (...args: string[]) => (redis as any).call(...args),
        prefix: 'rl:upi:',
    }),
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 30, // Limit each IP to 30 requests per windowMs (allows retries)
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many payment requests. Please wait a moment.' },
    handler: (req: Request, res: Response) => {
        secureLogger.warn('[RATE_LIMIT_EXCEEDED]', {
            type: 'upi_payment_flow',
            ip: req.ip,
            path: req.path,
            method: req.method,
            timestamp: new Date().toISOString()
        });
        res.status(429).json({ error: 'Too many payment requests. Please wait a moment.' });
    }
});

// ✅ HIGH-1: Per-User OCR Rate Limiter
// Protects against Gemini quota drain and cost spikes
export const ocrLimiter = rateLimit({
    store: new RedisStore({
        sendCommand: (...args: string[]) => (redis as any).call(...args),
        prefix: 'rl:ocr:',
    }),
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 15, // Limit each user to 15 scans per minute
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Scanning too fast. Please wait a moment.' },
    validate: { ip: false },
    keyGenerator: (req) => {
        // Use User ID if available (authenticated), otherwise fallback to IP
        const user = req.user;
        return user?.id || ipKeyGenerator(req.ip || '127.0.0.1');
    },
    handler: (req: Request, res: Response) => {
        const user = req.user;
        secureLogger.warn('[RATE_LIMIT_EXCEEDED]', {
            type: 'ocr',
            userId: user?.id || 'unknown',
            username: user?.username || 'unknown',
            ip: req.ip,
            path: req.path,
            timestamp: new Date().toISOString(),
            severity: 'HIGH',
            message: 'OCR limiter hit - potential cost abuse'
        });
        res.status(429).json({
            error: 'Scanning too fast. Please wait a moment.'
        });
    }
});

// ✅ P0 FIX: Bulk WhatsApp/Notification Rate Limiter
// Prevents teachers from accidentally sending duplicate bulk messages
// by spamming "Send Invite" or "Send Results" buttons
export const bulkNotifyLimiter = rateLimit({
    store: new RedisStore({
        sendCommand: (...args: string[]) => (redis as any).call(...args),
        prefix: 'rl:bulk_notify:',
    }),
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 5, // Max 5 bulk sends per minute per user
    standardHeaders: true,
    legacyHeaders: false,
    validate: { ip: false },
    keyGenerator: (req) => {
        const user = req.user;
        return user?.id || ipKeyGenerator(req.ip || '127.0.0.1');
    },
    message: { error: 'Too many notifications sent. Please wait a minute before sending again.' },
    handler: (req: Request, res: Response) => {
        const user = req.user;
        secureLogger.warn('[RATE_LIMIT_EXCEEDED]', {
            type: 'bulk_notify',
            userId: user?.id || 'unknown',
            ip: req.ip,
            path: req.path,
            timestamp: new Date().toISOString(),
            severity: 'HIGH',
            message: 'Bulk notification rate limit hit - possible duplicate sends'
        });
        res.status(429).json({
            error: 'Too many notifications sent. Please wait a minute before sending again.'
        });
    }
});

// Student Portal: General Limiter for Dashboard and Read Routes
export const studentPortalLimiter = rateLimit({
    store: new RedisStore({
        sendCommand: (...args: string[]) => (redis as any).call(...args),
        prefix: 'rl:student_portal:',
    }),
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 300, // Limit each IP to 300 requests per 15 minutes
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please try again later.' },
    handler: (req: Request, res: Response) => {
        secureLogger.warn('[RATE_LIMIT_EXCEEDED]', {
            type: 'student_portal',
            ip: req.ip,
            path: req.path,
            timestamp: new Date().toISOString()
        });
        res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }
});

// Student Portal: Login Rate Limiter
export const studentLoginLimiter = rateLimit({
    store: new RedisStore({
        sendCommand: (...args: string[]) => (redis as any).call(...args),
        prefix: 'rl:student_login:',
    }),
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // 20 login attempts per IP per window
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many login attempts. Please try again later.' },
    handler: (req: Request, res: Response) => {
        secureLogger.warn('[RATE_LIMIT_EXCEEDED]', {
            type: 'student_login',
            ip: req.ip,
            path: req.path,
            timestamp: new Date().toISOString(),
            severity: 'MEDIUM',
            message: 'Student portal login rate limit hit'
        });
        res.status(429).json({ error: 'Too many login attempts. Please try again later.' });
    }
});

// Student Portal: Quiz Activity Rate Limiter (heartbeat, autosave, cheating events)
// Tuned for classroom NAT: up to 200 students behind one IP, each sending heartbeat + autosave every ~15s
// Math: 200 students × 4 req/min = 800 req/min. Limit is 600 — catches abuse, allows real classroom use.
export const quizActivityLimiter = rateLimit({
    store: new RedisStore({
        sendCommand: (...args: string[]) => (redis as any).call(...args),
        prefix: 'rl:quiz_activity:',
    }),
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 600, // 600 req/min per IP (supports ~200 students on shared school Wi-Fi)
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please wait a moment.' },
    handler: (req: Request, res: Response) => {
        secureLogger.warn('[RATE_LIMIT_EXCEEDED]', {
            type: 'quiz_activity',
            ip: req.ip,
            path: req.path,
            method: req.method,
            timestamp: new Date().toISOString(),
            severity: 'HIGH',
            message: 'Quiz activity rate limit hit - possible bot or spam'
        });
        res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
    }
});
