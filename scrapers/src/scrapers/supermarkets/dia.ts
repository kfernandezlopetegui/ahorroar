import axios from 'axios';
import {
  SuperOffer, saveSuperOffers,
  detectSuperCategory, calcDiscount, today, endOfWeek,
} from './base-super';

const CHAIN    = 'DIA';
const BASE     = 'https://diaonline.supermercadosdia.com.ar';
const HEADERS  = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept':     'application/json',
  'Referer':    `${BASE}/`,
};

// DIA usa productClusterIds — estos son los IDs de colecciones de ofertas
// visibles en la home: /10392?map=productClusterIds, /10146, /10147, etc.
const OFFER_CLUSTERS = [
  10392, 10146, 10147, 10149, 10250, 10331, 10373,
  10391, 10392, 10398, 10399, 632,
];

const PAGE_SIZE = 50;

export async function scrapeDIA(): Promise<SuperOffer[]> {
  console.log(`[${CHAIN}] Iniciando scraper (Vtex productClusterIds)...`);
  const offers: SuperOffer[] = [];

  // Estrategia 1: Buscar todos los productos con descuento sin filtro de categoría
  await scrapeByDiscount(offers);

  // Estrategia 2: Por clusters de ofertas conocidos
  if (offers.length < 50) {
    console.log(`[${CHAIN}] Pocas ofertas, probando por clusters...`);
    await scrapeByClusters(offers);
  }

  console.log(`[${CHAIN}] Total crudo: ${offers.length}`);
  return offers;
}

/** Busca todos los productos ordenados por mayor descuento */
async function scrapeByDiscount(offers: SuperOffer[]) {
  const MAX_PAGES = 10;
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE;
    const to   = from + PAGE_SIZE - 1;
    try {
      const { data } = await axios.get<any[]>(
        `${BASE}/api/catalog_system/pub/products/search`,
        {
          headers: HEADERS,
          timeout: 12_000,
          params:  { _from: from, _to: to, O: 'OrderByBestDiscountDESC' },
        },
      );

      if (!data?.length) break;

      for (const product of data) {
        const offer = mapVtexProduct(product);
        if (offer) offers.push(offer);
      }

      if (data.length < PAGE_SIZE) break;
      await sleep(400);
    } catch (err: any) {
      console.error(`[${CHAIN}] byDiscount p${page}: ${err.message}`);
      break;
    }
  }
}

/** Busca por IDs de colecciones (clusters) de ofertas conocidos */
async function scrapeByClusters(offers: SuperOffer[]) {
  for (const clusterId of OFFER_CLUSTERS) {
    try {
      const { data } = await axios.get<any[]>(
        `${BASE}/api/catalog_system/pub/products/search`,
        {
          headers: HEADERS,
          timeout: 10_000,
          params:  {
            fq:    `productClusterIds:${clusterId}`,
            _from: 0,
            _to:   49,
            O:     'OrderByBestDiscountDESC',
          },
        },
      );

      if (!data?.length) continue;

      for (const product of data) {
        const offer = mapVtexProduct(product);
        if (offer) offers.push(offer);
      }

      await sleep(300);
    } catch (err: any) {
      console.error(`[${CHAIN}] cluster ${clusterId}: ${err.message}`);
    }
  }
}

function mapVtexProduct(p: any): SuperOffer | null {
  const item   = p.items?.[0];
  const seller = item?.sellers?.[0]?.commertialOffer;
  if (!seller || (seller.AvailableQuantity ?? 1) <= 0) return null;

  const offerPrice    = Number(seller.Price    ?? 0);
  const originalPrice = Number(seller.ListPrice ?? 0);
  if (!offerPrice) return null;

  const discount = calcDiscount(originalPrice, offerPrice);
  if (discount < 5) return null;

  return {
    chain:             CHAIN,
    ean:               item?.ean ?? null,
    product_name:      String(p.productName ?? '').slice(0, 200),
    brand:             p.brand ?? undefined,
    category:          detectSuperCategory(`${p.productName ?? ''} ${p.brand ?? ''}`),
    image_url:         item?.images?.[0]?.imageUrl ?? undefined,
    original_price:    originalPrice || null,
    offer_price:       offerPrice,
    discount_pct:      discount,
    offer_type:        'percent',
    offer_description: `${discount}% OFF`,
    valid_from:        today(),
    valid_until:       endOfWeek(),
  };
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

if (require.main === module) {
  scrapeDIA()
    .then(p => saveSuperOffers(p, CHAIN))
    .catch(console.error);
}