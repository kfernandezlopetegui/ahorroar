import { Controller, Get, Query } from '@nestjs/common';
import { BankComboService } from './bank-combo.service';

@Controller('bank-combo')
export class BankComboController {
  constructor(private svc: BankComboService) {}

  @Get()
  calcular(
    @Query('store') store: string,
    @Query('monto') monto: string,
    @Query('categoria') categoria?: string,
  ) {
    return this.svc.calcularMejorCombo(store ?? '', parseFloat(monto) || 0, categoria);
  }
}