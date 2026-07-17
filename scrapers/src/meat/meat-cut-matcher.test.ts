/**
 * Tests del matcher de cortes con nombres reales de productos scrapeados
 * (formato típico de cada cadena: Coto publica en MAYÚSCULAS y abrevia
 * "ENV.VACIO", DIA usa "por Kg", Changomás "x 1 kg", etc.).
 *
 * Correr con: npm test (node --test + ts-node)
 */
import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { buildMeatCutMatcher, parsePricePerKg, isMeatCutName } from './meat-cut-matcher';
import { MEAT_CUTS } from './meat-cuts.data';

const match = buildMeatCutMatcher(MEAT_CUTS);

function expectCut(name: string, slug: string | null) {
  const result = match(name);
  assert.equal(result?.slug ?? null, slug, `"${name}" → esperaba ${slug}, dio ${result?.slug ?? null}`);
}

// ── Carrefour (Vtex, Title Case, "x kg") ─────────────────────────────────────
test('Carrefour: 10 nombres scrapeados', () => {
  expectCut('Vacío x kg', 'vacio');
  expectCut('Asado de tira fresco x kg', 'asado');
  expectCut('Matambre de ternera x kg', 'matambre');
  expectCut('Nalga sin tapa en trozo x kg', 'nalga');
  expectCut('Bola de lomo en trozo envasada al vacío x kg', 'bola-de-lomo'); // no "lomo" ni "vacio"
  expectCut('Peceto de novillo x kg', 'peceto');
  expectCut('Colita de cuadril x kg', 'cuadril');
  expectCut('Bife de chorizo x kg', 'bife-de-chorizo');
  expectCut('Carne picada especial 500 g', 'picada');
  expectCut('Osobuco de ternera x kg', 'osobuco');
});

// ── Coto (MAYÚSCULAS, "POR KG", abreviaturas "ENV.VACIO", "C/HUESO") ─────────
test('Coto: 10 nombres scrapeados', () => {
  expectCut('VACIO EN TROZO ENVASADO AL VACIO POR KG', 'vacio');
  expectCut('ASADO C/HUESO CORTE AMERICANO x kg', 'asado');
  expectCut('MATAMBRE DE NOVILLITO POR KG', 'matambre');
  expectCut('NALGA PARA MILANESA COTO x Kg', 'nalga'); // corte crudo, no elaborado
  expectCut('PECETO DE NOVILLITO ENV.VACIO x kg', 'peceto'); // "ENV.VACIO" no es el corte vacío
  expectCut('CUADRIL DE NOVILLITO x kg', 'cuadril');
  expectCut('ROAST BEEF DE NOVILLITO POR KG', 'roast-beef');
  expectCut('OSOBUCO DE NOVILLITO x kg', 'osobuco');
  expectCut('FALDA DESHUESADA DE NOVILLITO POR KG', 'falda');
  expectCut('CARNE PICADA ESPECIAL POR KG', 'picada');
});

// ── DIA ("por Kg", "Fresco/a") ───────────────────────────────────────────────
test('DIA: 10 nombres scrapeados', () => {
  expectCut('Vacío Fresco por Kg', 'vacio');
  expectCut('Asado de Tira por Kg', 'asado');
  expectCut('Carne Picada Común 500 Gr', 'picada');
  expectCut('Bola de Lomo Fresca por Kg', 'bola-de-lomo');
  expectCut('Nalga Fresca por Kg', 'nalga');
  expectCut('Cuadril Fresco por Kg', 'cuadril');
  expectCut('Bife Ancho Fresco por Kg', 'bife-de-chorizo'); // sinónimo
  expectCut('Entraña Fresca por Kg', 'entrana');
  expectCut('Falda Parrillera por Kg', 'falda');
  expectCut('Roast Beef Fresco por Kg', 'roast-beef');
});

