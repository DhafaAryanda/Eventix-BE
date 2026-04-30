import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { EventsCache } from './events.cache';
import { TicketModule } from 'src/ticket/ticket.module';
import { MyEventsController } from './my-events.controller';

@Module({
  imports: [TicketModule],
  controllers: [EventsController, MyEventsController],
  providers: [EventsService, EventsCache],
  exports: [EventsService],
})
export class EventsModule {}
