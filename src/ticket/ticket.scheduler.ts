import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { TicketCache } from './ticket.cache';
import { TicketService } from './ticket.service';
import { OrderStatus } from '@prisma/client';

@Injectable()
export class TicketScheduler {
  private readonly logger = new Logger(TicketScheduler.name);

  constructor(
    private prisma: PrismaService,
    private ticketCache: TicketCache,
    private ticketService: TicketService,
  ) {}

  // ===========================
  // JOB 1: Cancel Order Expired
  // Jalan setiap 1 menit
  // Cari order PENDING yang melewati batas waktu bayar
  // ===========================
  @Cron(CronExpression.EVERY_MINUTE)
  async cancelExpiredOrders() {
    try {
      // Ambil semua order yang expired tapi masih PENDING
      const expiredOrders = await this.prisma.order.findMany({
        where: {
          status: OrderStatus.PENDING,
          expiresAt: { lt: new Date() },
        },
        select: {
          id: true,
          userId: true,
          ticketTypeId: true,
          quantity: true,
          reservationToken: true,
          ticketType: {
            select: { eventId: true },
          },
        },
      });

      if (expiredOrders.length === 0) return;

      this.logger.log(`Found ${expiredOrders.length} expired orders to cancel`);

      // Proses satu per satu — jangan parallel agar tidak race condition
      for (const order of expiredOrders) {
        await this.processExpiredOrder(order);
      }
    } catch (err) {
      this.logger.error(`cancelExpiredOrders error: ${err.message}`, err.stack);
    }
  }

  private async processExpiredOrder(order: {
    id: string;
    userId: string;
    ticketTypeId: string;
    quantity: number;
    reservationToken: string | null;
    ticketType: { eventId: string };
  }) {
    try {
      // Update status order ke EXPIRED di DB
      await this.prisma.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.EXPIRED },
      });

      // Kembalikan stok ke Redis jika ada reservation token
      // (reservation mungkin sudah expired sendiri via TTL Redis,
      //  tapi kita tetap coba release untuk keamanan)
      if (order.reservationToken) {
        await this.ticketService.releaseReservation(order.reservationToken);
      } else {
        // Jika tidak ada token, kembalikan stok langsung
        await this.ticketCache.atomicRelease({
          eventId: order.ticketType.eventId,
          ticketTypeId: order.ticketTypeId,
          userId: order.userId,
          reservationToken: '', // tidak ada token, release tidak akan cek
          quantity: order.quantity,
        });
      }

      this.logger.log(`Order ${order.id} expired and stock returned`);
    } catch (err) {
      // Log error tapi lanjutkan ke order berikutnya
      this.logger.error(
        `Failed to process expired order ${order.id}: ${err.message}`,
      );
    }
  }

  // ===========================
  // JOB 2: Sync Stok Redis ↔ DB
  // Jalan setiap 10 menit
  // Memastikan stok Redis tidak menyimpang dari DB
  // (safety net — bukan alur utama)
  // ===========================
  @Cron(CronExpression.EVERY_10_MINUTES)
  async syncStockWithDb() {
    try {
      // Ambil semua order PAID untuk hitung stok terpakai
      const soldCounts = await this.prisma.order.groupBy({
        by: ['ticketTypeId'],
        where: { status: OrderStatus.PAID },
        _sum: { quantity: true },
      });

      // Ambil semua ticket type yang aktif
      const ticketTypes = await this.prisma.ticketType.findMany({
        where: {
          event: {
            status: { in: ['PUBLISHED', 'SALE_OPEN'] },
          },
        },
        select: {
          id: true,
          quota: true,
          eventId: true,
        },
      });

      let syncCount = 0;

      for (const tt of ticketTypes) {
        const sold = soldCounts.find((s) => s.ticketTypeId === tt.id);
        const soldQty = sold?._sum?.quantity ?? 0;

        // Hitung stok yang seharusnya tersisa
        const expectedStock = tt.quota - soldQty;

        // Ambil stok aktual di Redis
        const actualStock = await this.ticketCache.getStock(tt.eventId, tt.id);

        // Jika selisih > 5, anggap menyimpang dan perbaiki
        // Threshold 5 untuk toleransi reservation yang sedang aktif
        const diff = Math.abs(actualStock - expectedStock);
        if (diff > 5) {
          this.logger.warn(
            `Stock mismatch for ticketType ${tt.id}: ` +
              `Redis=${actualStock}, expected=${expectedStock}, diff=${diff}`,
          );
          // Jangan auto-correct di production tanpa investigasi
          // Cukup log untuk sekarang
          syncCount++;
        }
      }

      if (syncCount > 0) {
        this.logger.warn(
          `Stock sync check: ${syncCount} mismatches found. ` +
            `Manual review recommended.`,
        );
      } else {
        this.logger.debug('Stock sync check: all stocks are consistent');
      }
    } catch (err) {
      this.logger.error(`syncStockWithDb error: ${err.message}`, err.stack);
    }
  }
}
