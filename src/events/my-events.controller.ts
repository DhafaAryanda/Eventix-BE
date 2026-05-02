import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { QueryEventDto } from './dto/query-event.dto';
import { EventsService } from './events.service';

@Controller('my')
export class MyEventsController {
  constructor(private eventsService: EventsService) {}

  @Get('events')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.ORGANIZER)
  getMyEvents(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') userRole: Role,
    @Query() query: QueryEventDto,
  ) {
    return this.eventsService.getMyEvents(userId, userRole, query);
  }
}
