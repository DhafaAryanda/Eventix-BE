import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QueueController } from './queue.controller';
import { QueueService } from './queue.service';
import { QueueProcessor } from './queue.processor';
import { QueueScheduler } from './queue.scheduler';
import { QueueCache } from './queue.cache';
import { QUEUE_NAME } from './constants/queue.constants';

@Module({
  imports: [
    // Daftarkan queue 'virtual-queue' ke BullMQ
    BullModule.registerQueue({
      name: QUEUE_NAME,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      },
    }),
  ],
  controllers: [QueueController],
  providers: [
    QueueService,
    QueueProcessor, // worker — consume job dari BullMQ
    QueueScheduler, // scheduler — tambah job ke BullMQ secara berkala
    QueueCache, // Redis logic untuk antrian
  ],
  exports: [
    QueueService,
    QueueCache, // di-export agar TicketModule bisa validasi session token
  ],
})
export class QueueModule {}
