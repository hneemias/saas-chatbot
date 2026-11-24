import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export const redis = new Redis({
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD || undefined,
  db: env.REDIS_DB,
  retryStrategy(times) {
    const delay = Math.min(times * 100, 3000);
    return delay;
  },
  maxRetriesPerRequest: 3,
});

redis.on('connect', () => {
  logger.info({ host: env.REDIS_HOST, port: env.REDIS_PORT }, 'Redis conectado com sucesso');
});

redis.on('error', (err) => {
  logger.error({ err: err.message }, 'Erro na conexão do Redis');
});
