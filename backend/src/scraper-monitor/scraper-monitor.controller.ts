import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { ScraperMonitorService } from './scraper-monitor.service';

@Controller('scraper-monitor')
@UseGuards(JwtGuard)
export class ScraperMonitorController {
  constructor(private svc: ScraperMonitorService) {}

  @Get('status')
  getStatus() {
    return this.svc.getStatus();
  }

  @Get('history/:scraper')
  getHistory(@Param('scraper') scraper: string, @Query('limit') limit?: string) {
    return this.svc.getHistory(scraper, limit ? parseInt(limit) : 30);
  }
}
