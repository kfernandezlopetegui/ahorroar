import {
  SuperOffer, saveSuperOffers, createBrowser, createPage,
  detectSuperCategory, calcDiscount, today, endOfWeek,
} from './base-super';

const CHAIN = 'Coto';
const BASE  = 'https://www.cotodigital.com.ar';
const PAGE_SIZE = 24;
const MAX_PAGES = 25;

export async function scrapeCoto(): Promise<SuperOffer[]> {
  console.log(`[${CHAIN}] Iniciando scraper...`);
  const browser = await createBrowser();
  const offers:  SuperOffer[] = [];

  try {
    const page = await createPage(browser);

    await page.goto(`${BASE}/sitios/cdigi/browse`, {
      waitUntil: 'domcontentloaded', timeout: 20_000,
    });
    await page.waitForTimeout(2000);

    const navStates = await getEndecaNavStates(page);
    console.log(`[${CHAIN}] NavStates: ${navStates.length}`);

    for (const { navState, label } of navStates) {
      let catOffers = 0;
      let total     = 0;

      for (let pageNo = 0; pageNo < MAX_PAGES; pageNo++) {
        const No  = pageNo * PAGE_SIZE;
        const sep = navState.includes('?') ? '&' : '?';
        const url = `${BASE}/sitios/cdigi/${navState}${sep}format=json&Nrpp=${PAGE_SIZE}&No=${No}`;

        const json = await navigateAndCapture(page, url);
        if (!json) { if (pageNo === 0) console.warn(`[${CHAIN}] Sin JSON: ${label}`); break; }

        if (pageNo === 0) {
          total = extractEndecaTotal(json);
          if (total > 0) console.log(`[${CHAIN}] ${label}: total=${total}`);
        }

        const records = extractEndecaProducts(json);
        if (!records.length) break;

        for (const r of records) {
          const offer = mapEndecaProduct(r);
          if (offer) { offers.push(offer); catOffers++; }
        }

        if (total > 0 && No + PAGE_SIZE >= total) break;
        if (records.length < PAGE_SIZE) break;
        await sleep(400);
      }

      if (catOffers > 0) console.log(`[${CHAIN}] ✅ ${label}: ${catOffers} ofertas`);
    }

  } catch (err: any) {
    console.error(`[${CHAIN}] Error: ${err.message}`);
  } finally {
    await browser.close();
  }

  console.log(`[${CHAIN}] Total: ${offers.length} ofertas`);
  return offers;
}

async function getEndecaNavStates(page: any): Promise<{ navState: string; label: string }[]> {
  // "Todas las Ofertas" siempre primero — la más completa (14628 productos)
  const result: { navState: string; label: string }[] = [
    { navState: 'categoria/ofertas-todas-las-ofertas/_/N-c7ha3p', label: 'Todas las Ofertas' },
  ];
  try {
    const data = await page.evaluate(async (base: string) => {
      const r = await fetch(`${base}/rest/model/atg/actors/cBackOfficeActor/getCategorias`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: '{}',
      });
      return r.json();
    }, BASE);
    for (const top of data?.output ?? []) {
      const cat = top.topLevelCategory ?? top;
      if (!cat.displayName?.toLowerCase().includes('oferta')) continue;
      for (const sub of cat.subCategories ?? []) {
        const ns = sub.navigationState ?? '';
        if (!ns || !ns.includes('N-')) continue;
        if (result.some(r => r.navState === ns)) continue;
        result.push({ navState: ns, label: sub.displayName ?? ns });
      }
    }
  } catch { /* usar hardcodeado */ }
  return result;
}

async function navigateAndCapture(page: any, url: string): Promise<any | null> {
  let capturedData: any = null;
  const handler = async (response: any) => {
    if (!response.url().includes('format=json')) return;
    if (response.status() !== 200) return;
    try {
      const text = await response.text();
      if (text.length < 10_000) return;
      const json = JSON.parse(text);
      if (json.contents) capturedData = json;
    } catch { /* ignorar */ }
  };
  page.on('response', handler);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await page.waitForTimeout(2500);
  } catch { /* timeout ok */ }
  page.off('response', handler);
  return capturedData;
}

