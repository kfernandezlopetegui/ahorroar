import { Module } from '@nestjs/common';
import { WatchlistService } from './watchlist.service';
import { WatchlistController } from './watchlist.controller';
import { JwtGuard } from '../auth/jwt.guard';

@Module({
  providers: [WatchlistService, JwtGuard],
  controllers: [WatchlistController],
  exports: [WatchlistService],
})
export class WatchlistModule {}