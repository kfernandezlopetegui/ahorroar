/**
 * Carrefour Argentina — usa la API Vtex (plataforma de su e-commerce)
 * Endpoint: /api/catalog_system/pub/products/search
 * Filtro: OrderByBestDiscountDESC para capturar lo que tiene descuento real
 */
import axios from 'axios';
import {
  SuperOffer, saveSuperOffers,
  detectSuperCategory, calcDiscount, today, endOfWeek,
} from './base-super';

const CHAIN    = 'Carrefour';
const BASE_URL = 'https://www.carrefour.com.ar/api/catalog_system/pub/products/search';
const HEADERS  = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept':     'application/json',
};

// Categorías Vtex de Carrefour con sus IDs de árbol
const CATEGORY_IDS = [
  { vtexId: 'C:/2/',   label: 'almacen'     },
  { vtexId: 'C:/3/',   label: 'lacteos'     },
  { vtexId: 'C:/4/',   label: 'bebidas'     },
  { vtexId: 'C:/5/',   label: 'carnes'      },
  { vtexId: 'C:/6/',   label: 'congelados'  },
  { vtexId: 'C:/7/',   label: 'limpieza'    },
  { vtexId: 'C:/8/',   label: 'perfumeria'  },
  { vtexId: 'C:/12/',  label: 'verduleria'  },
];

const PAGE_SIZE = 50;
const MAX_PAGES = 10; // máx 500 productos por categoría

export async function scrapeCarrefour(): Promise<SuperOffer[]> {
  console.log(`[${CHAIN}] Iniciando scraper (Vtex API)...`);
  const offers: SuperOffer[] = [];

  for (const cat of CATEGORY_IDS) {
    for (let page = 0; page < MAX_PAGES; page++) {
      const from = page * PAGE_SIZE;
      const to   = from + PAGE_SIZE - 1;

      try {
        const { data } = await axios.get<VtexProduct[]>(BASE_URL, {
          headers: HEADERS,
          timeout: 12_000,
          params: {
            fq:   cat.vtexId,
            _from: from,
            _to:   to,
            O:    'OrderByBestDiscountDESC',
          },
        });

        if (!data?.length) break;

        for (const product of data) {
          const offer = mapVtexProduct(product, cat.label as SuperOffer['category']);
          if (offer) offers.push(offer);
        }

        // Si retornó menos de PAGE_SIZE → última página
        if (data.length < PAGE_SIZE) break;

        // Pausa anti-ban entre páginas
        await sleep(300);
      } catch (err: any) {
        console.error(`[${CHAIN}] Cat ${cat.vtexId} p${page}: ${err.message}`);
        break;
      }
    }
  }

  // Deduplicar por EAN o por nombre
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

  const ean         = item.ean ?? p.ean ?? null;
  const imageUrl    = item.images?.[0]?.imageUrl ?? undefined;
  const fullText    = `${p.productName} ${p.brand} ${p.categories?.join(' ')}`;

  return {
    chain:             CHAIN,
    ean:               ean || null,
    product_name:      p.productName.slice(0, 200),
    brand:             p.brand || undefined,
    category:          detectSuperCategory(fullText) || defaultCat,
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
  scrapeCarrefour()
    .then(p => saveSuperOffers(p, CHAIN))
    .catch(console.error);
}