// src/ticket/ticket.module.ts
import { Module } from '@nestjs/common';
import { TicketController } from './ticket.controller';
import { TicketService } from './ticket.service';
import { TicketCache } from './ticket.cache';
import { TicketScheduler } from './ticket.scheduler';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [
    QueueModule, // untuk inject QueueCache (validasi session token)
  ],
  controllers: [TicketController],
  providers: [TicketService, TicketCache, TicketScheduler],
  exports: [
    TicketService,
    TicketCache, // di-export untuk OrderModule (consume reservation)
  ],
})
export class TicketModule {}
