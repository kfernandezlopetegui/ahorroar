import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateReportDto } from './dto/create-report.dto';

export { CreateReportDto };   // re-export para no romper otros imports si los hay

const BADGES = [
  { threshold: 1,  badge: 'colaborador' },
  { threshold: 5,  badge: 'informante'  },
  { threshold: 20, badge: 'experto'     },
  { threshold: 50, badge: 'maestro'     },
];

@Injectable()
export class CommunityService {
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
    if (error) throw error;
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