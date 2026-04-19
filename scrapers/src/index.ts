import * as dotenv from 'dotenv';
dotenv.config();

import * as cron from 'node-cron';
import { scrapeGalicia } from './scrapers/galicia';
import { scrapeNaranjaX } from './scrapers/naranja';
import { scrapeBBVA } from './scrapers/bbva';
import { savePromos, ScrapedPromo } from './scrapers/base';

interface ScraperResult {
  bank: string;
  ok: boolean;
  count: number;
  error?: string;
  durationMs: number;
}

const scrapers: { name: string; fn: () => Promise<ScrapedPromo[]> }[] = [
  { name: 'Galicia',   fn: scrapeGalicia  },
  { name: 'Naranja X', fn: scrapeNaranjaX },
  { name: 'BBVA',      fn: scrapeBBVA     },
];

// Estado en memoria para el health check
const lastRun: Record<string, ScraperResult> = {};

async function runScraper(bank: string, fn: () => Promise<ScrapedPromo[]>): Promise<ScraperResult> {
  const start = Date.now();
  try {
    const promos = await fn();
    if (promos.length > 0) {
      await savePromos(promos, bank);
    }
    const result: ScraperResult = { bank, ok: true, count: promos.length, durationMs: Date.now() - start };
    lastRun[bank] = result;
    return result;
  } catch (err: any) {
    const result: ScraperResult = { bank, ok: false, count: 0, error: err.message, durationMs: Date.now() - start };
    lastRun[bank] = result;
    console.error(`[${bank}] ❌ Error: ${err.message}`);
    return result;
  }
}

async function runAll() {
  console.log(`\n🚀 [${new Date().toISOString()}] Iniciando ciclo de scrapers\n`);

  const results = await Promise.allSettled(
    scrapers.map(s => runScraper(s.name, s.fn))
  );

  console.log('\n📊 Resumen:');
  for (const r of results) {
    if (r.status === 'fulfilled') {
      const { bank, ok, count, durationMs, error } = r.value;
      if (ok) {
        console.log(`  ✅ ${bank}: ${count} promos (${durationMs}ms)`);
      } else {
        console.log(`  ❌ ${bank}: ${error} (${durationMs}ms)`);
      }
    }
  }
  console.log('');
}

// ── Health check HTTP server (Railway / Better Stack) ────────────────────────
import * as http from 'http';

const PORT = parseInt(process.env.PORT ?? '3001');

http.createServer((req, res) => {
  if (req.url === '/health') {
    const allOk = Object.values(lastRun).every(r => r.ok);
    const status = allOk ? 200 : 503;
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: allOk ? 'ok' : 'degraded',
      scrapers: lastRun,
      timestamp: new Date().toISOString(),
    }));
    return;
  }

  if (req.url === '/run' && req.method === 'POST') {
    runAll().catch(console.error);
    res.writeHead(202, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Scraping iniciado' }));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
}).listen(PORT, () => {
  console.log(`🌐 Health check en http://localhost:${PORT}/health`);
});

// ── Cron: todos los días a las 7am hora Argentina ───────────────────────────
cron.schedule('0 7 * * *', () => {
  runAll().catch(console.error);
}, { timezone: 'America/Argentina/Buenos_Aires' });

// ── Correr inmediatamente al iniciar (excepto en test) ────────────────────────
if (process.env.RUN_ON_START !== 'false') {
  runAll().catch(console.error);
}

console.log('⏰ Scraper service iniciado — cron a las 7:00 AM (Argentina)');