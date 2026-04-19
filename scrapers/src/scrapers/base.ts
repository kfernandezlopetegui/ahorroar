import { chromium, Browser, Page } from 'playwright';
import { supabase } from '../supabase';

export interface ScrapedPromo {
  bank: string;
  title: string;
  description: string;
  discount_pct: number;
  max_discount: number | null;
  category: string;
  store: string;
  valid_from: string;
  valid_until: string;
  days_of_week: number[]; // 1=Lun … 7=Dom
  is_active: boolean;
}

export type Category =
  | 'supermercado'
  | 'farmacia'
  | 'transporte'
  | 'indumentaria'
  | 'electronica'
  | 'gastronomia'
  | 'otros';

// Mapea palabras clave a categorías
export function detectCategory(text: string): Category {
  const t = text.toLowerCase();
  if (/carrefour|disco|jumbo|coto|vea|super|mercado|dÃa|dia\b/.test(t)) return 'supermercado';
  if (/farmacity|farmacia|boti|salud|drogueria/.test(t)) return 'farmacia';
  if (/uber|cabify|metrobus|sube|subte|transporte/.test(t)) return 'transporte';
  if (/zara|h&m|ropa|indumentaria|moda|falabella|nike|adidas/.test(t)) return 'indumentaria';
  if (/fravega|musimundo|garbarino|electronica|celular|apple|samsung/.test(t)) return 'electronica';
  if (/restaurant|cafe|mcdonalds|burger|pizza|rappi|pedidosya|gastronomia/.test(t)) return 'gastronomia';
  return 'otros';
}

// Parsea strings de descuento → número. Ej: "20%" → 20, "2x1" → 50
export function parseDiscount(raw: string): number {
  const pct = raw.match(/(\d+)\s*%/);
  if (pct) return parseInt(pct[1]);
  if (/2\s*x\s*1/i.test(raw)) return 50;
  if (/3\s*x\s*2/i.test(raw)) return 33;
  if (/3\s*x\s*1/i.test(raw)) return 67;
  const plain = raw.match(/\d+/);
  return plain ? parseInt(plain[0]) : 0;
}

// Parsea topes de descuento → número. Ej: "$500" → 500
export function parseMaxDiscount(raw: string): number | null {
  const m = raw.replace(/\./g, '').match(/\$?\s*(\d+)/);
  return m ? parseInt(m[1]) : null;
}

// Días de la semana en español → número ISO (1=Lun, 7=Dom)
export function parseDays(raw: string): number[] {
  const map: Record<string, number> = {
    lun: 1, mar: 2, mié: 3, mie: 3, jue: 4,
    vie: 5, sáb: 6, sab: 6, dom: 7,
  };
  const found: number[] = [];
  const t = raw.toLowerCase();
  for (const [key, val] of Object.entries(map)) {
    if (t.includes(key)) found.push(val);
  }
  return found.sort();
}

// Fecha "valid_until" por defecto: fin del mes que viene
export function defaultValidUntil(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  d.setDate(new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate());
  return d.toISOString().split('T')[0];
}

export function today(): string {
  return new Date().toISOString().split('T')[0];
}

// Guarda promos en Supabase: desactiva las viejas del banco y hace upsert de las nuevas
export async function savePromos(promos: ScrapedPromo[], bankName: string): Promise<void> {
  if (!promos.length) {
    console.warn(`[${bankName}] 0 promos — se mantienen las anteriores en DB`);
    return; // NO borrar si el scraper no encontró nada
  }

  const { error: deactivateErr } = await supabase
    .from('promotions')
    .update({ is_active: false })
    .eq('bank', bankName);

  if (deactivateErr) {
    console.error(`[${bankName}] Error desactivando promos anteriores:`, deactivateErr.message);
  }

  const rows = promos.map(p => ({ ...p, scraped_at: new Date().toISOString() }));
  const { error } = await supabase.from('promotions').insert(rows);
  if (error) {
    console.error(`[${bankName}] Error guardando promos:`, error.message);
    throw error;
  }

  console.log(`[${bankName}] ✅ ${promos.length} promos guardadas`);
}

// Crea browser con opciones anti-detección
export async function createBrowser(): Promise<Browser> {
  return chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
    ],
  });
}

// Crea una page con user-agent realista
export async function createPage(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Buenos_Aires',
    viewport: { width: 1280, height: 800 },
  });
  const page = await ctx.newPage();
  // Ocultar Playwright
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  return page;
}