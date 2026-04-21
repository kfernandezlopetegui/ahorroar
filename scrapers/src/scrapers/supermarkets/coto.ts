import axios from 'axios';
import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import {
  SuperOffer, saveSuperOffers,
  detectSuperCategory, calcDiscount, today, endOfWeek,
} from './base-super';

const CHAIN = 'Coto';
// URL correcta del ecommerce de Coto
const BASE_URL = 'https://www.cotodigital.com.ar/sitios/cdigi/browse';
const HEADERS  = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-AR,es;q=0.9',
};

// Categorías del sitio cotodigital.com.ar con sus parámetros N reales
const CATEGORIES = [
  { path: '/',            N: 'c7ha3p', label: 'ofertas'     }, // Todas las ofertas
  { path: '/almacen',     N: '',       label: 'almacen'     },
  { path: '/lacteos',     N: '',       label: 'lacteos'     },
  { path: '/bebidas',     N: '',       label: 'bebidas'     },
  { path: '/carnes',      N: '',       label: 'carnes'      },
  { path: '/congelados',  N: '',       label: 'congelados'  },
  { path: '/limpieza',    N: '',       label: 'limpieza'    },
  { path: '/perfumeria',  N: '',       label: 'perfumeria'  },
];

export async function scrapeCoto(): Promise<SuperOffer[]> {
  console.log(`[${CHAIN}] Iniciando scraper...`);
  const offers: SuperOffer[] = [];

  // Primero intentar la página de todas las ofertas directamente
  try {
    await scrapeCotoOffers(offers);
  } catch (err: any) {
    console.error(`[${CHAIN}] Error ofertas: ${err.message}`);
  }

  // Si no encontró nada, intentar por categoría
  if (!offers.length) {
    for (const cat of CATEGORIES.filter(c => c.label !== 'ofertas')) {
      try {
        await scrapeCotoCat(cat.path, offers);
        await sleep(600);
      } catch (err: any) {
        console.error(`[${CHAIN}] Cat ${cat.path}: ${err.message}`);
      }
    }
  }

  return offers;
}

/** Scraping de la página de ofertas de Coto */
async function scrapeCotoOffers(offers: SuperOffer[]) {
  const offersUrl = 'https://www.cotodigital.com.ar/sitios/cdigi/categoria/ofertas-todas-las-ofertas/_/N-c7ha3p';
  let page    = 0;
  let hasMore = true;

  while (hasMore && page < 20) {
    const { data } = await axios.get(offersUrl, {
      headers: HEADERS,
      timeout: 15_000,
      params: {
        No:   page * 24,
        Nrpp: 24,
      },
    });

    const $        = cheerio.load(data);
    const products = $('.product-grid-item, .product_grid_each, [class*="product_item"]');

    if (!products.length) { hasMore = false; break; }

    let found = 0;
    products.each((_, el: AnyNode) => {
      const offer = parseCotoProduct($, el);
      if (offer) { offers.push(offer); found++; }
    });

    const hasNext = $('[class*="next"], .pager-next, [aria-label="siguiente"]').length > 0;
    hasMore = hasNext && found > 0;
    page++;
    if (hasMore) await sleep(500);
  }

  console.log(`[${CHAIN}] Ofertas page: ${offers.length} encontradas`);
}

async function scrapeCotoCat(catPath: string, offers: SuperOffer[]) {
  const url = `${BASE_URL}${catPath}`;
  let page    = 0;
  let hasMore = true;

  while (hasMore && page < 15) {
    const { data } = await axios.get(url, {
      headers: HEADERS,
      timeout: 12_000,
      params: {
        Dy:   1,      // solo con descuento
        No:   page * 24,
        Nrpp: 24,
      },
    });

    const $        = cheerio.load(data);
    const products = $('.product-grid-item, .product_grid_each, [class*="product_item"]');

    if (!products.length) { hasMore = false; break; }

    let found = 0;
    products.each((_, el: AnyNode) => {
      const offer = parseCotoProduct($, el);
      if (offer) { offers.push(offer); found++; }
    });

    const hasNext = $('[class*="next"], .pager-next').length > 0;
    hasMore = hasNext && found > 0;
    page++;
    if (hasMore) await sleep(500);
  }
}

function parseCotoProduct($: cheerio.CheerioAPI, el: AnyNode): SuperOffer | null {
  const $el = $(el);

  const name = $el
    .find('.product_title, .descrip_full, [class*="product-name"], [class*="product-title"]')
    .first()
    .text()
    .trim();

  if (!name || name.length < 3) return null;

  // Intentar varios selectores de precio
  const offerText    = $el.find('.atg_store_newPrice, .price_sale, [class*="price-sale"], [class*="new-price"]').first().text().trim();
  const originalText = $el.find('.atg_store_oldPrice, .price_regular, [class*="price-regular"], [class*="old-price"]').first().text().trim();

  const offerPrice    = parsePrice(offerText);
  const originalPrice = parsePrice(originalText);

  if (!offerPrice || offerPrice <= 0) return null;

  const discount = originalPrice ? calcDiscount(originalPrice, offerPrice) : 0;

  // Aceptar si hay precio tachado O si hay badge de descuento
  const hasBadge = $el.find('[class*="badge"], [class*="promo"], [class*="off"], [class*="discount"]').length > 0;
  if (discount < 5 && !hasBadge && !originalText) return null;

  const ean      = $el.attr('data-ean') || $el.find('[data-ean]').attr('data-ean') || null;
  const imageUrl = $el.find('img').first().attr('data-src')
    ?? $el.find('img').first().attr('src')
    ?? undefined;

  return {
    chain:             CHAIN,
    ean:               ean || null,
    product_name:      name.slice(0, 200),
    category:          detectSuperCategory(name),
    image_url:         imageUrl,
    original_price:    originalPrice || null,
    offer_price:       offerPrice,
    discount_pct:      discount || undefined,
    offer_type:        'percent',
    offer_description: discount > 0 ? `${discount}% OFF` : 'Precio especial',
    valid_from:        today(),
    valid_until:       endOfWeek(),
  };
}

function parsePrice(raw: string): number {
  if (!raw) return 0;
  // "$1.234,56" → 1234.56
  const cleaned = raw
    .replace(/\s/g, '')
    .replace(/\$/g, '')
    .replace(/\./g, '')    // separador de miles
    .replace(',', '.');    // separador decimal
  return parseFloat(cleaned) || 0;
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

if (require.main === module) {
  scrapeCoto()
    .then(p => saveSuperOffers(p, CHAIN))
    .catch(console.error);
}