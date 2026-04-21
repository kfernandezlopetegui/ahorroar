import { supabase } from '../../supabase';

export interface SuperOffer {
  chain:              string;
  ean?:               string | null;
  product_name:       string;
  brand?:             string;
  category:           SuperCategory;
  image_url?:         string;
  original_price?:    number | null;
  offer_price:        number;
  discount_pct?:      number;
  offer_type:         OfferType;
  offer_description?: string;
  valid_from:         string;
  valid_until:        string;
}

export type OfferType     = 'percent' | '2x1' | '3x2' | 'fixed_price' | 'cuotas';
export type SuperCategory =
  | 'almacen' | 'lacteos' | 'carnes' | 'verduleria' | 'panaderia'
  | 'limpieza' | 'perfumeria' | 'bebidas' | 'congelados' | 'otros';

export function detectSuperCategory(text: string): SuperCategory {
  const t = text.toLowerCase();
  if (/leche|yogur|queso|manteca|crema/.test(t))            return 'lacteos';
  if (/carne|pollo|cerdo|vacuno|fiambre|embutido/.test(t))  return 'carnes';
  if (/fruta|verdura|tomate|papa|cebolla/.test(t))          return 'verduleria';
  if (/pan|gallet|factur|panaderia/.test(t))                return 'panaderia';
  if (/limpiador|lavandina|jabón|detergen/.test(t))         return 'limpieza';
  if (/shampoo|desodor|pasta dental|perfum/.test(t))        return 'perfumeria';
  if (/gaseosa|agua|jugo|cerveza|vino|bebida/.test(t))      return 'bebidas';
  if (/congel|helad|pizza lista|medallón/.test(t))          return 'congelados';
  if (/arroz|fideos|aceite|harina|azúcar|conserva/.test(t)) return 'almacen';
  return 'otros';
}

export function parseOfferText(text: string): { pct: number; type: OfferType } {
  if (/2\s*x\s*1/i.test(text)) return { pct: 50, type: '2x1' };
  if (/3\s*x\s*2/i.test(text)) return { pct: 33, type: '3x2' };
  const pctMatch = text.match(/(\d+)\s*%/);
  if (pctMatch) return { pct: parseInt(pctMatch[1]), type: 'percent' };
  return { pct: 0, type: 'percent' };
}

export function calcDiscount(original: number, offer: number): number {
  if (!original || original <= 0 || offer >= original) return 0;
  return Math.round(((original - offer) / original) * 100);
}

export function today(): string {
  return new Date().toISOString().split('T')[0];
}

export function endOfWeek(): string {
  const d = new Date();
  d.setDate(d.getDate() + (7 - d.getDay()));
  return d.toISOString().split('T')[0];
}

export function nextMonthEnd(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  d.setDate(new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate());
  return d.toISOString().split('T')[0];
}

/**
 * Deduplicar por la clave de conflicto (chain, product_name, valid_until)
 * ANTES de enviar a Supabase — evita "ON CONFLICT DO UPDATE command cannot affect row a second time"
 */
function deduplicateBatch(offers: SuperOffer[]): SuperOffer[] {
  const seen = new Map<string, SuperOffer>();
  for (const o of offers) {
    const key = `${o.chain}|${o.product_name.toLowerCase().trim()}|${o.valid_until}`;
    // Si hay duplicado, quedarse con el que tenga mayor descuento
    const existing = seen.get(key);
    if (!existing || (o.discount_pct ?? 0) > (existing.discount_pct ?? 0)) {
      seen.set(key, o);
    }
  }
  return Array.from(seen.values());
}

export async function saveSuperOffers(
  offers: SuperOffer[],
  chain: string,
): Promise<void> {
  if (!offers.length) {
    console.warn(`[${chain}] 0 ofertas — se mantiene lo que hay en DB`);
    return;
  }

  // Desactivar ofertas anteriores de esta cadena
  const { error: deactErr } = await supabase
    .from('supermarket_offers')
    .update({ is_active: false })
    .eq('chain', chain)
    .eq('is_active', true);

  if (deactErr) console.error(`[${chain}] Desactivar error:`, deactErr.message);

  const BATCH = 200;
  let inserted = 0;
  const timestamp = new Date().toISOString();

  // Deduplicar el total ANTES de batchear
  const unique = deduplicateBatch(offers);
  console.log(`[${chain}] ${offers.length} ofertas → ${unique.length} tras deduplicar`);

  for (let i = 0; i < unique.length; i += BATCH) {
    const batch = unique.slice(i, i + BATCH).map(o => ({
      ...o,
      is_active:  true,
      scraped_at: timestamp,
    }));

    const { error } = await supabase
      .from('supermarket_offers')
      .upsert(batch, {
        onConflict:       'chain,product_name,valid_until',
        ignoreDuplicates: false,
      });

    if (error) {
      console.error(`[${chain}] Batch ${Math.floor(i / BATCH)} error:`, error.message);
    } else {
      inserted += batch.length;
    }
  }

  console.log(`[${chain}] ✅ ${inserted}/${unique.length} ofertas guardadas`);
}