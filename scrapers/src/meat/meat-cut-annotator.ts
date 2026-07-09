/**
 * Etiquetado de cortes de carne en el pipeline de guardado de ofertas.
 *
 * Lee las definiciones desde la tabla `meat_cuts` de Supabase (fuente de
 * verdad en runtime: permite ajustar keywords sin redeploy) y anota cada
 * oferta que matchea con meat_cut_id + price_per_kg. Si la tabla no existe
 * o falla la consulta, el guardado sigue sin etiquetar.
 */
import { supabase } from '../supabase';
import { buildMeatCutMatcher, parsePricePerKg, MeatCutMatcher } from './meat-cut-matcher';
import type { SuperOffer } from '../scrapers/supermarkets/base-super';

interface MeatCutRow {
  id: string;
  slug: string;
  keywords: string[];
  exclude_keywords: string[] | null;
}

const CACHE_TTL_MS = 10 * 60 * 1000;
let cached: { matcher: MeatCutMatcher | null; at: number } | null = null;

async function getMatcher(): Promise<MeatCutMatcher | null> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.matcher;

  const { data, error } = await supabase
    .from('meat_cuts')
    .select('id, slug, keywords, exclude_keywords')
    .order('match_priority', { ascending: true });

  if (error || !data?.length) {
    if (error) console.warn('[meat] No se pudo leer meat_cuts (¿falta la migración?):', error.message);
    cached = { matcher: null, at: Date.now() };
    return null;
  }

  const matcher = buildMeatCutMatcher(
    (data as MeatCutRow[]).map(row => ({
      id: row.id,
      slug: row.slug,
      keywords: row.keywords,
      excludeKeywords: row.exclude_keywords ?? [],
    })),
  );
  cached = { matcher, at: Date.now() };
  return matcher;
}

/** Muta las ofertas: setea meat_cut_id y price_per_kg cuando corresponde. */
export async function annotateMeatCuts(offers: SuperOffer[]): Promise<number> {
  const match = await getMatcher();
  if (!match) return 0;

  let tagged = 0;
  for (const offer of offers) {
    const cut = match(offer.product_name);
    if (!cut) continue;
    offer.meat_cut_id = cut.id;
    offer.price_per_kg = parsePricePerKg(offer.product_name, offer.offer_price).pricePerKg;
    tagged++;
  }
  return tagged;
}
