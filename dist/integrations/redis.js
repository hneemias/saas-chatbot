import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
let redisUnavailableWarned = false;
export const redis = new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
    db: env.REDIS_DB,
    lazyConnect: true,
    retryStrategy(times) {
        if (times > 3 && env.NODE_ENV !== 'production') {
            if (!redisUnavailableWarned) {
                redisUnavailableWarned = true;
                logger.warn({ host: env.REDIS_HOST, port: env.REDIS_PORT }, 'Redis indisponível localmente: operando com buffer de debounce em memória');
            }
            return null; // Encerra tentativas em dev local sem Redis
        }
        return Math.min(times * 500, 5000);
    },
    maxRetriesPerRequest: 1,
});
redis.on('connect', () => {
    redisUnavailableWarned = false;
    logger.info({ host: env.REDIS_HOST, port: env.REDIS_PORT }, 'Redis conectado com sucesso');
});
redis.on('error', (err) => {
    if (!redisUnavailableWarned) {
        logger.warn({ err: err.message || 'ECONNREFUSED' }, 'Aviso de conexão do Redis');
    }
});
