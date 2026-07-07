/**
 * Registro persistente de corridas de scrapers en Supabase.
 * Alimenta el dashboard "Monitor de scrapers" de la app.
 */
import { supabase } from './supabase';

export interface ScraperRunLog {
  scraper:     string;               // ej: "Galicia", "Carrefour"
  kind:        'bank' | 'super';
  ok:          boolean;
  count:       number;
  error?:      string;
  durationMs:  number;
}

export async function logScraperRun(run: ScraperRunLog): Promise<void> {
  try {
    const { error } = await supabase.from('scraper_runs').insert({
      scraper:     run.scraper,
      kind:        run.kind,
      ok:          run.ok,
      items_count: run.count,
      error:       run.error ?? null,
      duration_ms: run.durationMs,
      ran_at:      new Date().toISOString(),
    });
    if (error) console.error(`[monitor] No se pudo registrar ${run.scraper}:`, error.message);
  } catch (err: any) {
    console.error(`[monitor] Error registrando ${run.scraper}:`, err.message);
  }
}
