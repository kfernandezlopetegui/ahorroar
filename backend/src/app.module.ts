import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SupabaseModule } from './supabase/supabase.module';
import { PreciosClarosModule } from './precios-claros/precios-claros.module';
import { NotificationsService } from './notifications/notifications.service';
import { NotificationsController } from './notifications/notifications.controller';
import { NotificationsModule } from './notifications/notifications.module';
import { WatchlistService } from './watchlist/watchlist.service';
import { WatchlistModule } from './watchlist/watchlist.module';
import { CommunityService } from './community/community.service';
import { CommunityModule } from './community/community.module';
import { BankComboService } from './bank-combo/bank-combo.service';
import { BankComboModule } from './bank-combo/bank-combo.module';
import { JobsModule } from './jobs/jobs.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    SupabaseModule,
    PreciosClarosModule,
    NotificationsModule,
    WatchlistModule,
    CommunityModule,
    BankComboModule,
    JobsModule,
  ],
  controllers: [AppController, NotificationsController],
  providers: [AppService, NotificationsService, WatchlistService, CommunityService, BankComboService],
})
export class AppModule {}