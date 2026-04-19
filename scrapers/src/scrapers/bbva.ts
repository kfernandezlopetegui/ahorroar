import axios from 'axios';
import {
  ScrapedPromo, savePromos,
  detectCategory, parseDiscount, parseMaxDiscount,
  defaultValidUntil, today,
} from './base';

const BANK = 'BBVA';
const API  = 'https://go.bbva.com.ar/willgo/fgo/API';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept':     'application/json',
  'Referer':    'https://www.bbva.com.ar/beneficios/',
  'Origin':     'https://www.bbva.com.ar',
};

// Rubros reales obtenidos de /API/v3/rubros/filtro?filtro_padre=true
const RUBROS = [
  { id: 13,  nombre: 'otros'        }, // Viajes
  { id: 3,   nombre: 'gastronomia'  }, // Gastronomía
  { id: 4,   nombre: 'otros'        }, // Entretenimiento
  { id: 170, nombre: 'indumentaria' }, // Moda
  { id: 173, nombre: 'otros'        }, // Hogar y Deco
  { id: 192, nombre: 'electronica'  }, // Electro y Tecnología
  { id: 184, nombre: 'otros'        }, // Deportes
  { id: 8,   nombre: 'farmacia'     }, // Belleza
  { id: 175, nombre: 'otros'        }, // Jugueterías
  { id: 195, nombre: 'otros'        }, // Regalos
  { id: 27,  nombre: 'otros'        }, // Shopping
  { id: 174, nombre: 'transporte'   }, // Automotores
  { id: 26,  nombre: 'otros'        }, // Otros comercios
];

