import * as dotenv from 'dotenv';
dotenv.config();
import * as fs from 'fs';
import { createBrowser, createPage } from './scrapers/base';

const BASE = 'https://www.cotodigital.com.ar';

async function debug() {
  const browser = await createBrowser();
  const allResponses: any[] = [];

  try {
    const page = await createPage(browser);

    // Capturar TODAS las respuestas (sin filtro)
    page.on('response', async response => {
      const url    = response.url();
      const ct     = response.headers()['content-type'] ?? '';
      const status = response.status();

      if (!url.includes('cotodigital') && !url.includes('coto.com')) return;
      if (url.includes('.png') || url.includes('.jpg') || url.includes('.svg') ||
          url.includes('.gif') || url.includes('.ico') || url.includes('.woff') ||
          url.includes('.css')) return;

      try {
        const body = await response.text();
        const entry = {
          url:     url.replace(BASE, ''),
          status,
          ct:      ct.split(';')[0].trim(),
          size:    body.length,
          preview: body.slice(0, 500),
          isJson:  body.trim().startsWith('{') || body.trim().startsWith('['),
        };

        // Solo guardar respuestas interesantes (JSON o con contenido relevante)
        if (entry.isJson || body.includes('precio') || body.includes('displayName')) {
          allResponses.push(entry);
          console.log(`\n[${status}] ${entry.url}`);
          console.log(`  CT: ${entry.ct} | Size: ${entry.size}`);
          console.log(`  Preview: ${entry.preview.slice(0, 200)}`);
        }
      } catch { /* ignorar */ }
    });

    // Paso 1: Navegar a la home para establecer sesión
    console.log('\n=== Paso 1: Sesión ===');
    await page.goto(`${BASE}/sitios/cdigi/browse`, {
      waitUntil: 'domcontentloaded',
      timeout:   25_000,
    });
    await page.waitForTimeout(4000);

    // Paso 2: Obtener navState de "Todas las Ofertas" desde getCategorias
    console.log('\n=== Paso 2: getCategorias ===');
    const categorias = await page.evaluate(async (base: string) => {
      const r = await fetch(`${base}/rest/model/atg/actors/cBackOfficeActor/getCategorias`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: '{}',
      });
      return r.json();
    }, BASE);

    // Encontrar "Todas las Ofertas"
    const todasLasOfertas = categorias?.output?.find(
      (o: any) => o.topLevelCategory?.displayName?.toLowerCase().includes('todas las ofertas')
    )?.topLevelCategory;

    console.log('Todas las Ofertas navState:', todasLasOfertas?.navigationState);
    console.log('Todas las Ofertas categoryId:', todasLasOfertas?.categoryId);

    const navState = todasLasOfertas?.navigationState?.replace('N-', '') ?? 'c7ha3p';
    const catId    = todasLasOfertas?.categoryId ?? '';

    // Paso 3: Navegar a la página de "Todas las Ofertas" y esperar AJAX
    console.log('\n=== Paso 3: Navegar a Todas las Ofertas ===');
    await page.goto(
      `${BASE}/sitios/cdigi/categoria/ofertas-todas-las-ofertas/_/N-${navState}`,
      { waitUntil: 'domcontentloaded', timeout: 20_000 },
    );

    // Esperar más tiempo para que los AJAX de productos se disparen
    console.log('Esperando AJAX de productos...');
    await page.waitForTimeout(6000);

    // Scroll para triggerear lazy load
    for (let i = 0; i < 6; i++) {
      await page.evaluate(() => window.scrollBy(0, 1500));
      await page.waitForTimeout(700);
    }
    await page.waitForTimeout(3000);

    // Paso 4: Probar el endpoint browse con diferentes headers desde el browser
    console.log('\n=== Paso 4: Probar endpoints desde browser ===');

    const testEndpoints = [
      // Con X-Requested-With (típico de AJAX)
      { url: `/sitios/cdigi/browse?N=${navState}&Nrpp=24&No=0`, xrw: true  },
      { url: `/sitios/cdigi/browse?N=${navState}&Nrpp=24&No=0`, xrw: false },
      // Con categoryId
      { url: `/sitios/cdigi/browse?categoryId=${catId}&Nrpp=24&No=0`, xrw: true },
      // Endpoint de resultado de búsqueda ATG
      { url: `/sitios/cdigi/search?Ntk=product.sDisp_200&Ntt=&N=${navState}&Nrpp=24&No=0`, xrw: true },
      // REST actor de browse
      { url: `/rest/model/atg/actors/cBrowseActor/getProductosByNavState`, post: { navState, Nrpp: 24, No: 0 } },
      { url: `/rest/model/atg/actors/cBrowseActor/getProductsByCategory`, post: { categoryId: catId, Nrpp: 24, No: 0 } },
      { url: `/rest/model/atg/actors/cCatalogoActor/getProductosByNavState`, post: { navState, Nrpp: 24, No: 0 } },
      { url: `/rest/model/atg/actors/cCatalogoActor/browse`, post: { N: navState, Nrpp: 24, No: 0 } },
    ];

    const workingEndpoints: any[] = [];

    for (const test of testEndpoints) {
      const result = await page.evaluate(async ({ base, url, xrw, post }: any) => {
        try {
          const headers: Record<string, string> = { Accept: 'application/json, text/plain, */*' };
          if (xrw) headers['X-Requested-With'] = 'XMLHttpRequest';

          const opts: RequestInit = { credentials: 'include', headers };
          if (post) {
            opts.method = 'POST';
            opts.body   = JSON.stringify(post);
            headers['Content-Type'] = 'application/json';
          }

          const r    = await fetch(`${base}${url}`, opts);
          const text = await r.text();
          return {
            status: r.status,
            ct:     r.headers.get('content-type') ?? '',
            body:   text.slice(0, 800),
            size:   text.length,
            isJson: text.trim().startsWith('{') || text.trim().startsWith('['),
          };
        } catch (e: any) { return { error: e.message }; }
      }, { base: BASE, ...test });

      const hasProducts = result.body?.includes('precio') || result.body?.includes('displayName') ||
                          result.body?.includes('activePrice') || (result.isJson && result.size > 500);

      console.log(`\n${test.url.slice(0, 60)}`);
      console.log(`  Status: ${result.status} | Size: ${result.size} | Products: ${hasProducts}`);
      if (hasProducts) {
        console.log(`  ✅ TIENE PRODUCTOS! Preview: ${result.body?.slice(0, 300)}`);
        workingEndpoints.push({ ...test, result });
      }
    }

    // Guardar todo para análisis
    const report = {
      navState,
      catId,
      allResponses,
      workingEndpoints,
      timestamp: new Date().toISOString(),
    };
    fs.writeFileSync('debug-coto2.json', JSON.stringify(report, null, 2));
    console.log(`\n✅ Reporte guardado en debug-coto2.json`);
    console.log(`Total responses capturadas: ${allResponses.length}`);
    console.log(`Endpoints con productos: ${workingEndpoints.length}`);

  } finally {
    await browser.close();
  }
}

debug().catch(console.error);