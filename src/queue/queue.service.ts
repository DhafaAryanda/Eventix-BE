import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QueueCache } from './queue.cache';
import { QueueScheduler } from './queue.scheduler';
import { JoinQueueDto } from './dto/join-queue.dto';
import { EventStatus } from '@prisma/client';
import { BATCH_SIZE } from './constants/queue.constants';

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    private prisma: PrismaService,
    private queueCache: QueueCache,
    private scheduler: QueueScheduler,
  ) {}

  // ===========================
  // JOIN QUEUE
  // ===========================
  async joinQueue(dto: JoinQueueDto, userId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: dto.eventId },
      select: {
        id: true,
        title: true,
        status: true,
        saleOpenAt: true,
        saleCloseAt: true,
      },
    });

    if (!event) {
      throw new NotFoundException('Event tidak ditemukan');
    }

    // Validasi status event
    if (event.status !== EventStatus.SALE_OPEN) {
      const messages: Record<string, string> = {
        DRAFT: 'Penjualan tiket belum dibuka',
        PUBLISHED: 'Penjualan tiket belum dibuka',
        SOLD_OUT: 'Tiket sudah habis terjual',
        COMPLETED: 'Event sudah selesai',
      };
      throw new BadRequestException(
        messages[event.status] ?? 'Penjualan tidak tersedia',
      );
    }

    // Validasi waktu penjualan
    const now = new Date();
    if (now < event.saleOpenAt) {
      throw new BadRequestException(
        `Penjualan baru dibuka pada ${event.saleOpenAt.toISOString()}`,
      );
    }
    if (event.saleCloseAt && now > event.saleCloseAt) {
      throw new BadRequestException('Waktu penjualan sudah tutup');
    }

    // Masukkan ke antrian via Redis
    const result = await this.queueCache.joinQueue(dto.eventId, userId);

    if (!result.isNew) {
      this.logger.debug(
        `User ${userId} already in queue for event ${dto.eventId}`,
      );
      return {
        status: 'ALREADY_IN_QUEUE',
        position: result.position,
        queueSize: result.queueSize,
        estimatedWaitMinutes: this.estimateWait(result.position),
      };
    }

    this.logger.log(
      `User ${userId} joined queue for event ${dto.eventId} ` +
        `at position ${result.position}`,
    );

    return {
      status: 'JOINED',
      position: result.position,
      queueSize: result.queueSize,
      estimatedWaitMinutes: this.estimateWait(result.position),
    };
  }

  // ===========================
  // CEK STATUS ANTRIAN
  // ===========================
  async getStatus(eventId: string, userId: string) {
    // Validasi event ada
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { status: true },
    });

    if (!event) throw new NotFoundException('Event tidak ditemukan');

    if (
      event.status === EventStatus.SOLD_OUT ||
      event.status === EventStatus.COMPLETED
    ) {
      return { status: 'EVENT_CLOSED' };
    }

    return this.queueCache.getStatus(eventId, userId);
  }

  // ===========================
  // TRIGGER MANUAL (Admin)
  // Berguna saat pertama kali buka penjualan
  // ===========================
  async openSaleAndTriggerQueue(eventId: string) {
    // Update status event ke SALE_OPEN
    await this.prisma.event.update({
      where: { id: eventId },
      data: { status: EventStatus.SALE_OPEN },
    });

    // Langsung trigger batch pertama tanpa menunggu interval
    await this.scheduler.triggerBatchNow(eventId);

    this.logger.log(
      `Sale opened and first batch triggered for event ${eventId}`,
    );

    return { message: 'Penjualan dibuka dan antrian pertama diproses' };
  }

  // ===========================
  // PRIVATE HELPERS
  // ===========================
  private estimateWait(position: number): number {
    // Setiap batch memproses BATCH_SIZE user dalam 30 detik
    // Estimasi kasar: (posisi / batch_size) * 0.5 menit
    return Math.ceil(position / BATCH_SIZE) * 0.5;
  }
}
