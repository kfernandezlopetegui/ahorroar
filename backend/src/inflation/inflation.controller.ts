import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { InflationService } from './inflation.service';

@Controller('inflation')
export class InflationController {
  constructor(private svc: InflationService) {}

  @Get('ipc')
  getIpc(@Query('meses') meses?: string) {
    return this.svc.getIpc(meses ? parseInt(meses) : 12);
  }

  @Get('personal')
  @UseGuards(JwtGuard)
  getPersonal(@Req() req: any, @Query('meses') meses?: string) {
    return this.svc.getPersonal(req.user.id, meses ? parseInt(meses) : 6);
  }
}
