import { Module } from '@nestjs/common';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { EventsCache } from './events.cache';

@Module({
  controllers: [EventsController],
  providers: [EventsService, EventsCache],
  exports: [EventsService],
})
export class EventsModule {}
