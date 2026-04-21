import axios from 'axios';
import {
  SuperOffer, saveSuperOffers,
  detectSuperCategory, calcDiscount, today, endOfWeek,
} from './base-super';

const CHAIN    = 'DIA';
// URL real del ecommerce de DIA Argentina
const BASE_URL = 'https://diaonline.supermercadosdia.com.ar/api/catalog_system/pub/products/search';
const HEADERS  = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept':     'application/json',
  'Referer':    'https://diaonline.supermercadosdia.com.ar/',
  'Origin':     'https://diaonline.supermercadosdia.com.ar',
};

const PAGE_SIZE = 50;
const MAX_PAGES = 8;

const CATEGORY_FILTERS = [
  'C:/2/', 'C:/3/', 'C:/4/', 'C:/5/', 'C:/6/', 'C:/7/', 'C:/8/',
];

export async function scrapeDIA(): Promise<SuperOffer[]> {
  console.log(`[${CHAIN}] Iniciando scraper (Vtex API - diaonline)...`);
  const offers: SuperOffer[] = [];

  for (const catFilter of CATEGORY_FILTERS) {
    for (let page = 0; page < MAX_PAGES; page++) {
      const from = page * PAGE_SIZE;
      const to   = from + PAGE_SIZE - 1;
      try {
        const { data } = await axios.get<any[]>(BASE_URL, {
          headers: HEADERS,
          timeout: 12_000,
          params:  { fq: catFilter, _from: from, _to: to, O: 'OrderByBestDiscountDESC' },
        });

        if (!data?.length) break;

        for (const product of data) {
          const offer = mapVtexProduct(product);
          if (offer) offers.push(offer);
        }

        if (data.length < PAGE_SIZE) break;
        await sleep(350);
      } catch (err: any) {
        console.error(`[${CHAIN}] Cat ${catFilter} p${page}: ${err.message}`);
        break;
      }
    }
  }

  return offers;
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