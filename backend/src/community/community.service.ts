import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateReportDto } from './dto/create-report.dto';
import axios from 'axios';

export { CreateReportDto };

const PC_CDN = 'https://d3e6htiiul5ek9.cloudfront.net/prod';
const PC_HEADERS = {
  'User-Agent': 'Mozilla/5.0',
  Accept: 'application/json',
  Referer: 'https://www.preciosclaros.gob.ar/',
  Origin: 'https://www.preciosclaros.gob.ar',
};

const BADGES = [
  { threshold: 1,  badge: 'colaborador' },
  { threshold: 5,  badge: 'informante'  },
  { threshold: 20, badge: 'experto'     },
  { threshold: 50, badge: 'maestro'     },
];

@Injectable()
export class CommunityService {
  private readonly logger = new Logger(CommunityService.name);

  constructor(private readonly supabase: SupabaseService) {}

  async getReports(ean?: string, limit = 20) {
    let query = this.supabase.client
      .from('price_reports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (ean) query = query.eq('ean', ean);
    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  }

  async createReport(userId: string, dto: CreateReportDto) {
    const { data, error } = await this.supabase.client
      .from('price_reports')
      .insert({ user_id: userId, ...dto })
      .select()
      .single();
    if (error) {
      this.logger.error('createReport error', error);
      throw error;
    }
    await this.awardPoints(userId, 10, 'report');
    return data;
  }

  async upvoteReport(userId: string, reportId: string) {
    const { error } = await this.supabase.client.rpc('increment_report_upvotes', {
      report_id: reportId,
    });
    if (error) throw error;

    const { data: report } = await this.supabase.client
      .from('price_reports')
      .select('user_id')
      .eq('id', reportId)
      .single();

    if (report?.user_id && report.user_id !== userId) {
      await this.awardPoints(report.user_id, 5, 'upvote');
    }
    return { ok: true };
  }

  async getLeaderboard(limit = 10) {
    const { data, error } = await this.supabase.client
      .from('user_points')
      .select('user_id, points, reports_count')
      .order('points', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  }

  async getUserStats(userId: string) {
    const { data: pts } = await this.supabase.client
      .from('user_points')
      .select('*')
      .eq('user_id', userId)
      .single();

    const { data: badges } = await this.supabase.client
      .from('user_badges')
      .select('badge, earned_at')
      .eq('user_id', userId);

    return {
      points: pts ?? { points: 0, reports_count: 0 },
      badges: badges ?? [],
    };
  }

  
  async lookupProduct(ean: string) {
    try {
      const { data } = await axios.get(`${PC_CDN}/productos`, {
        headers: PC_HEADERS,
        params: { string: ean, lat: -34.6037, lng: -58.3816, limit: 5, offset: 0 },
        timeout: 6000,
      });
      const productos: any[] = data?.productos ?? [];
      
      const product = productos.find((p: any) => p.id === ean) ?? productos[0] ?? null;
      if (!product) return null;
      return {
        ean:          product.id,
        nombre:       product.nombre,
        marca:        product.marca,
        presentacion: product.presentacion,
        imagen:       `https://imagenes.preciosclaros.gob.ar/imagenes/productos/${product.id}.png`,
      };
    } catch (e: any) {
      this.logger.warn(`lookupProduct ${ean}: ${e.message}`);
      return null;
    }
  }

  
  async searchBranches(query: string) {
    if (!query || query.trim().length < 2) return [];
    try {
      const { data } = await axios.get(`${PC_CDN}/sucursales`, {
        headers: PC_HEADERS,
        params: {
          lat: -34.6037, lng: -58.3816,
          limit: 10, offset: 0,
          
        },
        timeout: 6000,
      });
      const q = query.toLowerCase();
      return ((data?.sucursales ?? []) as any[])
        .filter((s: any) =>
          s.sucursalNombre?.toLowerCase().includes(q) ||
          s.banderaDescripcion?.toLowerCase().includes(q) ||
          s.direccion?.toLowerCase().includes(q) ||
          s.id?.toString().includes(q),
        )
        .slice(0, 8)
        .map((s: any) => ({
          id:      s.id,
          nombre:  s.sucursalNombre,
          cadena:  s.banderaDescripcion,
          direccion: `${s.direccion}, ${s.localidad}`,
        }));
    } catch (e: any) {
      this.logger.warn(`searchBranches "${query}": ${e.message}`);
      return [];
    }
  }

  private async awardPoints(userId: string, pts: number, reason: string) {
    const { data: existing } = await this.supabase.client
      .from('user_points')
      .select('points, reports_count')
      .eq('user_id', userId)
      .single();

    const newPoints  = (existing?.points ?? 0) + pts;
    const newReports = reason === 'report'
      ? (existing?.reports_count ?? 0) + 1
      : (existing?.reports_count ?? 0);

    await this.supabase.client.from('user_points').upsert({
      user_id: userId,
      points: newPoints,
      reports_count: newReports,
      updated_at: new Date().toISOString(),
    });

    if (reason === 'report') {
      for (const { threshold, badge } of BADGES) {
        if (newReports === threshold) {
          await this.supabase.client
            .from('user_badges')
            .upsert({ user_id: userId, badge }, { onConflict: 'user_id,badge' });
        }
      }
    }
  }
}