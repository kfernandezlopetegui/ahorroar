import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateWatchlistDto } from './dto/create-watchlist.dto';

@Injectable()
export class WatchlistService {
  constructor(private readonly supabase: SupabaseService) {}

  async getByUser(userId: string) {
    const { data, error } = await this.supabase.client
      .from('watchlist')
      .select('*')
      .eq('user_id', userId)
      .eq('activa', true)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  async upsert(userId: string, dto: CreateWatchlistDto) {
    const { data, error } = await this.supabase.client
      .from('watchlist')
      .upsert(
        { user_id: userId, ...dto, activa: true },
        { onConflict: 'user_id,ean' },
      )
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async remove(userId: string, id: string) {
    const { error } = await this.supabase.client
      .from('watchlist')
      .update({ activa: false })
      .eq('id', id)
      .eq('user_id', userId);
    if (error) throw error;
    return { ok: true };
  }

  // usado por jobs internos
  async getAllActive() {
    const { data, error } = await this.supabase.client
      .from('watchlist')
      .select('*')
      .eq('activa', true);
    if (error) throw error;
    return data ?? [];
  }
}