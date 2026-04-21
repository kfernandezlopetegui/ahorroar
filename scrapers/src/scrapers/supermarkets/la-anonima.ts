/**
 * La Anónima — api.laanonima.com.ar
 * La app primero setea la sucursal, luego carga los productos de esa sucursal.
 * Estrategia: dejar que la página setee la sucursal,
 * luego probar los endpoints de catálogo desde el contexto del browser.
 */
import {
  SuperOffer, saveSuperOffers, createBrowser, createPage,
  detectSuperCategory, calcDiscount, today, endOfWeek,
} from './base-super';

const CHAIN    = 'La Anónima';
const BASE_WEB = 'https://www.laanonima.com.ar';
const BASE_API = 'https://api.laanonima.com.ar';

// Categorías del supermercado con sus IDs numéricos
// (deducidos de las URLs /almacen/n1_1/, /lacteos-y-frescos/n1_2/, etc.)
const SUPER_CATS = [
  { id: 1,  path: '/almacen/n1_1/',           label: 'almacen'    },
  { id: 2,  path: '/lacteos-y-frescos/n1_2/', label: 'lacteos'    },
  { id: 3,  path: '/bebidas/n1_3/',           label: 'bebidas'    },
  { id: 4,  path: '/carnes/n1_4/',            label: 'carnes'     },
  { id: 5,  path: '/limpieza/n1_5/',          label: 'limpieza'   },
  { id: 6,  path: '/perfumeria/n1_6/',        label: 'perfumeria' },
  { id: 7,  path: '/congelados/n1_7/',        label: 'congelados' },
];

// Endpoints candidatos para el catálogo (a probar con la sucursal seteada)
const CATALOG_ENDPOINTS = [
  (sucursal: string, catId: number) =>
    `${BASE_API}/catalogo/productos?sucursal=${sucursal}&categoriaId=${catId}&page=0&limit=50`,
  (sucursal: string, catId: number) =>
    `${BASE_API}/catalogo/categoria/${catId}?sucursal=${sucursal}&page=0&limit=50`,
  (sucursal: string, catId: number) =>
    `${BASE_API}/productos/categoria/${catId}?sucursal=${sucursal}&pagina=0&cantidad=50`,
  (sucursal: string, catId: number) =>
    `${BASE_API}/supermercado/productos?sucursal=${sucursal}&categoriaId=${catId}&page=0&size=50`,
  (sucursal: string, catId: number) =>
    `${BASE_API}/productos?sucursal=${sucursal}&categoria=${catId}&page=0&limit=50`,
  (sucursal: string, _catId: number) =>
    `${BASE_API}/supermercado/oferta?sucursal=${sucursal}&page=0&limit=100`,
  (sucursal: string, _catId: number) =>
    `${BASE_API}/catalogo/oferta?sucursal=${sucursal}&page=0&limit=100`,
  (sucursal: string, _catId: number) =>
    `${BASE_API}/productos/oferta?sucursal=${sucursal}&pagina=0&cantidad=100`,
];

