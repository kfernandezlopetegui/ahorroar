import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

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
  sucursal_id: string;
  sucursal_nombre: string;
  sucursal_direccion: string;
  bandera_nombre: string;
  lat: number;
  lng: number;
  precio: number;
  distancia_km?: number;
}

const BASE_URL = 'http://localhost:3000/precios-claros';

@Injectable({ providedIn: 'root' })
export class PreciosClarosService {
  productos = signal<PCProducto[]>([]);
  precios = signal<PCPrecio[]>([]);
  loadingProductos = signal(false);
  loadingPrecios = signal(false);
  error = signal('');

  constructor(private http: HttpClient) { }

  async buscarProductos(query: string, lat?: number, lng?: number): Promise<void> {
    if (query.length < 3) return;
    this.loadingProductos.set(true);
    this.error.set('');
    try {
      const params: any = { q: query };
      if (lat) params['lat'] = lat;
      if (lng) params['lng'] = lng;

      const res = await firstValueFrom(
        this.http.get<any>(`${BASE_URL}/productos`, { params })
      );
      this.productos.set(res.productos ?? []);
    } catch {
      this.error.set('No se pudo conectar con Precios Claros.');
    } finally {
      this.loadingProductos.set(false);
    }
  }
  async buscarPorEAN(ean: string): Promise<void> {
    this.loadingProductos.set(true);
    this.error.set('');
    try {
      const params = new HttpParams().set('string', ean);
      const res = await firstValueFrom(
        this.http.get<any>(`${BASE_URL}/productos`, { params })
      );
      this.productos.set(res.productos ?? []);
    } catch {
      this.error.set('Producto no encontrado.');
    } finally {
      this.loadingProductos.set(false);
    }
  }

 async buscarPrecios(productoId: string, lat?: number, lng?: number): Promise<void> {
  this.loadingPrecios.set(true);
  this.error.set('');
  try {
    const params: any = { limit: 50, offset: 0 };
    const res = await firstValueFrom(
      this.http.get<any>(`${BASE_URL}/precios`, {
        params: { id: productoId, ...params }
      })
    );
    console.log('Respuesta precios:', res);
    this.precios.set(res.sucursales ?? []);
  } catch (e: any) {
    console.error('Error detalle:', e?.status, e?.message, e);
    this.error.set('No se pudieron cargar los precios.');
  } finally {
    this.loadingPrecios.set(false);
  }
}

  private calcularDistancia(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) *
      Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}