import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

// Comparador de cortes de carne: sin EAN estándar, la comparación es por
// categoría normalizada a $/kg (endpoints públicos /meat-cuts del backend).

export interface MeatCutBestPrice {
  chain: string;
  price_per_kg: number;
  product_name: string;
  scraped_at: string;
}

export interface MeatCutSummary {
  slug: string;
  display_name: string;
  category: string;
  chains_count: number;
  best_price: MeatCutBestPrice | null;
}

export interface MeatCutsResponse {
  disclaimer: string;
  window_hours: number;
  data: MeatCutSummary[];
}

export interface MeatCutPriceRow {
  chain: string;
  price_per_kg: number;
  /** diferencia % vs la cadena más barata (0 = la más barata) */
  diff_pct: number;
  product_name: string;
  offer_price: number;
  source: string;
  scraped_at: string;
}

export interface MeatCutDetail {
  cut: { slug: string; display_name: string; category: string };
  disclaimer: string;
  window_hours: number;
  prices: MeatCutPriceRow[];
}

const BASE = `${environment.apiUrl}/meat-cuts`;

@Injectable({ providedIn: 'root' })
export class MeatCutsService {
  cuts          = signal<MeatCutSummary[]>([]);
  disclaimer    = signal('Precios por kg estimados según publicaciones de cada cadena');
  detail        = signal<MeatCutDetail | null>(null);
  loadingCuts   = signal(false);
  loadingDetail = signal(false);
  error         = signal('');

  constructor(private readonly http: HttpClient) {}

  async loadCuts(): Promise<void> {
    this.loadingCuts.set(true);
    this.error.set('');
    try {
      const res = await firstValueFrom(this.http.get<MeatCutsResponse>(BASE));
      this.cuts.set(res.data);
      if (res.disclaimer) this.disclaimer.set(res.disclaimer);
    } catch {
      this.error.set('No se pudieron cargar los cortes de carne.');
    } finally {
      this.loadingCuts.set(false);
    }
  }

  async loadDetail(slug: string): Promise<void> {
    this.loadingDetail.set(true);
    this.error.set('');
    this.detail.set(null);
    try {
      const res = await firstValueFrom(this.http.get<MeatCutDetail>(`${BASE}/${slug}/prices`));
      this.detail.set(res);
    } catch {
      this.error.set('No se pudo cargar la comparativa de este corte.');
    } finally {
      this.loadingDetail.set(false);
    }
  }
}
