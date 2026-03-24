import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

export interface ComboResult {
  bank: string;
  discount_pct: number;
  ahorro: number;
  total_final: number;
  promo_title: string;
  promo_desc: string;
  valid_until: string;
  days_of_week: number[];
  max_discount: number;
}

@Injectable()
export class BankComboService {
  constructor(private readonly supabase: SupabaseService) {}

  async calcularMejorCombo(store: string, monto: number, categoria?: string): Promise<ComboResult[]> {
    const today = new Date();
    // ISO day: 0=Sun → 7, 1=Mon → 1
    const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay();
    const todayStr = today.toISOString().split('T')[0];

    let query = this.supabase.client
      .from('promotions')
      .select('*')
      .eq('is_active', true)
      .lte('valid_from', todayStr)
      .gte('valid_until', todayStr);

    if (store) query = query.ilike('store', `%${store}%`);
    if (categoria && categoria !== 'todos') query = query.eq('category', categoria);

    const { data, error } = await query;
    if (error) throw error;

    return (data ?? [])
      .filter(
        (p: any) => !p.days_of_week?.length || p.days_of_week.includes(dayOfWeek),
      )
      .map((p: any): ComboResult => {
        const rawAhorro = monto * ((p.discount_pct ?? 0) / 100);
        const ahorro = p.max_discount ? Math.min(rawAhorro, p.max_discount) : rawAhorro;
        return {
          bank: p.bank,
          discount_pct: p.discount_pct ?? 0,
          ahorro: Math.round(ahorro * 100) / 100,
          total_final: Math.round((monto - ahorro) * 100) / 100,
          promo_title: p.title,
          promo_desc: p.description,
          valid_until: p.valid_until,
          days_of_week: p.days_of_week ?? [],
          max_discount: p.max_discount ?? 0,
        };
      })
      .sort((a, b) => b.ahorro - a.ahorro);
  }
}