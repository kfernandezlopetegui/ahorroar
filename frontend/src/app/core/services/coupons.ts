import { Injectable, signal } from '@angular/core';
import { SupabaseService } from './supabase';
import { AuthService } from './auth';

export interface Coupon {
  id: string;
  user_id: string | null;
  title: string;
  code: string;
  store: string;
  category: string;
  discount_pct: number | null;
  valid_until: string;
  is_community: boolean;
  upvotes: number;
  created_at: string;
}

export const COUPON_CATEGORIES = [
  { value: 'todos',        label: 'Todos' },
  { value: 'supermercado', label: 'Supermercado' },
  { value: 'farmacia',     label: 'Farmacia' },
  { value: 'indumentaria', label: 'Indumentaria' },
  { value: 'electronica',  label: 'Electrónica' },
  { value: 'gastronomia',  label: 'Gastronomía' },
  { value: 'otros',        label: 'Otros' },
];

@Injectable({ providedIn: 'root' })
export class CouponsService {
  coupons = signal<Coupon[]>([]);
  loading = signal(false);
  error = signal('');

  constructor(
    private supabase: SupabaseService,
    private auth: AuthService
  ) {}

  async loadAll(category?: string) {
    this.loading.set(true);
    this.error.set('');
    try {
      let query = this.supabase.client
        .from('coupons')
        .select('*')
        .eq('is_community', true)
        .gte('valid_until', new Date().toISOString().split('T')[0])
        .order('upvotes', { ascending: false });

      if (category && category !== 'todos') {
        query = query.eq('category', category);
      }

      const { data, error } = await query;
      if (error) throw error;
      this.coupons.set(data ?? []);
    } catch {
      this.error.set('No se pudieron cargar los cupones.');
    } finally {
      this.loading.set(false);
    }
  }

  async addCoupon(coupon: Omit<Coupon, 'id' | 'user_id' | 'upvotes' | 'created_at' | 'is_community'>) {
    const user = this.auth.currentUser();
    const { error } = await this.supabase.client
      .from('coupons')
      .insert({
        ...coupon,
        user_id: user?.id ?? null,
        is_community: true,
        upvotes: 0,
      });
    if (error) throw error;
    await this.loadAll();
  }

  async upvote(id: string) {
  if (this.hasUpvoted(id)) return;
  const { error } = await this.supabase.client.rpc('increment_upvotes', { coupon_id: id });
  if (error) throw error;
  this.markAsUpvoted(id);
  this.coupons.update(list =>
    list.map(c => c.id === id ? { ...c, upvotes: c.upvotes + 1 } : c)
  );
}

  isExpiringSoon(validUntil: string): boolean {
    const diff = new Date(validUntil).getTime() - Date.now();
    return diff > 0 && diff < 1000 * 60 * 60 * 24 * 3; // menos de 3 días
  }

  daysUntilExpiry(validUntil: string): number {
    return Math.ceil((new Date(validUntil).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  }

  hasUpvoted(id: string): boolean {
  const voted = JSON.parse(localStorage.getItem('upvoted_coupons') ?? '[]');
  return voted.includes(id);
}

private markAsUpvoted(id: string) {
  const voted = JSON.parse(localStorage.getItem('upvoted_coupons') ?? '[]');
  voted.push(id);
  localStorage.setItem('upvoted_coupons', JSON.stringify(voted));
}
}