/**
 * Jumbo + Disco Argentina — Grupo Cencosud
 * Ambas usan la misma plataforma Vtex
 */
import axios from 'axios';
import {
  SuperOffer, saveSuperOffers,
  detectSuperCategory, calcDiscount, today, endOfWeek,
} from './base-super';

interface CencosudConfig {
  chain:   string;
  baseUrl: string;
  referer: string;
}

const CHAINS: CencosudConfig[] = [
  {
    chain:   'Jumbo',
    baseUrl: 'https://www.jumbo.com.ar/api/catalog_system/pub/products/search',
    referer: 'https://www.jumbo.com.ar/',
  },
  {
    chain:   'Disco',
    baseUrl: 'https://www.disco.com.ar/api/catalog_system/pub/products/search',
    referer: 'https://www.disco.com.ar/',
  },
  {
    chain:   'Vea',
    baseUrl: 'https://www.vea.com.ar/api/catalog_system/pub/products/search',
    referer: 'https://www.vea.com.ar/',
  },
];

const CATEGORY_FILTERS = [
  'C:/2/', 'C:/3/', 'C:/4/', 'C:/5/',
  'C:/6/', 'C:/7/', 'C:/8/',
];

const PAGE_SIZE = 50;
const MAX_PAGES = 8;

export async function scrapeJumbo(): Promise<SuperOffer[]> {
  return scrapeCencosud(CHAINS[0]);
}

export async function scrapeDisco(): Promise<SuperOffer[]> {
  return scrapeCencosud(CHAINS[1]);
}

export async function scrapeVea(): Promise<SuperOffer[]> {
  return scrapeCencosud(CHAINS[2]);
}

async function scrapeCencosud(config: CencosudConfig): Promise<SuperOffer[]> {
  console.log(`[${config.chain}] Iniciando scraper (Vtex API)...`);
  const offers: SuperOffer[] = [];

  const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept':     'application/json',
    'Referer':    config.referer,
    'Origin':     new URL(config.referer).origin,
  };

  for (const catFilter of CATEGORY_FILTERS) {
    for (let page = 0; page < MAX_PAGES; page++) {
      const from = page * PAGE_SIZE;
      const to   = from + PAGE_SIZE - 1;

      try {
        const { data } = await axios.get<any[]>(config.baseUrl, {
          headers: HEADERS,
          timeout: 12_000,
          params: {
            fq:    catFilter,
            _from: from,
            _to:   to,
            O:     'OrderByBestDiscountDESC',
          },
        });

        if (!data?.length) break;

        for (const product of data) {
          const offer = mapVtexProduct(product, config.chain);
          if (offer) offers.push(offer);
        }

        if (data.length < PAGE_SIZE) break;
        await sleep(400);
      } catch (err: any) {
        console.error(`[${config.chain}] Cat ${catFilter} p${page}: ${err.message}`);
        break;
      }
    }
  }

  return deduplicate(offers);
}

function mapVtexProduct(p: any, chain: string): SuperOffer | null {
  const item   = p.items?.[0];
  const seller = item?.sellers?.[0]?.commertialOffer;
  if (!seller) return null;

  const offerPrice    = Number(seller.Price    ?? 0);
  const originalPrice = Number(seller.ListPrice ?? 0);
  if (!offerPrice) return null;

  const discount = calcDiscount(originalPrice, offerPrice);
  if (discount < 5) return null;

  return {
    chain,
    ean:               item?.ean ?? null,
    product_name:      String(p.productName ?? '').slice(0, 200),
    brand:             p.brand ?? undefined,
    category:          detectSuperCategory(`${p.productName} ${p.brand}`),
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

function deduplicate(offers: SuperOffer[]): SuperOffer[] {
  const seen = new Set<string>();
  return offers.filter(o => {
    const key = (o.ean ?? o.product_name).toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

if (require.main === module) {
  // Correr los tres Cencosud en paralelo
  Promise.all([scrapeJumbo(), scrapeDisco(), scrapeVea()])
    .then(async ([j, d, v]) => {
      await saveSuperOffers(j, 'Jumbo');
      await saveSuperOffers(d, 'Disco');
      await saveSuperOffers(v, 'Vea');
    })
    .catch(console.error);
}