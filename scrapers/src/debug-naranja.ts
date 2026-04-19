import * as dotenv from 'dotenv';
dotenv.config();
import * as fs from 'fs';
import { createBrowser, createPage } from './scrapers/base';

async function debug() {
  const browser = await createBrowser();
  try {
    const page = await createPage(browser);
    let rulesAspectsData: any = null;
    let rulesAspectsHeaders: Record<string, string> = {};

    page.on('response', async response => {
      const url = response.url();
      const ct  = response.headers()['content-type'] ?? '';
      if (!url.includes('naranjax.com') && !url.includes('naranja.dev')) return;
      if (!ct.includes('json')) return;

      try {
        const json = await response.json();
        const preview = JSON.stringify(json).slice(0, 300);
        console.log(`\n[JSON] ${url}\n  → ${preview}`);

        // Guardar rules/aspects completo
        if (url.includes('rules/aspects')) {
          rulesAspectsData = json;
          rulesAspectsHeaders = response.headers();
          fs.writeFileSync('debug-rules-aspects.json', JSON.stringify(json, null, 2));
          console.log('\n✅ rules/aspects guardado en debug-rules-aspects.json');
        }
      } catch { /* ignorar */ }
    });

    await page.goto('https://fintech-benefits-shell.naranjax.com/promociones/SUPERMERCADOS', {
      waitUntil: 'domcontentloaded', timeout: 45_000,
    });
    await page.waitForTimeout(6000);

    // Mostrar los headers que usó el browser para esa request
    if (rulesAspectsHeaders) {
      console.log('\nHeaders de respuesta de rules/aspects:');
      console.log(JSON.stringify(rulesAspectsHeaders, null, 2));
    }

    // Intentar reproducir la request con los mismos headers del browser
    const cookies = await page.context().cookies();
    const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    console.log('\nCookies del browser:', cookieStr.slice(0, 200));

    // Intentar la request manualmente desde el browser context
    const result = await page.evaluate(async () => {
      try {
        const r = await fetch('https://bkn-promotions.naranjax.com/bff-promotions-web/api/rules/aspects', {
          credentials: 'include',
        });
        return { status: r.status, data: await r.json() };
      } catch (e: any) {
        return { error: e.message };
      }
    });
    console.log('\nFetch desde browser:', JSON.stringify(result).slice(0, 500));

    console.log('\nURL final:', page.url());
  } finally {
    await browser.close();
  }
}

debug().catch(console.error);