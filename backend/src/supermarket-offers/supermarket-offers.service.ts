import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

export interface SupermarketOfferFilters {
  chain?:     string;
  category?:  string;
  ean?:       string;
  minDiscount?: number;
  page?:      number;
  limit?:     number;
}

@Injectable()
export class SupermarketOffersService {
  private readonly logger = new Logger(SupermarketOffersService.name);

  constructor(private readonly supabase: SupabaseService) {}

  async findAll(filters: SupermarketOfferFilters = {}) {
    const {
      chain, category, ean,
      minDiscount = 5,
      page  = 0,
      limit = 30,
    } = filters;

    const today = new Date().toISOString().split('T')[0];
    const from  = page * limit;
    const to    = from + limit - 1;

    let query = this.supabase.client
      .from('supermarket_offers')
      .select('*', { count: 'exact' })
      .eq('is_active', true)
      .lte('valid_from', today)
      .gte('valid_until', today)
      .gte('discount_pct', minDiscount)
      .order('discount_pct', { ascending: false })
      .range(from, to);

    if (chain)    query = query.eq('chain', chain);
    if (category) query = query.eq('category', category);
    if (ean)      query = query.eq('ean', ean);

    const { data, error, count } = await query;
    if (error) throw error;

    return {
      data:    data ?? [],
      total:   count ?? 0,
      page,
      limit,
      hasMore: (count ?? 0) > to + 1,
    };
  }

  /**
   * Buscar ofertas por EAN — usado por el comparador para enriquecer resultados
   */
  async findByEan(ean: string) {
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await this.supabase.client
      .from('supermarket_offers')
      .select('chain, product_name, offer_price, original_price, discount_pct, offer_type, offer_description, valid_until, image_url')
      .eq('ean', ean)
      .eq('is_active', true)
      .gte('valid_until', today)
      .order('discount_pct', { ascending: false });

    if (error) throw error;
    return data ?? [];
  }

  /**
   * Buscar por nombre (full-text) — fallback cuando no hay EAN
   */
  async findByName(name: string, limit = 10) {
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await this.supabase.client
      .from('supermarket_offers')
      .select('chain, product_name, offer_price, original_price, discount_pct, offer_type, image_url, valid_until')
      .eq('is_active', true)
      .gte('valid_until', today)
      .ilike('product_name', `%${name}%`)
      .order('discount_pct', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data ?? [];
  }

  /** Resumen de cadenas disponibles con cantidad de ofertas */
  async getChainsSummary() {
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await this.supabase.client
      .from('supermarket_offers')
      .select('chain')
      .eq('is_active', true)
      .gte('valid_until', today);

    if (error) throw error;

    const counts: Record<string, number> = {};
    for (const row of data ?? []) {
      counts[row.chain] = (counts[row.chain] ?? 0) + 1;
    }

    return Object.entries(counts)
      .map(([chain, count]) => ({ chain, count }))
      .sort((a, b) => b.count - a.count);
  }
}