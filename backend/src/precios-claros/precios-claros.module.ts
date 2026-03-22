import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PreciosClarosService } from './precios-claros.service';
import { PreciosClarosController } from './precios-claros.controller';

@Module({
  imports: [HttpModule],
  controllers: [PreciosClarosController],
  providers: [PreciosClarosService],
})
export class PreciosClarosModule { }