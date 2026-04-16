import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Query,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { QueueService } from './queue.service';
import { JoinQueueDto } from './dto/join-queue.dto';
import { QueueStatusDto } from './dto/queue-status.dto';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@Controller('queue')
export class QueueController {
  constructor(private queueService: QueueService) {}

  // POST /api/queue/join
  // User join antrian untuk sebuah event
  @Post('join')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  joinQueue(@Body() dto: JoinQueueDto, @CurrentUser('id') userId: string) {
    return this.queueService.joinQueue(dto, userId);
  }

  // GET /api/queue/status?eventId=xxx
  // User cek posisi antrian & apakah sudah giliran
  @Get('status')
  @UseGuards(JwtAuthGuard)
  getStatus(@Query() dto: QueueStatusDto, @CurrentUser('id') userId: string) {
    return this.queueService.getStatus(dto.eventId, userId);
  }

  // PATCH /api/queue/events/:id/open-sale
  // Admin buka penjualan & trigger batch pertama sekaligus
  @Patch('events/:id/open-sale')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.ORGANIZER)
  openSale(@Param('id', ParseUUIDPipe) eventId: string) {
    return this.queueService.openSaleAndTriggerQueue(eventId);
  }
}
