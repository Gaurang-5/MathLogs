import v8 from 'v8';
import { prisma } from '../prisma';

export interface HealthStatus {
    status: 'healthy' | 'degraded' | 'unhealthy';
    timestamp: string;
    uptime: number;
    checks: {
        database: { status: string; latency?: number; error?: string };
        memory: { status: string; usage: number; limit: number };
        disk: { status: string; available?: number };
    };
    version: string;
}

/**
 * Check database connectivity and performance
 */
const checkDatabase = async (): Promise<{ status: string; latency?: number; error?: string }> => {
    const start = Date.now();
    try {
        await prisma.$queryRaw`SELECT 1`;
        const latency = Date.now() - start;

        return {
            status: latency < 100 ? 'healthy' : 'degraded',
            latency
        };
    } catch (error) {
        return {
            status: 'unhealthy',
            error: error instanceof Error ? error.message : 'Unknown error'
        };
    }
};

/**
 * Check memory usage
 */
const checkMemory = (): { status: string; usage: number; limit: number } => {
    const usage = process.memoryUsage();
    const usedMB = Math.round(usage.heapUsed / 1024 / 1024);

    // Use actual V8 heap limit, not current allocation size
    const stats = v8.getHeapStatistics();
    const limitMB = Math.round(stats.heap_size_limit / 1024 / 1024);

    const usagePercent = (usedMB / limitMB) * 100;

    return {
        status: usagePercent < 80 ? 'healthy' : usagePercent < 90 ? 'degraded' : 'unhealthy',
        usage: usedMB,
        limit: limitMB
    };
};

/**
 * Get comprehensive health status
 */
export const getHealthStatus = async (): Promise<HealthStatus> => {
    const [database, memory] = await Promise.all([
        checkDatabase(),
        Promise.resolve(checkMemory())
    ]);

    const checks = {
        database,
        memory,
        disk: { status: 'healthy' } // Heroku manages disk automatically
    };

    // Determine overall status
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    if (database.status === 'unhealthy' || memory.status === 'unhealthy') {
        overallStatus = 'unhealthy';
    } else if (database.status === 'degraded' || memory.status === 'degraded') {
        overallStatus = 'degraded';
    }

    return {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        checks,
        version: process.env.HEROKU_SLUG_COMMIT?.slice(0, 7) || 'dev'
    };
};

/**
 * Simplified health check for load balancers
 */
export const getSimpleHealth = async (): Promise<{ status: 'ok' | 'error'; timestamp: string }> => {
    try {
        await prisma.$queryRaw`SELECT 1`;
        return {
            status: 'ok',
            timestamp: new Date().toISOString()
        };
    } catch {
        return {
            status: 'error',
            timestamp: new Date().toISOString()
        };
    }
};

/**
 * System metrics for monitoring dashboards
 */
export interface SystemMetrics {
    uptime: number;
    memory: {
        used: number;
        total: number;
        percent: number;
    };
    cpu: {
        usage: number; // Placeholder, requires additional library
    };
    nodeVersion: string;
    environment: string;
}

export const getSystemMetrics = (): SystemMetrics => {
    const usage = process.memoryUsage();
    const usedMB = Math.round(usage.heapUsed / 1024 / 1024);
    const totalMB = Math.round(usage.heapTotal / 1024 / 1024);

    return {
        uptime: process.uptime(),
        memory: {
            used: usedMB,
            total: totalMB,
            percent: Math.round((usedMB / totalMB) * 100)
        },
        cpu: {
            usage: 0 // Would need 'pidusage' or similar library
        },
        nodeVersion: process.version,
        environment: process.env.NODE_ENV || 'development'
    };
};

/**
 * Database statistics
 */
export const getDatabaseStats = async () => {
    try {
        const [
            studentCount,
            batchCount,
            instituteCount,
            paymentCount
        ] = await Promise.all([
            prisma.student.count(),
            prisma.batch.count(),
            prisma.institute.count(),
            prisma.feePayment.count()
        ]);

        return {
            students: studentCount,
            batches: batchCount,
            institutes: instituteCount,
            payments: paymentCount
        };
    } catch (error) {
        throw new Error('Failed to fetch database statistics');
    }
};
