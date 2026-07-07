import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

export interface ScraperStatus {
  scraper: string;
  kind: 'bank' | 'super';
  ok: boolean;
  items_count: number;
  error: string | null;
  duration_ms: number;
  ran_at: string;
  stale: boolean;
}

/** Un scraper se considera "viejo" si no corrió en las últimas 48hs */
const STALE_HOURS = 48;

@Injectable()
export class ScraperMonitorService {
  constructor(private readonly supabase: SupabaseService) {}

  /** Última corrida de cada scraper + resumen de salud */
  async getStatus() {
    const { data, error } = await this.supabase.client
      .from('scraper_runs')
      .select('scraper, kind, ok, items_count, error, duration_ms, ran_at')
      .order('ran_at', { ascending: false })
      .limit(300);

    if (error) throw error;

    const latest = new Map<string, ScraperStatus>();
    const staleLimit = Date.now() - STALE_HOURS * 3600 * 1000;

    for (const row of data ?? []) {
      if (!latest.has(row.scraper)) {
        latest.set(row.scraper, {
          ...row,
          stale: new Date(row.ran_at).getTime() < staleLimit,
        });
      }
    }

    const scrapers = [...latest.values()].sort((a, b) =>
      a.kind === b.kind ? a.scraper.localeCompare(b.scraper) : a.kind.localeCompare(b.kind),
    );

    const broken = scrapers.filter((s) => !s.ok || s.stale);

    return {
      healthy: broken.length === 0,
      total: scrapers.length,
      brokenCount: broken.length,
      scrapers,
    };
  }

  /** Historial de corridas de un scraper puntual */
  async getHistory(scraper: string, limit = 30) {
    const { data, error } = await this.supabase.client
      .from('scraper_runs')
      .select('ok, items_count, error, duration_ms, ran_at')
      .eq('scraper', scraper)
      .order('ran_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data ?? [];
  }
}
