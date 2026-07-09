/**
 * Wrapper de instrumentación de scrapers.
 *
 * runScraper(name, type, fn):
 *   1. Inserta una fila en scraper_runs con status 'running'.
 *   2. Ejecuta el scraper (fn) con un timeout global de 10 minutos.
 *   3. Actualiza la fila a 'success' | 'partial' | 'error' con contadores
 *      (ítems scrapeados / upserteados) y la duración.
 *
 * 'partial' = la corrida terminó OK pero trajo menos del 50% del promedio
 * de ítems de las últimas 5 corridas exitosas (señal de que la fuente
 * cambió el layout o nos está bloqueando parcialmente).
 *
 * No toca la lógica interna de cada scraper: `fn` es el scraper existente
 * (scrapear + guardar) devolviendo cuántos ítems trajo/guardó.
 */
import { supabase } from './supabase';

export type ScraperType = 'supermarket' | 'bank';

export interface ScraperResult {
  /** Ítems detectados por el scraper. */
  scraped: number;
  /** Ítems efectivamente guardados/upserteados en la DB. */
  upserted: number;
}

/** Timeout global por scraper: 10 minutos. */
export const SCRAPER_TIMEOUT_MS = 10 * 60 * 1000;

/** Umbral de "corrida parcial": debajo del 50% del promedio reciente. */
const PARTIAL_THRESHOLD = 0.5;

/** Cuántas corridas exitosas usamos para el promedio de referencia. */
const BASELINE_RUNS = 5;

class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Timeout: el scraper superó los ${Math.round(ms / 1000)}s`);
    this.name = 'TimeoutError';
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}

/**
 * Promedio de items_scraped de las últimas N corridas exitosas de este
 * scraper. Devuelve null si no hay historial suficiente (no se puede
 * decidir "partial" sin baseline).
 */
async function recentSuccessAverage(scraper: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('scraper_runs')
    .select('items_scraped')
    .eq('scraper', scraper)
    .eq('status', 'success')
    .order('started_at', { ascending: false })
    .limit(BASELINE_RUNS);

  if (error || !data || data.length === 0) return null;

  const total = data.reduce((sum, r) => sum + (r.items_scraped ?? 0), 0);
  return total / data.length;
}

export async function runScraper(
  name: string,
  type: ScraperType,
  fn: () => Promise<ScraperResult>,
): Promise<void> {
  const startedAt = Date.now();

  // 1) Registrar la corrida como 'running'.
  const { data: inserted, error: insertErr } = await supabase
    .from('scraper_runs')
    .insert({
      scraper: name,
      type,
      status: 'running',
      started_at: new Date(startedAt).toISOString(),
    })
    .select('id')
    .single();

  if (insertErr || !inserted) {
    // Si ni siquiera podemos registrar la corrida, igual intentamos scrapear
    // (no queremos perder datos por un problema del monitor), pero avisamos.
    console.error(`[runScraper] No se pudo registrar '${name}':`, insertErr?.message);
  }
  const runId = inserted?.id as string | undefined;

  const finalize = async (fields: Record<string, unknown>) => {
    if (!runId) return;
    const { error } = await supabase.from('scraper_runs').update(fields).eq('id', runId);
    if (error) console.error(`[runScraper] No se pudo actualizar '${name}':`, error.message);
  };

  try {
    const result = await withTimeout(fn(), SCRAPER_TIMEOUT_MS);
    const durationMs = Date.now() - startedAt;

    // 2) ¿Fue una corrida parcial?
    const baseline = await recentSuccessAverage(name);
    const isPartial =
      baseline !== null && baseline > 0 && result.scraped < baseline * PARTIAL_THRESHOLD;

    await finalize({
      status: isPartial ? 'partial' : 'success',
      items_scraped: result.scraped,
      items_upserted: result.upserted,
      finished_at: new Date().toISOString(),
      duration_ms: durationMs,
      error_message: isPartial
        ? `Corrida parcial: ${result.scraped} ítems vs. ~${Math.round(baseline!)} promedio`
        : null,
    });

    console.log(
      `[${name}] ${isPartial ? '⚠️ partial' : '✅ success'} — ${result.scraped} ítems (${durationMs}ms)`,
    );
  } catch (err: any) {
    const durationMs = Date.now() - startedAt;
    await finalize({
      status: 'error',
      finished_at: new Date().toISOString(),
      duration_ms: durationMs,
      error_message: err?.message ?? String(err),
    });
    console.error(`[${name}] ❌ error — ${err?.message ?? err} (${durationMs}ms)`);
    throw err; // que BullMQ lo cuente como fallo → reintentos
  }
}
