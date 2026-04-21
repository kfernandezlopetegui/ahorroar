import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PreciosClarosService } from './precios-claros.service';
import { PreciosClarosController } from './precios-claros.controller';
import { SupermarketOffersModule } from '../supermarket-offers/supermarket-offers.module';

@Module({
  imports: [HttpModule, SupermarketOffersModule],
  controllers: [PreciosClarosController],
  providers: [PreciosClarosService],
  exports: [PreciosClarosService],
})
export class PreciosClarosModule {}