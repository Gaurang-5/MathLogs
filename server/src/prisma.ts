import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { queryPerformanceMiddleware } from './middleware/queryMonitor';

// Production-grade Prisma configuration with connection pooling and query logging
export const prisma = new PrismaClient({
    log: process.env.NODE_ENV === 'production'
        ? [
            { level: 'error', emit: 'stdout' },
            { level: 'warn', emit: 'stdout' }
        ]
        : ['error', 'warn'],
    datasources: {
        db: {
            url: process.env.DATABASE_URL
                ? `${process.env.DATABASE_URL}${process.env.DATABASE_URL.includes('?') ? '&' : '?'}connection_limit=10&pool_timeout=20`
                : undefined
        }
    }
});

// PERF: Automatic slow query monitoring with Sentry integration
// Logs queries > 1s and sends alerts to Sentry for investigation
prisma.$use(queryPerformanceMiddleware);

// PERF: Graceful shutdown to prevent connection leaks
process.on('SIGTERM', async () => {
    console.log('[PRISMA] Disconnecting...');
    await prisma.$disconnect();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('[PRISMA] Disconnecting...');
    await prisma.$disconnect();
    process.exit(0);
});
