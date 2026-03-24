import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';
import { SupabaseService } from '../supabase/supabase.service';

@Processor('coupon-alert')
export class CouponAlertProcessor extends WorkerHost {
  private readonly logger = new Logger(CouponAlertProcessor.name);

  constructor(
    private readonly notifs: NotificationsService,
    private readonly supabase: SupabaseService,
  ) {
    super();
  }

  async process(_job: Job) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const { data: expiring } = await this.supabase.client
      .from('coupons')
      .select('id, title, code, store, user_id')
      .eq('valid_until', tomorrowStr)
      .not('user_id', 'is', null);

    if (!expiring?.length) return;
    this.logger.log(`Sending alerts for ${expiring.length} expiring coupons`);

    for (const coupon of expiring) {
      try {
        await this.notifs.sendToUser(
          coupon.user_id,
          '⏰ Cupón por vencer mañana',
          `Tu cupón "${coupon.code}" de ${coupon.store} vence mañana. ¡Usalo!`,
          { coupon_id: coupon.id, tipo: 'coupon_alert' },
        );
      } catch (err) {
        this.logger.error(`Coupon alert failed for ${coupon.id}:`, err);
      }
    }
  }
}