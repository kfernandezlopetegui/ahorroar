import { Controller, Get, Post, Delete, Param, Body, Req, UseGuards } from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { WatchlistService } from './watchlist.service';
import { CreateWatchlistDto } from './dto/create-watchlist.dto';

@Controller('watchlist')
@UseGuards(JwtGuard)
export class WatchlistController {
  constructor(private svc: WatchlistService) {}

  @Get()
  getAll(@Req() req: any) {
    return this.svc.getByUser(req.user.id);
  }

  @Post()
  upsert(@Req() req: any, @Body() dto: CreateWatchlistDto) {
    return this.svc.upsert(req.user.id, dto);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.svc.remove(req.user.id, id);
  }
}