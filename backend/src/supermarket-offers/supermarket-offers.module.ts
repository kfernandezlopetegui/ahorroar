import { Module } from '@nestjs/common';
import { SupermarketOffersService }    from './supermarket-offers.service';
import { SupermarketOffersController } from './supermarket-offers.controller';

@Module({
  providers:   [SupermarketOffersService],
  controllers: [SupermarketOffersController],
  exports:     [SupermarketOffersService],
})
export class SupermarketOffersModule {}