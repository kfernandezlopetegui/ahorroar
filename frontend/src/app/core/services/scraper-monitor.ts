import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SupabaseService } from './supabase';

// Monitor de scrapers (endpoints /admin/scrapers, sólo admin).

export type ScraperType = 'supermarket' | 'bank';
export type RunStatus = 'running' | 'success' | 'error' | 'partial';
export type ScraperState = RunStatus | 'never';

export interface ScraperRun {
  id: string;
  scraper: string;
  type: ScraperType;
  status: RunStatus;
  items_scraped: number;
  items_upserted: number;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
}

export interface ScraperStatus {
  name: string;
  label: string;
  type: ScraperType;
  status: ScraperState;
  lastRun: ScraperRun | null;
}

export interface MonitorStatus {
  healthy: boolean;
  totals: {
    total: number;
    ok: number;
    error: number;
    running: number;
    never: number;
    itemsScraped: number;
  };
  lastRunAt: string | null;
  scrapers: ScraperStatus[];
}

const BASE = `${environment.apiUrl}/admin/scrapers`;

@Injectable({ providedIn: 'root' })
export class ScraperMonitorService {
  constructor(
    private readonly http: HttpClient,
    private readonly supabase: SupabaseService,
  ) {}

  private async authHeaders(): Promise<HttpHeaders> {
    const { data } = await this.supabase.client.auth.getSession();
    return new HttpHeaders({
      Authorization: `Bearer ${data.session?.access_token ?? ''}`,
    });
  }

  async getStatus(): Promise<MonitorStatus> {
    const headers = await this.authHeaders();
    return firstValueFrom(this.http.get<MonitorStatus>(`${BASE}/status`, { headers }));
  }

  async getRuns(name: string, limit = 20): Promise<{ scraper: ScraperStatus; runs: ScraperRun[] }> {
    const headers = await this.authHeaders();
    return firstValueFrom(
      this.http.get<{ scraper: ScraperStatus; runs: ScraperRun[] }>(
        `${BASE}/${name}/runs?limit=${limit}`,
        { headers },
      ),
    );
  }

  async runNow(name: string): Promise<{ enqueued: boolean; scraper: string; jobId: string }> {
    const headers = await this.authHeaders();
    return firstValueFrom(
      this.http.post<{ enqueued: boolean; scraper: string; jobId: string }>(
        `${BASE}/${name}/run`,
        {},
        { headers },
      ),
    );
  }
}
