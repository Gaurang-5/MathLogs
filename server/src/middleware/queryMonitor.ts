/**
 * Prisma Query Performance Monitor
 * Logs slow queries (>1s) and sends alerts to Sentry
 * Provides real-time visibility into database bottlenecks
 */

import { Prisma } from '@prisma/client';
import * as Sentry from '@sentry/node';
import { performance } from 'perf_hooks';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const SLOW_QUERY_THRESHOLD_MS = 1000; // 1 second
const VERY_SLOW_QUERY_THRESHOLD_MS = 3000; // 3 seconds

interface QueryMetrics {
    model: string;
    action: string;
    duration: number;
    timestamp: Date;
}

// In-memory query stats (last 100 queries)
const queryStats: QueryMetrics[] = [];
const MAX_STATS_SIZE = 100;

/**
 * Prisma middleware for query performance monitoring
 * Automatically logs slow queries and sends alerts to Sentry
 */
export const queryPerformanceMiddleware: Prisma.Middleware = async (params, next) => {
    const start = performance.now();

    try {
        const result = await next(params);
        const duration = performance.now() - start;

        // Track query metrics
        trackQueryMetrics(params, duration);

        // Log slow queries
        if (duration > SLOW_QUERY_THRESHOLD_MS) {
            handleSlowQuery(params, duration);
        }

        return result;
    } catch (error) {
        const duration = performance.now() - start;

        // Log failed queries
        console.error(`[QUERY_ERROR] ${params.model}.${params.action} failed after ${duration.toFixed(2)}ms`);

        // Send to Sentry
        Sentry.captureException(error, {
            level: 'error',
            tags: {
                query_type: 'failed',
                model: params.model || 'unknown',
                action: params.action
            },
            extra: {
                duration_ms: duration,
                params: sanitizeParams(params)
            }
        });

        throw error;
    }
};

/**
 * Track query metrics for analysis
 */
function trackQueryMetrics(params: Prisma.MiddlewareParams, duration: number) {
    const metric: QueryMetrics = {
        model: params.model || 'unknown',
        action: params.action,
        duration,
        timestamp: new Date()
    };

    queryStats.push(metric);

    // Keep only last 100 queries
    if (queryStats.length > MAX_STATS_SIZE) {
        queryStats.shift();
    }
}

/**
 * Handle slow query detection
 */
function handleSlowQuery(params: Prisma.MiddlewareParams, duration: number) {
    const logLevel = duration > VERY_SLOW_QUERY_THRESHOLD_MS ? '🔴 CRITICAL' : '🟡 WARNING';
    const model = params.model || 'unknown';
    const action = params.action;

    console.warn(
        `[SLOW_QUERY] ${logLevel} ${model}.${action} took ${duration.toFixed(2)}ms (threshold: ${SLOW_QUERY_THRESHOLD_MS}ms)`
    );

    // Send to Sentry for production monitoring
    if (IS_PRODUCTION || duration > VERY_SLOW_QUERY_THRESHOLD_MS) {
        Sentry.captureMessage(`Slow Query: ${model}.${action}`, {
            level: duration > VERY_SLOW_QUERY_THRESHOLD_MS ? 'error' : 'warning',
            tags: {
                query_type: 'slow',
                model,
                action,
                severity: duration > VERY_SLOW_QUERY_THRESHOLD_MS ? 'critical' : 'warning'
            },
            extra: {
                duration_ms: duration,
                threshold_ms: SLOW_QUERY_THRESHOLD_MS,
                params: sanitizeParams(params)
            }
        });

        // Track custom metric in Sentry
        Sentry.metrics.distribution('query.duration', duration, {
            unit: 'millisecond'
        });
    }
}

/**
 * Sanitize query params to remove sensitive data
 */
function sanitizeParams(params: Prisma.MiddlewareParams): any {
    const sanitized = {
        model: params.model,
        action: params.action,
        datamodel: params.dataPath,
        runInTransaction: params.runInTransaction
    };

    // Don't log full args in production (may contain PII)
    if (!IS_PRODUCTION) {
        return {
            ...sanitized,
            args: params.args
        };
    }

    return sanitized;
}

/**
 * Get query statistics (for debugging)
 */
export function getQueryStats() {
    if (queryStats.length === 0) {
        return {
            totalQueries: 0,
            slowQueries: 0,
            avgDuration: 0,
            maxDuration: 0
        };
    }

    const slowQueries = queryStats.filter(q => q.duration > SLOW_QUERY_THRESHOLD_MS);
    const totalDuration = queryStats.reduce((sum, q) => sum + q.duration, 0);
    const maxDuration = Math.max(...queryStats.map(q => q.duration));

    return {
        totalQueries: queryStats.length,
        slowQueries: slowQueries.length,
        avgDuration: totalDuration / queryStats.length,
        maxDuration,
        slowQueryPercentage: (slowQueries.length / queryStats.length) * 100
    };
}

/**
 * Get top 10 slowest queries (for analysis)
 */
export function getTopSlowQueries(limit = 10) {
    return queryStats
        .slice()
        .sort((a, b) => b.duration - a.duration)
        .slice(0, limit)
        .map(q => ({
            model: q.model,
            action: q.action,
            duration: `${q.duration.toFixed(2)}ms`,
            timestamp: q.timestamp.toISOString()
        }));
}
