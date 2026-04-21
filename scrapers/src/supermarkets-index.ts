/**
 * Orquestador de scrapers de supermercados
 * Corre en paralelo por grupos para no saturar las APIs
 */
import * as dotenv from 'dotenv';
dotenv.config();

import { scrapeCarrefour }  from './scrapers/supermarkets/carrefour';
import { scrapeCoto }       from './scrapers/supermarkets/coto';
import { scrapeDIA }        from './scrapers/supermarkets/dia';
import { scrapeJumbo, scrapeDisco, scrapeVea } from './scrapers/supermarkets/jumbo';
import { scrapeLaAnonima }  from './scrapers/supermarkets/la-anonima';
import { scrapeChangomas }  from './scrapers/supermarkets/changomas';
import { saveSuperOffers, SuperOffer } from './scrapers/supermarkets/base-super';
import { supabase }         from './supabase';


interface ScraperDef {
  name:    string;
  fn:      () => Promise<SuperOffer[]>;
  chain:   string;
  group:   number; // scrapers del mismo grupo corren en paralelo
}

const SCRAPERS: ScraperDef[] = [
  // Grupo 1: Vtex stores (APIs similares, distribuimos carga)
  { name: 'Carrefour',  fn: scrapeCarrefour,  chain: 'Carrefour',  group: 1 },
  { name: 'DIA',        fn: scrapeDIA,        chain: 'DIA',        group: 1 },
  { name: 'Changomás',  fn: scrapeChangomas,  chain: 'Changomás',  group: 1 },
  // Grupo 2: Cencosud (mismo servidor, no los saturamos)
  { name: 'Jumbo',      fn: scrapeJumbo,      chain: 'Jumbo',      group: 2 },
  { name: 'Disco',      fn: scrapeDisco,      chain: 'Disco',      group: 2 },
  { name: 'Vea',        fn: scrapeVea,        chain: 'Vea',        group: 2 },
  // Grupo 3: Scrapers HTML (más lentos)
  { name: 'Coto',       fn: scrapeCoto,       chain: 'Coto',       group: 3 },
  { name: 'La Anónima', fn: scrapeLaAnonima,  chain: 'La Anónima', group: 3 },
];

export interface SuperScraperResult {
  chain:       string;
  ok:          boolean;
  count:       number;
  error?:      string;
  durationMs:  number;
}

export async function runSuperScraper(def: ScraperDef): Promise<SuperScraperResult> {
  const start = Date.now();
  try {
    const offers = await def.fn();
    if (offers.length > 0) {
      await saveSuperOffers(offers, def.chain);
    }
    return { chain: def.chain, ok: true, count: offers.length, durationMs: Date.now() - start };
  } catch (err: any) {
    return { chain: def.chain, ok: false, count: 0, error: err.message, durationMs: Date.now() - start };
  }
}

export async function runAllSuperScrapers(): Promise<SuperScraperResult[]> {
  console.log(`\n🛒 [${new Date().toISOString()}] Iniciando scrapers de supermercados\n`);
  const results: SuperScraperResult[] = [];

  // Agrupar por grupo y correr cada grupo en paralelo
  const groups = [...new Set(SCRAPERS.map(s => s.group))].sort();

  for (const group of groups) {
    const groupScrapers = SCRAPERS.filter(s => s.group === group);
    console.log(`\n📦 Grupo ${group}: ${groupScrapers.map(s => s.name).join(', ')}`);

    const groupResults = await Promise.allSettled(
      groupScrapers.map(s => runSuperScraper(s))
    );

    for (const r of groupResults) {
      if (r.status === 'fulfilled') results.push(r.value);
    }

    // Pausa entre grupos para no saturar
    if (group < groups[groups.length - 1]) {
      console.log(`⏳ Pausa 3s entre grupos...`);
      await sleep(3000);
    }
  }

  // Limpiar ofertas vencidas
  await cleanupExpiredOffers();

  console.log('\n📊 Resumen supermercados:');
  for (const r of results) {
    const icon = r.ok ? '✅' : '❌';
    console.log(`  ${icon} ${r.chain.padEnd(12)} ${r.count} ofertas (${r.durationMs}ms)${r.error ? ' — ' + r.error : ''}`);
  }

  return results;
}

async function cleanupExpiredOffers() {
  const { error } = await supabase.rpc('deactivate_expired_offers');
  if (error) console.error('Cleanup error:', error.message);
  else console.log('🧹 Ofertas vencidas desactivadas');
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// Correr standalone
if (require.main === module) {
  runAllSuperScrapers()
    .then(() => process.exit(0))
    .catch(err => { console.error(err); process.exit(1); });
}