import {
    ScrapedPromo, createBrowser, createPage, savePromos,
    detectCategory, parseDiscount, parseMaxDiscount, today,
} from './base';

const BANK = 'Naranja X';
const URL = 'https://fintech-benefits-shell.naranjax.com/promociones/SUPERMERCADOS';

export async function scrapeNaranjaX(): Promise<ScrapedPromo[]> {
    console.log(`[${BANK}] Iniciando scraper (Playwright + intercepción)...`);
    const browser = await createBrowser();
    const promos: ScrapedPromo[] = [];

    try {
        const page = await createPage(browser);
        let rulesAspectsData: any[] = [];


        // Capturar rules/aspects antes de navegar
        page.on('response', async response => {
            if (!response.url().includes('rules/aspects')) return;
            try {
                const json = await response.json();
                if (Array.isArray(json) && json.length > 0) {
                    rulesAspectsData = json as any[];
                    console.log(`[${BANK}] rules/aspects capturado: ${json.length} aspects`);
                }
            } catch { /* ignorar */ }
        });

        await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
        await page.waitForTimeout(8000);

        // Si no llegó rules/aspects todavía, esperar más
        if (!rulesAspectsData) {
            await page.waitForTimeout(5000);
        }
        if (rulesAspectsData.length === 0) {
            console.warn(`[${BANK}] rules/aspects no capturado — usando featured solamente`);
        } else {
            for (const aspectEntry of rulesAspectsData) {
                const binders: any[] = aspectEntry.binders ?? [];
                for (const binder of binders) {
                    const p = mapBinder(binder);
                    if (p) promos.push(p);
                }
            }
        }

        // También capturar las promos destacadas (featured) — no requieren cookie
        const featuredPromos = await scrapeFeatured();
        promos.push(...featuredPromos);

    } catch (err: any) {
        console.error(`[${BANK}] Error: ${err.message}`);
    } finally {
        await browser.close();
    }

    // Deduplicar por título + comercio
    const seen = new Set<string>();
    const unique = promos.filter(p => {
        const k = `${p.title}|${p.store}`.toLowerCase().trim();
        if (!k || seen.has(k)) return false;
        seen.add(k);
        return true;
    });

    console.log(`[${BANK}] ${unique.length} promos encontradas`);
    return unique;
}

// Estructura real de un binder:
// { commerceName, title, category.key, plans[].days, tags[{type:"refund",description}] }
function mapBinder(binder: any): ScrapedPromo | null {
    const store = binder.commerceName ?? '';
    const title = binder.title ?? '';
    if (!store || !title) return null;

    const categoryKey: string = binder.category?.key ?? '';
    const category = mapNaranjaCategory(categoryKey);
    const fullText = `${title} ${store} ${categoryKey}`;

    const discount = parseDiscount(title) || parseDiscount(fullText) || 10;

    // Tope de reintegro: tag con type "refund"
    const refundTag = (binder.tags ?? []).find((t: any) => t.type === 'refund');
    const maxDiscount = refundTag
        ? parseMaxDiscount(refundTag.description ?? '')
        : null;

    // Fechas: tomar min(dateFrom) y max(dateTo) de todos los plans con status CURRENT
    const plans: any[] = (binder.plans ?? []).filter((p: any) => p.status === 'CURRENT');
    const dates = plans
        .map((p: any) => p.days)
        .filter(Boolean)
        .map((d: any) => ({
            from: parseNaranjaDate(d.dateFrom),
            to: parseNaranjaDate(d.dateTo),
            days: d.weekdaysApplied as number[] ?? [],
        }));

    const validFrom = dates.length
        ? dates.reduce((min, d) => d.from < min ? d.from : min, dates[0].from)
        : today();
    const validUntil = dates.length
        ? dates.reduce((max, d) => d.to > max ? d.to : max, dates[0].to)
        : defaultValidUntil();

    // Días de la semana: tomar la intersección más común
    // Si todos los planes aplican todos los días → vacío
    const allDays = dates.flatMap(d => d.days);
    const daySet = [...new Set(allDays)].sort();
    const daysOfWeek = daySet.length === 7 || daySet.length === 0 ? [] : daySet;

    return {
        bank: BANK,
        title: `${store} — ${title}`.slice(0, 200),
        description: `${title} en ${store}`.slice(0, 500),
        discount_pct: discount,
        max_discount: maxDiscount,
        category,
        store: store.slice(0, 100),
        valid_from: validFrom,
        valid_until: validUntil,
        days_of_week: daysOfWeek,
        is_active: true,
    };
}

