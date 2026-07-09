import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtGuard } from './jwt.guard';
import { isAdminUser } from './admin.guard';

@Controller('auth')
export class AuthController {
  @Get('me')
  @UseGuards(JwtGuard)
  me(@Req() req: any) {
    return {
      id: req.user.id,
      email: req.user.email,
      isAdmin: isAdminUser(req.user),
    };
  }
}
