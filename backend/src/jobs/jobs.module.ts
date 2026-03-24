import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { PriceCheckProcessor } from './price-check.processor';
import { WeeklyDigestProcessor } from './weekly-digest.processor';
import { CouponAlertProcessor } from './coupon-alert.processor';
import { JobsScheduler } from './jobs.scheduler';
import { NotificationsModule } from '../notifications/notifications.module';
import { WatchlistModule } from '../watchlist/watchlist.module';
import { PreciosClarosModule } from '../precios-claros/precios-claros.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      useFactory: () => {
        const config = {
          connection: {
            host: process.env.REDIS_HOST ?? 'localhost',
            port: parseInt(process.env.REDIS_PORT ?? '6379'),
            password: process.env.REDIS_PASSWORD || undefined,
            tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
          },
        };
        console.log(`[BullMQ] Connecting to Redis at ${config.connection.host}:${config.connection.port} (TLS: ${process.env.REDIS_TLS})`);
        return config;
      },
    }),
    BullModule.registerQueue(
      { name: 'price-check' },
      { name: 'weekly-digest' },
      { name: 'coupon-alert' },
    ),
    NotificationsModule,
    WatchlistModule,
    PreciosClarosModule,
  ],
  providers: [PriceCheckProcessor, WeeklyDigestProcessor, CouponAlertProcessor, JobsScheduler],
})
export class JobsModule { }