// ── Jumbo / Disco / Vea (Cencosud, "en trozo x kg") ──────────────────────────
test('Jumbo/Disco/Vea: 10 nombres scrapeados', () => {
  expectCut('Vacío en trozo x kg', 'vacio');
  expectCut('Bife de chorizo x kg', 'bife-de-chorizo');
  expectCut('Lomo en trozo x kg', 'lomo');
  expectCut('Entraña fina x kg', 'entrana');
  expectCut('Matambre de novillo x kg', 'matambre');
  expectCut('Osobuco en rodajas x kg', 'osobuco');
  expectCut('Picada especial x 1 kg', 'picada');
  expectCut('Peceto x kg', 'peceto');
  expectCut('Asado del carnicero x kg', 'asado');
  expectCut('Colita de cuadril envasada al vacío x kg', 'cuadril');
});

// ── Changomás ("x 1 kg") ─────────────────────────────────────────────────────
test('Changomás: 10 nombres scrapeados', () => {
  expectCut('Vacio x 1 kg', 'vacio'); // sin tilde
  expectCut('Asado de tira x 1 kg', 'asado');
  expectCut('Carne picada especial x 1 kg', 'picada');
  expectCut('Nalga en trozo x 1 kg', 'nalga');
  expectCut('Bola de lomo x 1 kg', 'bola-de-lomo');
  expectCut('Cuadril en trozo x 1 kg', 'cuadril');
  expectCut('Falda con hueso x 1 kg', 'falda');
  expectCut('Osobuco x 1 kg', 'osobuco');
  expectCut('Matambre vacuno x 1 kg', 'matambre');
  expectCut('Roast beef en trozo x 1 kg', 'roast-beef');
});

// ── La Anónima ───────────────────────────────────────────────────────────────
test('La Anónima: 10 nombres scrapeados', () => {
  expectCut('Vacío novillito especial x kg', 'vacio');
  expectCut('Asado banderita x kg', 'asado');
  expectCut('Costillar de novillito x kg', 'asado'); // sinónimo
  expectCut('Matambre novillito x kg', 'matambre');
  expectCut('Nalga de novillito s/tapa x kg', 'nalga');
  expectCut('Peceto novillito x kg', 'peceto');
  expectCut('Bife angosto s/cuadrada x kg', 'bife-de-chorizo'); // sinónimo
  expectCut('Entrana de novillito x kg', 'entrana'); // sin ñ
  expectCut('Bola de lomo novillito x kg', 'bola-de-lomo');
  expectCut('Carne picada comun x kg', 'picada');
});

// ── Falsos positivos que NO deben matchear ───────────────────────────────────
test('exclusiones: elaborados y no-carne quedan afuera', () => {
  expectCut('Hamburguesas de nalga x 4 un.', null);
  expectCut('Milanesa de nalga x kg', null);
  expectCut('Milanesas de peceto rebozadas x kg', null);
  expectCut('Empanadas de carne x 12 un.', null);
  expectCut('Medallón de lomo y queso congelado x 6', null);
  expectCut('Queso cremoso envasado al vacío x kg', null); // "al vacío" ≠ corte vacío
  expectCut('Lomitos de atún al natural 170 g', null); // "lomitos" ≠ "lomo"
  expectCut('Lomo de cerdo x kg', null); // porcino
  expectCut('Matambrito de cerdo x kg', null);
  expectCut('Pollo asado entero', null);
  expectCut('Salsa criolla para asado 250 g', null);
  expectCut('Carbón para asado 4 kg', null);
  expectCut('Picada de fiambres y quesos', null);
  expectCut('Cebolla picada congelada 500 g', null);
  expectCut('Falda de jean mujer talle 42', null); // marketplace de ropa
  expectCut('Lomo ahumado feteado 150 g', null); // fiambre
  expectCut('Caldo de carne x 6 cubos', null);
  expectCut('Matambre a la pizza listo x kg', null); // elaborado
});

