import { Module } from '@nestjs/common';
import { CommunityService } from './community.service';
import { CommunityController } from './community.controller';
import { JwtGuard } from '../auth/jwt.guard';

@Module({
  providers: [CommunityService, JwtGuard],
  controllers: [CommunityController],
  exports: [CommunityService],
})
export class CommunityModule {}