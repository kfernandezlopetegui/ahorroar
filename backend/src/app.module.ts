import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PreciosClarosModule } from './precios-claros/precios-claros.module';

@Module({
  imports: [PreciosClarosModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
