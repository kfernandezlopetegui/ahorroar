import {
  Controller, Get, Post, Body, Param,
  Query, Req, UseGuards,
} from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { CommunityService } from './community.service';
import { CreateReportDto } from './dto/create-report.dto';

@Controller('community')
export class CommunityController {
  constructor(private svc: CommunityService) {}

  @Get('reports')
  getReports(
    @Query('ean') ean?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.getReports(ean, limit ? parseInt(limit) : 20);
  }

  @Get('leaderboard')
  getLeaderboard() {
    return this.svc.getLeaderboard();
  }

  
  @Get('product-lookup/:ean')
  lookupProduct(@Param('ean') ean: string) {
    return this.svc.lookupProduct(ean);
  }

  
  @Get('branch-search')
  searchBranches(@Query('q') q: string) {
    return this.svc.searchBranches(q ?? '');
  }

  @Post('reports')
  @UseGuards(JwtGuard)
  createReport(@Req() req: any, @Body() dto: CreateReportDto) {
    return this.svc.createReport(req.user.id, dto);
  }

  @Post('reports/:id/upvote')
  @UseGuards(JwtGuard)
  upvoteReport(@Req() req: any, @Param('id') id: string) {
    return this.svc.upvoteReport(req.user.id, id);
  }

  @Get('stats')
  @UseGuards(JwtGuard)
  getUserStats(@Req() req: any) {
    return this.svc.getUserStats(req.user.id);
  }
}