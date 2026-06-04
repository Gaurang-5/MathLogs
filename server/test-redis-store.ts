import { RedisStore } from 'rate-limit-redis';
import { redis } from './src/utils/redis';

new RedisStore({
    sendCommand: (...args: string[]) => (redis as any).call(...args)
});
