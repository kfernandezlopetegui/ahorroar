/**
 * Worker de scrapers (Railway/Render).
 *
 * Consume la cola `scrapers` de BullMQ (Upstash Redis por TCP). Un job por
 * scraper: el `job.name` es el slug del scraper (ver registry.ts). Cada job
 * se ejecuta a través de runScraper, que registra la corrida en Supabase.
 *
 * - Concurrencia: 3 (los de Playwright son pesados en RAM).
 * - Reintentos / backoff: los define quien encola (el backend), acá sólo
 *   procesamos; si el job falla, BullMQ reintenta según su config.
 *
 * Además levanta un HTTP server mínimo con GET /health que responde 200 si
 * el worker está conectado a Redis (para el health check del hosting).
 */
import * as dotenv from 'dotenv';
dotenv.config();

import { Worker, Job } from 'bullmq';
import * as http from 'http';
import { createRedis, redisConnectionOptions } from './redis';
import { getScraper, SCRAPER_REGISTRY } from './registry';
import { runScraper } from './run-scraper';

const QUEUE_NAME = 'scrapers';
const CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY ?? '3');
const PORT = parseInt(process.env.PORT ?? '3001');

// Conexión dedicada para leer el estado (health check).
const redisHealth = createRedis();
let redisReady = false;
redisHealth.on('ready', () => {
  redisReady = true;
  console.log('🔌 Redis conectado');
});
redisHealth.on('end', () => {
  redisReady = false;
});
redisHealth.on('error', (err) => {
  redisReady = false;
  console.error('[redis] error:', err.message);
});

// ── Worker BullMQ ──────────────────────────────────────────────────────────

const worker = new Worker(
  QUEUE_NAME,
  async (job: Job) => {
    const entry = getScraper(job.name);
    if (!entry) {
      throw new Error(`Scraper desconocido: '${job.name}'`);
    }
    console.log(`▶️  [${job.name}] intento ${job.attemptsMade + 1}`);
    await runScraper(entry.name, entry.type, entry.run);
  },
  {
    connection: redisConnectionOptions(),
    concurrency: CONCURRENCY,
  },
);

worker.on('completed', (job) => console.log(`✅ [${job.name}] job ${job.id} completado`));
worker.on('failed', (job, err) =>
  console.error(`❌ [${job?.name}] job ${job?.id} falló: ${err.message}`),
);
worker.on('error', (err) => console.error('[worker] error:', err.message));

// ── Health check HTTP ────────────────────────────────────────────────────────

http
  .createServer((req, res) => {
    if (req.url === '/health') {
      const ok = redisReady && worker.isRunning();
      res.writeHead(ok ? 200 : 503, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          status: ok ? 'ok' : 'degraded',
          redis: redisReady ? 'connected' : 'disconnected',
          worker: worker.isRunning() ? 'running' : 'stopped',
          scrapers: SCRAPER_REGISTRY.map((s) => s.name),
          timestamp: new Date().toISOString(),
        }),
      );
      return;
    }
    res.writeHead(404);
    res.end('Not found');
  })
  .listen(PORT, () => {
    console.log(`🌐 Health check en http://localhost:${PORT}/health`);
  });

console.log(
  `⚙️  Worker de scrapers iniciado — cola '${QUEUE_NAME}', concurrencia ${CONCURRENCY}`,
);
console.log(`   Scrapers registrados: ${SCRAPER_REGISTRY.map((s) => s.name).join(', ')}`);

// ── Apagado ordenado ─────────────────────────────────────────────────────────

async function shutdown() {
  console.log('🛑 Cerrando worker...');
  await worker.close();
  await redisHealth.quit();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