export async function scrapeBBVA(): Promise<ScrapedPromo[]> {
  console.log(`[${BANK}] Iniciando scraper (API directa)...`);
  const promos: ScrapedPromo[] = [];

  // 1. Comunicaciones destacadas (featured) — endpoint confirmado
  await scrapeCommunications(promos, true);

  // 2. Todas las comunicaciones paginadas
  await scrapeCommunications(promos, false);

  // 3. Promos por rubro — probar endpoints comunes
  await scrapeByRubro(promos);

  // 4. Slides destacados
  await scrapeSlides(promos);

  // Deduplicar
  const seen = new Set<string>();
  const unique = promos.filter(p => {
    const k = p.title.toLowerCase().trim();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  console.log(`[${BANK}] ${unique.length} promos encontradas`);
  return unique;
}

async function scrapeCommunications(promos: ScrapedPromo[], destacado: boolean) {
  try {
    let pager = 0;
    let hasMore = true;

    while (hasMore) {
      const params: Record<string, any> = { pager };
      if (destacado) params.destacado = true;

      const { data } = await axios.get(`${API}/v3/communications`, {
        headers: HEADERS, timeout: 10_000, params,
      });

      const items: any[] = data.data ?? [];
      const pages = parseInt(data.message?.match(/paginas:\s*(\d+)/)?.[1] ?? '1');

      for (const item of items) {
        const p = mapCommunication(item);
        if (p) promos.push(p);
      }

      hasMore = pager + 1 < pages;
      pager++;
    }

    console.log(`[${BANK}] Communications (destacado=${destacado}): OK`);
  } catch (err: any) {
    console.error(`[${BANK}] Error communications: ${err.message}`);
  }
}

async function scrapeByRubro(promos: ScrapedPromo[]) {
  // Probar endpoints de beneficios por rubro
  const endpointTemplates = [
    (id: number, p: number) => `${API}/v3/beneficios?idRubro=${id}&pager=${p}`,
    (id: number, p: number) => `${API}/v3/communications?idRubro=${id}&pager=${p}`,
    (id: number, p: number) => `${API}/beneficios?idRubro=${id}&pager=${p}`,
    (id: number, p: number) => `${API}/v3/campanias?idRubro=${id}&pager=${p}`,
  ];

  for (const rubro of RUBROS) {
    let found = false;

    for (const tmpl of endpointTemplates) {
      try {
        const { data } = await axios.get(tmpl(rubro.id, 0), {
          headers: HEADERS, timeout: 8_000,
        });

        const items: any[] = extractItems(data);
        if (!items.length) continue;

        found = true;
        let pager = 0;
        let hasMore = true;

        while (hasMore) {
          const { data: pd } = await axios.get(tmpl(rubro.id, pager), {
            headers: HEADERS, timeout: 8_000,
          });
          const pageItems: any[] = extractItems(pd);

          for (const item of pageItems) {
            const p = mapBeneficio(item, rubro.nombre as ScrapedPromo['category']);
            if (p) promos.push(p);
          }

          const pages = parseInt(pd.message?.match(/paginas:\s*(\d+)/)?.[1] ?? '1');
          hasMore = pager + 1 < pages;
          pager++;
        }

        console.log(`[${BANK}] Rubro ${rubro.id}: OK`);
        break;
      } catch { /* siguiente endpoint */ }
    }

    if (!found) {
      console.warn(`[${BANK}] Rubro ${rubro.id}: sin endpoint funcional`);
    }
  }
}

async function scrapeSlides(promos: ScrapedPromo[]) {
  try {
    const { data } = await axios.get(`${API}/slides`, {
      headers: HEADERS, timeout: 10_000,
      params: { publicado: true, disponible_hoy: true },
    });

    const slides: any[] = data.slides ?? [];
    console.log(`[${BANK}] Slides: ${slides.length}`);

    for (const slide of slides) {
      // Los slides tienen callToAction con id_campaign, buscar esa campaña
      const campMatch = slide.callToAction?.match(/id_campaign=(\d+)/);
      if (!campMatch) continue;
      const campId = campMatch[1];

      try {
        const { data: camp } = await axios.get(`${API}/v3/campanias/${campId}`, {
          headers: HEADERS, timeout: 8_000,
        });
        const campData = camp.data ?? camp;
        const p = mapCampania(campData);
        if (p) promos.push(p);
      } catch { /* ignorar */ }
    }
  } catch (err: any) {
    console.error(`[${BANK}] Error slides: ${err.message}`);
  }
}

function extractItems(data: any): any[] {
  if (Array.isArray(data)) return data;
  return data.data ?? data.items ?? data.beneficios ?? data.campanias ?? [];
}

// Estructura de /v3/communications:
// { cabecera, subcabecera, fechaDesde, fechaHasta, diasPromo, montoTope, idCampania }
function mapCommunication(item: any): ScrapedPromo | null {
  const title = item.cabecera ?? '';
  if (!title || title.length < 3) return null;

  const desc     = item.subcabecera ?? '';
  const fullText = `${title} ${desc}`;
  const discount = parseDiscount(desc) || parseDiscount(title) || 10;

  return {
    bank:         BANK,
    title:        String(title).slice(0, 200),
    description:  String(desc).slice(0, 500),
    discount_pct: discount,
    max_discount: item.montoTope ?? parseMaxDiscount(desc),
    category:     detectCategory(fullText),
    store:        '',
    valid_from:   item.fechaDesde ?? today(),
    valid_until:  item.fechaHasta ?? defaultValidUntil(),
    days_of_week: parseDiasBBVA(item.diasPromo ?? ''),
    is_active:    true,
  };
}

function mapBeneficio(item: any, defaultCat: ScrapedPromo['category']): ScrapedPromo | null {
  const title = item.nombre ?? item.cabecera ?? item.title ?? item.titulo ?? '';
  if (!title || String(title).length < 3) return null;

  const desc     = item.descripcion ?? item.subcabecera ?? item.description ?? '';
  const fullText = `${title} ${desc}`;
  const discount = parseDiscount(desc) || parseDiscount(title) || 10;

  return {
    bank:         BANK,
    title:        String(title).slice(0, 200),
    description:  String(desc || title).slice(0, 500),
    discount_pct: discount,
    max_discount: item.montoTope ?? item.tope ?? null,
    category:     detectCategory(fullText) || defaultCat,
    store:        item.comercio ?? item.nombreComercio ?? '',
    valid_from:   item.fechaDesde ?? today(),
    valid_until:  item.fechaHasta ?? defaultValidUntil(),
    days_of_week: parseDiasBBVA(item.diasPromo ?? item.dias ?? ''),
    is_active:    true,
  };
}

function mapCampania(item: any): ScrapedPromo | null {
  const title = item.nombre ?? item.cabecera ?? '';
  if (!title) return null;
  const desc     = item.descripcion ?? item.subcabecera ?? '';
  const fullText = `${title} ${desc}`;
  return {
    bank:         BANK,
    title:        String(title).slice(0, 200),
    description:  String(desc || title).slice(0, 500),
    discount_pct: parseDiscount(desc) || parseDiscount(title) || 10,
    max_discount: item.montoTope ?? null,
    category:     detectCategory(fullText),
    store:        '',
    valid_from:   item.fechaDesde ?? today(),
    valid_until:  item.fechaHasta ?? defaultValidUntil(),
    days_of_week: parseDiasBBVA(item.diasPromo ?? ''),
    is_active:    true,
  };
}

// "Lunes y Martes" / null → [1,2]
function parseDiasBBVA(raw: string | null): number[] {
  if (!raw || /todos/i.test(raw)) return [];
  const map: Record<string, number> = {
    lunes: 1, martes: 2, miércoles: 3, miercoles: 3,
    jueves: 4, viernes: 5, sábado: 6, sabado: 6, domingo: 7,
  };
  const days: number[] = [];
  const lower = String(raw).toLowerCase();
  for (const [k, v] of Object.entries(map)) {
    if (lower.includes(k)) days.push(v);
  }
  return [...new Set(days)].sort();
}

if (require.main === module) {
  scrapeBBVA()
    .then(p => savePromos(p, BANK))
    .catch(console.error);
}