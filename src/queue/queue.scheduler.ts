import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Cron } from '@nestjs/schedule';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { QueueCache } from './queue.cache';
import {
  QUEUE_NAME,
  JOB_NAMES,
  BATCH_SIZE,
} from './constants/queue.constants';
import { EventStatus } from '@prisma/client';

@Injectable()
export class QueueScheduler {
  private readonly logger = new Logger(QueueScheduler.name);

  constructor(
    @InjectQueue(QUEUE_NAME) private bullQueue: Queue,
    private prisma: PrismaService,
    private queueCache: QueueCache,
  ) {}

  // Cari semua event yang sedang dalam penjualan,
  // lalu schedule batch job untuk masing-masing
  @Cron('*/30 * * * * *')
  async scheduleActiveBatches() {
    try {
      // Ambil semua event yang penjualannya sedang buka
      const activeEvents = await this.prisma.event.findMany({
        where: {
          status: EventStatus.SALE_OPEN,
        },
        select: { id: true, title: true },
      });

      if (activeEvents.length === 0) {
        this.logger.debug('No active sale events, skipping batch schedule');
        return;
      }

      // Schedule job untuk setiap event aktif secara parallel
      await Promise.all(
        activeEvents.map((event) => this.scheduleBatchForEvent(event.id)),
      );
    } catch (err) {
      this.logger.error(`Scheduler error: ${err.message}`, err.stack);
    }
  }

  private async scheduleBatchForEvent(eventId: string) {
    // Skip jika antrian sudah kosong
    const isEmpty = await this.queueCache.isEventQueueEmpty(eventId);
    if (isEmpty) {
      this.logger.debug(`Queue empty for event ${eventId}, skipping`);
      return;
    }

    // Cek apakah ada job yang masih pending untuk event ini
    // Hindari penumpukan job jika processor lambat
    const waitingJobs = await this.bullQueue.getWaiting();
    const alreadyQueued = waitingJobs.some(
      (job) => job.data.eventId === eventId,
    );

    if (alreadyQueued) {
      this.logger.debug(`Job already queued for event ${eventId}, skipping`);
      return;
    }

    // Tambahkan job ke BullMQ
    await this.bullQueue.add(
      JOB_NAMES.PROCESS_BATCH,
      { eventId, batchSize: BATCH_SIZE },
      {
        // Retry otomatis jika job gagal
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000, // retry pertama setelah 2 detik, lalu 4, 8...
        },
        // Hapus job dari history setelah selesai (hemat memory Redis)
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
      },
    );

    this.logger.log(`Batch job scheduled for event ${eventId}`);
  }

  // ===========================
  // MANUAL TRIGGER
  // Berguna untuk testing atau trigger langsung saat event dibuka
  // ===========================
  async triggerBatchNow(eventId: string): Promise<void> {
    await this.bullQueue.add(
      JOB_NAMES.PROCESS_BATCH,
      { eventId, batchSize: BATCH_SIZE },
      {
        priority: 1, // prioritas tinggi, proses duluan
        attempts: 3,
        removeOnComplete: true,
      },
    );
    this.logger.log(`Manual batch triggered for event ${eventId}`);
  }
}
