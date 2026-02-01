/**
 * Sentry Error Monitoring Integration
 * Automatically captures errors, performance metrics, and user context
 */

import * as Sentry from '@sentry/node';
import { ProfilingIntegration } from '@sentry/profiling-node';
import { Express } from 'express';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const SENTRY_DSN = process.env.SENTRY_DSN;

/**
 * Initialize Sentry monitoring
 * Should be called BEFORE any other app code
 */
export const initializeSentry = (app: Express) => {
    if (!SENTRY_DSN) {
        if (IS_PRODUCTION) {
            console.error('[SENTRY] ⚠️ SENTRY_DSN not set in production!');
        } else {
            console.log('[SENTRY] Skipping Sentry in development (no DSN)');
        }
        return;
    }

    Sentry.init({
        dsn: SENTRY_DSN,
        environment: process.env.NODE_ENV || 'development',

        // Performance Monitoring
        tracesSampleRate: IS_PRODUCTION ? 0.1 : 1.0, // 10% in prod, 100% in dev

        // Profiling
        profilesSampleRate: IS_PRODUCTION ? 0.1 : 1.0,
        integrations: [
            new ProfilingIntegration(),
            new Sentry.Integrations.Http({ tracing: true }),
            new Sentry.Integrations.Express({ app })
        ],

        // Release tracking
        release: process.env.HEROKU_SLUG_COMMIT || 'local-development',

        // PII filtering (CRITICAL for GDPR)
        beforeSend(event, hint) {
            // Remove PII from error data
            if (event.request) {
                delete event.request.cookies;
                if (event.request.data) {
                    const data = event.request.data as any;
                    // Redact sensitive fields
                    const sensitiveFields = ['password', 'token', 'parentWhatsapp', 'parentEmail', 'email', 'phone'];
                    sensitiveFields.forEach(field => {
                        if (data[field]) data[field] = '[REDACTED]';
                    });
                }
            }
            return event;
        },

        // Ignore specific errors
        ignoreErrors: [
            'Non-Error promise rejection captured',
            'Network request failed',
            'Load failed',
            'Invalid credentials' // Don't log failed login attempts to Sentry
        ]
    });

    console.log('[SENTRY] ✅ Initialized successfully');
    console.log(`[SENTRY] Environment: ${process.env.NODE_ENV}`);
    console.log(`[SENTRY] Sample Rate: ${IS_PRODUCTION ? '10%' : '100%'}`);
};

/**
 * Sentry request handler (must be first middleware)
 */
export const sentryRequestHandler = () => {
    return Sentry.Handlers.requestHandler();
};

/**
 * Sentry tracing handler (after request handler)
 */
export const sentryTracingHandler = () => {
    return Sentry.Handlers.tracingHandler();
};

/**
 * Sentry error handler (must be AFTER all routes, BEFORE other error handlers)
 */
export const sentryErrorHandler = () => {
    return Sentry.Handlers.errorHandler();
};

/**
 * Capture exception with context
 */
export const captureException = (error: Error, context?: {
    userId?: string;
    username?: string;
    instituteId?: string;
    endpoint?: string;
    [key: string]: any;
}) => {
    if (!SENTRY_DSN) return;

    Sentry.captureException(error, {
        tags: {
            endpoint: context?.endpoint,
            instituteId: context?.instituteId
        },
        user: {
            id: context?.userId,
            username: context?.username
        },
        extra: context
    });
};

/**
 * Capture message (for non-error events)
 */
export const captureMessage = (message: string, level: 'info' | 'warning' | 'error' = 'info') => {
    if (!SENTRY_DSN) return;

    Sentry.captureMessage(message, level);
};

/**
 * Add breadcrumb for debugging
 */
export const addBreadcrumb = (category: string, message: string, data?: any) => {
    if (!SENTRY_DSN) return;

    Sentry.addBreadcrumb({
        category,
        message,
        level: 'info',
        data
    });
};

/**
 * Performance monitoring for specific operations
 */
export const measurePerformance = async <T>(
    operation: string,
    fn: () => Promise<T>
): Promise<T> => {
    if (!SENTRY_DSN) return fn();

    const transaction = Sentry.startTransaction({
        op: operation,
        name: operation
    });

    try {
        const result = await fn();
        transaction.setStatus('ok');
        return result;
    } catch (error) {
        transaction.setStatus('internal_error');
        throw error;
    } finally {
        transaction.finish();
    }
};

export default Sentry;
