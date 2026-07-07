import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SupabaseService } from './supabase';

export interface MonthPoint {
  periodo: string;
  variacion_pct: number;
  indice: number;
}

export interface PersonalInflation {
  canasta: { puntos: MonthPoint[]; eansIncluidos: number };
  ipc: MonthPoint[];
  productosSeguidos: number;
  mensaje: string | null;
}

const BASE = `${environment.apiUrl}/inflation`;

@Injectable({ providedIn: 'root' })
export class InflationService {
  data    = signal<PersonalInflation | null>(null);
  loading = signal(false);
  error   = signal('');

  constructor(
    private readonly http: HttpClient,
    private readonly supabase: SupabaseService,
  ) {}

  private async authHeaders(): Promise<HttpHeaders> {
    const { data } = await this.supabase.client.auth.getSession();
    return new HttpHeaders({ Authorization: `Bearer ${data.session?.access_token ?? ''}` });
  }

  async load(meses = 6) {
    this.loading.set(true);
    this.error.set('');
    try {
      const headers = await this.authHeaders();
      const res = await firstValueFrom(
        this.http.get<PersonalInflation>(`${BASE}/personal`, {
          headers,
          params: { meses: String(meses) },
        }),
      );
      this.data.set(res);
    } catch {
      this.error.set('No se pudo calcular tu inflación personal.');
    } finally {
      this.loading.set(false);
    }
  }
}
