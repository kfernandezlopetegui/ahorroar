/**
 * Registro de corridas de scrapers en Supabase (esquema scraper_runs v2).
 *
 * NOTA: el camino principal de producción es runScraper (run-scraper.ts),
 * usado por el worker de BullMQ, que registra el ciclo completo
 * running → success/partial/error. Este helper queda para los runners
 * standalone legacy (index.ts, supermarkets-index.ts, `npm run scrape:*`):
 * inserta una única fila ya terminada, mapeando el formato viejo al v2.
 */
import { supabase } from './supabase';

export interface ScraperRunLog {
  scraper: string; // ej: "Galicia", "Carrefour"
  kind: 'bank' | 'super';
  ok: boolean;
  count: number;
  error?: string;
  durationMs: number;
}

/**
 * "La Anónima" → "la-anonima", "Naranja X" → "naranja-x", "Changomás" →
 * "changomas". Mismo slug que registry.ts y que el monitor del backend
 * (scrapers.registry.ts) usan como clave: si acá se guardara sólo
 * .toLowerCase(), esas corridas quedarían huérfanas y el monitor mostraría
 * "Nunca corrió" aunque el scraper haya corrido.
 */
function toSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function logScraperRun(run: ScraperRunLog): Promise<void> {
  try {
    const now = new Date();
    const startedAt = new Date(now.getTime() - run.durationMs);
    const { error } = await supabase.from('scraper_runs').insert({
      scraper: toSlug(run.scraper),
      type: run.kind === 'bank' ? 'bank' : 'supermarket',
      status: run.ok ? 'success' : 'error',
      items_scraped: run.count,
      items_upserted: run.count,
      error_message: run.error ?? null,
      started_at: startedAt.toISOString(),
      finished_at: now.toISOString(),
      duration_ms: run.durationMs,
    });
    if (error) console.error(`[monitor] No se pudo registrar ${run.scraper}:`, error.message);
  } catch (err: any) {
    console.error(`[monitor] Error registrando ${run.scraper}:`, err.message);
  }
}
