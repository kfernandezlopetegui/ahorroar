import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

/**
 * Fuentes alternativas de lookup por EAN, para no depender solo de Precios Claros.
 * Como hacen otras apps de precios:
 *  - APIs VTEX de las cadenas (Carrefour, DIA, Jumbo, Disco, Vea, ChangoMás, Farmacity):
 *    devuelven nombre, marca, imagen y PRECIO online real por cadena.
 *  - Open Food Facts: metadata del producto (nombre, marca, imagen) cuando
 *    ninguna cadena lo tiene.
 */

export interface OnlinePrice {
  cadena: string;
  nombre: string;
  marca: string | null;
  precio: number;
  precioLista: number | null;
  imagen: string | null;
  url: string | null;
  fuente: 'vtex';
}

export interface ExternalProductInfo {
  ean: string;
  nombre: string;
  marca: string | null;
  presentacion: string | null;
  imagen: string | null;
  fuente: 'vtex' | 'openfoodfacts';
}

export interface EanSourcesResult {
  onlinePrices: OnlinePrice[];
  productInfo: ExternalProductInfo | null;
}

interface VtexStore {
  cadena: string;
  host: string;
}

const VTEX_STORES: VtexStore[] = [
  { cadena: 'Carrefour', host: 'https://www.carrefour.com.ar' },
  { cadena: 'DIA', host: 'https://diaonline.supermercadosdia.com.ar' },
  { cadena: 'Jumbo', host: 'https://www.jumbo.com.ar' },
  { cadena: 'Disco', host: 'https://www.disco.com.ar' },
  { cadena: 'Vea', host: 'https://www.vea.com.ar' },
  { cadena: 'ChangoMás', host: 'https://www.masonline.com.ar' },
  { cadena: 'Farmacity', host: 'https://www.farmacity.com' },
];

const VTEX_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json',
};

const TIMEOUT_MS = 6000;

@Injectable()
export class EanSourcesService {
  private readonly logger = new Logger(EanSourcesService.name);

  constructor(private readonly http: HttpService) {}

  /**
   * Consulta todas las fuentes alternativas en paralelo.
   * `candidatos` son las variantes del código (EAN-13 / UPC-A).
   */
  async lookup(candidatos: string[]): Promise<EanSourcesResult> {
    if (!candidatos.length) return { onlinePrices: [], productInfo: null };

    const vtexResults = await Promise.allSettled(
      VTEX_STORES.map((store) => this.lookupVtexStore(store, candidatos)),
    );

    const onlinePrices: OnlinePrice[] = [];
    for (const r of vtexResults) {
      if (r.status === 'fulfilled' && r.value) onlinePrices.push(r.value);
    }
    onlinePrices.sort((a, b) => a.precio - b.precio);

    let productInfo: ExternalProductInfo | null = null;
    const first = onlinePrices[0];
    if (first) {
      productInfo = {
        ean: candidatos[0],
        nombre: first.nombre,
        marca: first.marca,
        presentacion: null,
        imagen: first.imagen,
        fuente: 'vtex',
      };
    } else {
      // Ninguna cadena lo vende online: al menos identificar el producto
      productInfo = await this.lookupOpenFoodFacts(candidatos);
    }

    return { onlinePrices, productInfo };
  }

  private async lookupVtexStore(
    store: VtexStore,
    candidatos: string[],
  ): Promise<OnlinePrice | null> {
    for (const ean of candidatos) {
      try {
        const { data } = await firstValueFrom(
          this.http.get<any[]>(
            `${store.host}/api/catalog_system/pub/products/search`,
            {
              headers: { ...VTEX_HEADERS, Referer: `${store.host}/` },
              params: { fq: `alternateIds_Ean:${ean}` },
              timeout: TIMEOUT_MS,
            },
          ),
        );

        const product = data?.[0];
        if (!product) continue;

        const item =
          product.items?.find((i: any) =>
            candidatos.includes(String(i.ean ?? '')),
          ) ?? product.items?.[0];
        const offer = item?.sellers?.[0]?.commertialOffer;
        if (!offer || !offer.Price || offer.AvailableQuantity <= 0) continue;

        return {
          cadena: store.cadena,
          nombre: product.productName ?? `Producto ${ean}`,
          marca: product.brand ?? null,
          precio: offer.Price,
          precioLista:
            offer.ListPrice && offer.ListPrice !== offer.Price
              ? offer.ListPrice
              : null,
          imagen: item?.images?.[0]?.imageUrl ?? null,
          url: product.link ?? (product.linkText ? `${store.host}/${product.linkText}/p` : null),
          fuente: 'vtex',
        };
      } catch (err: any) {
        this.logger.debug(`[${store.cadena}] EAN ${ean}: ${err.message}`);
      }
    }
    return null;
  }

  private async lookupOpenFoodFacts(
    candidatos: string[],
  ): Promise<ExternalProductInfo | null> {
    for (const ean of candidatos) {
      try {
        const { data } = await firstValueFrom(
          this.http.get(
            `https://world.openfoodfacts.org/api/v2/product/${ean}.json`,
            {
              headers: { 'User-Agent': 'Preciosos/1.0 (price comparison app)' },
              params: {
                fields: 'product_name,product_name_es,brands,quantity,image_front_url',
              },
              timeout: TIMEOUT_MS,
            },
          ),
        );

        const p = data?.product;
        if (data?.status !== 1 || !p) continue;

        const nombre = p.product_name_es || p.product_name;
        if (!nombre) continue;

        return {
          ean,
          nombre,
          marca: p.brands ?? null,
          presentacion: p.quantity ?? null,
          imagen: p.image_front_url ?? null,
          fuente: 'openfoodfacts',
        };
      } catch (err: any) {
        this.logger.debug(`[OpenFoodFacts] EAN ${ean}: ${err.message}`);
      }
    }
    return null;
  }
}
