import { Module } from '@nestjs/common';
import { BankComboService } from './bank-combo.service';
import { BankComboController } from './bank-combo.controller';

@Module({
  providers: [BankComboService],
  controllers: [BankComboController],
})
export class BankComboModule {}