export async function scrapeLaAnonima(): Promise<SuperOffer[]> {
  console.log(`[${CHAIN}] Iniciando scraper (api.laanonima.com.ar)...`);
  const browser = await createBrowser();
  const offers:   SuperOffer[] = [];

  try {
    const page = await createPage(browser);
    let sucursalId = '8300'; // default: Neuquén (el que detecta por IP)

    // Paso 1: Navegar para que la app setee la sucursal y cookies
    console.log(`[${CHAIN}] Estableciendo sesión y sucursal...`);

    // Interceptar para capturar el ID de sucursal real
    page.on('response', async response => {
      const url = response.url();
      if (!url.includes('api.laanonima.com.ar')) return;
      // Capturar el ID de sucursal de la respuesta
      const match = url.match(/sucursal\/(\d+)/);
      if (match) {
        sucursalId = match[1];
        console.log(`[${CHAIN}] Sucursal detectada: ${sucursalId}`);
      }
    });

    await page.goto(`${BASE_WEB}/supermercado`, {
      waitUntil: 'networkidle',
      timeout:   20_000,
    });
    await page.waitForTimeout(3000);

    console.log(`[${CHAIN}] Usando sucursal: ${sucursalId}`);

    // Paso 2: Descubrir endpoint de catálogo probando todos los candidatos
    let workingEndpoint: string | null = null;

    for (const buildUrl of CATALOG_ENDPOINTS) {
      const testUrl = buildUrl(sucursalId, 1); // cat 1 = almacén
      const result  = await page.evaluate(async (url: string) => {
        try {
          const r = await fetch(url, {
            credentials: 'include',
            headers:     { Accept: 'application/json', 'Content-Type': 'application/json' },
          });
          if (!r.ok) return null;
          const text = await r.text();
          if (!text.trim().startsWith('{') && !text.trim().startsWith('[')) return null;
          return JSON.parse(text);
        } catch { return null; }
      }, testUrl);

      if (result) {
        const products = extractProducts(result);
        if (products.length > 0) {
          console.log(`[${CHAIN}] ✅ Endpoint funcional: ${testUrl.replace(BASE_API, '')}`);
          workingEndpoint = testUrl.replace(sucursalId, '{sucursal}')
                                   .replace('/1?', '/{catId}?')
                                   .replace('/1/', '/{catId}/');
          // Mapear los primeros resultados
          for (const p of products) {
            const offer = mapProduct(p);
            if (offer) offers.push(offer);
          }
          break;
        }
      }
    }

    // Paso 3: Si encontramos el endpoint, iterar todas las categorías
    if (workingEndpoint && offers.length > 0) {
      console.log(`[${CHAIN}] Scrapeando todas las categorías...`);

      for (const cat of SUPER_CATS.slice(1)) { // ya hicimos cat 1
        const url = buildEndpointUrl(workingEndpoint, sucursalId, String(cat.id));
        if (!url) continue;

        let page_num = 0;
        while (true) {
          const pageUrl = url.replace('page=0', `page=${page_num}`)
                             .replace('pagina=0', `pagina=${page_num}`);

          const result = await page.evaluate(async (u: string) => {
            try {
              const r = await fetch(u, {
                credentials: 'include',
                headers:     { Accept: 'application/json' },
              });
              if (!r.ok) return null;
              return await r.json();
            } catch { return null; }
          }, pageUrl);

          if (!result) break;
          const products = extractProducts(result);
          if (!products.length) break;

          for (const p of products) {
            const offer = mapProduct(p);
            if (offer) offers.push(offer);
          }

          // Verificar si hay más páginas
          const hasMore = Boolean(
            result.hasMore ??
            result.has_more ??
            (typeof result.total === 'number' ? result.total > (page_num + 1) * 50 : null) ??
            (products.length >= 50),
          );

          if (!hasMore) break;
          page_num++;
          if (page_num > 10) break;
        }

        await new Promise(r => setTimeout(r, 300));
      }
    }

    // Paso 4: Si no encontramos ningún endpoint, DOM fallback
    if (!offers.length) {
      console.log(`[${CHAIN}] No se encontró endpoint de catálogo. Intentando DOM...`);

      await page.goto(`${BASE_WEB}/supermercado/oferta`, {
        waitUntil: 'networkidle',
        timeout:   15_000,
      });
      await page.waitForTimeout(3000);

      for (let i = 0; i < 8; i++) {
        await page.evaluate(() => window.scrollBy(0, 1200));
        await page.waitForTimeout(500);
      }

      const domItems = await page.evaluate(() => {
        const items: any[] = [];
        const selectors = [
          '[class*="ProductCard"]', '[class*="product-card"]',
          '[class*="product_card"]', '[class*="ProductItem"]',
          '[class*="product-item"]', 'article[class*="product"]',
        ];
        for (const sel of selectors) {
          document.querySelectorAll(sel).forEach(el => {
            const name  = el.querySelector('[class*="name"], [class*="Name"], [class*="title"], [class*="Title"]')?.textContent?.trim();
            const price = el.querySelector('[class*="price"], [class*="Price"], [class*="precio"]')?.textContent?.trim();
            const img   = (el.querySelector('img') as HTMLImageElement)?.src;
            if (name && price) items.push({ name, price, img });
          });
          if (items.length > 0) break;
        }
        return items;
      });

      console.log(`[${CHAIN}] DOM: ${domItems.length} elementos`);
      for (const item of domItems) {
        const offer = mapDomProduct(item);
        if (offer) offers.push(offer);
      }
    }

  } catch (err: any) {
    console.error(`[${CHAIN}] Error: ${err.message}`);
  } finally {
    await browser.close();
  }

  console.log(`[${CHAIN}] ${offers.length} ofertas encontradas`);
  return offers;
}

