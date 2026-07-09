import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AdminScrapersController } from './admin-scrapers.controller';
import { AdminScrapersService } from './admin-scrapers.service';
import { AdminScrapersScheduler } from './admin-scrapers.scheduler';

/**
 * Monitor + orquestación de scrapers.
 *
 * La conexión a Redis (BullModule.forRootAsync) y ScheduleModule.forRoot()
 * los registra JobsModule de forma global; acá sólo registramos la cola
 * `scrapers`, el scheduler y los endpoints. El worker que procesa la cola
 * vive en el servicio de scrapers, no acá.
 */
@Module({
  imports: [BullModule.registerQueue({ name: 'scrapers' })],
  controllers: [AdminScrapersController],
  providers: [AdminScrapersService, AdminScrapersScheduler],
})
export class AdminScrapersModule {}
