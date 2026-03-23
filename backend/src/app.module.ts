import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SupabaseModule } from './supabase/supabase.module';
import { PreciosClarosModule } from './precios-claros/precios-claros.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    SupabaseModule,
    PreciosClarosModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}