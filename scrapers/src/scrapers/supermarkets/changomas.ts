import axios from 'axios';
import {
  SuperOffer, saveSuperOffers,
  detectSuperCategory, calcDiscount, today, endOfWeek,
} from './base-super';

const CHAIN = 'Changomás';
// ChangoMás migró su ecommerce a masonline.com.ar (Vtex)
const BASE_URL = 'https://www.masonline.com.ar/api/catalog_system/pub/products/search';
const HEADERS  = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept':     'application/json',
  'Referer':    'https://www.masonline.com.ar/',
  'Origin':     'https://www.masonline.com.ar',
};

const CATEGORY_FILTERS = [
  'C:/2/', 'C:/3/', 'C:/4/', 'C:/5/', 'C:/6/', 'C:/7/', 'C:/8/',
];

const PAGE_SIZE = 50;
const MAX_PAGES = 8;

export async function scrapeChangomas(): Promise<SuperOffer[]> {
  console.log(`[${CHAIN}] Iniciando scraper (Vtex API - masonline)...`);
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
          const item   = product.items?.[0];
          const seller = item?.sellers?.[0]?.commertialOffer;
          if (!seller || (seller.AvailableQuantity ?? 1) <= 0) continue;

          const offerPrice    = Number(seller.Price    ?? 0);
          const originalPrice = Number(seller.ListPrice ?? 0);
          if (!offerPrice) continue;

          const discount = calcDiscount(originalPrice, offerPrice);
          if (discount < 5) continue;

          offers.push({
            chain:             CHAIN,
            ean:               item?.ean ?? null,
            product_name:      String(product.productName ?? '').slice(0, 200),
            brand:             product.brand ?? undefined,
            category:          detectSuperCategory(`${product.productName ?? ''} ${product.brand ?? ''}`),
            image_url:         item?.images?.[0]?.imageUrl ?? undefined,
            original_price:    originalPrice || null,
            offer_price:       offerPrice,
            discount_pct:      discount,
            offer_type:        'percent',
            offer_description: `${discount}% OFF`,
            valid_from:        today(),
            valid_until:       endOfWeek(),
          });
        }

        if (data.length < PAGE_SIZE) break;
        await sleep(400);
      } catch (err: any) {
        console.error(`[${CHAIN}] Cat ${catFilter} p${page}: ${err.message}`);
        break;
      }
    }
  }

  return offers;
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

if (require.main === module) {
  scrapeChangomas()
    .then(p => saveSuperOffers(p, CHAIN))
    .catch(console.error);
}