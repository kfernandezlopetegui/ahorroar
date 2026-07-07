/**
 * Farmacity — usa la API Vtex (misma plataforma que Carrefour/DIA)
 * Endpoint: /api/catalog_system/pub/products/search
 * Filtro: OrderByBestDiscountDESC para capturar lo que tiene descuento real
 */
import axios from 'axios';
import {
  SuperOffer, saveSuperOffers,
  calcDiscount, today, endOfWeek,
} from './base-super';

const CHAIN    = 'Farmacity';
const BASE_URL = 'https://www.farmacity.com/api/catalog_system/pub/products/search';
const HEADERS  = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept':     'application/json',
};

// Búsquedas por término: Farmacity no expone el árbol de categorías de forma
// estable, así que se recorren los rubros principales por texto
const SEARCH_TERMS = [
  { term: 'dermocosmetica', label: 'perfumeria' },
  { term: 'shampoo',        label: 'perfumeria' },
  { term: 'desodorante',    label: 'perfumeria' },
  { term: 'pañales',        label: 'otros'      },
  { term: 'vitaminas',      label: 'otros'      },
  { term: 'protector solar',label: 'perfumeria' },
  { term: 'crema dental',   label: 'perfumeria' },
];

const PAGE_SIZE = 50;
const MAX_PAGES = 6; // máx 300 productos por término

export async function scrapeFarmacity(): Promise<SuperOffer[]> {
  console.log(`[${CHAIN}] Iniciando scraper (Vtex API)...`);
  const offers: SuperOffer[] = [];

  for (const search of SEARCH_TERMS) {
    for (let page = 0; page < MAX_PAGES; page++) {
      const from = page * PAGE_SIZE;
      const to   = from + PAGE_SIZE - 1;

      try {
        const { data } = await axios.get<VtexProduct[]>(
          `${BASE_URL}/${encodeURIComponent(search.term)}`,
          {
            headers: HEADERS,
            timeout: 12_000,
            params: {
              _from: from,
              _to:   to,
              O:     'OrderByBestDiscountDESC',
            },
          },
        );

        if (!data?.length) break;

        for (const product of data) {
          const offer = mapVtexProduct(product, search.label as SuperOffer['category']);
          if (offer) offers.push(offer);
        }

        if (data.length < PAGE_SIZE) break;

        // Pausa anti-ban entre páginas
        await sleep(300);
      } catch (err: any) {
        console.error(`[${CHAIN}] "${search.term}" p${page}: ${err.message}`);
        break;
      }
    }
  }

  return deduplicate(offers);
}

interface VtexProduct {
  productId:    string;
  productName:  string;
  brand:        string;
  categories:   string[];
  ean?:         string;
  items: {
    ean?:  string;
    images?: { imageUrl: string }[];
    sellers: {
      commertialOffer: {
        Price:          number;
        ListPrice:      number;
        AvailableQuantity: number;
        discountHighlights?: { name: string }[];
      };
    }[];
  }[];
}

function mapVtexProduct(
  p: VtexProduct,
  defaultCat: SuperOffer['category'],
): SuperOffer | null {
  const item   = p.items?.[0];
  const seller = item?.sellers?.[0]?.commertialOffer;
  if (!seller || seller.AvailableQuantity <= 0) return null;

  const offerPrice    = seller.Price;
  const originalPrice = seller.ListPrice;

  // Solo incluir si hay descuento real (mínimo 5%)
  const discount = calcDiscount(originalPrice, offerPrice);
  if (discount < 5) return null;

  const ean      = item.ean ?? p.ean ?? null;
  const imageUrl = item.images?.[0]?.imageUrl ?? undefined;

  return {
    chain:             CHAIN,
    ean:               ean || null,
    product_name:      p.productName.slice(0, 200),
    brand:             p.brand || undefined,
    category:          defaultCat,
    image_url:         imageUrl,
    original_price:    originalPrice,
    offer_price:       offerPrice,
    discount_pct:      discount,
    offer_type:        'percent',
    offer_description: seller.discountHighlights?.map(d => d.name).join(' ') || `${discount}% OFF`,
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

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

if (require.main === module) {
  scrapeFarmacity()
    .then(p => saveSuperOffers(p, CHAIN))
    .catch(console.error);
}
