import axios from 'axios';
import {
  ScrapedPromo, savePromos,
  detectCategory, parseDiscount,
  defaultValidUntil, today,
} from './base';

const BANK    = 'Galicia';
const BFF     = 'https://loyalty.bff.bancogalicia.com.ar/api/portal';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept':     'application/json',
  'Referer':    'https://www.galicia.ar/',
  'Origin':     'https://www.galicia.ar',
};

// Categorías conocidas del buscador de Galicia
const CATEGORIAS = [
  { id: 8, nombre: 'supermercado'  },
  { id: 7, nombre: 'indumentaria'  },
  { id: 6, nombre: 'gastronomia'   },
  { id: 5, nombre: 'farmacia'      },
  { id: 4, nombre: 'electronica'   },
  { id: 3, nombre: 'transporte'    },
  { id: 1, nombre: 'otros'         },
  { id: 2, nombre: 'otros'         },
  { id: 9, nombre: 'otros'         },
];

export async function scrapeGalicia(): Promise<ScrapedPromo[]> {
  console.log(`[${BANK}] Iniciando scraper (API directa)...`);
  const promos: ScrapedPromo[] = [];

  // 1. Obtener carruseles destacados y sus promos
  await scrapeCarruseles(promos);

  // 2. Obtener promos por categoría
  await scrapeCategories(promos);

  // Deduplicar por título
  const seen  = new Set<string>();
  const unique = promos.filter(p => {
    const k = p.title.toLowerCase().trim();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  console.log(`[${BANK}] ${unique.length} promos encontradas`);
  return unique;
}

async function scrapeCarruseles(promos: ScrapedPromo[]) {
  try {
    // Obtener IDs de carruseles
    const { data: agrupadorRes } = await axios.get(
      `${BFF}/personalizacion/v1/promociones/list/agrupador/10/carruseles`,
      { headers: HEADERS, timeout: 10_000 },
    );

    const carruseles: { idCarrusel: number; titulo: string }[] =
      agrupadorRes.data?.carruseles ?? [];

    console.log(`[${BANK}] Carruseles encontrados: ${carruseles.map(c => c.titulo).join(', ')}`);

    // Obtener promos de cada carrusel (con paginación)
    for (const carrusel of carruseles) {
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const { data: res } = await axios.get(
          `${BFF}/personalizacion/v1/promociones/list/carrusel/${carrusel.idCarrusel}`,
          {
            headers: HEADERS,
            timeout: 10_000,
            params: { page, pageSize: 50, cardEspecial: true, haberes: true },
          },
        );

        const lista: any[] = res.data?.promociones?.list ?? [];
        const total: number = res.data?.promociones?.totalSize ?? 0;

        for (const item of lista) {
          const p = mapCarruselItem(item);
          if (p) promos.push(p);
        }

        hasMore = page * 50 < total;
        page++;
      }
    }
  } catch (err: any) {
    console.error(`[${BANK}] Error en carruseles: ${err.message}`);
  }
}

async function scrapeCategories(promos: ScrapedPromo[]) {
  for (const cat of CATEGORIAS) {
    try {
      let pageIndex = 1;
      let hasMore   = true;

      while (hasMore) {
        const { data: res } = await axios.get(
          `${BFF}/catalogo/v1/agrupador-promocion`,
          {
            headers: HEADERS,
            timeout: 10_000,
            params: { pageIndex, pageSize: 50, IdCategoria: cat.id },
          },
        );

        const lista: any[] = res.data?.list ?? [];
        const total: number = res.data?.totalSize ?? 0;

        // Cada item es una marca — buscamos sus promos
        for (const marca of lista) {
          if (!marca.marcaId) continue;
          const marcaPromos = await fetchMarcaPromos(marca, cat.nombre as ScrapedPromo['category']);
          promos.push(...marcaPromos);
        }

        hasMore = pageIndex * 50 < total;
        pageIndex++;
      }

      console.log(`[${BANK}] Categoría ${cat.nombre} (${cat.id}) procesada`);
    } catch (err: any) {
      console.error(`[${BANK}] Error categoría ${cat.id}: ${err.message}`);
    }
  }
}

async function fetchMarcaPromos(
  marca: any,
  category: ScrapedPromo['category'],
): Promise<ScrapedPromo[]> {
  try {
    const { data: res } = await axios.get(
      `${BFF}/catalogo/v1/promociones-marca`,
      {
        headers: HEADERS,
        timeout: 8_000,
        params: { marcaId: marca.marcaId, pageIndex: 1, pageSize: 20 },
      },
    );

    const lista: any[] = res.data?.list ?? res.data?.promociones ?? [];

    return lista
      .map((item: any) => mapMarcaItem(item, marca.titulo, category))
      .filter((p): p is ScrapedPromo => p !== null);

  } catch {
    // Si falla la consulta de marca individual, crear una promo genérica
    return [{
      bank:         BANK,
      title:        marca.titulo,
      description:  `Promoción Galicia en ${marca.titulo}`,
      discount_pct: 10,
      max_discount: null,
      category,
      store:        marca.titulo,
      valid_from:   today(),
      valid_until:  defaultValidUntil(),
      days_of_week: [],
      is_active:    true,
    }];
  }
}

// Mapea item del endpoint de carrusel
// Estructura real: { titulo, promocion, subtitulo, leyendaDiasAplicacion, fechaHasta, idMarca }
function mapCarruselItem(item: any): ScrapedPromo | null {
  const title = item.titulo ?? '';
  if (!title) return null;

  // "promocion" tiene el texto real: "15% de ahorro y hasta 3 cuotas sin interés"
  const promoText  = item.promocion ?? '';
  const fullText   = `${title} ${promoText} ${item.subtitulo ?? ''}`;
  const discount   = parseDiscount(promoText) || parseDiscount(fullText) || 10;

  const daysText   = item.leyendaDiasAplicacion ?? '';
  const days_of_week = parseDaysLeyenda(daysText);

  return {
    bank:         BANK,
    title:        String(title).slice(0, 200),
    description:  promoText.slice(0, 500) || String(title),
    discount_pct: discount,
    max_discount: null,
    category:     detectCategory(fullText),
    store:        String(title).slice(0, 100),
    valid_from:   today(),
    valid_until:  item.fechaHasta
      ? item.fechaHasta.split('T')[0]
      : defaultValidUntil(),
    days_of_week,
    is_active: true,
  };
}

// Mapea item del endpoint de marca/categoría
function mapMarcaItem(
  item: any,
  storeName: string,
  defaultCategory: ScrapedPromo['category'],
): ScrapedPromo | null {
  const promoText = item.promocion ?? item.descripcion ?? item.titulo ?? '';
  if (!promoText) return null;

  const fullText = `${storeName} ${promoText}`;
  const discount = parseDiscount(promoText) || 10;

  return {
    bank:         BANK,
    title:        `${storeName} — ${promoText}`.slice(0, 200),
    description:  promoText.slice(0, 500),
    discount_pct: discount,
    max_discount: item.tope ?? item.montoMaximo ?? null,
    category:     detectCategory(fullText) || defaultCategory,
    store:        storeName,
    valid_from:   item.fechaDesde  ? item.fechaDesde.split('T')[0]  : today(),
    valid_until:  item.fechaHasta  ? item.fechaHasta.split('T')[0]  : defaultValidUntil(),
    days_of_week: parseDaysLeyenda(item.leyendaDiasAplicacion ?? ''),
    is_active:    true,
  };
}

// "Lunes a viernes" / "Todos los días" / "Martes y jueves" → [1,2,3,4,5]
function parseDaysLeyenda(leyenda: string): number[] {
  if (!leyenda || /todos/i.test(leyenda)) return [];
  const map: Record<string, number> = {
    lunes: 1, martes: 2, 'miércoles': 3, miercoles: 3,
    jueves: 4, viernes: 5, sábado: 6, sabado: 6, domingo: 7,
  };
  const days: number[] = [];
  const lower = leyenda.toLowerCase();
  for (const [key, val] of Object.entries(map)) {
    if (lower.includes(key)) days.push(val);
  }
  return [...new Set(days)].sort();
}

if (require.main === module) {
  scrapeGalicia()
    .then(p => savePromos(p, BANK))
    .catch(console.error);
}