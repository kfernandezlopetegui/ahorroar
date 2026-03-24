import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class JobsScheduler {
  private readonly logger = new Logger(JobsScheduler.name);

  constructor(
    @InjectQueue('price-check')  private priceQueue: Queue,
    @InjectQueue('weekly-digest') private digestQueue: Queue,
    @InjectQueue('coupon-alert') private couponQueue: Queue,
  ) {}

  // Todos los días a las 8am
  @Cron('0 8 * * *')
  async schedulePriceChecks() {
    this.logger.log('Enqueuing price-check job');
    await this.priceQueue.add('check-all', {}, { removeOnComplete: true });
  }

  // Lunes a las 9am
  @Cron('0 9 * * 1')
  async scheduleWeeklyDigest() {
    this.logger.log('Enqueuing weekly-digest job');
    await this.digestQueue.add('send-digest', {}, { removeOnComplete: true });
  }

  // Todos los días a las 10am
  @Cron('0 10 * * *')
  async scheduleCouponAlerts() {
    this.logger.log('Enqueuing coupon-alert job');
    await this.couponQueue.add('check-expiring', {}, { removeOnComplete: true });
  }
}