import { Module } from '@nestjs/common';
import { ScraperMonitorService } from './scraper-monitor.service';
import { ScraperMonitorController } from './scraper-monitor.controller';

@Module({
  controllers: [ScraperMonitorController],
  providers: [ScraperMonitorService],
})
export class ScraperMonitorModule {}
