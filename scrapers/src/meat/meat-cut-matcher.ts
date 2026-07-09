/**
 * Matcher de cortes de carne + normalización de precio a $/kg.
 *
 * Los cortes no tienen EAN estándar (se venden por peso y cada cadena
 * usa nombres y presentaciones distintas), así que la comparación se
 * hace por categoría normalizada:
 *   1. matchMeatCut(): detecta el corte por keywords (case-insensitive,
 *      sin tildes, por palabra completa) con exclusiones globales y por corte.
 *   2. parsePricePerKg(): normaliza el precio publicado a $/kg según la
 *      presentación que aparezca en el nombre ("x kg", "500 g", "por kilo"…).
 *
 * Lógica pura, sin I/O — testeable sin DB.
 */
import { MeatCutDef, GLOBAL_MEAT_EXCLUDES } from './meat-cuts.data';

export type MeatCutMatch = Pick<MeatCutDef, 'id' | 'slug'>;
export type MeatCutMatcher = (productName: string) => MeatCutMatch | null;

/** minúsculas + sin tildes/diacríticos (ñ → n incluida, alcanza para matching) */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Canonizar para matching por palabra completa: todo lo que no sea
 * alfanumérico se vuelve un espacio, y se rodea con espacios para poder
 * buscar frases con ` includes(' frase ') ` sin regex.
 * "ENV.VACIO x Kg." → " env vacio x kg "
 */
function canon(s: string): string {
  return ' ' + normalizeText(s).replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
}

function containsPhrase(canonText: string, phrase: string): boolean {
  return canonText.includes(' ' + canon(phrase).trim() + ' ');
}

/**
 * Frases que se borran del nombre ANTES de buscar keywords: "envasado al
 * vacío" habla del packaging, no del corte "vacío". Coto abrevia "ENV.VACIO".
 */
const NEUTRALIZE_PHRASES = ['envasado al vacio', 'envasada al vacio', 'al vacio', 'env vacio', 'en vacio'];

function neutralize(canonText: string): string {
  let out = canonText;
  for (const phrase of NEUTRALIZE_PHRASES) {
    out = out.split(' ' + phrase + ' ').join(' ');
  }
  return out;
}

/**
 * Crea el matcher a partir de las definiciones de cortes (filas de la tabla
 * meat_cuts o el seed en meat-cuts.data.ts). El orden del array es la
 * prioridad: gana el primer corte que matchea.
 */
export function buildMeatCutMatcher(
  cuts: Pick<MeatCutDef, 'id' | 'slug' | 'keywords' | 'excludeKeywords'>[],
): MeatCutMatcher {
  const compiled = cuts.map(cut => ({
    id: cut.id,
    slug: cut.slug,
    keywords: cut.keywords.map(k => ' ' + canon(k).trim() + ' '),
    excludes: (cut.excludeKeywords ?? []).map(k => ' ' + canon(k).trim() + ' '),
  }));

  return (productName: string): MeatCutMatch | null => {
    const text = neutralize(canon(productName));

    // "Milanesa de nalga" es un elaborado, pero "Nalga para milanesas"
    // es el corte crudo vendido por peso.
    if (/\bmilanesa/.test(text) && !/\bpara( hacer)? milanesa/.test(text) && !/\bp ?\/ ?milanesa/.test(normalizeText(productName))) {
      return null;
    }

    for (const phrase of GLOBAL_MEAT_EXCLUDES) {
      if (containsPhrase(text, phrase)) return null;
    }

    for (const cut of compiled) {
      if (!cut.keywords.some(k => text.includes(k))) continue;
      if (cut.excludes.some(e => text.includes(e))) continue;
      return { id: cut.id, slug: cut.slug };
    }
    return null;
  };
}

// ── Normalización a $/kg ─────────────────────────────────────────────────────

export interface PricePerKgResult {
  /** null = presentación desconocida → fuera del comparador */
  pricePerKg: number | null;
  /** peso detectado en el nombre, si lo hubo */
  weightKg: number | null;
  basis: 'explicit-weight' | 'per-kg' | null;
}

const HALF_KG_RE = /\b1\s*\/\s*2\s*(?:kg|kgs|kilo|kilos)\b/;
const KG_RE = /(\d+(?:[.,]\d+)?)\s*(?:kg|kgs|kilo|kilos)\b/;
const GRAMS_RE = /(\d+(?:[.,]\d+)?)\s*(?:g|gr|grs|gramos)\b/;
const PER_KG_RE = /\b(?:kg|kgs|kilo|kilos)\b/;

function toNumber(raw: string): number {
  return parseFloat(raw.replace(',', '.'));
}

/**
 * Reglas (en orden):
 *  1. Peso explícito en el nombre ("x 1 kg", "500 g", "bandeja 1kg",
 *     "1/2 kg") → precio / peso.
 *  2. Sin peso pero el nombre menciona kg/kilo ("x kg", "por kilo") →
 *     se asume que el precio publicado ya es por kg.
 *  3. Nada de lo anterior → null: no se puede normalizar y el producto
 *     queda fuera del comparador.
 */
export function parsePricePerKg(productName: string, price: number): PricePerKgResult {
  const none: PricePerKgResult = { pricePerKg: null, weightKg: null, basis: null };
  if (!price || price <= 0) return none;

  const text = normalizeText(productName);

  let weightKg: number | null = null;
  if (HALF_KG_RE.test(text)) {
    weightKg = 0.5;
  } else {
    const kg = text.match(KG_RE);
    if (kg) {
      weightKg = toNumber(kg[1]);
    } else {
      const g = text.match(GRAMS_RE);
      if (g) weightKg = toNumber(g[1]) / 1000;
    }
  }

  if (weightKg !== null) {
    if (weightKg <= 0) return none;
    return {
      pricePerKg: Math.round((price / weightKg) * 100) / 100,
      weightKg,
      basis: 'explicit-weight',
    };
  }

  if (PER_KG_RE.test(text)) {
    return { pricePerKg: price, weightKg: null, basis: 'per-kg' };
  }

  return none;
}
