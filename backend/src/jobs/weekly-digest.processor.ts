import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';
import { SupabaseService } from '../supabase/supabase.service';

@Processor('weekly-digest')
export class WeeklyDigestProcessor extends WorkerHost {
  private readonly logger = new Logger(WeeklyDigestProcessor.name);

  constructor(
    private readonly notifs: NotificationsService,
    private readonly supabase: SupabaseService,
  ) {
    super();
  }

  async process(_job: Job) {
    this.logger.log('Processing weekly digest...');

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: history } = await this.supabase.client
      .from('price_history')
      .select('ean, producto_nombre, precio_lista, captured_at')
      .gte('captured_at', sevenDaysAgo.toISOString())
      .order('captured_at', { ascending: true });

    if (!history?.length) return;

    // Calcular bajadas por producto
    const map = new Map<string, { min: number; max: number; nombre: string }>();
    for (const row of history) {
      const e = map.get(row.ean);
      if (!e) {
        map.set(row.ean, { min: row.precio_lista, max: row.precio_lista, nombre: row.producto_nombre });
      } else {
        e.min = Math.min(e.min, row.precio_lista);
        e.max = Math.max(e.max, row.precio_lista);
      }
    }

    const drops = Array.from(map.entries())
      .map(([, { min, max, nombre }]) => ({
        nombre,
        drop_pct: max > 0 ? Math.round(((max - min) / max) * 100) : 0,
      }))
      .filter(d => d.drop_pct >= 5)
      .sort((a, b) => b.drop_pct - a.drop_pct)
      .slice(0, 3);

    if (!drops.length) return;

    const { data: tokens } = await this.supabase.client.from('fcm_tokens').select('token');
    if (!tokens?.length) return;

    const top = drops[0];
    await this.notifs.sendMulticast(
      tokens.map(t => t.token),
      '📊 Resumen semanal de AhorroAR',
      `${top.nombre} bajó ${top.drop_pct}% esta semana. ${drops.length} bajadas destacadas.`,
    );
  }
}