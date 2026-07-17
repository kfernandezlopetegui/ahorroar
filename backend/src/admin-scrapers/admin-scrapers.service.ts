import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SupabaseService } from '../supabase/supabase.service';
import {
  SCRAPERS,
  ScraperDef,
  ScraperType,
  findScraper,
} from './scrapers.registry';

/** Fila de scraper_runs (esquema v2). */
export interface ScraperRun {
  id: string;
  scraper: string;
  type: ScraperType;
  status: 'running' | 'success' | 'error' | 'partial';
  items_scraped: number;
  items_upserted: number;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
}

/** Estado de un scraper = su definición + la última corrida (si hubo). */
export interface ScraperStatus extends ScraperDef {
  status: 'running' | 'success' | 'error' | 'partial' | 'never';
  lastRun: ScraperRun | null;
}

/** Estado de la cola BullMQ compartida con el worker. */
export interface QueueHealth {
  /** false = el backend no llega a Redis: nada puede encolarse ni procesarse. */
  connected: boolean;
  /** Conteos de jobs; waiting alto con active 0 = el worker no está consumiendo. */
  counts: { waiting: number; active: number; failed: number; delayed: number } | null;
  error?: string;
}

/** Config de reintentos para los jobs (2 reintentos, backoff exponencial). */
export const JOB_OPTS = {
  attempts: 3, // intento inicial + 2 reintentos
  backoff: { type: 'exponential' as const, delay: 30_000 },
  removeOnComplete: 50,
  removeOnFail: 50,
};

/**
 * Una corrida que quedó en 'running' más de este tiempo está colgada: el
 * timeout real del worker es de 10 min (SCRAPER_TIMEOUT_MS), así que pasado
 * ese margen el proceso murió sin actualizar la fila (deploy, OOM, crash).
 */
const STALE_RUNNING_MS = 20 * 60_000;

/** Timeout para consultar Redis: si no responde en 3s lo damos por caído. */
const QUEUE_PING_TIMEOUT_MS = 3_000;

@Injectable()
export class AdminScrapersService {
  private readonly logger = new Logger(AdminScrapersService.name);

  constructor(
    private readonly supabase: SupabaseService,
    @InjectQueue('scrapers') private readonly queue: Queue,
  ) {}

  /**
   * Estado del sistema: última corrida de cada scraper (incluidos los que
   * nunca corrieron) + agregados de salud.
   */
  async getStatus() {
    // Traemos las corridas recientes y nos quedamos con la última por scraper.
    const [{ data, error }, queue] = await Promise.all([
      this.supabase.client
        .from('scraper_runs')
        .select(
          'id, scraper, type, status, items_scraped, items_upserted, error_message, started_at, finished_at, duration_ms',
        )
        .order('started_at', { ascending: false })
        .limit(500),
      this.getQueueHealth(),
    ]);

    if (error) throw error;

    const latestByScraper = new Map<string, ScraperRun>();
    for (const row of (data ?? []) as ScraperRun[]) {
      if (!latestByScraper.has(row.scraper)) {
        latestByScraper.set(row.scraper, this.markIfStale(row));
      }
    }

    const scrapers: ScraperStatus[] = SCRAPERS.map((def) => {
      const lastRun = latestByScraper.get(def.name) ?? null;
      return {
        ...def,
        status: lastRun ? lastRun.status : 'never',
        lastRun,
      };
    });

    const totals = {
      total: scrapers.length,
      ok: scrapers.filter((s) => s.status === 'success' || s.status === 'partial').length,
      error: scrapers.filter((s) => s.status === 'error').length,
      running: scrapers.filter((s) => s.status === 'running').length,
      never: scrapers.filter((s) => s.status === 'never').length,
      itemsScraped: scrapers.reduce((sum, s) => sum + (s.lastRun?.items_scraped ?? 0), 0),
    };

    // Corrida más reciente de todo el sistema (para "última actualización").
    const lastRunAt =
      scrapers
        .map((s) => s.lastRun?.started_at)
        .filter((d): d is string => !!d)
        .sort()
        .at(-1) ?? null;

    return {
      healthy: totals.error === 0 && queue.connected,
      totals,
      lastRunAt,
      queue,
      scrapers,
    };
  }

  /**
   * Salud de la cola: un ping real a Redis (getJobCounts hace roundtrip).
   * Con Redis caído ioredis encola el comando y espera indefinidamente,
   * por eso el race con timeout — un monitor que no distingue "Redis caído"
   * de "todo verde" no sirve para diagnosticar por qué nada corre.
   */
  private async getQueueHealth(): Promise<QueueHealth> {
    try {
      const counts = await Promise.race([
        this.queue.getJobCounts('waiting', 'active', 'failed', 'delayed'),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Redis no respondió en 3s')), QUEUE_PING_TIMEOUT_MS),
        ),
      ]);
      return {
        connected: true,
        counts: {
          waiting: counts.waiting ?? 0,
          active: counts.active ?? 0,
          failed: counts.failed ?? 0,
          delayed: counts.delayed ?? 0,
        },
      };
    } catch (err) {
      this.logger.warn(`Cola 'scrapers' inaccesible: ${(err as Error).message}`);
      return { connected: false, counts: null, error: (err as Error).message };
    }
  }

  /**
   * Una fila que quedó en 'running' eterno (worker muerto a mitad de corrida)
   * se presenta como error: mostrarla "Corriendo" para siempre esconde el
   * problema y además deshabilita el botón "Ejecutar ahora" en la UI.
   */
  private markIfStale(run: ScraperRun): ScraperRun {
    if (run.status !== 'running') return run;
    const ageMs = Date.now() - new Date(run.started_at).getTime();
    if (ageMs < STALE_RUNNING_MS) return run;
    return {
      ...run,
      status: 'error',
      error_message: `Corrida colgada: en 'running' hace ${Math.round(ageMs / 60_000)} min sin actualizarse (¿worker caído o redeployado?)`,
    };
  }

  /** Historial de corridas de un scraper puntual. */
  async getRuns(name: string, limit = 20) {
    const def = findScraper(name);
    if (!def) throw new NotFoundException(`Scraper desconocido: '${name}'`);

    const { data, error } = await this.supabase.client
      .from('scraper_runs')
      .select(
        'id, scraper, type, status, items_scraped, items_upserted, error_message, started_at, finished_at, duration_ms',
      )
      .eq('scraper', name)
      .order('started_at', { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 100));

    if (error) throw error;
    return {
      scraper: def,
      runs: ((data ?? []) as ScraperRun[]).map((r) => this.markIfStale(r)),
    };
  }

  /** Encola una corrida manual de un scraper. */
  async enqueueRun(name: string) {
    const def = findScraper(name);
    if (!def) throw new NotFoundException(`Scraper desconocido: '${name}'`);

    const job = await this.queue.add(def.name, { manual: true }, JOB_OPTS);
    this.logger.log(`Encolada corrida manual de '${def.name}' (job ${job.id})`);
    return { enqueued: true, scraper: def.name, jobId: job.id };
  }
}
