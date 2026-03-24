import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

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

@Injectable({ providedIn: 'root' })
export class BankComboService {
  results = signal<ComboResult[]>([]);
  loading = signal(false);
  error   = signal('');

  constructor(private readonly http: HttpClient) {}

  async calcular(store: string, monto: number, categoria?: string) {
    if (!store || monto <= 0) return;
    this.loading.set(true);
    this.error.set('');
    try {
      const params: Record<string, string> = { store, monto: String(monto) };
      if (categoria && categoria !== 'todos') params['categoria'] = categoria;
      const data = await firstValueFrom(
        this.http.get<ComboResult[]>(`${environment.apiUrl}/bank-combo`, { params }),
      );
      this.results.set(data ?? []);
    } catch {
      this.error.set('No se pudo calcular el mejor combo.');
    } finally {
      this.loading.set(false);
    }
  }

  reset() { this.results.set([]); this.error.set(''); }
}