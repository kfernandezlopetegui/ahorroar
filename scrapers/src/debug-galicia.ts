import * as dotenv from 'dotenv';
dotenv.config();
import * as fs from 'fs';
import { createBrowser, createPage } from './scrapers/base';

const URL = 'https://www.bancogalicia.com/banca/online/web/Personas/BeneficiosyPromociones/buscador-beneficios';

async function debug() {
  const browser = await createBrowser();
  try {
    const page = await createPage(browser);

    // Logear TODAS las requests (no solo JSON)
    page.on('request', req => {
      console.log(`[REQ] ${req.method()} ${req.url()}`);
    });

    page.on('response', async response => {
      const url  = response.url();
      const ct   = response.headers()['content-type'] ?? '';
      const status = response.status();
      console.log(`[RES] ${status} ${ct.split(';')[0].padEnd(25)} ${url}`);
    });

    console.log(`\nNavegando a ${URL}...\n`);
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForTimeout(8000);

    // Guardar HTML de la página
    const html = await page.content();
    fs.writeFileSync('debug-galicia.html', html);
    console.log(`\n✅ HTML guardado en debug-galicia.html (${Math.round(html.length / 1024)}KB)`);

    // Mostrar URL final (por si hubo redirect)
    console.log(`\nURL final: ${page.url()}`);

    // Contar elementos encontrados
    const counts = await page.evaluate(() => {
      const selectors = [
        '[class*="benefit"]', '[class*="Benefit"]',
        '[class*="promo"]',   '[class*="Promo"]',
        '[class*="card"]',    '[class*="Card"]',
        'article', '.item',   'li',
        'h2', 'h3',
      ];
      return selectors.map(sel => ({
        selector: sel,
        count: document.querySelectorAll(sel).length,
      }));
    });

    console.log('\nElementos en DOM:');
    counts.forEach(({ selector, count }) => {
      if (count > 0) console.log(`  ${String(count).padStart(4)}  ${selector}`);
    });

    // Texto visible en la página
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 2000));
    console.log('\nTexto visible (primeros 2000 chars):\n' + bodyText);

  } finally {
    await browser.close();
  }
}

debug().catch(console.error);