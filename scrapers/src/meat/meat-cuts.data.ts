/**
 * Definiciones de cortes de carne para el matcher por keywords.
 *
 * Fuente de verdad en runtime: la tabla `meat_cuts` de Supabase
 * (db/migrations/2026-07-09_meat_cuts.sql). Este archivo replica el
 * seed para que los tests unitarios corran sin DB — si cambiás
 * keywords acá, actualizá también la migración (y viceversa).
 *
 * El orden de `MEAT_CUTS` es la prioridad de matching: los cortes
 * cuyo nombre contiene a otro van primero ("bola de lomo" antes que
 * "lomo", si no todo terminaría etiquetado como "lomo").
 */

export interface MeatCutDef {
  /** id real (uuid) cuando viene de la DB; en tests se usa el slug */
  id: string;
  slug: string;
  displayName: string;
  category: string;
  /** frases que identifican el corte (palabra completa, sin tildes) */
  keywords: string[];
  /** palabras que descartan el match solo para este corte */
  excludeKeywords: string[];
}

export const MEAT_CUTS: MeatCutDef[] = [
  {
    id: 'bola-de-lomo', slug: 'bola-de-lomo', displayName: 'Bola de lomo', category: 'vacuno',
    keywords: ['bola de lomo'],
    excludeKeywords: [],
  },
  {
    id: 'bife-de-chorizo', slug: 'bife-de-chorizo', displayName: 'Bife de chorizo', category: 'vacuno',
    keywords: ['bife de chorizo', 'bife chorizo', 'bife ancho', 'bife angosto'],
    excludeKeywords: [],
  },
  {
    id: 'roast-beef', slug: 'roast-beef', displayName: 'Roast beef', category: 'vacuno',
    keywords: ['roast beef', 'roastbeef', 'rost beef', 'rosbif'],
    excludeKeywords: [],
  },
  {
    id: 'cuadril', slug: 'cuadril', displayName: 'Cuadril', category: 'vacuno',
    keywords: ['cuadril', 'colita de cuadril'],
    excludeKeywords: [],
  },
  {
    id: 'peceto', slug: 'peceto', displayName: 'Peceto', category: 'vacuno',
    keywords: ['peceto'],
    excludeKeywords: [],
  },
  {
    id: 'nalga', slug: 'nalga', displayName: 'Nalga', category: 'vacuno',
    keywords: ['nalga'],
    excludeKeywords: [],
  },
  {
    id: 'matambre', slug: 'matambre', displayName: 'Matambre', category: 'vacuno',
    keywords: ['matambre', 'matambrito'],
    excludeKeywords: ['cerdo', 'porcino', 'chancho', 'pizza', 'arrollado', 'relleno'],
  },
  {
    id: 'entrana', slug: 'entrana', displayName: 'Entraña', category: 'vacuno',
    keywords: ['entraña', 'entrana'],
    excludeKeywords: ['cerdo', 'porcino'],
  },
  {
    id: 'osobuco', slug: 'osobuco', displayName: 'Osobuco', category: 'vacuno',
    keywords: ['osobuco', 'ossobuco', 'osso buco', 'oso buco'],
    excludeKeywords: [],
  },
  {
    id: 'falda', slug: 'falda', displayName: 'Falda', category: 'vacuno',
    // "falda" también es ropa en los marketplaces de las cadenas
    keywords: ['falda'],
    excludeKeywords: ['mujer', 'nena', 'nina', 'talle', 'vestido', 'jean', 'pollera'],
  },
  {
    id: 'asado', slug: 'asado', displayName: 'Asado', category: 'vacuno',
    keywords: ['asado', 'tira de asado', 'asado de tira', 'costillar'],
    excludeKeywords: ['pollo', 'cerdo', 'porcino', 'chancho', 'carbon', 'salsa', 'sal parrillera'],
  },
  {
    id: 'vacio', slug: 'vacio', displayName: 'Vacío', category: 'vacuno',
    // "envasado al vacío" se neutraliza en el matcher antes de buscar keywords
    keywords: ['vacio', 'vacío'],
    excludeKeywords: [],
  },
  {
    id: 'lomo', slug: 'lomo', displayName: 'Lomo', category: 'vacuno',
    keywords: ['lomo', 'bife de lomo'],
    excludeKeywords: ['cerdo', 'porcino', 'chancho', 'atun', 'ahumado', 'embuchado', 'cocido'],
  },
  {
    id: 'picada', slug: 'picada', displayName: 'Carne picada', category: 'vacuno',
    keywords: ['carne picada', 'picada', 'picada especial', 'picada comun'],
    excludeKeywords: ['fiambre', 'fiambres', 'queso', 'quesos', 'mani', 'salame', 'cebolla', 'verdura', 'pollo', 'cerdo'],
  },
];

/**
 * Exclusiones globales: si el nombre contiene alguna de estas palabras,
 * no es un corte fresco por peso (elaborados, congelados, snacks, etc.)
 * y se descarta para TODOS los cortes.
 * "milanesa" tiene regla propia en el matcher: "milanesa de nalga" se
 * excluye pero "nalga para milanesas" (corte crudo) se mantiene.
 */
export const GLOBAL_MEAT_EXCLUDES = [
  'hamburguesa', 'hamburguesas',
  'medallon', 'medallones',
  'empanada', 'empanadas',
  'albondiga', 'albondigas',
  'nugget', 'nuggets',
  'salchicha', 'salchichas',
  'pate',
  'escabeche',
  'caldo', 'sopa',
  'condimento', 'sazonador', 'adobo',
  'rebozado', 'rebozada', 'rebozador',
  'alimento para',
  'tarta', 'pizza lista',
  'lasagna', 'lasana', 'canelones', 'ravioles', 'sorrentinos',
];
