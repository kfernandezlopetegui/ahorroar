import axios from 'axios';
import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import {
  SuperOffer, saveSuperOffers,
  detectSuperCategory, calcDiscount, parseOfferText, today, endOfWeek,
} from './base-super';

const CHAIN    = 'La Anónima';
const BASE_URL = 'https://www.la-anonima.com.ar/ofertas';
const HEADERS  = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept':          'text/html,application/xhtml+xml',
  'Accept-Language': 'es-AR,es;q=0.9',
};

export async function scrapeLaAnonima(): Promise<SuperOffer[]> {
  console.log(`[${CHAIN}] Iniciando scraper (HTML)...`);
  const offers: SuperOffer[] = [];

  try {
    const apiOffers = await tryApiEndpoint();
    if (apiOffers.length > 0) {
      console.log(`[${CHAIN}] API: ${apiOffers.length} ofertas`);
      return apiOffers;
    }

    const { data } = await axios.get(BASE_URL, {
      headers: HEADERS,
      timeout: 15_000,
    });

    const $ = cheerio.load(data);

    $('[class*="product"], [class*="offer"], article').each((_, el: AnyNode) => {
      const offer = parseProduct($, el);
      if (offer) offers.push(offer);
    });

    console.log(`[${CHAIN}] HTML: ${offers.length} ofertas`);
  } catch (err: any) {
    console.error(`[${CHAIN}] Error: ${err.message}`);
  }

  return deduplicate(offers);
}

async function tryApiEndpoint(): Promise<SuperOffer[]> {
  const endpoints = [
    'https://www.la-anonima.com.ar/api/ofertas',
    'https://www.la-anonima.com.ar/api/products/offers',
  ];

  for (const url of endpoints) {
    try {
      const { data } = await axios.get(url, {
        headers: { ...HEADERS, Accept: 'application/json' },
        timeout: 8_000,
      });

      const products: any[] = Array.isArray(data) ? data : (data.products ?? data.items ?? []);
      if (!products.length) continue;

      return products
        .map((p): SuperOffer | null => {
          const offerPrice    = Number(p.price ?? p.offer_price ?? p.salePrice ?? 0);
          const originalPrice = Number(p.listPrice ?? p.original_price ?? p.regularPrice ?? 0);
          const discount      = calcDiscount(originalPrice, offerPrice);
          if (!offerPrice || discount < 5) return null;

          return {
            chain:             CHAIN,
            ean:               p.ean ?? p.barcode ?? null,
            product_name:      String(p.name ?? p.title ?? '').slice(0, 200),
            brand:             p.brand ?? undefined,
            category:          detectSuperCategory(`${p.name ?? ''} ${p.category ?? ''}`),
            image_url:         p.image ?? p.imageUrl ?? undefined,
            original_price:    originalPrice || null,
            offer_price:       offerPrice,
            discount_pct:      discount,
            offer_type:        'percent',
            offer_description: `${discount}% OFF`,
            valid_from:        today(),
            valid_until:       endOfWeek(),
          };
        })
        .filter((o): o is SuperOffer => o !== null);
    } catch { continue; }
  }

  return [];
}

function parseProduct($: cheerio.CheerioAPI, el: AnyNode): SuperOffer | null {
  const $el = $(el);

  const name = $el.find('[class*="title"], [class*="name"], h3, h4').first().text().trim();
  if (!name || name.length < 3) return null;

  const priceTexts = $el.find('[class*="price"]').map((_, e) => $(e).text().trim()).get();
  if (!priceTexts.length) return null;

  const prices = priceTexts
    .map(t => parseFloat(t.replace(/[^\d,]/g, '').replace(',', '.')))
    .filter(n => n > 0)
    .sort((a, b) => a - b);

  if (!prices.length) return null;

  const offerPrice    = prices[0];
  const originalPrice = prices.length > 1 ? prices[prices.length - 1] : 0;
  const discount      = calcDiscount(originalPrice, offerPrice);

  const hasBadge = $el.find('[class*="badge"], [class*="promo"], [class*="off"]').length > 0;
  if (discount < 5 && !hasBadge) return null;

  const offerText    = $el.find('[class*="badge"], [class*="promo"]').first().text().trim();
  const { type }     = offerText ? parseOfferText(offerText) : { type: 'percent' as const };

  return {
    chain:             CHAIN,
    ean:               $el.attr('data-ean') || null,
    product_name:      name.slice(0, 200),
    category:          detectSuperCategory(name),
    image_url:         $el.find('img').attr('data-src') ?? $el.find('img').attr('src'),
    original_price:    originalPrice || null,
    offer_price:       offerPrice,
    discount_pct:      discount || undefined,
    offer_type:        type,
    offer_description: offerText || (discount > 0 ? `${discount}% OFF` : 'Precio especial'),
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

if (require.main === module) {
  scrapeLaAnonima()
    .then(p => saveSuperOffers(p, CHAIN))
    .catch(console.error);
}