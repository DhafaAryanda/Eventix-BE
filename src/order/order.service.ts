// src/order/order.service.ts
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TicketCache } from '../ticket/ticket.cache';
import { OrderStatus } from '@prisma/client';

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    private prisma: PrismaService,
    private ticketCache: TicketCache,
  ) {}

  // ===========================
  // CREATE ORDER
  // Dipanggil setelah user berhasil reserve tiket
  // ===========================
  async createOrder(reservationToken: string, userId: string) {
    // Ambil data reservation dari Redis
    const reservation = await this.ticketCache.getReservation(reservationToken);

    if (!reservation) {
      throw new BadRequestException(
        'Reservation tidak ditemukan atau sudah expired. ' +
          'Silakan ulangi dari antrian.',
      );
    }

    // Pastikan reservation milik user yang sama
    if (reservation.userId !== userId) {
      throw new BadRequestException('Reservation bukan milik kamu');
    }

    // Cek apakah order untuk reservation ini sudah pernah dibuat
    // (idempotency — cegah double order)
    const existingOrder = await this.prisma.order.findUnique({
      where: { reservationToken },
    });

    if (existingOrder) {
      this.logger.warn(
        `Duplicate order attempt for reservation ${reservationToken}`,
      );
      return existingOrder;
    }

    // Buat order di DB
    const order = await this.prisma.order.create({
      data: {
        userId,
        ticketTypeId: reservation.ticketTypeId,
        quantity: reservation.quantity,
        totalAmount: reservation.totalAmount,
        reservationToken,
        status: OrderStatus.WAITING_PAYMENT,
        // 15 menit dari sekarang untuk bayar
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
      include: {
        ticketType: {
          select: {
            name: true,
            price: true,
            event: { select: { title: true, venue: true, eventDate: true } },
          },
        },
      },
    });

    // Hapus reservation dari Redis setelah order dibuat
    // Stok sudah terkurangi sejak fase reserve — tidak perlu kembalikan
    await this.ticketCache.consumeReservation({
      token: reservationToken,
      userId,
      eventId: reservation.eventId,
    });

    this.logger.log(`Order created: ${order.id} for user ${userId}`);

    return {
      orderId: order.id,
      status: order.status,
      totalAmount: order.totalAmount,
      expiresAt: order.expiresAt,
      ticketType: order.ticketType.name,
      eventTitle: order.ticketType.event.title,
      venue: order.ticketType.event.venue,
      eventDate: order.ticketType.event.eventDate,
      // Instruksi ke client: lanjut ke POST /orders/:id/pay
      nextStep: `POST /api/orders/${order.id}/pay`,
    };
  }

  // ===========================
  // GET ORDER DETAIL
  // ===========================
  async getOrder(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        ticketType: {
          select: {
            name: true,
            price: true,
            event: { select: { title: true, venue: true, eventDate: true } },
          },
        },
        payment: {
          select: {
            status: true,
            paymentMethod: true,
            paymentChannel: true,
            paidAt: true,
            expiresAt: true,
            invoiceUrl: true,
          },
        },
      },
    });

    if (!order) throw new NotFoundException('Order tidak ditemukan');

    if (order.userId !== userId) {
      throw new NotFoundException('Order tidak ditemukan');
    }

    return order;
  }

  // ===========================
  // GET ORDER LIST (milik user)
  // ===========================
  async getMyOrders(userId: string) {
    return this.prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        ticketType: {
          select: {
            name: true,
            event: { select: { title: true, eventDate: true } },
          },
        },
        payment: {
          select: { status: true, paymentMethod: true, paidAt: true },
        },
      },
    });
  }
}
