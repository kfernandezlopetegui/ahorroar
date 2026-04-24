import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { SupabaseService } from '../supabase/supabase.service';
import { SupermarketOffersService } from '../supermarket-offers/supermarket-offers.service';


const BASE_URL = 'https://d3e6htiiul5ek9.cloudfront.net/prod';

@Injectable()
export class PreciosClarosService {
  constructor(
    private readonly http: HttpService,
    private readonly supabase: SupabaseService,
    private readonly superOffers: SupermarketOffersService,
  ) { }

  private get headers() {
    return {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'es-AR,es;q=0.9',
      Referer: 'https://www.preciosclaros.gob.ar/',
      Origin: 'https://www.preciosclaros.gob.ar',
      ...(process.env.PRECIOS_CLAROS_API_KEY && {
        'x-api-key': process.env.PRECIOS_CLAROS_API_KEY,
      }),
    };
  }

  async buscarProductos(query: string, lat = -34.6037, lng = -58.3816) {
    const { data } = await firstValueFrom(
      this.http.get(`${BASE_URL}/productos`, {
        headers: this.headers,
        params: { string: query, lat, lng, limit: 20, offset: 0 },
      }),
    );
    return data;
  }

  async buscarSucursales(lat = -34.6037, lng = -58.3816) {
    const { data } = await firstValueFrom(
      this.http.get(`${BASE_URL}/sucursales`, {
        headers: this.headers,
        params: { lat, lng, limit: 30, offset: 0 },
      }),
    );
    return data;
  }

  async buscarPrecios(productoId: string, lat = -34.6037, lng = -58.3816) {
    const sucursalesData = await this.buscarSucursales(lat, lng);
    const sucursales: any[] = sucursalesData.sucursales ?? [];
    if (!sucursales.length) return { sucursales: [] };

    const arraySucursales = sucursales.map((s: any) => s.id).join(',');

    const { data } = await firstValueFrom(
      this.http.get(`${BASE_URL}/producto`, {
        headers: this.headers,
        params: {
          limit: 30,
          id_producto: productoId,
          array_sucursales: arraySucursales,
        },
      }),
    );

    const conProducto = (data?.sucursales ?? []).filter(
      (s: any) => !s.message,
    );

    return { ...data, sucursales: conProducto };
  }

  async buscarPorEAN(ean: string, lat = -34.6037, lng = -58.3816) {
  // Siempre buscar en DB, en paralelo, sin bloquear
  const supermarketOffersPromise = this.superOffers.findByEan(ean).catch(() => []);

  let producto: any = null;
  let preciosData: { sucursales: any[] } = { sucursales: [] };

  try {
    const productosData = await this.buscarProductos(ean, lat, lng);
    const productos: any[] = productosData?.productos ?? [];
    producto = productos.find((p: any) => p.id === ean) ?? productos[0] ?? null;

    if (producto) {
      preciosData = await this.buscarPrecios(producto.id, lat, lng);
      this.savePriceSnapshot(producto, preciosData.sucursales ?? []).catch(
        (err) => console.error('[price_history] Error saving snapshot:', err),
      );
    }
  } catch (err) {
    console.warn('[buscarPorEAN] Precios Claros no disponible:', (err as any)?.message);
  }

  const supermarketOffers = await supermarketOffersPromise;
  return { producto, ...preciosData, supermarketOffers };
}

  async getHistorial(ean: string, dias = 30) {
    const desde = new Date();
    desde.setDate(desde.getDate() - dias);

    const { data, error } = await this.supabase.client
      .from('price_history')
      .select('cadena, precio_lista, precio_promo, captured_at')
      .eq('ean', ean)
      .gte('captured_at', desde.toISOString())
      .order('captured_at', { ascending: true });

    if (error) throw error;
    return data ?? [];
  }

  private async savePriceSnapshot(producto: any, sucursales: any[]) {
    if (!sucursales.length) return;

    const rows = sucursales
      .map((s: any) => ({
        ean: producto.id,
        producto_nombre: producto.nombre,
        sucursal_id: s.id,
        cadena: s.banderaDescripcion,
        sucursal_nombre: s.sucursalNombre,
        direccion: s.direccion,
        localidad: s.localidad,
        lat: parseFloat(s.lat) || null,
        lng: parseFloat(s.lng) || null,
        precio_lista: s.preciosProducto?.precioLista ?? null,
        precio_promo: s.preciosProducto?.promo1?.precio ?? null,
        descripcion_promo: s.preciosProducto?.promo1?.descripcion ?? null,
      }))
      .filter((r) => r.precio_lista !== null);

    if (!rows.length) return;

    const { error } = await this.supabase.client
      .from('price_history')
      .insert(rows);

    if (error) throw error;
  }
}