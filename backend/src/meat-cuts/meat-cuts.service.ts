import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

// Los cortes de carne no tienen EAN estándar: se comparan por categoría
// normalizada (meat_cut_id) a precio por kg (price_per_kg), campos que el
// pipeline de scrapers setea al guardar en supermarket_offers.

export interface MeatCutOfferRow {
  meat_cut_id: string;
  chain: string;
  product_name: string;
  offer_price: number;
  price_per_kg: number;
  scraped_at: string;
}

const DEFAULT_WINDOW_HOURS = 48;

export const MEAT_PRICE_DISCLAIMER =
  'Precios por kg estimados según publicaciones de cada cadena';

@Injectable()
export class MeatCutsService {
  constructor(private readonly supabase: SupabaseService) {}

  /** Lista de cortes con el mejor $/kg actual y la cadena que lo publica */
  async findAll() {
    const [cuts, offers] = await Promise.all([
      this.getCuts(),
      this.getRecentOffers(DEFAULT_WINDOW_HOURS),
    ]);

    const bestByCut = new Map<string, MeatCutOfferRow>();
    const chainsByCut = new Map<string, Set<string>>();
    for (const offer of offers) {
      const best = bestByCut.get(offer.meat_cut_id);
      if (!best || offer.price_per_kg < best.price_per_kg) {
        bestByCut.set(offer.meat_cut_id, offer);
      }
      if (!chainsByCut.has(offer.meat_cut_id)) chainsByCut.set(offer.meat_cut_id, new Set());
      chainsByCut.get(offer.meat_cut_id)!.add(offer.chain);
    }

    return {
      disclaimer: MEAT_PRICE_DISCLAIMER,
      window_hours: DEFAULT_WINDOW_HOURS,
      data: cuts.map(cut => {
        const best = bestByCut.get(cut.id);
        return {
          slug: cut.slug,
          display_name: cut.display_name,
          category: cut.category,
          chains_count: chainsByCut.get(cut.id)?.size ?? 0,
          best_price: best
            ? {
                chain: best.chain,
                price_per_kg: best.price_per_kg,
                product_name: best.product_name,
                scraped_at: best.scraped_at,
              }
            : null,
        };
      }),
    };
  }

  /**
   * Comparativa por cadena para un corte: mejor $/kg de cada cadena en la
   * ventana, con diferencia % contra el más barato y el nombre original
   * del producto scrapeado.
   */
  async findPricesBySlug(slug: string, hours = DEFAULT_WINDOW_HOURS) {
    const windowHours = Math.min(Math.max(hours, 24), 72);

    const cuts = await this.getCuts();
    const cut = cuts.find(c => c.slug === slug);
    if (!cut) throw new NotFoundException(`Corte desconocido: ${slug}`);

    const offers = (await this.getRecentOffers(windowHours)).filter(
      o => o.meat_cut_id === cut.id,
    );

    // Mejor precio por cadena
    const byChain = new Map<string, MeatCutOfferRow>();
    for (const offer of offers) {
      const current = byChain.get(offer.chain);
      if (!current || offer.price_per_kg < current.price_per_kg) {
        byChain.set(offer.chain, offer);
      }
    }

    const rows = [...byChain.values()].sort((a, b) => a.price_per_kg - b.price_per_kg);
    const cheapest = rows[0]?.price_per_kg ?? null;

    return {
      cut: { slug: cut.slug, display_name: cut.display_name, category: cut.category },
      disclaimer: MEAT_PRICE_DISCLAIMER,
      window_hours: windowHours,
      prices: rows.map(row => ({
        chain: row.chain,
        price_per_kg: row.price_per_kg,
        diff_pct: cheapest
          ? Math.round(((row.price_per_kg - cheapest) / cheapest) * 1000) / 10
          : 0,
        product_name: row.product_name,
        offer_price: row.offer_price,
        source: `online:${row.chain}`,
        scraped_at: row.scraped_at,
      })),
    };
  }

  private async getCuts() {
    const { data, error } = await this.supabase.client
      .from('meat_cuts')
      .select('id, slug, display_name, category')
      .order('display_name', { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  private async getRecentOffers(hours: number): Promise<MeatCutOfferRow[]> {
    const since = new Date(Date.now() - hours * 3600_000).toISOString();
    const { data, error } = await this.supabase.client
      .from('supermarket_offers')
      .select('meat_cut_id, chain, product_name, offer_price, price_per_kg, scraped_at')
      .not('meat_cut_id', 'is', null)
      .not('price_per_kg', 'is', null)
      .eq('is_active', true)
      .gte('scraped_at', since);
    if (error) throw error;
    return (data ?? []) as MeatCutOfferRow[];
  }
}
