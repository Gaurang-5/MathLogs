import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

// Production-grade Prisma configuration with connection pooling and query logging
export const prisma = new PrismaClient({
    log: process.env.NODE_ENV === 'production'
        ? [
            { level: 'query', emit: 'event' }, // Emit event for listener, don't print to stdout
            { level: 'error', emit: 'stdout' },
            { level: 'warn', emit: 'stdout' }
        ]
        : ['query', 'error', 'warn'],
    datasources: {
        db: {
            url: process.env.DATABASE_URL
        }
    }
});

// PERF: Log slow queries in production for observability
if (process.env.NODE_ENV === 'production') {
    prisma.$on('query' as never, (e: any) => {
        if (e.duration > 1000) {  // Log queries taking > 1 second
            console.warn('[SLOW_QUERY]', {
                query: e.query.substring(0, 200), // Truncate for readability
                duration: `${e.duration}ms`,
                timestamp: new Date().toISOString()
            });
        }
    });
}

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