// Parsea "01/04/2026" → "2026-04-01"
function parseNaranjaDate(raw: string): string {
    if (!raw) return today();
    const parts = raw.split('/');
    if (parts.length !== 3) return today();
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
}

function defaultValidUntil(): string {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    d.setDate(new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate());
    return d.toISOString().split('T')[0];
}

// Mapear category key de Naranja → nuestro enum
function mapNaranjaCategory(key: string): ScrapedPromo['category'] {
    const map: Record<string, ScrapedPromo['category']> = {
        SUPERMERCADOS: 'supermercado',
        GASTRONOMIA: 'gastronomia',
        SALUD_Y_BIENESTAR: 'farmacia',
        TRANSPORTES: 'transporte',
        VIAJES_Y_TURISMO: 'transporte',
        MODA_Y_ACCESORIOS: 'indumentaria',
        ELECTRO_Y_TECNOLOGIA: 'electronica',
        COMBUSTIBLE: 'transporte',
        ALIMENTOS: 'supermercado',
    };
    return map[key] ?? 'otros';
}

// Promos destacadas (no requieren cookie)
async function scrapeFeatured(): Promise<ScrapedPromo[]> {
    try {
        const axios = (await import('axios')).default;
        const { data } = await axios.get(
            'https://bkn-promotions.naranjax.com/bff-promotions-web/api/aspects/featured',
            {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'application/json',
                    'Referer': 'https://fintech-benefits-shell.naranjax.com/',
                    'Origin': 'https://fintech-benefits-shell.naranjax.com',
                },
                timeout: 10_000,
            },
        );

        const items: any[] = Array.isArray(data) ? data : [];
        return items
            .filter(i => i.title && i.commerceNameOrCategory)
            .map(i => ({
                bank: BANK,
                title: `${i.commerceNameOrCategory} — ${i.title}`.slice(0, 200),
                description: [i.title, i.clarification, i.validity].filter(Boolean).join(' · ').slice(0, 500),
                discount_pct: parseDiscount(i.title) || 10,
                max_discount: i.clarification ? parseMaxDiscount(i.clarification) : null,
                category: detectCategory(`${i.title} ${i.commerceNameOrCategory}`),
                store: String(i.commerceNameOrCategory).slice(0, 100),
                valid_from: i.dateFrom ? i.dateFrom.split('T')[0] : today(),
                valid_until: i.dateTo ? i.dateTo.split('T')[0] : defaultValidUntil(),
                days_of_week: parseDaysValidity(i.validity ?? ''),
                is_active: true,
            } as ScrapedPromo));
    } catch (err: any) {
        console.error(`[${BANK}] Error featured: ${err.message}`);
        return [];
    }
}

function parseDaysValidity(text: string): number[] {
    if (!text || /todos los días|siempre/i.test(text)) return [];
    const map: Record<string, number> = {
        lunes: 1, martes: 2, miércoles: 3, miercoles: 3,
        jueves: 4, viernes: 5, sábado: 6, sabado: 6, domingo: 7,
    };
    const days: number[] = [];
    for (const [k, v] of Object.entries(map)) {
        if (text.toLowerCase().includes(k)) days.push(v);
    }
    return [...new Set(days)].sort();
}

if (require.main === module) {
    scrapeNaranjaX()
        .then(p => savePromos(p, BANK))
        .catch(console.error);
}