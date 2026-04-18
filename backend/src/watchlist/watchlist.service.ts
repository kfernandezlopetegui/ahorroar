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
    const payload: Record<string, any> = {
      user_id:         userId,
      ean:             dto.ean,
      producto_nombre: dto.producto_nombre,
      activa:          true,
    };

    if (dto.discount_threshold != null) {
      payload['discount_threshold'] = dto.discount_threshold;
    }
    if (dto.precio_objetivo != null) {
      payload['precio_objetivo'] = dto.precio_objetivo;
    }

    const { data, error } = await this.supabase.client
      .from('watchlist')
      .upsert(payload, { onConflict: 'user_id,ean' })
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

  async getAllActive() {
    const { data, error } = await this.supabase.client
      .from('watchlist')
      .select('*')
      .eq('activa', true);
    if (error) throw error;
    return data ?? [];
  }
}