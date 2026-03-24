import { Controller, Post, Body, Req, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtGuard)
export class NotificationsController {
  constructor(private svc: NotificationsService) {}

  @Post('token')
  saveToken(@Req() req: any, @Body() body: { token: string; platform?: string }) {
    return this.svc.saveToken(req.user.id, body.token, body.platform);
  }
}