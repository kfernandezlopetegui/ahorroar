import axios from 'axios';
import {
  SuperOffer, saveSuperOffers,
  detectSuperCategory, calcDiscount, today, endOfWeek,
} from './base-super';

const CHAIN    = 'Changomás';
const BASE     = 'https://www.masonline.com.ar';
const HEADERS  = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept':     'application/json',
  'Referer':    `${BASE}/`,
  'Origin':     BASE,
};

// IDs de colecciones (productClusterIds) visibles en la home de masonline.com.ar
// 2063 = destacados/ofertas, 2057 = almacén, 2398 = bebidas,
// 2070 = perfumería/limpieza, 2062 = lácteos/congelados
const CLUSTERS = [
  { id: 2063, label: 'ofertas'    },
  { id: 2057, label: 'almacen'    },
  { id: 2398, label: 'bebidas'    },
  { id: 2070, label: 'perfumeria' },
  { id: 2062, label: 'lacteos'    },
];

const PAGE_SIZE = 50;
const MAX_PAGES = 8;

export async function scrapeChangomas(): Promise<SuperOffer[]> {
  console.log(`[${CHAIN}] Iniciando scraper (Vtex productClusterIds - masonline)...`);
  const offers: SuperOffer[] = [];

  // Estrategia 1: búsqueda global por mayor descuento
  await scrapeByDiscount(offers);

  // Estrategia 2: por clusters si la primera trajo poco
  if (offers.length < 50) {
    await scrapeByClusters(offers);
  }

  return offers;
}

async function scrapeByDiscount(offers: SuperOffer[]) {
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

async function scrapeByClusters(offers: SuperOffer[]) {
  for (const cluster of CLUSTERS) {
    for (let page = 0; page < MAX_PAGES; page++) {
      const from = page * PAGE_SIZE;
      const to   = from + PAGE_SIZE - 1;
      try {
        const { data } = await axios.get<any[]>(
          `${BASE}/api/catalog_system/pub/products/search`,
          {
            headers: HEADERS,
            timeout: 12_000,
            params:  {
              fq:    `productClusterIds:${cluster.id}`,
              _from: from,
              _to:   to,
              O:     'OrderByBestDiscountDESC',
            },
          },
        );

        if (!data?.length) break;

        for (const product of data) {
          const offer = mapVtexProduct(product);
          if (offer) offers.push(offer);
        }

        if (data.length < PAGE_SIZE) break;
        await sleep(350);
      } catch (err: any) {
        console.error(`[${CHAIN}] cluster ${cluster.id} p${page}: ${err.message}`);
        break;
      }
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
  scrapeChangomas()
    .then(p => saveSuperOffers(p, CHAIN))
    .catch(console.error);
}