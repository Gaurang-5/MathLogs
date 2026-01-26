/**
 * Structured Logging Utility for Production Debugging
 * 
 * Provides consistent, searchable log format for operational monitoring.
 * Safe for production - avoids logging sensitive PII.
 */

type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

interface LogContext {
    [key: string]: any;
}

/**
 * Create structured log entry
 */
function log(level: LogLevel, event: string, context?: LogContext) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        level,
        event,
        ...context
    };

    // Format for easy grep/search
    const formattedMessage = `[${timestamp}] [${level}] [${event}]`;

    switch (level) {
        case 'ERROR':
            console.error(formattedMessage, context || '');
            break;
        case 'WARN':
            console.warn(formattedMessage, context || '');
            break;
        case 'DEBUG':
            if (process.env.NODE_ENV !== 'production') {
                console.log(formattedMessage, context || '');
            }
            break;
        default:
            console.log(formattedMessage, context || '');
    }

    return logEntry;
}

/**
 * Sanitize sensitive data before logging
 */
function sanitize(data: any): any {
    if (!data) return data;

    const sanitized = { ...data };

    // Sanitize WhatsApp/phone numbers - keep last 4 digits only
    if (sanitized.parentWhatsapp) {
        sanitized.parentWhatsapp = '***' + sanitized.parentWhatsapp.slice(-4);
    }
    if (sanitized.whatsapp) {
        sanitized.whatsapp = '***' + sanitized.whatsapp.slice(-4);
    }

    // Sanitize email - keep domain
    if (sanitized.parentEmail) {
        const parts = sanitized.parentEmail.split('@');
        sanitized.parentEmail = parts[0].slice(0, 2) + '***@' + (parts[1] || '');
    }
    if (sanitized.email) {
        const parts = sanitized.email.split('@');
        sanitized.email = parts[0].slice(0, 2) + '***@' + (parts[1] || '');
    }

    // Remove password fields entirely
    delete sanitized.password;
    delete sanitized.parentPassword;

    return sanitized;
}

// Convenience methods
export const logger = {
    info: (event: string, context?: LogContext) => log('INFO', event, context),
    warn: (event: string, context?: LogContext) => log('WARN', event, context),
    error: (event: string, context?: LogContext) => log('ERROR', event, context),
    debug: (event: string, context?: LogContext) => log('DEBUG', event, context),

    // Domain-specific logging
    registration: {
        started: (batchId: string, studentName: string, whatsapp: string) =>
            log('INFO', 'REGISTRATION_STARTED', sanitize({ batchId, studentName, whatsapp })),

        success: (batchId: string, studentId: string, humanId: string, latencyMs: number) =>
            log('INFO', 'REGISTRATION_SUCCESS', { batchId, studentId, humanId, latencyMs }),

        idempotencyHit: (batchId: string, studentName: string, existingId: string) =>
            log('INFO', 'REGISTRATION_IDEMPOTENCY_HIT', { batchId, studentName, existingId }),

        idCollision: (prefix: string, attemptedSeq: number, retries: number, maxRetries: number) =>
            log('WARN', 'REGISTRATION_ID_COLLISION', { prefix, attemptedSeq, retries, maxRetries }),

        naturalKeyCollision: (batchId: string, studentName: string, action: string) =>
            log('INFO', 'REGISTRATION_NATURAL_KEY_COLLISION', { batchId, studentName, action }),

        error: (batchId: string, studentName: string, errorType: string, message: string, retries?: number) =>
            log('ERROR', 'REGISTRATION_ERROR', sanitize({ batchId, studentName, errorType, message, retries })),

        timeout: (batchId: string, studentName: string, elapsedMs: number) =>
            log('ERROR', 'REGISTRATION_TIMEOUT', { batchId, studentName, elapsedMs }),
    },

    batch: {
        created: (batchId: string, name: string, teacherId: string) =>
            log('INFO', 'BATCH_CREATED', { batchId, name, teacherId }),

        registrationOpened: (batchId: string, name: string) =>
            log('INFO', 'BATCH_REGISTRATION_OPENED', { batchId, name }),

        registrationClosed: (batchId: string, name: string, studentCount: number) =>
            log('INFO', 'BATCH_REGISTRATION_CLOSED', { batchId, name, studentCount }),
    },

    academicYear: {
        switched: (teacherId: string, fromYearId: string | null, toYearId: string, yearName: string) =>
            log('INFO', 'ACADEMIC_YEAR_SWITCHED', { teacherId, fromYearId, toYearId, yearName }),

        created: (yearId: string, name: string, teacherId: string) =>
            log('INFO', 'ACADEMIC_YEAR_CREATED', { yearId, name, teacherId }),
    },

    performance: {
        slow: (operation: string, durationMs: number, threshold: number, context?: LogContext) =>
            log('WARN', 'SLOW_OPERATION', { operation, durationMs, threshold, ...context }),
    }
};

export default logger;