function buildEndpointUrl(template: string, sucursal: string, catId: string): string | null {
  try {
    return template
      .replace('{sucursal}', sucursal)
      .replace('{catId}', catId);
  } catch { return null; }
}

function extractProducts(json: any): any[] {
  if (!json || typeof json !== 'object') return [];
  const candidates = [
    json.productos, json.products, json.items,
    json.data?.productos, json.data?.products, json.data?.items,
    json.content, json.data?.content,
    json.resultado, json.data?.resultado,
    Array.isArray(json) ? json : null,
  ];
  for (const c of candidates) {
    if (Array.isArray(c) && c.length > 0) {
      const keys = JSON.stringify(c[0]).toLowerCase();
      if (keys.includes('precio') || keys.includes('price') ||
          keys.includes('nombre') || keys.includes('name')) {
        return c;
      }
    }
  }
  return [];
}

function mapProduct(p: any): SuperOffer | null {
  const name = String(
    p.nombre ?? p.name ?? p.titulo ?? p.title ?? p.descripcion ?? '',
  ).trim();
  if (!name || name.length < 3) return null;

  const offerPrice    = Number(p.precioOferta ?? p.precio_oferta ?? p.precio ?? p.price ?? p.salePrice ?? 0);
  const originalPrice = Number(p.precioLista  ?? p.precio_lista ?? p.originalPrice ?? p.listPrice ?? 0);
  if (!offerPrice) return null;

  const discount = calcDiscount(originalPrice, offerPrice);
  if (discount < 5 && !p.enOferta && !p.isOffer && !p.oferta) return null;

  return {
    chain:             CHAIN,
    ean:               p.ean ?? p.codigoBarra ?? p.barcode ?? p.gtin ?? null,
    product_name:      name.slice(0, 200),
    brand:             p.marca ?? p.brand ?? undefined,
    category:          detectSuperCategory(`${name} ${p.categoria ?? p.category ?? ''}`),
    image_url:         p.imagen ?? p.imageUrl ?? p.image ?? p.foto ?? undefined,
    original_price:    originalPrice || null,
    offer_price:       offerPrice,
    discount_pct:      discount || undefined,
    offer_type:        'percent',
    offer_description: discount > 0 ? `${discount}% OFF` : 'Precio especial',
    valid_from:        today(),
    valid_until:       endOfWeek(),
  };
}

function mapDomProduct(item: { name: string; price: string; img?: string }): SuperOffer | null {
  const p = parseFloat(
    (item.price ?? '').replace(/\s/g,'').replace(/\$/g,'').replace(/\./g,'').replace(',','.')
  ) || 0;
  if (!p) return null;
  return {
    chain:             CHAIN,
    ean:               null,
    product_name:      item.name.slice(0, 200),
    category:          detectSuperCategory(item.name),
    image_url:         item.img,
    original_price:    null,
    offer_price:       p,
    offer_type:        'percent',
    offer_description: 'Precio online',
    valid_from:        today(),
    valid_until:       endOfWeek(),
  };
}

if (require.main === module) {
  scrapeLaAnonima()
    .then(p => saveSuperOffers(p, CHAIN))
    .catch(console.error);
}