// ── Normalización a $/kg ─────────────────────────────────────────────────────
test('parsePricePerKg: presentaciones típicas', () => {
  // precio ya por kg (el nombre menciona kg/kilo sin peso numérico)
  assert.deepEqual(parsePricePerKg('Vacío x kg', 8990), {
    pricePerKg: 8990, weightKg: null, basis: 'per-kg',
  });
  assert.deepEqual(parsePricePerKg('NALGA POR KILO', 11000), {
    pricePerKg: 11000, weightKg: null, basis: 'per-kg',
  });

  // peso explícito → precio / peso
  assert.deepEqual(parsePricePerKg('Carne picada especial 500 g', 3200), {
    pricePerKg: 6400, weightKg: 0.5, basis: 'explicit-weight',
  });
  assert.deepEqual(parsePricePerKg('Picada especial x 1 kg', 7500), {
    pricePerKg: 7500, weightKg: 1, basis: 'explicit-weight',
  });
  assert.deepEqual(parsePricePerKg('Asado bandeja 1kg', 9000), {
    pricePerKg: 9000, weightKg: 1, basis: 'explicit-weight',
  });
  assert.deepEqual(parsePricePerKg('Matambre 1/2 kg', 5000), {
    pricePerKg: 10000, weightKg: 0.5, basis: 'explicit-weight',
  });
  assert.deepEqual(parsePricePerKg('Lomo 750 gr', 9750), {
    pricePerKg: 13000, weightKg: 0.75, basis: 'explicit-weight',
  });
  assert.deepEqual(parsePricePerKg('Entraña 1,5 kg aprox', 15000), {
    pricePerKg: 10000, weightKg: 1.5, basis: 'explicit-weight',
  });

  // sin presentación inferible → fuera del comparador
  assert.deepEqual(parsePricePerKg('Bife de chorizo bandeja 2 unidades', 12000), {
    pricePerKg: null, weightKg: null, basis: null,
  });
  assert.deepEqual(parsePricePerKg('Peceto en trozo', 14000), {
    pricePerKg: null, weightKg: null, basis: null,
  });
});

test('parsePricePerKg: fracciones distintas de 1/2 (bug: "1/4 kg" se leía "4 kg")', () => {
  assert.deepEqual(parsePricePerKg('Asado 1/4 kg', 2500), {
    pricePerKg: 10000, weightKg: 0.25, basis: 'explicit-weight',
  });
  assert.deepEqual(parsePricePerKg('Peceto 3/4 kg', 9000), {
    pricePerKg: 12000, weightKg: 0.75, basis: 'explicit-weight',
  });
  // la de siempre sigue funcionando
  assert.deepEqual(parsePricePerKg('Matambre 1/2 kg', 5000), {
    pricePerKg: 10000, weightKg: 0.5, basis: 'explicit-weight',
  });
});

test('parsePricePerKg: multipacks "N x peso" suman el peso total', () => {
  assert.deepEqual(parsePricePerKg('Carne picada 2 x 500 g', 7000), {
    pricePerKg: 7000, weightKg: 1, basis: 'explicit-weight',
  });
  assert.deepEqual(parsePricePerKg('Picada comun 4x250g', 6000), {
    pricePerKg: 6000, weightKg: 1, basis: 'explicit-weight',
  });
  assert.deepEqual(parsePricePerKg('Asado 2 x 1 kg', 18000), {
    pricePerKg: 9000, weightKg: 2, basis: 'explicit-weight',
  });
  // "x 1 kg" como separador (sin número antes de la x) NO es multipack
  assert.deepEqual(parsePricePerKg('Vacio x 1 kg', 8990), {
    pricePerKg: 8990, weightKg: 1, basis: 'explicit-weight',
  });
});

test('parsePricePerKg: pesos implausibles quedan fuera', () => {
  // media res / cajas mayoristas: dividir daría un "$/kg" engañoso
  assert.deepEqual(parsePricePerKg('Media res 90 kg', 500000), {
    pricePerKg: null, weightKg: null, basis: null,
  });
});

test('isMeatCutName: decide dentro de los scrapers sin DB', () => {
  assert.equal(isMeatCutName('Vacío x kg'), true);
  assert.equal(isMeatCutName('ASADO C/HUESO CORTE AMERICANO x kg'), true);
  assert.equal(isMeatCutName('Salsa criolla para asado 250 g'), false);
  assert.equal(isMeatCutName('Lomitos de atún al natural 170 g'), false);
  assert.equal(isMeatCutName('Detergente 750 ml'), false);
});
