import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PreciosClarosService } from './precios-claros.service';
import { PreciosClarosController } from './precios-claros.controller';
import { EanSourcesService } from './ean-sources.service';
import { ProductImageService } from './product-image.service';
import { ProductImageController } from './product-image.controller';
import { SupermarketOffersModule } from '../supermarket-offers/supermarket-offers.module';

@Module({
  imports: [HttpModule, SupermarketOffersModule],
  controllers: [PreciosClarosController, ProductImageController],
  providers: [PreciosClarosService, EanSourcesService, ProductImageService],
  exports: [PreciosClarosService],
})
export class PreciosClarosModule {}