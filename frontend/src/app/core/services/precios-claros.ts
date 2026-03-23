import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface PCProducto {
  id: string;
  nombre: string;
  marca: string;
  presentacion: string;
  precioMin: number;
  precioMax: number;
  cantSucursalesDisponible: number;
}

export interface PCPrecio {
  id: string;
  banderaDescripcion: string;
  sucursalNombre: string;
  direccion: string;
  localidad: string;
  lat: string;
  lng: string;
  sucursalTipo: string;
  actualizadoHoy: boolean;
  preciosProducto: {
    precioLista: number;
    promo1?: { descripcion: string; precio: string | number };
    promo2?: { descripcion: string; precio: string | number };
  };
  distancia_km?: number;
}

export interface PCHistorialRow {
  cadena: string;
  precio_lista: number;
  precio_promo: number | null;
  captured_at: string;
}

export interface PCResultadoEAN {
  producto: PCProducto | null;
  sucursales: PCPrecio[];
}

const BASE = `${environment.apiUrl}/precios-claros`;

@Injectable({ providedIn: 'root' })
export class PreciosClarosService {
  productos        = signal<PCProducto[]>([]);
  precios          = signal<PCPrecio[]>([]);
  historial        = signal<PCHistorialRow[]>([]);
  loadingProductos = signal(false);
  loadingPrecios   = signal(false);
  loadingHistorial = signal(false);
  error            = signal('');

  constructor(private readonly http: HttpClient) {}

  async buscarProductos(query: string, lat?: number, lng?: number): Promise<void> {
    if (query.length < 3) return;
    this.loadingProductos.set(true);
    this.error.set('');
    try {
      const params: Record<string, any> = { q: query };
      if (lat != null) params['lat'] = lat;
      if (lng != null) params['lng'] = lng;
      const res = await firstValueFrom(
        this.http.get<any>(`${BASE}/productos`, { params }),
      );
      this.productos.set(res.productos ?? []);
    } catch {
      this.error.set('No se pudo conectar con Precios Claros.');
    } finally {
      this.loadingProductos.set(false);
    }
  }

  async buscarPrecios(productoId: string, lat?: number, lng?: number): Promise<void> {
    this.loadingPrecios.set(true);
    this.error.set('');
    try {
      const params: Record<string, any> = { id: productoId };
      if (lat != null) params['lat'] = lat;
      if (lng != null) params['lng'] = lng;
      const res = await firstValueFrom(
        this.http.get<any>(`${BASE}/precios`, { params }),
      );
      this.precios.set(this.sortSucursales(res.sucursales ?? [], lat, lng));
    } catch {
      this.error.set('No se pudieron cargar los precios.');
    } finally {
      this.loadingPrecios.set(false);
    }
  }

  async buscarPorEAN(ean: string, lat?: number, lng?: number): Promise<PCProducto | null> {
    this.loadingProductos.set(true);
    this.loadingPrecios.set(true);
    this.error.set('');
    try {
      const params: Record<string, any> = {};
      if (lat != null) params['lat'] = lat;
      if (lng != null) params['lng'] = lng;
      const res = await firstValueFrom(
        this.http.get<PCResultadoEAN>(`${BASE}/ean/${ean}`, { params }),
      );
      if (!res.producto) {
        this.error.set('Producto no encontrado para este código.');
        return null;
      }
      this.productos.set([res.producto]);
      this.precios.set(this.sortSucursales(res.sucursales, lat, lng));
      return res.producto;
    } catch {
      this.error.set('Error buscando por código EAN.');
      return null;
    } finally {
      this.loadingProductos.set(false);
      this.loadingPrecios.set(false);
    }
  }

  async getHistorial(ean: string, dias = 30): Promise<void> {
    this.loadingHistorial.set(true);
    try {
      const res = await firstValueFrom(
        this.http.get<PCHistorialRow[]>(`${BASE}/historial/${ean}`, {
          params: { dias: String(dias) },
        }),
      );
      this.historial.set(res ?? []);
    } catch {
      this.historial.set([]);
    } finally {
      this.loadingHistorial.set(false);
    }
  }

  private sortSucursales(sucursales: PCPrecio[], lat?: number, lng?: number): PCPrecio[] {
    if (lat != null && lng != null) {
      return sucursales
        .map((s) => ({
          ...s,
          distancia_km: this.calcularDistancia(lat, lng, parseFloat(s.lat), parseFloat(s.lng)),
        }))
        .sort((a, b) => (a.distancia_km ?? 99) - (b.distancia_km ?? 99));
    }
    return [...sucursales].sort(
      (a, b) =>
        (a.preciosProducto?.precioLista ?? 99999) -
        (b.preciosProducto?.precioLista ?? 99999),
    );
  }

  private calcularDistancia(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}