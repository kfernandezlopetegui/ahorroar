import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

export interface FindAllParams {
  category?:  string;
  bank?:      string;
  page:       number;
  limit:      number;
  userBanks:  string[];
}

@Injectable()
export class PromotionsService {
  constructor(private readonly supabase: SupabaseService) {}

  async findAll({ category, bank, page, limit, userBanks }: FindAllParams) {
    const today = new Date().toISOString().split('T')[0];
    const from  = page * limit;
    const to    = from + limit - 1;

    let query = this.supabase.client
      .from('promotions')
      .select('*', { count: 'exact' })
      .eq('is_active', true)
      .lte('valid_from', today)
      .gte('valid_until', today);

    // Filtro de categoría — validar contra lista conocida
    const validCategories = [
      'supermercado','farmacia','transporte','indumentaria',
      'electronica','gastronomia','otros',
    ];
    if (category && validCategories.includes(category)) {
      query = query.eq('category', category);
    }

    if (bank) {
      query = query.ilike('bank', `%${bank}%`);
    }

    // Si hay tarjetas del usuario: primero sus bancos, después el resto
    if (userBanks.length > 0) {
      // Traer todo paginado con orden: tarjetas propias primero, luego por descuento
      const { data, error, count } = await query
        .order('discount_pct', { ascending: false })
        .range(from, to);

      if (error) throw error;

      const items = data ?? [];
      const sorted = [
        ...items.filter(p => userBanks.some(b =>
          p.bank?.toLowerCase().includes(b.toLowerCase())
        )),
        ...items.filter(p => !userBanks.some(b =>
          p.bank?.toLowerCase().includes(b.toLowerCase())
        )),
      ];

      return {
        data:       sorted,
        total:      count ?? 0,
        page,
        limit,
        hasMore:    (count ?? 0) > to + 1,
      };
    }

    const { data, error, count } = await query
      .order('discount_pct', { ascending: false })
      .range(from, to);

    if (error) throw error;

    return {
      data:    data ?? [],
      total:   count ?? 0,
      page,
      limit,
      hasMore: (count ?? 0) > to + 1,
    };
  }

  async findOne(id: string) {
    const { data, error } = await this.supabase.client
      .from('promotions')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) throw new NotFoundException('Promoción no encontrada');
    return data;
  }
}