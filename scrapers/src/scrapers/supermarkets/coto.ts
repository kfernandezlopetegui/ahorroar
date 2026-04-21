/**
 * Coto Digital — Oracle ATG Commerce
 * getCategorias funciona y devuelve el árbol de categorías.
 * Estructura: output[].topLevelCategory.{ categoryId, displayName, subCategories[] }
 * Usamos los categoryId para llamar al endpoint de productos.
 */
import {
  SuperOffer, saveSuperOffers, createBrowser, createPage,
  detectSuperCategory, calcDiscount, today, endOfWeek,
} from './base-super';

const CHAIN = 'Coto';
const BASE  = 'https://www.cotodigital.com.ar';

export async function scrapeCoto(): Promise<SuperOffer[]> {
  console.log(`[${CHAIN}] Iniciando scraper (ATG REST - getCategorias + productos)...`);
  const browser = await createBrowser();
  const offers:   SuperOffer[] = [];

  try {
    const page = await createPage(browser);

    // Paso 1: Establecer sesión ATG
    console.log(`[${CHAIN}] Estableciendo sesión...`);
    await page.goto(`${BASE}/sitios/cdigi/browse`, {
      waitUntil: 'networkidle',
      timeout:   25_000,
    });
    await page.waitForTimeout(3000);

    // Paso 2: Obtener árbol de categorías
    const categoriasRaw = await page.evaluate(async (base: string) => {
      try {
        const r = await fetch(`${base}/rest/model/atg/actors/cBackOfficeActor/getCategorias`, {
          method:      'POST',
          credentials: 'include',
          headers:     { 'Content-Type': 'application/json', Accept: 'application/json' },
          body:        JSON.stringify({}),
        });
        if (!r.ok) return null;
        return await r.json();
      } catch { return null; }
    }, BASE);

    // Extraer IDs del árbol de categorías
    const catIds = parseCategoryIds(categoriasRaw);
    console.log(`[${CHAIN}] Categorías encontradas: ${catIds.length} →`, catIds.map(c => c.label).join(', '));

    if (!catIds.length) {
      // Fallback con IDs hardcodeados si getCategorias no devuelve IDs útiles
      catIds.push(
        { id: 'ofertas',   navState: 'N-c7ha3p', label: 'Ofertas'    },
        { id: 'almacen',   navState: '',         label: 'Almacén'    },
        { id: 'lacteos',   navState: '',         label: 'Lácteos'    },
        { id: 'bebidas',   navState: '',         label: 'Bebidas'    },
        { id: 'limpieza',  navState: '',         label: 'Limpieza'   },
        { id: 'perfumeria',navState: '',         label: 'Perfumería' },
      );
    }

    // Paso 3: Probar endpoints de productos con los categoryIds reales
    const productEndpoints = [
      // Actor de catálogo — variantes de nombre comunes en ATG en español
      (catId: string) => ({ 
        url: `${BASE}/rest/model/atg/actors/cCatalogoActor/getProductosByCategoria`,
        body: { categoryId: catId, Nrpp: 50, No: 0 },
      }),
      (catId: string) => ({
        url: `${BASE}/rest/model/atg/actors/cCatalogoActor/getProductos`,
        body: { categoryId: catId, pageSize: 50, page: 0 },
      }),
      (catId: string) => ({
        url: `${BASE}/rest/model/atg/actors/cBrowseActor/getProductos`,
        body: { categoryId: catId, Nrpp: 50, No: 0 },
      }),
      (catId: string) => ({
        url: `${BASE}/rest/model/atg/actors/cBrowseActor/browse`,
        body: { categoryId: catId, Nrpp: 50, No: 0, Dy: 1 },
      }),
      // Browse endpoint clásico ATG con categoryId como parámetro GET
      (catId: string) => ({
        url: `${BASE}/sitios/cdigi/browse/${catId}?Nrpp=50&No=0&format=json`,
        body: null,
      }),
      // Browse con navState
      (catId: string) => ({
        url: `${BASE}/sitios/cdigi/browse?N=${catId}&Nrpp=50&No=0`,
        body: null,
      }),
    ];

    // Encontrar el endpoint que funciona
    let workingEndpointIdx = -1;

    for (let i = 0; i < productEndpoints.length; i++) {
      const firstCat = catIds[0];
      const { url, body } = productEndpoints[i](firstCat.id || firstCat.navState);

      const result = await page.evaluate(async ({ url, body }: { url: string; body: any }) => {
        try {
          const opts: RequestInit = {
            credentials: 'include',
            headers:     { Accept: 'application/json', 'Content-Type': 'application/json' },
          };
          if (body) {
            opts.method = 'POST';
            opts.body   = JSON.stringify(body);
          }
          const r = await fetch(url, opts);
          if (!r.ok) return null;
          const text = await r.text();
          if (!text.trim().startsWith('{') && !text.trim().startsWith('[')) return null;
          return JSON.parse(text);
        } catch { return null; }
      }, { url, body });

      if (result) {
        const products = extractAtgProducts(result);
        if (products.length > 1) { // más de 1 = lista real de productos
          console.log(`[${CHAIN}] ✅ Endpoint #${i} funciona: ${url.replace(BASE, '')} → ${products.length} productos`);
          workingEndpointIdx = i;
          for (const p of products) {
            const offer = mapAtgProduct(p);
            if (offer) offers.push(offer);
          }
          break;
        }
      }
    }

    // Paso 4: Si encontramos el endpoint, iterar todas las categorías con paginación
    if (workingEndpointIdx >= 0) {
      for (const cat of catIds.slice(1)) {
        let pageNo = 0;
        while (true) {
          const { url, body } = productEndpoints[workingEndpointIdx](cat.id || cat.navState);
          const paginatedBody = body
            ? { ...body, No: pageNo * 50, page: pageNo }
            : null;
          const paginatedUrl  = body
            ? url
            : url.replace('No=0', `No=${pageNo * 50}`).replace('page=0', `page=${pageNo}`);

          const result = await page.evaluate(async ({ url, body }: { url: string; body: any }) => {
            try {
              const opts: RequestInit = {
                credentials: 'include',
                headers:     { Accept: 'application/json', 'Content-Type': 'application/json' },
              };
              if (body) { opts.method = 'POST'; opts.body = JSON.stringify(body); }
              const r = await fetch(url, opts);
              if (!r.ok) return null;
              return await r.json();
            } catch { return null; }
          }, { url: paginatedUrl, body: paginatedBody });

          if (!result) break;
          const products = extractAtgProducts(result);
          if (!products.length) break;

          for (const p of products) {
            const offer = mapAtgProduct(p);
            if (offer) offers.push(offer);
          }

          const total = result.resultSet?.total ?? result.total ?? 0;
          if (total && (pageNo + 1) * 50 >= total) break;
          if (products.length < 50) break;
          pageNo++;
          if (pageNo > 20) break;
          await new Promise(r => setTimeout(r, 300));
        }
        await new Promise(r => setTimeout(r, 400));
      }

    } else {
      // Paso 5: Ningún endpoint funcionó — DOM fallback
      console.log(`[${CHAIN}] Ningún endpoint de productos encontrado. Intentando DOM...`);
      await page.goto(
        `${BASE}/sitios/cdigi/categoria/ofertas-todas-las-ofertas/_/N-c7ha3p`,
        { waitUntil: 'networkidle', timeout: 20_000 },
      );
      await page.waitForTimeout(3000);

      for (let i = 0; i < 12; i++) {
        await page.evaluate(() => window.scrollBy(0, 1500));
        await page.waitForTimeout(400);
      }
      await page.waitForTimeout(2000);

      // Intentar llamar al endpoint de productos usando el navState de "Ofertas"
      const ofertasNavState = catIds.find(c => c.label.toLowerCase().includes('oferta'))?.navState ?? 'c7ha3p';
      const browseResult = await page.evaluate(async ({ base, navState }: { base: string; navState: string }) => {
        try {
          const urls = [
            `${base}/sitios/cdigi/browse?N=${navState}&Nrpp=50&No=0`,
            `${base}/sitios/cdigi/categoria/ofertas-todas-las-ofertas/_/N-${navState}?Nrpp=50&No=0`,
          ];
          for (const url of urls) {
            const r = await fetch(url, {
              credentials: 'include',
              headers:     { Accept: 'application/json, text/plain, */*' },
            });
            if (!r.ok) continue;
            const text = await r.text();
            try { return JSON.parse(text); } catch { /* no JSON */ }
          }
          return null;
        } catch { return null; }
      }, { base: BASE, navState: ofertasNavState });

      if (browseResult) {
        const products = extractAtgProducts(browseResult);
        console.log(`[${CHAIN}] Browse con navState: ${products.length} productos`);
        for (const p of products) {
          const offer = mapAtgProduct(p);
          if (offer) offers.push(offer);
        }
      }

      // DOM como último recurso
      if (!offers.length) {
        const domItems = await page.evaluate(() => {
          const items: any[] = [];
          document.querySelectorAll(
            '.product_grid_each, [class*="productCard"], [id*="product_"], ' +
            '[data-product-id], [class*="product-item"]',
          ).forEach(el => {
            const name  = el.querySelector('[class*="descrip"], [class*="display_name"], h3, h2')?.textContent?.trim();
            const price = el.querySelector('[class*="newPrice"], [class*="sale"], [class*="oferta"]')?.textContent?.trim();
            const orig  = el.querySelector('[class*="oldPrice"], [class*="lista"], [class*="regular"]')?.textContent?.trim();
            const ean   = el.getAttribute('data-ean') ?? el.getAttribute('data-product-id');
            if (name && price) items.push({ name, price, orig, ean });
          });
          return items;
        });

        console.log(`[${CHAIN}] DOM final: ${domItems.length} elementos`);
        for (const item of domItems) {
          const offer = mapDomProduct(item);
          if (offer) offers.push(offer);
        }
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

/** Parsea el árbol de categorías de getCategorias */
function parseCategoryIds(raw: any): { id: string; navState: string; label: string }[] {
  if (!raw?.output) return [];
  const result: { id: string; navState: string; label: string }[] = [];

  for (const top of raw.output) {
    const cat = top.topLevelCategory ?? top;
    if (!cat) continue;

    const label      = cat.displayName ?? cat.nombre ?? '';
    const categoryId = cat.categoryId  ?? cat.id     ?? '';
    const navState   = cat.navigationState ?? '';

    if (categoryId || navState) {
      result.push({ id: categoryId, navState, label });
    }

    // Subcategorías
    for (const sub of cat.subCategories ?? cat.subcategorias ?? []) {
      const subId  = sub.categoryId ?? sub.id ?? '';
      const subNav = sub.navigationState ?? '';
      const subLbl = sub.displayName ?? sub.nombre ?? '';
      if (subId || subNav) {
        result.push({ id: subId, navState: subNav, label: subLbl });
      }
    }
  }

  return result;
}

/** Extrae array de productos de cualquier estructura ATG */
function extractAtgProducts(json: any): any[] {
  if (!json || typeof json !== 'object') return [];
  const candidates = [
    json.resultSet?.records,
    json.records,
    json.output?.records,
    json.output?.productos,
    json.output,
    json.productos,
    json.products,
    json.items,
    json.data?.records,
    json.data?.productos,
    Array.isArray(json) ? json : null,
  ];
  for (const c of candidates) {
    if (Array.isArray(c) && c.length > 0) {
      const first = JSON.stringify(c[0]).toLowerCase();
      if (first.includes('price') || first.includes('precio') ||
          first.includes('name')  || first.includes('nombre') ||
          first.includes('displayname')) {
        return c;
      }
    }
  }
  return [];
}

function mapAtgProduct(r: any): SuperOffer | null {
  const a = r.attributes ?? r.allMeta ?? {};

  const name = String(
    a['product.displayName']?.[0] ?? a['displayName']?.[0] ??
    r.displayName ?? r.nombre ?? r.name ?? r.title ?? '',
  ).trim();
  if (!name || name.length < 3) return null;

  const getNum = (keys: string[]) => {
    for (const k of keys) {
      const v = a[k]?.[0] ?? r[k];
      if (v != null) {
        const n = parseFloat(String(v).replace(/[^\d.,]/g, '').replace(',', '.'));
        if (n > 0) return n;
      }
    }
    return 0;
  };

  const offerPrice    = getNum(['sku.activePrice','activePrice','price','precio','salePrice','precioVigente']);
  const originalPrice = getNum(['sku.listPrice','listPrice','originalPrice','precioLista','precioOriginal']);
  if (!offerPrice) return null;

  const discount = calcDiscount(originalPrice, offerPrice);
  if (discount < 5 && !originalPrice) return null;

  return {
    chain:             CHAIN,
    ean:               String(a['product.ean']?.[0] ?? a['ean']?.[0] ?? r.ean ?? r.codigoBarra ?? '') || null,
    product_name:      name.slice(0, 200),
    category:          detectSuperCategory(name),
    image_url:         a['product.largeImage']?.[0] ?? r.image ?? r.imageUrl ?? r.imagen ?? undefined,
    original_price:    originalPrice || null,
    offer_price:       offerPrice,
    discount_pct:      discount || undefined,
    offer_type:        'percent',
    offer_description: discount > 0 ? `${discount}% OFF` : 'Precio especial',
    valid_from:        today(),
    valid_until:       endOfWeek(),
  };
}

function mapDomProduct(item: { name: string; price: string; orig?: string; ean?: string | null }): SuperOffer | null {
  const parseP = (s: string) =>
    parseFloat((s ?? '').replace(/\s/g,'').replace(/\$/g,'').replace(/\./g,'').replace(',','.')) || 0;
  const offerPrice    = parseP(item.price);
  const originalPrice = parseP(item.orig ?? '');
  if (!offerPrice) return null;
  const discount = calcDiscount(originalPrice, offerPrice);
  if (discount < 5 && !item.orig) return null;
  return {
    chain:             CHAIN,
    ean:               item.ean || null,
    product_name:      item.name.slice(0, 200),
    category:          detectSuperCategory(item.name),
    original_price:    originalPrice || null,
    offer_price:       offerPrice,
    discount_pct:      discount || undefined,
    offer_type:        'percent',
    offer_description: discount > 0 ? `${discount}% OFF` : 'Precio especial',
    valid_from:        today(),
    valid_until:       endOfWeek(),
  };
}

if (require.main === module) {
  scrapeCoto()
    .then(p => saveSuperOffers(p, CHAIN))
    .catch(console.error);
}