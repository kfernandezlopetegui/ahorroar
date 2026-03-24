import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { JwtGuard } from '../auth/jwt.guard';

@Module({
  providers: [NotificationsService, JwtGuard],
  controllers: [NotificationsController],
  exports: [NotificationsService],
})
export class NotificationsModule {}