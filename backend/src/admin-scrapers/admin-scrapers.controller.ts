import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { AdminGuard } from '../auth/admin.guard';
import { AdminScrapersService } from './admin-scrapers.service';

/**
 * Panel interno de scrapers. Sólo administradores (JwtGuard + AdminGuard,
 * ver ADMIN_EMAILS / app_metadata.role en el backend).
 */
@Controller('admin/scrapers')
@UseGuards(JwtGuard, AdminGuard)
export class AdminScrapersController {
  constructor(private readonly svc: AdminScrapersService) {}

  /** Última corrida de cada scraper + agregados. */
  @Get('status')
  getStatus() {
    return this.svc.getStatus();
  }

  /** Historial de corridas de un scraper. */
  @Get(':name/runs')
  getRuns(@Param('name') name: string, @Query('limit') limit?: string) {
    return this.svc.getRuns(name, limit ? parseInt(limit, 10) : 20);
  }

  /** Encola una corrida manual. */
  @Post(':name/run')
  run(@Param('name') name: string) {
    return this.svc.enqueueRun(name);
  }
}