function extractEndecaProducts(json: any): any[] {
  if (!json?.contents) return [];
  const products: any[] = [];
  const searchIn = (obj: any, depth = 0) => {
    if (!obj || typeof obj !== 'object' || depth > 8) return;
    if (Array.isArray(obj.records) && obj.records.length > 0) {
      const first = obj.records[0];
      if (first.attributes || first.detailsAction) {
        products.push(...obj.records);
        return;
      }
    }
    for (const val of Object.values(obj)) {
      if (Array.isArray(val)) {
        for (const item of val) {
          if (item && typeof item === 'object') searchIn(item, depth + 1);
        }
      } else if (val && typeof val === 'object') {
        searchIn(val as any, depth + 1);
      }
    }
  };
  searchIn(json);
  return products;
}

function extractEndecaTotal(json: any): number {
  const search = (obj: any, d = 0): number => {
    if (!obj || typeof obj !== 'object' || d > 8) return 0;
    if (typeof obj.totalNumRecs === 'number') return obj.totalNumRecs;
    if (typeof obj.numRecs      === 'number') return obj.numRecs;
    for (const v of Object.values(obj)) {
      if (v && typeof v === 'object') {
        const f = search(v as any, d + 1);
        if (f > 0) return f;
      }
    }
    return 0;
  };
  return search(json);
}

function mapEndecaProduct(parentRecord: any): SuperOffer | null {
  // Combinar atributos parent + sub-record
  const sub      = parentRecord.records?.[0] ?? {};
  const allAttrs = { ...parentRecord.attributes ?? {}, ...sub.attributes ?? {} };

  // Extrae primera valor de atributo (siempre es array de 1 elemento en Endeca)
  const attr = (...keys: string[]): string => {
    for (const k of keys) {
      const v = allAttrs[k];
      if (v != null) return String(Array.isArray(v) ? v[0] : v).trim();
    }
    return '';
  };

  const name = attr('product.displayName', 'sku.displayName');
  if (!name || name.length < 3) return null;

  // Precio activo (lo que paga el cliente) y precio de referencia (precio original)
  // Confirmado en la estructura: sku.activePrice=2100, sku.referencePrice=4200
  const offerPrice    = parsePrice(attr('sku.activePrice'));
  const originalPrice = parsePrice(attr('sku.referencePrice'));

  if (!offerPrice) return null;

  const discount = calcDiscount(originalPrice, offerPrice);
  if (discount < 0) return null;

  // EAN principal confirmado en estructura
  const ean = attr('product.eanPrincipal') || null;

  // Imagen: preferir medium, fallback large
  const imageUrl = attr('product.mediumImage.url', 'product.largeImage.url') || undefined;

  // Texto de descuento desde dtoDescuentos (JSON embebido)
  let offerDescription = '';
  try {
    const dtoJson = attr('product.dtoDescuentos');
    if (dtoJson && dtoJson !== '[]') {
      const dtos = JSON.parse(dtoJson);
      if (dtos.length > 0) {
        // Ej: "35%Dto" o "2x1"
        offerDescription = dtos[0].textoDescuento?.trim() ?? '';
        // También: "Precio Contado: $2100"
        if (!offerDescription) offerDescription = dtos[0].textoPrecioRegular?.trim() ?? '';
      }
    }
  } catch { /* ignorar */ }

  if (!offerDescription && discount > 0) offerDescription = `${discount}% OFF`;
  if (!offerDescription) offerDescription = 'Precio especial';

  // Tipo de oferta
  let offerType: SuperOffer['offer_type'] = 'percent';
  if (/2x1|2\s*x\s*1/i.test(offerDescription)) offerType = '2x1';
  else if (/3x2|3\s*x\s*2/i.test(offerDescription)) offerType = '3x2';

  // Categoría del departamento (LDEPAR = ALMACEN, LIMPIEZA, etc.)
  const depar = attr('product.LDEPAR', 'product.LCLASE', 'product.category');

  return {
    chain:             CHAIN,
    ean:               ean || null,
    product_name:      name.slice(0, 200),
    category:          detectSuperCategory(`${name} ${depar}`),
    image_url:         imageUrl,
    original_price:    originalPrice || null,
    offer_price:       offerPrice,
    discount_pct:      discount || undefined,
    offer_type:        offerType,
    offer_description: offerDescription.slice(0, 200),
    valid_from:        today(),
    valid_until:       endOfWeek(),
  };
}

function parsePrice(raw: string): number {
  if (!raw) return 0;
  return parseFloat(raw.replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

if (require.main === module) {
  scrapeCoto()
    .then(p => saveSuperOffers(p, CHAIN))
    .catch(console.error);
}