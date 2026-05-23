import { Redis } from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Heroku Redis uses rediss:// (TLS) — must allow self-signed certs
const tls = redisUrl.startsWith('rediss://')
    ? { tls: { rejectUnauthorized: false } }
    : {};

export const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    ...tls,
    retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
    }
});

redis.on('error', (err) => {
    console.error('[REDIS] Connection Error:', err.message);
});

redis.on('connect', () => {
    console.log('[REDIS] Connected successfully');
});

/**
 * Quiz Cache Implementation using Redis for cross-dyno scaling
 */
export const quizCache = {
    async get(quizId: string) {
        try {
            const data = await redis.get(`quiz:${quizId}`);
            return data ? JSON.parse(data) : null;
        } catch {
            return null;
        }
    },

    async set(quizId: string, data: any, ttlSeconds = 300) {
        try {
            await redis.setex(`quiz:${quizId}`, ttlSeconds, JSON.stringify(data));
        } catch (err) {
            console.error('[REDIS] Cache Set Error:', err);
        }
    },

    async invalidate(quizId: string) {
        try {
            await redis.del(`quiz:${quizId}`);
        } catch (err) {
            console.error('[REDIS] Cache Del Error:', err);
        }
    }
};

/**
 * Branding Cache for Institute-specific look and feel
 */
export const brandingCache = {
    async get(slug: string) {
        try {
            const data = await redis.get(`branding:${slug.toLowerCase()}`);
            return data ? JSON.parse(data) : null;
        } catch {
            return null;
        }
    },

    async set(slug: string, data: any, ttlSeconds = 3600) { // 1 hour
        try {
            await redis.setex(`branding:${slug.toLowerCase()}`, ttlSeconds, JSON.stringify(data));
        } catch (err) {
            console.error('[REDIS] Branding Set Error:', err);
        }
    },

    async invalidate(slug: string) {
        try {
            await redis.del(`branding:${slug.toLowerCase()}`);
        } catch (err) {
            console.error('[REDIS] Branding Del Error:', err);
        }
    }
};

/**
 * Distributed Heartbeat Management
 */
export const heartbeatManager = {
    async set(submissionId: string) {
        // Set with 60s expiration
        await redis.setex(`hb:${submissionId}`, 60, Date.now().toString());
    },

    async get(submissionId: string): Promise<number> {
        const val = await redis.get(`hb:${submissionId}`);
        return val ? parseInt(val, 10) : 0;
    },

    async getMultiple(submissionIds: string[]): Promise<Record<string, number>> {
        if (submissionIds.length === 0) return {};
        const pipeline = redis.pipeline();
        submissionIds.forEach(id => pipeline.get(`hb:${id}`));
        const results = await pipeline.exec();
        
        const map: Record<string, number> = {};
        submissionIds.forEach((id, idx) => {
            const res = results ? results[idx] : null;
            // res is [error, result]
            const val = res && !res[0] ? res[1] as string : null;
            map[id] = val ? parseInt(val, 10) : 0;
        });
        return map;
    }
};
