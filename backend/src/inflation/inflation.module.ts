import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { InflationService } from './inflation.service';
import { InflationController } from './inflation.controller';

@Module({
  imports: [HttpModule],
  controllers: [InflationController],
  providers: [InflationService],
})
export class InflationModule {}
