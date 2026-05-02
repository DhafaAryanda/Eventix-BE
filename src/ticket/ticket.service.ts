import {
  Injectable,
  NotFoundException,
  BadRequestException,
  // ForbiddenException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../prisma/prisma.service';
import { TicketCache } from './ticket.cache';
import { QueueCache } from '../queue/queue.cache';
import { ReserveTicketDto } from './dto/reserve-ticket.dto';
import { EventStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { ReserveResult, StockInfo } from './types/ticket.types';

// Kode return dari Lua script
const LUA_RESULT = {
  STOCK_NOT_FOUND: -1,
  INSUFFICIENT_STOCK: -2,
  ALREADY_RESERVED: -3,
} as const;

@Injectable()
export class TicketService {
  constructor(
    private readonly logger: PinoLogger,
    private prisma: PrismaService,
    private ticketCache: TicketCache,
    private queueCache: QueueCache,
  ) {
    logger.setContext(TicketService.name);
  }

  // ===========================
  // CEK KETERSEDIAAN TIKET
  // Menggabungkan data stok real-time dari Redis
  // dengan data metadata dari PostgreSQL
  // ===========================
  async checkAvailability(eventId: string): Promise<StockInfo[]> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: {
        ticketTypes: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!event) throw new NotFoundException('Event tidak ditemukan');

    if (event.status === EventStatus.DRAFT) {
      throw new NotFoundException('Event tidak ditemukan');
    }

    // Ambil semua stok dari Redis sekaligus (1 round-trip)
    const ticketTypeIds = event.ticketTypes.map((tt) => tt.id);
    const stockMap = await this.ticketCache.getStockBulk(
      eventId,
      ticketTypeIds,
    );

    return event.ticketTypes.map((tt) => ({
      ticketTypeId: tt.id,
      name: tt.name,
      price: tt.price,
      maxPerUser: tt.maxPerUser,
      description: tt.description,
      available: stockMap[tt.id] ?? 0, // real-time dari Redis
      quota: tt.quota, // total awal dari DB
    }));
  }

  // ===========================
  // RESERVE TICKET
  // Flow:
  // 1. Validasi session token (dari virtual queue)
  // 2. Validasi event & ticket type
  // 3. Jalankan Lua script atomic di Redis
  // 4. Jika berhasil → return reservation token
  // ===========================
  async reserveTicket(
    dto: ReserveTicketDto,
    userId: string,
  ): Promise<ReserveResult> {
    // STEP 1: Validasi session token dari antrian
    const sessionValid = await this.queueCache.validateSessionToken(
      userId,
      dto.eventId,
      dto.sessionToken,
    );

    if (!sessionValid) {
      this.logger.info(
        `Invalid session token for user ${userId}, event ${dto.eventId}`,
      );
      return { success: false, reason: 'SESSION_INVALID' };
    }

    // STEP 2: Validasi event & ticket type dari DB
    const ticketType = await this.prisma.ticketType.findFirst({
      where: {
        id: dto.ticketTypeId,
        eventId: dto.eventId,
        event: {
          status: EventStatus.SALE_OPEN,
        },
      },
      include: {
        event: {
          select: { status: true, saleCloseAt: true },
        },
      },
    });

    if (!ticketType) {
      throw new NotFoundException(
        'Tipe tiket tidak ditemukan atau penjualan sudah tutup',
      );
    }

    // Validasi batas pembelian per user
    if (dto.quantity > ticketType.maxPerUser) {
      throw new BadRequestException(
        `Maksimal pembelian ${ticketType.maxPerUser} tiket per orang`,
      );
    }

    // Validasi waktu tutup penjualan
    if (
      ticketType.event.saleCloseAt &&
      new Date() > ticketType.event.saleCloseAt
    ) {
      throw new BadRequestException('Waktu penjualan sudah tutup');
    }

    // STEP 3: Jalankan Lua script atomic
    const reservationToken = randomUUID();
    const reservationData = {
      userId,
      eventId: dto.eventId,
      ticketTypeId: dto.ticketTypeId,
      ticketTypeName: ticketType.name,
      quantity: dto.quantity,
      totalAmount: ticketType.price * dto.quantity,
    };

    const { code, remainingStock } = await this.ticketCache.atomicReserve({
      eventId: dto.eventId,
      ticketTypeId: dto.ticketTypeId,
      userId,
      quantity: dto.quantity,
      reservationToken,
      reservationData,
    });

    // STEP 4: Handle hasil Lua script
    if (code === LUA_RESULT.STOCK_NOT_FOUND) {
      throw new BadRequestException(
        'Data stok tiket tidak ditemukan. Hubungi panitia.',
      );
    }

    if (code === LUA_RESULT.INSUFFICIENT_STOCK) {
      this.logger.info(
        `Stock insufficient for event ${dto.eventId}, ` +
          `type ${dto.ticketTypeId}: requested ${dto.quantity}`,
      );
      return { success: false, reason: 'OUT_OF_STOCK' };
    }

    if (code === LUA_RESULT.ALREADY_RESERVED) {
      return { success: false, reason: 'ALREADY_RESERVED' };
    }

    // ✅ Berhasil reserve — hapus session token agar tidak bisa dipakai lagi
    await this.queueCache.consumeSessionToken(userId, dto.eventId);

    this.logger.info(
      `Ticket reserved: user ${userId}, event ${dto.eventId}, ` +
        `type ${dto.ticketTypeId}, qty ${dto.quantity}, ` +
        `remaining stock: ${remainingStock}`,
    );

    return {
      success: true,
      reservationToken,
      expiresInSeconds: 300, // 5 menit
      remainingStock,
    };
  }

  // ===========================
  // RELEASE RESERVATION (internal)
  // Dipanggil oleh scheduler saat reservation expired
  // atau oleh OrderService saat payment gagal
  // ===========================
  async releaseReservation(token: string): Promise<void> {
    const reservation = await this.ticketCache.getReservation(token);
    if (!reservation) {
      this.logger.debug(
        `Reservation ${token} not found or already expired, skipping`,
      );
      return;
    }

    const released = await this.ticketCache.atomicRelease({
      eventId: reservation.eventId,
      ticketTypeId: reservation.ticketTypeId,
      userId: reservation.userId,
      reservationToken: token,
      quantity: reservation.quantity,
    });

    if (released) {
      this.logger.info(
        `Reservation ${token} released, ` +
          `${reservation.quantity} stock returned`,
      );
    }
  }
}
