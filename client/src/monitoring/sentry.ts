/**
 * Sentry Frontend Error Monitoring
 * Captures client-side errors and user interactions
 */

import * as Sentry from '@sentry/react';
import type { Breadcrumb } from '@sentry/react';

const IS_PRODUCTION = import.meta.env.PROD;
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;
let sentryInitialized = false;

// Public student flows must not depend on, or send personal data to, telemetry.
// These pages are commonly opened on shared devices and classroom networks.
const isPublicStudentFlow = () => {
    if (typeof window === 'undefined') return false;

    const path = window.location.pathname;
    return /^\/register\/[^/]+/.test(path)
        || /^\/kiosk\/register\/[^/]+/.test(path)
        || /^\/check-status\/[^/]+/.test(path)
        || /^\/pay\/[^/]+/.test(path)
        || /^\/[^/]+\/student(?:\/|$)/.test(path);
};

export const initializeSentry = () => {
    if (!SENTRY_DSN) {
        if (IS_PRODUCTION) {
            console.warn('[SENTRY] No DSN configured for production frontend');
        }
        return;
    }
    if (isPublicStudentFlow()) return;

    try {
        Sentry.init({
            dsn: SENTRY_DSN,
            environment: IS_PRODUCTION ? 'production' : 'development',
            sendDefaultPii: false,

            // Performance Monitoring
            integrations: [
                Sentry.browserTracingIntegration(),
                Sentry.replayIntegration({
                    maskAllText: true, // GDPR: Mask all text
                    blockAllMedia: true, // GDPR: Block all media
                }),
            ],

            // Console payloads can contain form context. Keep them local.
            enableLogs: false,

        // Performance traces sample rate
        tracesSampleRate: IS_PRODUCTION ? 0.1 : 1.0,

        // Session replay sample rate
        replaysSessionSampleRate: IS_PRODUCTION ? 0.1 : 0.5,
        replaysOnErrorSampleRate: 1.0, // Always replay when error occurs

        // Release tracking
        release: import.meta.env.VITE_APP_VERSION || '1.0.0',

        // PII filtering
        beforeSend(event) {
            // Also protects client-side navigation into a public student flow.
            if (isPublicStudentFlow()) return null;

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

        beforeSendTransaction(event) {
            return isPublicStudentFlow() ? null : event;
        },

        // Ignore specific errors
        ignoreErrors: [
            'ResizeObserver loop limit exceeded', // Common browser warning
            'Non-Error promise rejection',
            'Network request failed',
            'Load failed',
            'QuotaExceededError', // LocalStorage quota issues
            // Stale chunk hashes after a deploy — handled by ChunkErrorBoundary (forced reload)
            'Failed to fetch dynamically imported module',
            'Importing a module script failed',
            'error loading dynamically imported module',
        ],
        });
        sentryInitialized = true;

        console.log('[SENTRY] Frontend initialized');
    } catch (error) {
        // Monitoring is optional and must never prevent the application mounting.
        console.warn('[SENTRY] Initialization skipped', error);
    }
};

// Helper to capture custom errors
export const captureException = (error: Error, context?: {
    userId?: string;
    page?: string;
    action?: string;
}) => {
    if (!sentryInitialized || isPublicStudentFlow()) return;

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
export const addBreadcrumb = (message: string, category: string, data?: Breadcrumb['data']) => {
    if (!sentryInitialized || isPublicStudentFlow()) return;

    Sentry.addBreadcrumb({
        message,
        category,
        level: 'info',
        data,
    });
};

export default Sentry;
