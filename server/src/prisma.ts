import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { queryPerformanceMiddleware } from './middleware/queryMonitor';
import { secureLogger } from './utils/secureLogger';


// Production-grade Prisma configuration with connection pooling and query logging
// HEROKU TIP: Basic/Mini Postgres has a 20 connection limit. 
// If scaling to multiple dynos, keep CONNECTION_LIMIT low (e.g. 3-5) or use PgBouncer.
const CONNECTION_LIMIT = parseInt(process.env.DB_CONNECTION_LIMIT || '3', 10);
const POOL_TIMEOUT = parseInt(process.env.DB_POOL_TIMEOUT || '30', 10);

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'production'
        ? [
            { level: 'error', emit: 'stdout' },
            { level: 'warn', emit: 'stdout' }
        ]
        : ['error', 'warn'],
    datasources: {
        db: {
            url: process.env.DATABASE_URL
                ? `${process.env.DATABASE_URL}${process.env.DATABASE_URL.includes('?') ? '&' : '?'}connection_limit=${CONNECTION_LIMIT}&pool_timeout=${POOL_TIMEOUT}`
                : undefined
        }
    }
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// PERF: Automatic slow query monitoring with Sentry integration
// Logs queries > 1s and sends alerts to Sentry for investigation
prisma.$use(queryPerformanceMiddleware);

// PERF: Graceful shutdown to prevent connection leaks
process.on('SIGTERM', async () => {
    secureLogger.info('[PRISMA] Disconnecting...');
    await prisma.$disconnect();
    process.exit(0);
});

process.on('SIGINT', async () => {
    secureLogger.info('[PRISMA] Disconnecting...');
    await prisma.$disconnect();
    process.exit(0);
});
