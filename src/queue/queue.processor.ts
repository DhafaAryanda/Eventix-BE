import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { QueueCache } from './queue.cache';
import { QUEUE_NAME, JOB_NAMES } from './constants/queue.constants';
import { ProcessBatchJobData } from './types/queue.types';

// @Processor menghubungkan class ini ke queue 'virtual-queue'
// WorkerHost adalah base class dari @nestjs/bullmq untuk processor
@Processor(QUEUE_NAME, {
  // Hanya proses 1 job sekaligus per worker instance
  // Penting: mencegah dua batch jalan bersamaan untuk event yang sama
  concurrency: 1,
})
export class QueueProcessor extends WorkerHost {
  private readonly logger = new Logger(QueueProcessor.name);

  constructor(
    private queueCache: QueueCache,
    private eventEmitter: EventEmitter2,
  ) {
    super();
  }

  // Entry point — dipanggil BullMQ setiap ada job masuk
  async process(job: Job<ProcessBatchJobData>): Promise<void> {
    if (job.name !== JOB_NAMES.PROCESS_BATCH) {
      this.logger.warn(`Unknown job name: ${job.name}`);
      return;
    }

    await this.processBatch(job);
  }

  private async processBatch(job: Job<ProcessBatchJobData>): Promise<void> {
    const { eventId, batchSize } = job.data;

    this.logger.log(
      `Processing batch — event: ${eventId}, batchSize: ${batchSize}`,
    );

    // Ambil & proses batch dari Redis
    // popBatch sudah handle: ambil user → issue session token → remove dari antrian
    const processedUsers = await this.queueCache.popBatch(eventId, batchSize);

    if (processedUsers.length === 0) {
      this.logger.log(`Queue empty for event ${eventId}, skipping`);
      return;
    }

    // Emit event — nanti WebSocket gateway subscribe ini (fase 7)
    // Untuk sekarang event ini tidak ada subscriber-nya, tidak apa-apa
    this.eventEmitter.emit('queue.batch.processed', {
      eventId,
      userIds: processedUsers,
    });

    this.logger.log(
      `Batch done — ${processedUsers.length} users notified for event ${eventId}`,
    );
  }

  // ===========================
  // LIFECYCLE HOOKS
  // Berguna untuk debugging & monitoring
  // ===========================
  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.debug(`Job ${job.id} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Job ${job.id} failed: ${error.message}`, error.stack);
  }

  @OnWorkerEvent('stalled')
  onStalled(jobId: string) {
    // Job stalled = worker mati di tengah proses
    // BullMQ otomatis retry job stalled
    this.logger.warn(`Job ${jobId} stalled, will be retried`);
  }
}
