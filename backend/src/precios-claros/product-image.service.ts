import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { SupabaseService } from '../supabase/supabase.service';

export interface ProductImage {
  buffer: Buffer;
  contentType: string;
}

/**
 * Resuelve la imagen de un producto por EAN, en orden:
 *  1. Patrón público de Precios Claros: imagenes.preciosclaros.gob.ar/productos/{EAN}.jpg
 *     (el sitio bloquea hotlinking/CORS desde otros orígenes, por eso el proxy).
 *  2. Imagen scrapeada guardada en supermarket_offers.image_url (Supabase),
 *     para productos que solo vinieron de nuestros scrapers.
 *
 * Cachea en memoria (positivos y negativos) para no golpear las fuentes en
 * cada card del comparador; el controller agrega Cache-Control para que el
 * cliente/CDN también cachee.
 */
@Injectable()
export class ProductImageService {
  private readonly logger = new Logger(ProductImageService.name);

  private readonly cache = new Map<
    string,
    { image: ProductImage | null; expiresAt: number }
  >();
  private static readonly CACHE_TTL_MS = 24 * 60 * 60 * 1000;
  private static readonly NEGATIVE_TTL_MS = 60 * 60 * 1000;
  private static readonly CACHE_MAX_ENTRIES = 500;
  private static readonly MAX_IMAGE_BYTES = 2 * 1024 * 1024;
  private static readonly TIMEOUT_MS = 6000;

  constructor(
    private readonly http: HttpService,
    private readonly supabase: SupabaseService,
  ) {}

  async getImage(ean: string): Promise<ProductImage | null> {
    const limpio = (ean ?? '').replace(/\D/g, '');
    if (limpio.length < 8) return null;

    const cached = this.cache.get(limpio);
    if (cached && cached.expiresAt > Date.now()) return cached.image;

    const candidatos = this.candidatosEAN(limpio);
    const urls: string[] = [
      ...candidatos.map(
        (c) => `https://imagenes.preciosclaros.gob.ar/productos/${c}.jpg`,
      ),
      ...(await this.scrapedImageUrls(candidatos)),
    ];

    let image: ProductImage | null = null;
    for (const url of urls) {
      image = await this.download(url);
      if (image) break;
    }

    this.remember(limpio, image);
    return image;
  }

  private async download(url: string): Promise<ProductImage | null> {
    try {
      const { data, headers, status } = await firstValueFrom(
        this.http.get<ArrayBuffer>(url, {
          responseType: 'arraybuffer',
          timeout: ProductImageService.TIMEOUT_MS,
          maxContentLength: ProductImageService.MAX_IMAGE_BYTES,
          headers: { Accept: 'image/*' },
          // sin Referer: el hotlinking suele bloquearse justamente por Referer
        }),
      );

      const contentType = String(headers['content-type'] ?? '');
      if (status !== 200 || !contentType.startsWith('image/') || !data) {
        return null;
      }
      return { buffer: Buffer.from(data), contentType };
    } catch (err: any) {
      this.logger.debug(`Imagen no disponible en ${url}: ${err.message}`);
      return null;
    }
  }

  /** URLs de imagen scrapeadas por nuestros scrapers (tabla supermarket_offers) */
  private async scrapedImageUrls(candidatos: string[]): Promise<string[]> {
    try {
      const { data, error } = await this.supabase.client
        .from('supermarket_offers')
        .select('image_url')
        .in('ean', candidatos)
        .not('image_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(3);

      if (error) throw error;
      return (data ?? [])
        .map((r: any) => String(r.image_url ?? ''))
        .filter((u) => /^https?:\/\//.test(u))
        .map((u) => u.replace(/^http:\/\//, 'https://'));
    } catch (err: any) {
      this.logger.debug(`Lookup de imagen scrapeada falló: ${err.message}`);
      return [];
    }
  }

  private remember(ean: string, image: ProductImage | null) {
    if (this.cache.size >= ProductImageService.CACHE_MAX_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(ean, {
      image,
      expiresAt:
        Date.now() +
        (image
          ? ProductImageService.CACHE_TTL_MS
          : ProductImageService.NEGATIVE_TTL_MS),
    });
  }

  /** Mismas variantes EAN-13/UPC-A que usa PreciosClarosService */
  private candidatosEAN(ean: string): string[] {
    const set = new Set<string>([ean]);
    if (ean.length === 12) set.add('0' + ean);
    if (ean.length === 13 && ean.startsWith('0')) set.add(ean.slice(1));
    return [...set];
  }
}
