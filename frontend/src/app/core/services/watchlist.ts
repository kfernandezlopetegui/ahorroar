import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SupabaseService } from './supabase';

export interface WatchlistItem {
  id: string;
  user_id: string;
  ean: string;
  producto_nombre: string;
  alert_on_promo: boolean;
  precio_objetivo?: number;
  last_known_price?: number;
  last_notified_at?: string;
  activa: boolean;
  created_at: string;
}

const BASE = `${environment.apiUrl}/watchlist`;

@Injectable({ providedIn: 'root' })
export class WatchlistService {
  items = signal<WatchlistItem[]>([]);
  loading = signal(false);
  error = signal('');

  constructor(
    private readonly http: HttpClient,
    private readonly supabase: SupabaseService,
  ) { }

  private async headers(): Promise<HttpHeaders> {
    const { data } = await this.supabase.client.auth.getSession();
    return new HttpHeaders({ Authorization: `Bearer ${data.session?.access_token ?? ''}` });
  }

  async load() {
    this.loading.set(true);
    this.error.set('');
    try {
      const h = await this.headers();
      const data = await firstValueFrom(
        this.http.get<WatchlistItem[]>(BASE, { headers: h }),
      );
      this.items.set(data ?? []);
    } catch {
      this.error.set('No se pudo cargar la watchlist.');
    } finally {
      this.loading.set(false);
    }
  }

  // Seguir con alerta de promo (modo default)
  async followPromo(ean: string, producto_nombre: string): Promise<WatchlistItem> {
    return this.upsertRaw({ ean, producto_nombre, alert_on_promo: true });
  }

  // Seguir con precio objetivo
  async followPrecio(ean: string, producto_nombre: string, precio_objetivo: number): Promise<WatchlistItem> {
    return this.upsertRaw({ ean, producto_nombre, alert_on_promo: false, precio_objetivo });
  }

  // Actualizar modo de alerta
  async updateAlertMode(item: WatchlistItem, mode: 'promo' | 'precio', precio_objetivo?: number): Promise<WatchlistItem> {
    return this.upsertRaw({
      ean: item.ean,
      producto_nombre: item.producto_nombre,
      alert_on_promo: mode === 'promo',
      precio_objetivo: mode === 'precio' ? precio_objetivo : undefined,
    });
  }

  private async upsertRaw(dto: Record<string, any>): Promise<WatchlistItem> {
    const h = await this.headers();
    const item = await firstValueFrom(
      this.http.post<WatchlistItem>(BASE, dto, { headers: h }),
    );
    this.items.update(list => {
      const idx = list.findIndex(i => i.ean === dto['ean']);  // ← corregido
      if (idx >= 0) { const n = [...list]; n[idx] = item; return n; }
      return [item, ...list];
    });
    return item;
  }

  async remove(id: string) {
    const h = await this.headers();
    await firstValueFrom(this.http.delete(`${BASE}/${id}`, { headers: h }));
    this.items.update(list => list.filter(i => i.id !== id));
  }

  isWatching(ean: string) { return this.items().some(i => i.ean === ean && i.activa); }
  getItem(ean: string) { return this.items().find(i => i.ean === ean); }
}