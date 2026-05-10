import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { CreateTicketTypeDto } from './dto/create-ticket-type.dto';
import { QueryEventDto } from './dto/query-event.dto';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@Controller('events')
export class EventsController {
  constructor(private eventsService: EventsService) {}

  // --------------------------------------------------
  // PUBLIC ROUTES — tidak perlu login
  // --------------------------------------------------

  // GET /api/events?page=1&limit=12&city=jakarta&search=coldplay
  @Get()
  getEvents(@Query() query: QueryEventDto, @CurrentUser() user: any) {
    const isAdmin = user?.role === Role.ADMIN || user?.role === Role.ORGANIZER;
    return this.eventsService.getEvents(query, isAdmin);
  }

  // GET /api/my/events — dashboard creator
  // Tampilkan semua event milik creator yang sedang login
  // termasuk DRAFT

  @Get('my/events')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.ORGANIZER)
  getMyEvents(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: Role,
    @Query() query: QueryEventDto,
  ) {
    return this.eventsService.getMyEvents(userId, userRole, query);
  }

  // GET /api/events/:id
  @Get(':id')
  getEventById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: any,
  ) {
    const isAdmin = user?.role === Role.ADMIN || user?.role === Role.ORGANIZER;
    return this.eventsService.getEventById(id, isAdmin);
  }

  // --------------------------------------------------
  // PROTECTED ROUTES — butuh login & role tertentu
  // --------------------------------------------------

  // POST /api/events
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.ORGANIZER)
  @HttpCode(HttpStatus.CREATED)
  createEvent(@Body() dto: CreateEventDto, @CurrentUser('id') userId: string) {
    return this.eventsService.createEvent(dto, userId);
  }

  // POST /api/events/:id/ticket-types
  @Post(':id/ticket-types')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.ORGANIZER)
  @HttpCode(HttpStatus.CREATED)
  addTicketType(
    @Param('id', ParseUUIDPipe) eventId: string,
    @Body() dto: CreateTicketTypeDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: Role,
  ) {
    return this.eventsService.addTicketType(eventId, dto, userId, userRole);
  }

  // PATCH /api/events/:id/publish
  @Patch(':id/publish')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.ORGANIZER)
  publishEvent(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: Role,
  ) {
    return this.eventsService.publishEvent(id, userId, userRole);
  }

  // PATCH /api/events/:id
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.ORGANIZER)
  updateEvent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEventDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: Role,
  ) {
    return this.eventsService.updateEvent(id, dto, userId, userRole);
  }

  // DELETE /api/events/:id — ADMIN only
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  deleteEvent(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('role') userRole: Role,
  ) {
    return this.eventsService.deleteEvent(id, userRole);
  }

  // POST /api/events/:id/banner
  @Post(':id/banner')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.ORGANIZER)
  @HttpCode(HttpStatus.OK)
  async uploadBanner(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: Role,
    @Req() req: FastifyRequest,
  ) {
    const file = await req.file();
    if (!file) throw new BadRequestException('File tidak ditemukan');
    const buffer = await file.toBuffer();
    return this.eventsService.uploadBanner(id, buffer, file.mimetype, userId, userRole);
  }

  // DELETE /api/events/:id/banner
  @Delete(':id/banner')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.ORGANIZER)
  @HttpCode(HttpStatus.OK)
  deleteBanner(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: Role,
  ) {
    return this.eventsService.deleteBanner(id, userId, userRole);
  }
}
