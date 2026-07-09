import { Controller, Get, Param, Query } from '@nestjs/common';
import { MeatCutsService } from './meat-cuts.service';

// Público, igual que el resto del comparador
@Controller('meat-cuts')
export class MeatCutsController {
  constructor(private svc: MeatCutsService) {}

  @Get()
  findAll() {
    return this.svc.findAll();
  }

  @Get(':slug/prices')
  findPrices(@Param('slug') slug: string, @Query('hours') hours?: string) {
    return this.svc.findPricesBySlug(slug, hours ? parseInt(hours) : undefined);
  }
}
