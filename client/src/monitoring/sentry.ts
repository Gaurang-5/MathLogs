/**
 * Sentry Frontend Error Monitoring
 * Captures client-side errors and user interactions
 */

import * as Sentry from '@sentry/react';

const IS_PRODUCTION = import.meta.env.PROD;
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;

export const initializeSentry = () => {
    if (!SENTRY_DSN) {
        if (IS_PRODUCTION) {
            console.warn('[SENTRY] No DSN configured for production frontend');
        }
        return;
    }

    Sentry.init({
        dsn: SENTRY_DSN,
        environment: IS_PRODUCTION ? 'production' : 'development',

        // Performance Monitoring
        integrations: [
            Sentry.browserTracingIntegration(),
            Sentry.replayIntegration({
                maskAllText: true, // GDPR: Mask all text
                blockAllMedia: true, // GDPR: Block all media
            }),
        ],

        // Performance traces sample rate
        tracesSampleRate: IS_PRODUCTION ? 0.1 : 1.0,

        // Session replay sample rate
        replaysSessionSampleRate: IS_PRODUCTION ? 0.1 : 0.5,
        replaysOnErrorSampleRate: 1.0, // Always replay when error occurs

        // Release tracking
        release: import.meta.env.VITE_APP_VERSION || '1.0.0',

        // PII filtering
        beforeSend(event) {
            // Remove PII from URLs
            if (event.request?.url) {
                event.request.url = event.request.url.replace(
                    /\/students\/[a-zA-Z0-9-]+/g,
                    '/students/[REDACTED]'
                );
            }

            // Remove sensitive data from breadcrumbs
            if (event.breadcrumbs) {
                event.breadcrumbs = event.breadcrumbs.map(breadcrumb => {
                    if (breadcrumb.data) {
                        const sensitiveKeys = ['token', 'password', 'email', 'phone'];
                        sensitiveKeys.forEach(key => {
                            if (breadcrumb.data && breadcrumb.data[key]) {
                                breadcrumb.data[key] = '[REDACTED]';
                            }
                        });
                    }
                    return breadcrumb;
                });
            }

            return event;
        },

        // Ignore specific errors
        ignoreErrors: [
            'ResizeObserver loop limit exceeded', // Common browser warning
            'Non-Error promise rejection',
            'Network request failed',
            'Load failed',
            'QuotaExceededError', // LocalStorage quota issues
        ],
    });

    console.log('[SENTRY] Frontend initialized');
};

// Helper to capture custom errors
export const captureException = (error: Error, context?: {
    userId?: string;
    page?: string;
    action?: string;
}) => {
    if (!SENTRY_DSN) return;

    Sentry.captureException(error, {
        tags: {
            page: context?.page,
            action: context?.action,
        },
        user: {
            id: context?.userId,
        },
    });
};

// Helper to add breadcrumbs
export const addBreadcrumb = (message: string, category: string, data?: any) => {
    if (!SENTRY_DSN) return;

    Sentry.addBreadcrumb({
        message,
        category,
        level: 'info',
        data,
    });
};

export default Sentry;
