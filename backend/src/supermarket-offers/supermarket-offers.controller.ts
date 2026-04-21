import { Controller, Get, Param, Query } from '@nestjs/common';
import { SupermarketOffersService } from './supermarket-offers.service';

@Controller('supermarket-offers')
export class SupermarketOffersController {
  constructor(private readonly svc: SupermarketOffersService) {}

  @Get()
  findAll(
    @Query('chain')       chain?:       string,
    @Query('category')    category?:    string,
    @Query('minDiscount') minDiscount?: string,
    @Query('page')        page  = '0',
    @Query('limit')       limit = '30',
  ) {
    return this.svc.findAll({
      chain,
      category,
      minDiscount: minDiscount ? parseInt(minDiscount) : undefined,
      page:  parseInt(page),
      limit: parseInt(limit),
    });
  }

  /** Usado internamente por el comparador al buscar EAN */
  @Get('ean/:ean')
  findByEan(@Param('ean') ean: string) {
    return this.svc.findByEan(ean);
  }

  /** Búsqueda por nombre (cuando no hay EAN) */
  @Get('search')
  findByName(
    @Query('q')     q:     string,
    @Query('limit') limit = '10',
  ) {
    return this.svc.findByName(q ?? '', parseInt(limit));
  }

  /** Resumen de cadenas con cantidad de ofertas activas */
  @Get('chains')
  getChains() {
    return this.svc.getChainsSummary();
  }
}