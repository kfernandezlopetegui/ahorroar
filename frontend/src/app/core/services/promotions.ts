import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SupabaseService } from './supabase';

export interface Promotion {
  id: string;
  bank: string;
  title: string;
  description: string;
  discount_pct: number;
  max_discount: number | null;
  category: string;
  store: string;
  valid_from: string;
  valid_until: string;
  days_of_week: number[];
  is_active: boolean;
  scraped_at: string;
}

export const CATEGORIES = [
  { value: 'todos',        label: 'Todos'         },
  { value: 'supermercado', label: 'Supermercado'  },
  { value: 'farmacia',     label: 'Farmacia'      },
  { value: 'transporte',   label: 'Transporte'    },
  { value: 'indumentaria', label: 'Indumentaria'  },
  { value: 'electronica',  label: 'Electrónica'   },
  { value: 'gastronomia',  label: 'Gastronomía'   },
  { value: 'otros',        label: 'Otros'         },
];

const BASE  = `${environment.apiUrl}/promotions`;
const LIMIT = 20;

@Injectable({ providedIn: 'root' })
export class PromotionsService {
  promotions = signal<Promotion[]>([]);
  loading    = signal(false);
  loadingMore= signal(false);
  error      = signal('');
  hasMore    = signal(false);

  private currentPage     = 0;
  private currentCategory = 'todos';
  private currentBank     = '';
  private userBanks: string[] = [];

  constructor(
    private readonly http: HttpClient,
    private readonly supabase: SupabaseService,
  ) {}

  setUserBanks(banks: string[]) {
    this.userBanks = banks;
  }

  async loadAll(category = 'todos', bank = '') {
    this.currentPage     = 0;
    this.currentCategory = category;
    this.currentBank     = bank;
    this.promotions.set([]);
    this.loading.set(true);
    this.error.set('');
    try {
      const res = await this.fetch(0);
      this.promotions.set(res.data);
      this.hasMore.set(res.hasMore);
    } catch {
      this.error.set('No se pudieron cargar las promociones.');
    } finally {
      this.loading.set(false);
    }
  }

  async loadMore() {
    if (!this.hasMore() || this.loadingMore()) return;
    this.loadingMore.set(true);
    try {
      this.currentPage++;
      const res = await this.fetch(this.currentPage);
      this.promotions.update(prev => [...prev, ...res.data]);
      this.hasMore.set(res.hasMore);
    } catch {
      this.currentPage--;
    } finally {
      this.loadingMore.set(false);
    }
  }

  async loadByUserCards(userBanks: string[]) {
    this.userBanks = userBanks;
    return this.loadAll('todos');
  }

  async getDetail(id: string): Promise<Promotion> {
    return firstValueFrom(this.http.get<Promotion>(`${BASE}/${id}`));
  }

  private async fetch(page: number) {
    const params: Record<string, string> = { page: String(page), limit: String(LIMIT) };
    if (this.currentCategory && this.currentCategory !== 'todos') {
      params['category'] = this.currentCategory;
    }
    if (this.currentBank) params['bank'] = this.currentBank;
    if (this.userBanks.length) params['banks'] = this.userBanks.join(',');

    return firstValueFrom(
      this.http.get<{ data: Promotion[]; total: number; hasMore: boolean }>(BASE, { params }),
    );
  }
}