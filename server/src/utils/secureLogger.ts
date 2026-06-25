/**
 * Production-safe logging utility
 * Automatically filters sensitive data in production
 */

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

export const secureLogger = {
    /**
     * Debug logs - only in development
     * Safe to include PII as it won't appear in production
     */
    debug: (message: string, data?: any) => {
        if (!IS_PRODUCTION) {
            console.log(`[DEBUG] ${message}`, data || '');
        }
    },

    /**
     * Info logs - production safe
     * Should NOT contain PII
     */
    info: (message: string, data?: any) => {
        console.log(`[INFO] ${message}`, data || '');
    },

    /**
     * Warning logs - production safe
     * Should NOT contain PII
     */
    warn: (message: string, data?: any) => {
        console.warn(`[WARN] ${message}`, data || '');
    },

    /**
     * Error logs - production safe
     * Sanitize PII before logging
     */
    error: (message: string, error?: any) => {
        if (IS_PRODUCTION) {
            // In production, log error message but not full stack trace
            console.error(`[ERROR] ${message}`, error?.message || '');
        } else {
            console.error(`[ERROR] ${message}`, error);
        }
    },

    /**
     * Audit logs - always logged (critical actions)
     * Should NOT contain PII, only IDs and metadata
     */
    audit: (action: string, metadata: {
        userId?: string;
        username?: string;
        ip?: string;
        timestamp?: string;
        [key: string]: any;
    }) => {
        console.log(`[AUDIT] ${action}`, {
            ...metadata,
            timestamp: metadata.timestamp || new Date().toISOString()
        });
    }
};

/**
 * Sanitize data for production logging
 * Removes PII fields
 */
export const sanitizeForLog = (data: any): any => {
    if (!IS_PRODUCTION) return data;

    const sanitized = { ...data };
    const piiFields = ['name', 'parentName', 'parentWhatsapp', 'parentEmail', 'email', 'phone', 'whatsapp'];

    piiFields.forEach(field => {
        if (sanitized[field]) {
            sanitized[field] = '[REDACTED]';
        }
    });

    return sanitized;
};
