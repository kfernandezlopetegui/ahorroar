/**
 * Registro central de scrapers.
 *
 * Cada entrada compone los scrapers EXISTENTES (scrapear + guardar) en una
 * función uniforme que devuelve { scraped, upserted } para el wrapper
 * runScraper. No se modifica la lógica interna de cada scraper: sólo se
 * los envuelve.
 *
 * El worker (BullMQ) usa este registro para resolver name → fn.
 * El nombre (slug) es la clave estable que también usa el backend para
 * encolar y mostrar el estado.
 */
import { ScraperType, ScraperResult } from './run-scraper';

// Bancos
import { scrapeGalicia } from './scrapers/galicia';
import { scrapeNaranjaX } from './scrapers/naranja';
import { scrapeBBVA } from './scrapers/bbva';
import { savePromos } from './scrapers/base';

// Supermercados
import { scrapeCarrefour } from './scrapers/supermarkets/carrefour';
import { scrapeCoto } from './scrapers/supermarkets/coto';
import { scrapeDIA } from './scrapers/supermarkets/dia';
import { scrapeJumbo, scrapeDisco, scrapeVea } from './scrapers/supermarkets/jumbo';
import { scrapeLaAnonima } from './scrapers/supermarkets/la-anonima';
import { scrapeChangomas } from './scrapers/supermarkets/changomas';
import { scrapeFarmacity } from './scrapers/supermarkets/farmacity';
import { saveSuperOffers } from './scrapers/supermarkets/base-super';

export interface ScraperEntry {
  /** Slug estable, en minúsculas. Clave del job y de la UI. */
  name: string;
  /** Nombre para mostrar. */
  label: string;
  type: ScraperType;
  run: () => Promise<ScraperResult>;
}

/** Envuelve un scraper de banco: scrapea promos y las guarda. */
function bank(name: string, label: string, fn: () => Promise<any[]>, saveName: string): ScraperEntry {
  return {
    name,
    label,
    type: 'bank',
    run: async () => {
      const promos = await fn();
      if (promos.length > 0) await savePromos(promos, saveName);
      return { scraped: promos.length, upserted: promos.length };
    },
  };
}

/** Envuelve un scraper de super: scrapea ofertas y las guarda. */
function supermarket(
  name: string,
  label: string,
  fn: () => Promise<any[]>,
  chain: string,
): ScraperEntry {
  return {
    name,
    label,
    type: 'supermarket',
    run: async () => {
      const offers = await fn();
      if (offers.length > 0) await saveSuperOffers(offers, chain);
      return { scraped: offers.length, upserted: offers.length };
    },
  };
}

export const SCRAPER_REGISTRY: ScraperEntry[] = [
  // ── Bancos ──────────────────────────────────────────────
  bank('galicia', 'Galicia', scrapeGalicia, 'Galicia'),
  bank('naranja-x', 'Naranja X', scrapeNaranjaX, 'Naranja X'),
  bank('bbva', 'BBVA', scrapeBBVA, 'BBVA'),

  // ── Supermercados / farmacias ───────────────────────────
  supermarket('carrefour', 'Carrefour', scrapeCarrefour, 'Carrefour'),
  supermarket('coto', 'Coto', scrapeCoto, 'Coto'),
  supermarket('dia', 'DIA', scrapeDIA, 'DIA'),
  supermarket('jumbo', 'Jumbo', scrapeJumbo, 'Jumbo'),
  supermarket('disco', 'Disco', scrapeDisco, 'Disco'),
  supermarket('vea', 'Vea', scrapeVea, 'Vea'),
  supermarket('la-anonima', 'La Anónima', scrapeLaAnonima, 'La Anónima'),
  supermarket('changomas', 'Changomás', scrapeChangomas, 'Changomás'),
  supermarket('farmacity', 'Farmacity', scrapeFarmacity, 'Farmacity'),
];

export function getScraper(name: string): ScraperEntry | undefined {
  return SCRAPER_REGISTRY.find((s) => s.name === name);
}
