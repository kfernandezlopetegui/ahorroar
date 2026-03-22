import { Injectable, signal } from '@angular/core';
import { SupabaseService } from './supabase';

export interface Promotion {
  id: string;
  bank: string;
  title: string;
  description: string;
  discount_pct: number;
  max_discount: number;
  category: string;
  store: string;
  valid_from: string;
  valid_until: string;
  days_of_week: number[];
  is_active: boolean;
  scraped_at: string;
}

export const CATEGORIES = [
  { value: 'todos',         label: 'Todos' },
  { value: 'supermercado',  label: 'Supermercado' },
  { value: 'farmacia',      label: 'Farmacia' },
  { value: 'transporte',    label: 'Transporte' },
  { value: 'indumentaria',  label: 'Indumentaria' },
  { value: 'electronica',   label: 'Electrónica' },
  { value: 'gastronomia',   label: 'Gastronomía' },
];

@Injectable({ providedIn: 'root' })
export class PromotionsService {
  promotions = signal<Promotion[]>([]);
  loading = signal(false);
  error = signal('');

  constructor(private supabase: SupabaseService) {}

  async loadAll(category?: string, bank?: string) {
    this.loading.set(true);
    this.error.set('');
    try {
      let query = this.supabase.client
        .from('promotions')
        .select('*')
        .eq('is_active', true)
        .order('discount_pct', { ascending: false });

      if (category && category !== 'todos') {
        query = query.eq('category', category);
      }
      if (bank) {
        query = query.eq('bank', bank);
      }

      const { data, error } = await query;
      if (error) throw error;
      this.promotions.set(data ?? []);
    } catch {
      this.error.set('No se pudieron cargar las promociones.');
    } finally {
      this.loading.set(false);
    }
  }

  async loadByUserCards(userBanks: string[]) {
  if (!userBanks.length) return this.loadAll();
  this.loading.set(true);
  try {
    const { data, error } = await this.supabase.client
      .from('promotions')
      .select('*')
      .eq('is_active', true)
      .order('discount_pct', { ascending: false });

    if (error) throw error;

    // Primero las que coinciden con las tarjetas del usuario, después el resto
    const mine = (data ?? []).filter(p => userBanks.includes(p.bank));
    const others = (data ?? []).filter(p => !userBanks.includes(p.bank));
    this.promotions.set([...mine, ...others]);

  } finally {
    this.loading.set(false);
  }
}
}