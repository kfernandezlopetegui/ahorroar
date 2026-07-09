import { Module } from '@nestjs/common';
import { MeatCutsController } from './meat-cuts.controller';
import { MeatCutsService } from './meat-cuts.service';

@Module({
  controllers: [MeatCutsController],
  providers: [MeatCutsService],
  exports: [MeatCutsService],
})
export class MeatCutsModule {}
