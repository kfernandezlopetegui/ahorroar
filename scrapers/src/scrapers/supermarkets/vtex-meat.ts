/**
 * Barrido de carnes para tiendas Vtex (Carrefour, DIA, Changomás,
 * Jumbo/Disco/Vea).
 *
 * Los scrapers de ofertas ordenan por descuento y descartan todo lo que
 * tenga menos de 5% — pero la carne fresca se vende "x kg" a precio de
 * lista, casi nunca con descuento porcentual, así que el comparador de
 * cortes quedaba alimentado sólo por liquidaciones puntuales (pocas
 * cadenas y precios sesgados a la baja).
 *
 * Este barrido consulta la búsqueda full-text de Vtex por término de corte
 * ("vacio", "asado", …) y se queda SOLO con los productos que el matcher
 * de cortes reconoce, con o sin descuento. Como el feed de ofertas filtra
 * discount_pct >= 5 en el backend, la carne a precio de lista no aparece
 * entre las "ofertas": únicamente alimenta el comparador por $/kg.
 */
import axios from 'axios';
import {
  SuperOffer, calcDiscount, today, endOfWeek,
} from './base-super';
import { isMeatCutName } from '../../meat/meat-cut-matcher';

/** Un término por corte del seed (meat-cuts.data.ts). */
const MEAT_SEARCH_TERMS = [
  'vacio', 'asado', 'matambre', 'peceto', 'nalga', 'cuadril',
  'bife de chorizo', 'roast beef', 'entraña', 'osobuco', 'falda',
  'bola de lomo', 'carne picada', 'lomo',
];

const PAGE_SIZE = 50;

export interface VtexMeatSweepConfig {
  chain: string;
  /** URL del endpoint /api/catalog_system/pub/products/search */
  baseUrl: string;
  headers: Record<string, string>;
}

export async function vtexMeatSweep(config: VtexMeatSweepConfig): Promise<SuperOffer[]> {
  const offers: SuperOffer[] = [];

  for (const term of MEAT_SEARCH_TERMS) {
    try {
      const { data } = await axios.get<any[]>(config.baseUrl, {
        headers: config.headers,
        timeout: 12_000,
        params: { ft: term, _from: 0, _to: PAGE_SIZE - 1 },
      });

      for (const product of data ?? []) {
        const offer = mapVtexMeatProduct(product, config.chain);
        if (offer) offers.push(offer);
      }

      await sleep(350);
    } catch (err: any) {
      console.error(`[${config.chain}] meat sweep '${term}': ${err.message}`);
    }
  }

  const unique = deduplicate(offers);
  console.log(`[${config.chain}] 🥩 Barrido de carnes: ${unique.length} cortes`);
  return unique;
}

function mapVtexMeatProduct(p: any, chain: string): SuperOffer | null {
  const name = String(p.productName ?? '').trim();
  // La búsqueda full-text trae de todo ("salsa para asado", "lomitos de
  // atún"): sólo pasa lo que el matcher reconoce como corte comparable.
  if (!name || !isMeatCutName(name)) return null;

  const item   = p.items?.[0];
  const seller = item?.sellers?.[0]?.commertialOffer;
  if (!seller || (seller.AvailableQuantity ?? 1) <= 0) return null;

  const offerPrice    = Number(seller.Price ?? 0);
  const originalPrice = Number(seller.ListPrice ?? 0);
  if (!offerPrice) return null;

  const discount = calcDiscount(originalPrice, offerPrice);

  // Productos pesables: Vtex publica Price por unitMultiplier de la unidad
  // de medida (ej: 0.1 kg = el precio mostrado es por 100 g). Si el nombre
  // dice "x kg" pero el precio es por 100 g, inferirlo del nombre daría un
  // $/kg 10 veces más barato — por eso lo calculamos acá desde los datos
  // estructurados y el annotator lo respeta.
  let pricePerKg: number | null = null;
  const unit = String(item?.measurementUnit ?? '').toLowerCase();
  const mult = Number(item?.unitMultiplier ?? 0);
  if (unit === 'kg' && mult > 0) {
    pricePerKg = Math.round((offerPrice / mult) * 100) / 100;
  }

  return {
    chain,
    ean:               item?.ean ?? null,
    product_name:      name.slice(0, 200),
    brand:             p.brand ?? undefined,
    category:          'carnes',
    image_url:         item?.images?.[0]?.imageUrl ?? undefined,
    original_price:    originalPrice > offerPrice ? originalPrice : null,
    offer_price:       offerPrice,
    discount_pct:      discount || undefined,
    offer_type:        discount > 0 ? 'percent' : 'fixed_price',
    offer_description: discount > 0 ? `${discount}% OFF` : 'Precio de carnicería',
    valid_from:        today(),
    valid_until:       endOfWeek(),
    price_per_kg:      pricePerKg,
  };
}

function deduplicate(offers: SuperOffer[]): SuperOffer[] {
  const seen = new Set<string>();
  return offers.filter(o => {
    const key = (o.ean || o.product_name).toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}
