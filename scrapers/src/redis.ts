/**
 * Conexión a Redis (Upstash) por TCP con ioredis, compartida por el worker.
 *
 * Upstash expone endpoint TCP con TLS. Config por env (mismas variables que
 * usa el backend NestJS):
 *   REDIS_HOST, REDIS_PORT, REDIS_PASSWORD, REDIS_TLS ('true' | 'false')
 */
import IORedis, { RedisOptions } from 'ioredis';

export function redisConnectionOptions(): RedisOptions {
  return {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
    // Requerido por BullMQ para blocking commands.
    maxRetriesPerRequest: null,
  };
}

/** Crea una conexión ioredis con la config de entorno. */
export function createRedis(): IORedis {
  return new IORedis(redisConnectionOptions());
}
