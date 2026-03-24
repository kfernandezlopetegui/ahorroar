import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SupabaseService } from './supabase';

export interface PriceReport {
  id: string;
  user_id: string;
  ean: string;
  producto_nombre: string;
  cadena: string;
  sucursal?: string;
  direccion?: string;
  precio: number;
  upvotes: number;
  verified: boolean;
  created_at: string;
}

export interface UserStats {
  points: { points: number; reports_count: number };
  badges: { badge: string; earned_at: string }[];
}

export const BADGE_INFO: Record<string, { label: string; icon: string; color: string }> = {
  colaborador: { label: 'Colaborador',        icon: '🤝', color: 'primary'   },
  informante:  { label: 'Informante',         icon: '📰', color: 'secondary' },
  experto:     { label: 'Experto',            icon: '🏆', color: 'warning'   },
  maestro:     { label: 'Maestro del Ahorro', icon: '👑', color: 'danger'    },
};

const BASE = `${environment.apiUrl}/community`;

@Injectable({ providedIn: 'root' })
export class CommunityService {
  reports   = signal<PriceReport[]>([]);
  loading   = signal(false);
  error     = signal('');
  userStats = signal<UserStats | null>(null);

  constructor(
    private readonly http: HttpClient,
    private readonly supabase: SupabaseService,
  ) {}

  private async authHeaders(): Promise<HttpHeaders> {
    const { data } = await this.supabase.client.auth.getSession();
    return new HttpHeaders({ Authorization: `Bearer ${data.session?.access_token ?? ''}` });
  }

  async loadReports(ean?: string) {
    this.loading.set(true);
    this.error.set('');
    try {
      // Construir HttpParams solo con valores definidos para evitar el error de tipo
      let params = new HttpParams();
      if (ean) params = params.set('ean', ean);

      const data = await firstValueFrom(
        this.http.get<PriceReport[]>(`${BASE}/reports`, { params }),
      );
      this.reports.set(data ?? []);
    } catch {
      this.error.set('No se pudieron cargar los reportes.');
    } finally {
      this.loading.set(false);
    }
  }

  async createReport(
    dto: Omit<PriceReport, 'id' | 'user_id' | 'upvotes' | 'verified' | 'created_at'>,
  ) {
    const headers = await this.authHeaders();
    const report = await firstValueFrom(
      this.http.post<PriceReport>(`${BASE}/reports`, dto, { headers }),
    );
    this.reports.update(list => [report, ...list]);
    await this.loadUserStats();
    return report;
  }

  async upvoteReport(id: string) {
    if (this.hasUpvoted(id)) return;
    const headers = await this.authHeaders();
    await firstValueFrom(
      this.http.post(`${BASE}/reports/${id}/upvote`, {}, { headers }),
    );
    this.markAsUpvoted(id);
    this.reports.update(list =>
      list.map(r => (r.id === id ? { ...r, upvotes: r.upvotes + 1 } : r)),
    );
  }

  async loadUserStats() {
    try {
      const headers = await this.authHeaders();
      const stats = await firstValueFrom(
        this.http.get<UserStats>(`${BASE}/stats`, { headers }),
      );
      this.userStats.set(stats);
    } catch { /* silent */ }
  }

  async loadLeaderboard(): Promise<any[]> {
    return firstValueFrom(this.http.get<any[]>(`${BASE}/leaderboard`));
  }

  hasUpvoted(id: string): boolean {
    return (
      JSON.parse(localStorage.getItem('upvoted_reports') ?? '[]') as string[]
    ).includes(id);
  }

  private markAsUpvoted(id: string) {
    const voted = JSON.parse(
      localStorage.getItem('upvoted_reports') ?? '[]',
    ) as string[];
    localStorage.setItem('upvoted_reports', JSON.stringify([...voted, id]));
  }

  timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `hace ${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `hace ${hrs}h`;
    return `hace ${Math.floor(hrs / 24)}d`;
  }
}