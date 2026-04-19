import { Controller, Get, Param, Query } from '@nestjs/common';
import { PromotionsService } from './promotions.service';

@Controller('promotions')
export class PromotionsController {
  constructor(private readonly svc: PromotionsService) {}

  @Get()
  findAll(
    @Query('category') category?: string,
    @Query('bank')     bank?: string,
    @Query('page')     page = '0',
    @Query('limit')    limit = '20',
    @Query('banks')    banks?: string, // "Galicia,BBVA" — tarjetas del usuario
  ) {
    return this.svc.findAll({
      category,
      bank,
      page:       parseInt(page),
      limit:      parseInt(limit),
      userBanks:  banks ? banks.split(',').map(b => b.trim()) : [],
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }
}