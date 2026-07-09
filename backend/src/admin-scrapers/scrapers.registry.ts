/**
 * Lista canónica de scrapers (debe coincidir con scrapers/src/registry.ts).
 *
 * El backend no ejecuta scrapers: sólo encola jobs (por `name`) y arma el
 * estado. Necesita conocer la lista completa para:
 *  - encolar los jobs correctos en el scheduler, y
 *  - mostrar en el monitor los scrapers que todavía nunca corrieron (gris).
 */
export type ScraperType = 'supermarket' | 'bank';

export interface ScraperDef {
  name: string; // slug estable = job.name = scraper_runs.scraper
  label: string;
  type: ScraperType;
}

export const SCRAPERS: ScraperDef[] = [
  // Bancos
  { name: 'galicia', label: 'Galicia', type: 'bank' },
  { name: 'naranja-x', label: 'Naranja X', type: 'bank' },
  { name: 'bbva', label: 'BBVA', type: 'bank' },
  // Supermercados / farmacias
  { name: 'carrefour', label: 'Carrefour', type: 'supermarket' },
  { name: 'coto', label: 'Coto', type: 'supermarket' },
  { name: 'dia', label: 'DIA', type: 'supermarket' },
  { name: 'jumbo', label: 'Jumbo', type: 'supermarket' },
  { name: 'disco', label: 'Disco', type: 'supermarket' },
  { name: 'vea', label: 'Vea', type: 'supermarket' },
  { name: 'la-anonima', label: 'La Anónima', type: 'supermarket' },
  { name: 'changomas', label: 'Changomás', type: 'supermarket' },
  { name: 'farmacity', label: 'Farmacity', type: 'supermarket' },
];

export const SCRAPER_NAMES = SCRAPERS.map((s) => s.name);

export const BANK_SCRAPERS = SCRAPERS.filter((s) => s.type === 'bank');
export const SUPERMARKET_SCRAPERS = SCRAPERS.filter((s) => s.type === 'supermarket');

export function findScraper(name: string): ScraperDef | undefined {
  return SCRAPERS.find((s) => s.name === name);
}
