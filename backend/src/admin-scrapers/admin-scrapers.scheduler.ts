import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  BANK_SCRAPERS,
  SUPERMARKET_SCRAPERS,
  ScraperDef,
} from './scrapers.registry';
import { JOB_OPTS } from './admin-scrapers.service';

const TZ = 'America/Argentina/Buenos_Aires';

/**
 * Orquestación: encola un job por scraper en la cola `scrapers`.
 * El worker (servicio aparte en Railway/Render) los procesa con
 * concurrencia 3 y reintentos (definidos en JOB_OPTS).
 *
 *  - Supermercados: 2 veces por día (6:00 y 15:00 ART).
 *  - Bancos:        1 vez por día (7:00 ART).
 */
@Injectable()
export class AdminScrapersScheduler {
  private readonly logger = new Logger(AdminScrapersScheduler.name);

  constructor(@InjectQueue('scrapers') private readonly queue: Queue) {}

  private async enqueue(scrapers: ScraperDef[], reason: string) {
    this.logger.log(`Encolando ${scrapers.length} scrapers (${reason})`);
    await Promise.all(
      scrapers.map((s) => this.queue.add(s.name, { scheduled: reason }, JOB_OPTS)),
    );
  }

  // Supermercados: 6:00 ART
  @Cron('0 6 * * *', { timeZone: TZ })
  async supermarketsMorning() {
    await this.enqueue(SUPERMARKET_SCRAPERS, 'supers 06:00');
  }

  // Supermercados: 15:00 ART
  @Cron('0 15 * * *', { timeZone: TZ })
  async supermarketsAfternoon() {
    await this.enqueue(SUPERMARKET_SCRAPERS, 'supers 15:00');
  }

  // Bancos: 7:00 ART
  @Cron('0 7 * * *', { timeZone: TZ })
  async banksDaily() {
    await this.enqueue(BANK_SCRAPERS, 'bancos 07:00');
  }
}
