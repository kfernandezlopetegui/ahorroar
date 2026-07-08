import {
  Controller, Get, Post, Delete, Param, Body, Query, Req, UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { BasketService } from './basket.service';

@Controller('basket')
@UseGuards(JwtGuard)
export class BasketController {
  constructor(private svc: BasketService) {}

  @Get()
  getAll(@Req() req: any) {
    return this.svc.getByUser(req.user.id);
  }

  @Get('evaluation')
  evaluate(@Req() req: any, @Query('meses') meses?: string) {
    const m = meses ? parseInt(meses) : 3;
    if (isNaN(m) || m < 1 || m > 24) {
      throw new BadRequestException('meses debe estar entre 1 y 24');
    }
    return this.svc.evaluate(req.user.id, m);
  }

  @Post()
  upsert(
    @Req() req: any,
    @Body() dto: { ean: string; producto_nombre: string; cantidad?: number },
  ) {
    if (!dto?.ean || !dto?.producto_nombre) {
      throw new BadRequestException('ean y producto_nombre son requeridos');
    }
    return this.svc.upsert(req.user.id, dto);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.svc.remove(req.user.id, id);
  }
}
