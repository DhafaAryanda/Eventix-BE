// src/ticket/ticket.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  // Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  // ParseUUIDPipe,
} from '@nestjs/common';
import { TicketService } from './ticket.service';
import { ReserveTicketDto } from './dto/reserve-ticket.dto';
import { CheckAvailabilityDto } from './dto/check-availability.dto';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('tickets')
export class TicketController {
  constructor(private ticketService: TicketService) {}

  // GET /api/tickets/availability?eventId=xxx
  // Public — siapa saja bisa cek stok
  @Get('availability')
  checkAvailability(@Query() dto: CheckAvailabilityDto) {
    return this.ticketService.checkAvailability(dto.eventId);
  }

  // POST /api/tickets/reserve
  // Harus login & punya session token dari antrian
  @Post('reserve')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  reserveTicket(
    @Body() dto: ReserveTicketDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.ticketService.reserveTicket(dto, userId);
  }
}
