import * as dotenv from 'dotenv';
dotenv.config();
import { createBrowser, createPage } from './scrapers/base';

async function debug() {
  const browser = await createBrowser();
  try {
    const page = await createPage(browser);

    page.on('response', async response => {
      const url = response.url();
      const ct  = response.headers()['content-type'] ?? '';
      if (!ct.includes('json')) return;
      try {
        const json = await response.json();
        const preview = JSON.stringify(json).slice(0, 400);
        console.log(`\n[JSON] ${url}\n  → ${preview}`);
      } catch { /* ignorar */ }
    });

    // URL correcta del portal de beneficios BBVA
    console.log('Navegando a BBVA beneficios...');
    await page.goto('https://www.bbva.com.ar/beneficios/', {
      waitUntil: 'domcontentloaded', timeout: 45_000,
    });
    await page.waitForTimeout(10000);

    // Scroll para triggear lazy load
    for (let i = 0; i < 8; i++) {
      await page.evaluate((s: number) => window.scrollBy(0, s), 500);
      await page.waitForTimeout(800);
    }
    await page.waitForTimeout(3000);

    console.log('\nURL final:', page.url());
  } finally {
    await browser.close();
  }
}

debug().catch(console.error);