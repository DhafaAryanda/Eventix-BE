// import {
//   Controller,
//   Get,
//   Post,
//   Body,
//   Patch,
//   Param,
//   Delete,
// } from '@nestjs/common';
// import { EventService } from './event.service';
// import { CreateEventDto } from './dto/create-event.dto';
// import { UpdateEventDto } from './dto/update-event.dto';

// @Controller('event')
// export class EventController {
//   constructor(private readonly eventService: EventService) {}

//   @Post()
//   create(@Body() createEventDto: CreateEventDto) {
//     return this.eventService.create(createEventDto);
//   }

//   @Get()
//   findAll() {
//     return this.eventService.findAll();
//   }

//   @Get(':id')
//   findOne(@Param('id') id: string) {
//     return this.eventService.findOne(+id);
//   }

//   @Patch(':id')
//   update(@Param('id') id: string, @Body() updateEventDto: UpdateEventDto) {
//     return this.eventService.update(+id, updateEventDto);
//   }

//   @Delete(':id')
//   remove(@Param('id') id: string) {
//     return this.eventService.remove(+id);
//   }

//   // Route public — siapa saja bisa akses
//   @Get()
//   getEvents() { ... }

//   // Route hanya untuk ADMIN
//   @Post()
//   @UseGuards(JwtAuthGuard, RolesGuard)
//   @Roles(Role.ADMIN)
//   createEvent(@Body() dto: CreateEventDto) { ... }

//   // Route untuk semua user yang sudah login
//   @Get('my-orders')
//   @UseGuards(JwtAuthGuard)
//   getMyOrders(@CurrentUser('id') userId: string) { ... }

//   // Route untuk ADMIN dan ORGANIZER
//   @Patch(':id/publish')
//   @UseGuards(JwtAuthGuard, RolesGuard)
//   @Roles(Role.ADMIN, Role.ORGANIZER)
//   publishEvent(@Param('id') id: string) { ... }
// }
// }
