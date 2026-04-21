import * as dotenv from 'dotenv';
dotenv.config();

import * as cron from 'node-cron';
import * as http from 'http';

import { scrapeGalicia }   from './scrapers/galicia';
import { scrapeNaranjaX }  from './scrapers/naranja';
import { scrapeBBVA }      from './scrapers/bbva';
import { savePromos, ScrapedPromo } from './scrapers/base';
import { runAllSuperScrapers, SuperScraperResult } from './supermarkets-index';

// ── Tipos ────────────────────────────────────────────────────────────────────

interface BankScraperResult {
  bank:       string;
  ok:         boolean;
  count:      number;
  error?:     string;
  durationMs: number;
}

// ── Estado en memoria para el health check ───────────────────────────────────

const lastRunBanks: Record<string, BankScraperResult>   = {};
const lastRunSuper: Record<string, SuperScraperResult>  = {};

// ── Scrapers de bancos ────────────────────────────────────────────────────────

const BANK_SCRAPERS: { name: string; fn: () => Promise<ScrapedPromo[]> }[] = [
  { name: 'Galicia',   fn: scrapeGalicia  },
  { name: 'Naranja X', fn: scrapeNaranjaX },
  { name: 'BBVA',      fn: scrapeBBVA     },
];

async function runBankScraper(
  bank: string,
  fn: () => Promise<ScrapedPromo[]>,
): Promise<BankScraperResult> {
  const start = Date.now();
  try {
    const promos = await fn();
    if (promos.length > 0) await savePromos(promos, bank);
    const result: BankScraperResult = {
      bank, ok: true, count: promos.length, durationMs: Date.now() - start,
    };
    lastRunBanks[bank] = result;
    return result;
  } catch (err: any) {
    const result: BankScraperResult = {
      bank, ok: false, count: 0, error: err.message, durationMs: Date.now() - start,
    };
    lastRunBanks[bank] = result;
    console.error(`[${bank}] ❌ Error: ${err.message}`);
    return result;
  }
}

async function runAllBankScrapers(): Promise<void> {
  console.log(`\n🏦 [${new Date().toISOString()}] Iniciando scrapers de bancos\n`);

  const results = await Promise.allSettled(
    BANK_SCRAPERS.map(s => runBankScraper(s.name, s.fn)),
  );

  console.log('\n📊 Resumen bancos:');
  for (const r of results) {
    if (r.status === 'fulfilled') {
      const { bank, ok, count, durationMs, error } = r.value;
      console.log(
        ok
          ? `  ✅ ${bank.padEnd(12)} ${count} promos (${durationMs}ms)`
          : `  ❌ ${bank.padEnd(12)} ${error} (${durationMs}ms)`,
      );
    }
  }
  console.log('');
}

// ── Health check HTTP ─────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? '3001');

http.createServer((req, res) => {
  // GET /health — estado general
  if (req.url === '/health') {
    const banksOk = Object.values(lastRunBanks).every(r => r.ok);
    const supersOk = Object.values(lastRunSuper).every(r => r.ok);
    const allOk = banksOk && supersOk;

    res.writeHead(allOk ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status:      allOk ? 'ok' : 'degraded',
      banks:       lastRunBanks,
      supermarkets: lastRunSuper,
      timestamp:   new Date().toISOString(),
    }));
    return;
  }

  // POST /run/banks — forzar scraping de bancos manualmente
  if (req.url === '/run/banks' && req.method === 'POST') {
    runAllBankScrapers().catch(console.error);
    res.writeHead(202, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Scraping de bancos iniciado' }));
    return;
  }

  // POST /run/supers — forzar scraping de supermercados manualmente
  if (req.url === '/run/supers' && req.method === 'POST') {
    runAllSuperScrapers()
      .then(results => results.forEach(r => { lastRunSuper[r.chain] = r; }))
      .catch(console.error);
    res.writeHead(202, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Scraping de supermercados iniciado' }));
    return;
  }

  // POST /run — forzar todo (backwards compat)
  if (req.url === '/run' && req.method === 'POST') {
    runAllBankScrapers().catch(console.error);
    runAllSuperScrapers()
      .then(results => results.forEach(r => { lastRunSuper[r.chain] = r; }))
      .catch(console.error);
    res.writeHead(202, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Scraping completo iniciado' }));
    return;
  }

  res.writeHead(404);
  res.end('Not found');

}).listen(PORT, () => {
  console.log(`🌐 Health check en http://localhost:${PORT}/health`);
});

// ── Crons ─────────────────────────────────────────────────────────────────────

// Bancos: todos los días a las 7am
cron.schedule('0 7 * * *', () => {
  runAllBankScrapers().catch(console.error);
}, { timezone: 'America/Argentina/Buenos_Aires' });

// Supermercados: martes y viernes a las 6am (ofertas cambian a mitad de semana)
cron.schedule('0 6 * * 2,5', () => {
  runAllSuperScrapers()
    .then(results => results.forEach(r => { lastRunSuper[r.chain] = r; }))
    .catch(console.error);
}, { timezone: 'America/Argentina/Buenos_Aires' });

// ── Arranque inicial ──────────────────────────────────────────────────────────

if (process.env.RUN_ON_START !== 'false') {
  runAllBankScrapers().catch(console.error);
}

if (process.env.RUN_SUPERS_ON_START === 'true') {
  runAllSuperScrapers()
    .then(results => results.forEach(r => { lastRunSuper[r.chain] = r; }))
    .catch(console.error);
}

console.log('⏰ Scraper service iniciado');
console.log('   Bancos:        cron 7:00 AM diario');
console.log('   Supermercados: cron 6:00 AM martes y viernes');