import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SupabaseService } from './supabase';

export interface BasketItem {
  id: string;
  user_id: string;
  ean: string;
  producto_nombre: string;
  cantidad: number;
  created_at: string;
}

export interface BasketItemEvaluation {
  id: string;
  ean: string;
  producto_nombre: string;
  cantidad: number;
  conDatos: boolean;
  precioActual: number | null;
  precioAnterior: number | null;
  periodoActual: string | null;
  periodoAnterior: string | null;
  variacionPct: number | null;
  variacionAbs: number | null;
}

export interface BasketEvaluation {
  meses: number;
  items: BasketItemEvaluation[];
  resumen: {
    totalActual: number;
    totalAnterior: number;
    variacionPct: number;
    variacionAbs: number;
    productosConDatos: number;
    productosTotal: number;
    periodoAnterior: string;
    periodoActual: string;
  } | null;
  mensaje: string | null;
}

export interface ProductoBusqueda {
  id: string;       // EAN
  nombre: string;
  marca: string;
  presentacion: string;
}

const BASE = `${environment.apiUrl}/basket`;

@Injectable({ providedIn: 'root' })
export class BasketService {
  items       = signal<BasketItem[]>([]);
  evaluation  = signal<BasketEvaluation | null>(null);
  loading     = signal(false);
  loadingEval = signal(false);
  error       = signal('');

  constructor(
    private readonly http: HttpClient,
    private readonly supabase: SupabaseService,
  ) {}

  private async headers(): Promise<HttpHeaders> {
    const { data } = await this.supabase.client.auth.getSession();
    return new HttpHeaders({ Authorization: `Bearer ${data.session?.access_token ?? ''}` });
  }

  async load() {
    this.loading.set(true);
    this.error.set('');
    try {
      const h = await this.headers();
      const data = await firstValueFrom(this.http.get<BasketItem[]>(BASE, { headers: h }));
      this.items.set(data ?? []);
    } catch {
      this.error.set('No se pudo cargar tu canasta.');
    } finally {
      this.loading.set(false);
    }
  }

  async add(ean: string, producto_nombre: string, cantidad = 1): Promise<BasketItem> {
    const h = await this.headers();
    const item = await firstValueFrom(
      this.http.post<BasketItem>(BASE, { ean, producto_nombre, cantidad }, { headers: h }),
    );
    this.items.update(list => {
      const idx = list.findIndex(i => i.ean === ean);
      if (idx >= 0) { const n = [...list]; n[idx] = item; return n; }
      return [item, ...list];
    });
    return item;
  }

  async setCantidad(item: BasketItem, cantidad: number) {
    if (cantidad < 1 || cantidad > 99) return;
    await this.add(item.ean, item.producto_nombre, cantidad);
  }

  async remove(id: string) {
    const h = await this.headers();
    await firstValueFrom(this.http.delete(`${BASE}/${id}`, { headers: h }));
    this.items.update(list => list.filter(i => i.id !== id));
  }

  async evaluate(meses = 3) {
    this.loadingEval.set(true);
    try {
      const h = await this.headers();
      const res = await firstValueFrom(
        this.http.get<BasketEvaluation>(`${BASE}/evaluation`, {
          headers: h,
          params: { meses: String(meses) },
        }),
      );
      this.evaluation.set(res);
    } catch {
      this.error.set('No se pudo evaluar tu canasta.');
    } finally {
      this.loadingEval.set(false);
    }
  }

  /** Búsqueda de productos por nombre (Precios Claros), sin pisar el estado del comparador */
  async searchProducts(q: string): Promise<ProductoBusqueda[]> {
    if (q.trim().length < 3) return [];
    try {
      const res = await firstValueFrom(
        this.http.get<{ productos: ProductoBusqueda[] }>(
          `${environment.apiUrl}/precios-claros/productos`,
          { params: { q: q.trim() } },
        ),
      );
      return res.productos ?? [];
    } catch {
      return [];
    }
  }

  isInBasket(ean: string): boolean {
    return this.items().some(i => i.ean === ean);
  }
}
