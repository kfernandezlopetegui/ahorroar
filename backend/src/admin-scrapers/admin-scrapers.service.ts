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

/** Config de reintentos para los jobs (2 reintentos, backoff exponencial). */
export const JOB_OPTS = {
  attempts: 3, // intento inicial + 2 reintentos
  backoff: { type: 'exponential' as const, delay: 30_000 },
  removeOnComplete: 50,
  removeOnFail: 50,
};

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
    const { data, error } = await this.supabase.client
      .from('scraper_runs')
      .select(
        'id, scraper, type, status, items_scraped, items_upserted, error_message, started_at, finished_at, duration_ms',
      )
      .order('started_at', { ascending: false })
      .limit(500);

    if (error) throw error;

    const latestByScraper = new Map<string, ScraperRun>();
    for (const row of (data ?? []) as ScraperRun[]) {
      if (!latestByScraper.has(row.scraper)) latestByScraper.set(row.scraper, row);
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
      healthy: totals.error === 0,
      totals,
      lastRunAt,
      scrapers,
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
    return { scraper: def, runs: (data ?? []) as ScraperRun[] };
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
