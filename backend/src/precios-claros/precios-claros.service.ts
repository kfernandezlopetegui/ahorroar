import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { SupabaseService } from '../supabase/supabase.service';
import { SupermarketOffersService } from '../supermarket-offers/supermarket-offers.service';
import { EanSourcesService, OnlinePrice } from './ean-sources.service';


const BASE_URL = 'https://d3e6htiiul5ek9.cloudfront.net/prod';

@Injectable()
export class PreciosClarosService {
  constructor(
    private readonly http: HttpService,
    private readonly supabase: SupabaseService,
    private readonly superOffers: SupermarketOffersService,
    private readonly eanSources: EanSourcesService,
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
    const candidatos = this.candidatosEAN(ean);
    if (!candidatos.length) {
      return {
        producto: null,
        sucursales: [],
        supermarketOffers: [],
        onlinePrices: [],
      };
    }

    // Fuentes alternativas en paralelo, sin bloquear:
    // ofertas scrapeadas en DB + precios online de las cadenas (VTEX) + Open Food Facts
    const supermarketOffersPromise = this.superOffers
      .findByEan(candidatos)
      .catch(() => []);
    const eanSourcesPromise = this.eanSources
      .lookup(candidatos)
      .catch(() => ({ onlinePrices: [], productInfo: null }));

    let producto: any = null;
    let preciosData: { sucursales: any[] } = { sucursales: [] };

    try {
      const productosData = await this.buscarProductos(candidatos[0], lat, lng);
      const productos: any[] = productosData?.productos ?? [];
      producto =
        productos.find((p: any) => candidatos.includes(String(p.id))) ??
        productos[0] ??
        null;

      if (producto) {
        preciosData = await this.buscarPrecios(producto.id, lat, lng);
      }
    } catch (err) {
      console.warn('[buscarPorEAN] Búsqueda por texto falló:', (err as any)?.message);
    }

    // Fallback: consultar el endpoint /producto directamente con el EAN como id,
    // por si la búsqueda de texto no indexa códigos de barras
    if (!producto) {
      for (const candidato of candidatos) {
        try {
          const data = await this.buscarPrecios(candidato, lat, lng);
          if (data?.sucursales?.length) {
            producto = this.productoDesdeRespuesta(data, candidato);
            preciosData = data;
            break;
          }
        } catch (err) {
          console.warn(
            `[buscarPorEAN] Lookup directo ${candidato} falló:`,
            (err as any)?.message,
          );
        }
      }
    }

    const { onlinePrices, productInfo } = await eanSourcesPromise;

    // Último fallback: si Precios Claros no encontró nada (o está caído),
    // armar el producto con lo que devolvieron las otras fuentes
    if (!producto && productInfo) {
      const precios = onlinePrices.map((p) => p.precio);
      producto = {
        id: candidatos[0],
        nombre: productInfo.nombre,
        marca: productInfo.marca ?? '',
        presentacion: productInfo.presentacion ?? '',
        precioMin: precios.length ? Math.min(...precios) : 0,
        precioMax: precios.length ? Math.max(...precios) : 0,
        cantSucursalesDisponible: 0,
        imagen: productInfo.imagen,
        fuente: productInfo.fuente,
      };
    }

    if (producto) {
      this.savePriceSnapshot(producto, preciosData.sucursales ?? []).catch(
        (err) => console.error('[price_history] Error saving snapshot:', err),
      );
      this.saveOnlineSnapshot(producto, onlinePrices).catch((err) =>
        console.error('[price_history] Error saving online snapshot:', err),
      );
    }

    const supermarketOffers = await supermarketOffersPromise;
    return { producto, ...preciosData, supermarketOffers, onlinePrices };
  }

  /**
   * Variantes válidas de un código escaneado o tipeado:
   * el original limpio, la versión EAN-13 de un UPC-A (12 dígitos) y viceversa.
   */
  private candidatosEAN(ean: string): string[] {
    const limpio = (ean ?? '').replace(/\D/g, '');
    if (limpio.length < 8) return [];
    const set = new Set<string>([limpio]);
    if (limpio.length === 12) set.add('0' + limpio);
    if (limpio.length === 13 && limpio.startsWith('0')) set.add(limpio.slice(1));
    return [...set];
  }

  private productoDesdeRespuesta(data: any, ean: string) {
    const p = data?.producto ?? {};
    const sucursales: any[] = data?.sucursales ?? [];
    const precios = sucursales
      .map((s: any) => s?.preciosProducto?.precioLista)
      .filter((v: any) => typeof v === 'number');
    return {
      id: String(p.id ?? ean),
      nombre: p.nombre ?? p.descripcion ?? `Producto ${ean}`,
      marca: p.marca ?? '',
      presentacion: p.presentacion ?? '',
      precioMin: precios.length ? Math.min(...precios) : 0,
      precioMax: precios.length ? Math.max(...precios) : 0,
      cantSucursalesDisponible: sucursales.length,
    };
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

  /** Guarda los precios online de las cadenas también en el historial */
  private async saveOnlineSnapshot(producto: any, onlinePrices: OnlinePrice[]) {
    if (!onlinePrices.length) return;

    const rows = onlinePrices.map((p) => ({
      ean: producto.id,
      producto_nombre: producto.nombre,
      sucursal_id: `online:${p.cadena}`,
      cadena: `${p.cadena} (online)`,
      sucursal_nombre: 'Tienda online',
      direccion: null,
      localidad: null,
      lat: null,
      lng: null,
      precio_lista: p.precioLista ?? p.precio,
      precio_promo: p.precioLista ? p.precio : null,
      descripcion_promo: null,
    }));

    const { error } = await this.supabase.client
      .from('price_history')
      .insert(rows);

    if (error) throw error;
  }
}