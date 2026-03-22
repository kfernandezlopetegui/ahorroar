import { Injectable, signal } from '@angular/core';
import { SupabaseService } from './supabase';
import { AuthService } from './auth';

export interface UserCard {
  id: string;
  user_id: string;
  bank: string;
  card_type: string;
  card_name: string;
}

export const BANKS = [
  { bank: 'Galicia',     cards: ['Galicia Black', 'Galicia Visa', 'Galicia Mastercard'] },
  { bank: 'Naranja X',   cards: ['Naranja X Visa', 'Naranja X Mastercard'] },
  { bank: 'BBVA',        cards: ['BBVA Visa', 'BBVA Mastercard'] },
  { bank: 'Santander',   cards: ['Santander Visa', 'Santander American Express'] },
  { bank: 'HSBC',        cards: ['HSBC Visa', 'HSBC Mastercard'] },
  { bank: 'Macro',       cards: ['Macro Visa', 'Macro Mastercard'] },
  { bank: 'Supervielle', cards: ['Supervielle Visa', 'Supervielle Mastercard'] },
];

@Injectable({ providedIn: 'root' })
export class CardsService {
  userCards = signal<UserCard[]>([]);
  loading = signal(false);

  constructor(
    private supabase: SupabaseService,
    private auth: AuthService
  ) {}

  async loadCards() {
    const user = this.auth.currentUser();
    if (!user) return;
    this.loading.set(true);
    try {
      const { data, error } = await this.supabase.client
        .from('user_cards')
        .select('*')
        .eq('user_id', user.id);
      if (error) throw error;
      this.userCards.set(data ?? []);
    } finally {
      this.loading.set(false);
    }
  }

  async addCard(bank: string, cardName: string) {
    const user = this.auth.currentUser();
    if (!user) return;
    const { error } = await this.supabase.client
      .from('user_cards')
      .insert({ user_id: user.id, bank, card_name: cardName, card_type: 'credit' });
    if (error) throw error;
    await this.loadCards();
  }

  async removeCard(id: string) {
    const { error } = await this.supabase.client
      .from('user_cards')
      .delete()
      .eq('id', id);
    if (error) throw error;
    this.userCards.update(cards => cards.filter(c => c.id !== id));
  }

  getBankNames(): string[] {
    return this.userCards().map(c => c.bank);
  }
}