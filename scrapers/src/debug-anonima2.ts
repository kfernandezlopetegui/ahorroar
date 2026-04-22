import * as dotenv from 'dotenv';
dotenv.config();
import * as fs from 'fs';
import { createBrowser, createPage } from './scrapers/base';

const BASE_WEB = 'https://www.laanonima.com.ar';
const BASE_API = 'https://api.laanonima.com.ar';

async function debug() {
  const browser = await createBrowser();
  const allResponses: any[] = [];
  let sucursalId  = '8300';

  try {
    const page = await createPage(browser);

    // Capturar TODAS las respuestas de api.laanonima.com.ar
    page.on('response', async response => {
      const url    = response.url();
      const ct     = response.headers()['content-type'] ?? '';
      const status = response.status();

      if (!url.includes('laanonima.com.ar')) return;
      if (url.includes('static-api') && !url.includes('/api/')) return;
      if (url.includes('.png') || url.includes('.jpg') || url.includes('.svg') ||
          url.includes('.gif') || url.includes('.css') || url.includes('.js')) return;

      // Capturar el sucursal ID
      const match = url.match(/\/sucursal\/(\d+)/);
      if (match) sucursalId = match[1];

      try {
        const body = await response.text();
        const entry = {
          url:     url.replace(BASE_API, '[API]').replace(BASE_WEB, '[WEB]'),
          status,
          ct:      ct.split(';')[0].trim(),
          size:    body.length,
          preview: body.slice(0, 300),
          isJson:  body.trim().startsWith('{') || body.trim().startsWith('['),
        };

        allResponses.push(entry);
        console.log(`\n[${status}] ${entry.url}`);
        console.log(`  Size: ${entry.size} | JSON: ${entry.isJson}`);
        if (entry.size > 100) console.log(`  Preview: ${entry.preview.slice(0, 200)}`);
      } catch { /* ignorar */ }
    });

    // Paso 1: Home del supermercado
    console.log('\n=== Paso 1: Home supermercado ===');
    await page.goto(`${BASE_WEB}/supermercado`, {
      waitUntil: 'domcontentloaded',
      timeout:   20_000,
    });
    await page.waitForTimeout(5000);

    console.log(`Sucursal detectada: ${sucursalId}`);

    // Paso 2: Navegar a categorías y esperar
    const cats = [
      `${BASE_WEB}/almacen/n1_1/`,
      `${BASE_WEB}/bebidas/n1_3/`,
      `${BASE_WEB}/supermercado/oferta`,
      `${BASE_WEB}/ofertas`,
    ];

    for (const url of cats) {
      console.log(`\n=== Navegando a ${url.replace(BASE_WEB, '')} ===`);
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 });
        await page.waitForTimeout(4000);
        for (let i = 0; i < 4; i++) {
          await page.evaluate(() => window.scrollBy(0, 1200));
          await page.waitForTimeout(600);
        }
        await page.waitForTimeout(2000);
      } catch { /* continuar */ }
    }

    // Paso 3: Probar endpoints de la API directamente desde el browser
    console.log('\n=== Paso 3: Probar API endpoints ===');

    const endpoints = [
      // Patrones con sucursal
      `/catalogo/productos?sucursal=${sucursalId}&categoriaId=1&page=0&limit=20`,
      `/catalogo/categoria/1?sucursal=${sucursalId}&page=0&limit=20`,
      `/productos?sucursal=${sucursalId}&categoria=1&page=0&limit=20`,
      `/productos/categoria/1?sucursal=${sucursalId}`,
      `/supermercado/productos?sucursal=${sucursalId}&categoriaId=1`,
      `/catalogo/oferta?sucursal=${sucursalId}&page=0&limit=20`,
      `/productos/oferta?sucursal=${sucursalId}`,
      `/supermercado/oferta?sucursal=${sucursalId}`,
      // Sin categoría
      `/catalogo?sucursal=${sucursalId}&page=0&limit=20`,
      `/productos?sucursal=${sucursalId}&page=0&limit=20`,
      // Con path n1_X (como las URLs del sitio)
      `/catalogo/n1_1?sucursal=${sucursalId}&page=0&limit=20`,
      `/supermercado/n1_1?sucursal=${sucursalId}&page=0&limit=20`,
      // Ofertas específicas
      `/oferta?sucursal=${sucursalId}&page=0&limit=20`,
      `/ofertas?sucursal=${sucursalId}&page=0&limit=20`,
    ];

    const workingEndpoints: any[] = [];

    for (const ep of endpoints) {
      const fullUrl = `${BASE_API}${ep}`;
      const result  = await page.evaluate(async (url: string) => {
        try {
          const r    = await fetch(url, {
            credentials: 'include',
            headers:     { Accept: 'application/json' },
          });
          const text = await r.text();
          return {
            status: r.status,
            ct:     r.headers.get('content-type') ?? '',
            body:   text.slice(0, 500),
            size:   text.length,
          };
        } catch (e: any) { return { error: e.message }; }
      }, fullUrl);

      const hasProducts = result.body?.includes('precio') || result.body?.includes('nombre') ||
                          result.body?.includes('producto') || (result.status === 200 && result.size > 200);

      console.log(`\n${ep.slice(0, 60)}`);
      console.log(`  Status: ${result.status} | Size: ${result.size}`);
      if (hasProducts || result.status === 200) {
        console.log(`  ✅ RESPUESTA! Body: ${result.body?.slice(0, 300)}`);
        workingEndpoints.push({ endpoint: ep, ...result });
      }
    }

    // Guardar reporte
    const report = {
      sucursalId,
      allResponses,
      workingEndpoints,
      timestamp: new Date().toISOString(),
    };
    fs.writeFileSync('debug-anonima2.json', JSON.stringify(report, null, 2));
    console.log(`\n✅ Reporte guardado en debug-anonima2.json`);
    console.log(`Total responses capturadas: ${allResponses.length}`);
    console.log(`Endpoints con datos: ${workingEndpoints.length}`);

  } finally {
    await browser.close();
  }
}

debug().catch(console.error);