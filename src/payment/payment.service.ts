// src/payment/payment.service.ts
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { XenditClient } from './xendit/xendit.client';
import { XenditInvoiceWebhookPayload } from './xendit/xendit.types';
import { OrderStatus, PaymentStatus } from '@prisma/client';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private prisma: PrismaService,
    private xendit: XenditClient,
    private config: ConfigService,
    private mailer: MailerService,
    private eventEmitter: EventEmitter2,
  ) {}

  // ===========================
  // CREATE PAYMENT — Invoice API
  // Tidak perlu body dari user, Xendit handle semua metode
  // ===========================
  async createPayment(orderId: string, userId: string) {
    // Ambil order lengkap
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
        ticketType: {
          select: {
            name: true,
            price: true,
            event: {
              select: { title: true, venue: true, eventDate: true },
            },
          },
        },
        payment: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order tidak ditemukan');
    }

    if (order.userId !== userId) {
      throw new UnauthorizedException('Order bukan milik kamu');
    }

    if (order.status !== OrderStatus.WAITING_PAYMENT) {
      throw new BadRequestException(
        `Order tidak bisa dibayar — status saat ini: ${order.status}`,
      );
    }

    if (order.expiresAt && new Date() > order.expiresAt) {
      throw new BadRequestException(
        'Order sudah expired. Silakan ulangi dari antrian.',
      );
    }

    // Idempotency — jika payment sudah ada, return invoice URL yang sama
    if (order.payment) {
      this.logger.log(
        `Payment sudah ada untuk order ${orderId}, return existing invoice`,
      );
      return {
        orderId,
        invoiceUrl: order.payment.invoiceUrl,
        amount: order.totalAmount,
        expiresAt: order.payment.expiresAt,
        status: order.payment.status,
      };
    }

    // External ID unik per order
    const externalId = `invoice-${orderId}-${Date.now()}`;
    const baseUrl = this.config.get<string>('APP_URL');

    // Hitung durasi invoice dari sisa waktu order
    const now = new Date();
    const orderExpiry =
      order.expiresAt ?? new Date(now.getTime() + 15 * 60 * 1000);
    const durationSeconds = Math.floor(
      (orderExpiry.getTime() - now.getTime()) / 1000,
    );

    // Buat invoice di Xendit
    const invoice = await this.xendit.createInvoice({
      external_id: externalId,
      amount: order.totalAmount,
      payer_email: order.user.email,
      description: `Tiket ${order.ticketType.name} — ${order.ticketType.event.title}`,
      invoice_duration: durationSeconds,

      customer: {
        given_names: order.user.name,
        email: order.user.email,
      },

      customer_notification_preference: {
        invoice_created: ['email'],
        invoice_paid: ['email'],
        invoice_expired: ['email'],
      },

      // Item yang tampil di halaman invoice Xendit
      items: [
        {
          name: `${order.ticketType.name} — ${order.ticketType.event.title}`,
          quantity: order.quantity,
          price: order.ticketType.price,
          category: 'Tiket Konser',
        },
      ],

      // Redirect setelah bayar
      success_redirect_url: `${baseUrl}/payment/success?orderId=${orderId}`,
      failure_redirect_url: `${baseUrl}/payment/failed?orderId=${orderId}`,

      // Simpan orderId di metadata untuk lookup saat webhook
      metadata: {
        orderId,
        userId,
      },
    });

    // Simpan payment ke DB dalam transaksi
    const payment = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          orderId,
          externalId,
          amount: order.totalAmount,
          status: PaymentStatus.PENDING,
          xenditInvoiceId: invoice.id,
          invoiceUrl: invoice.invoice_url,
          expiresAt: new Date(invoice.expiry_date),
        },
      });

      // Update order status
      await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.WAITING_PAYMENT },
      });

      return payment;
    });

    this.logger.log(
      `Invoice created: orderId=${orderId}, invoiceId=${invoice.id}`,
    );

    return {
      orderId,
      invoiceUrl: invoice.invoice_url,
      amount: order.totalAmount,
      expiresAt: payment.expiresAt,
      status: payment.status,
      // Instruksi ke client
      instruction: 'Buka invoiceUrl untuk memilih metode pembayaran',
    };
  }

  // ===========================
  // WEBHOOK HANDLER
  // Xendit kirim ini saat status invoice berubah
  // ===========================
  async handleWebhook(
    payload: XenditInvoiceWebhookPayload,
    callbackToken: string,
  ): Promise<void> {
    // Verifikasi callback token
    const expectedToken = this.config.get<string>('XENDIT_WEBHOOK_TOKEN');
    if (callbackToken !== expectedToken) {
      this.logger.warn('Webhook rejected: invalid callback token');
      throw new UnauthorizedException('Invalid callback token');
    }

    this.logger.log(
      `Webhook received: status=${payload.status} ` +
        `external_id=${payload.external_id}`,
    );

    switch (payload.status) {
      case 'PAID':
      case 'SETTLED':
        await this.handleInvoicePaid(payload);
        break;

      case 'EXPIRED':
        await this.handleInvoiceExpired(payload);
        break;

      default:
        this.logger.warn(`Unhandled invoice status: ${payload.status}`);
    }
  }

  // ===========================
  // HANDLE INVOICE PAID
  // ===========================
  private async handleInvoicePaid(payload: XenditInvoiceWebhookPayload) {
    // Cari payment via externalId
    const payment = await this.prisma.payment.findUnique({
      where: { externalId: payload.external_id },
      include: {
        order: {
          include: {
            user: {
              select: { id: true, email: true, name: true },
            },
            ticketType: {
              select: {
                name: true,
                event: {
                  select: {
                    title: true,
                    venue: true,
                    eventDate: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!payment) {
      this.logger.warn(
        `Webhook PAID: payment not found for ${payload.external_id}`,
      );
      return;
    }

    // Idempotency — skip jika sudah diproses
    if (payment.status === PaymentStatus.SUCCESS) {
      this.logger.log(
        `Webhook PAID: payment ${payment.id} already processed, skipping`,
      );
      return;
    }

    // Update payment & order dalam satu transaksi
    await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.SUCCESS,
          paymentMethod: payload.payment_method ?? null,
          paymentChannel: payload.payment_channel ?? null,
          paidAt: payload.paid_at ? new Date(payload.paid_at) : new Date(),
        },
      }),
      this.prisma.order.update({
        where: { id: payment.orderId },
        data: { status: OrderStatus.PAID },
      }),
    ]);

    this.logger.log(
      `Payment success: orderId=${payment.orderId} ` +
        `method=${payload.payment_method} ` +
        `channel=${payload.payment_channel}`,
    );

    // Emit event untuk WebSocket notification (fase 7)
    this.eventEmitter.emit('payment.success', {
      userId: payment.order.user.id,
      orderId: payment.orderId,
      eventTitle: payment.order.ticketType.event.title,
      ticketType: payment.order.ticketType.name,
      quantity: payment.order.quantity,
      totalAmount: payment.order.totalAmount,
      paidAt: new Date(),
    });

    // Kirim email konfirmasi — non-blocking
    this.sendConfirmationEmail(payment.order).catch((err) =>
      this.logger.error(`Failed to send confirmation email: ${err.message}`),
    );
  }

  // ===========================
  // HANDLE INVOICE EXPIRED
  // ===========================
  private async handleInvoiceExpired(payload: XenditInvoiceWebhookPayload) {
    const payment = await this.prisma.payment.findUnique({
      where: { externalId: payload.external_id },
      include: { order: true },
    });

    if (!payment) {
      this.logger.warn(
        `Webhook EXPIRED: payment not found for ${payload.external_id}`,
      );
      return;
    }

    if (payment.status !== PaymentStatus.PENDING) {
      this.logger.log(
        `Webhook EXPIRED: payment ${payment.id} ` +
          `already has status ${payment.status}, skipping`,
      );
      return;
    }

    await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.EXPIRED },
      }),
      this.prisma.order.update({
        where: { id: payment.orderId },
        data: { status: OrderStatus.EXPIRED },
      }),
    ]);

    this.logger.log(`Invoice expired: orderId=${payment.orderId}`);

    // Emit untuk WebSocket & scheduler kembalikan stok
    this.eventEmitter.emit('order.expired', {
      userId: payment.order.userId,
      orderId: payment.orderId,
    });
  }

  // ===========================
  // GET PAYMENT STATUS
  // Untuk user cek status pembayaran
  // ===========================
  async getPaymentStatus(orderId: string, userId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        payment: {
          select: {
            status: true,
            invoiceUrl: true,
            paymentMethod: true,
            paymentChannel: true,
            paidAt: true,
            expiresAt: true,
          },
        },
      },
    });

    if (!order) throw new NotFoundException('Order tidak ditemukan');
    if (order.userId !== userId) {
      throw new NotFoundException('Order tidak ditemukan');
    }

    if (!order.payment) {
      return {
        orderId,
        orderStatus: order.status,
        paymentStatus: null,
        invoiceUrl: null,
      };
    }

    return {
      orderId,
      orderStatus: order.status,
      paymentStatus: order.payment.status,
      invoiceUrl: order.payment.invoiceUrl,
      paymentMethod: order.payment.paymentMethod,
      paymentChannel: order.payment.paymentChannel,
      paidAt: order.payment.paidAt,
      expiresAt: order.payment.expiresAt,
    };
  }

  // ===========================
  // SEND CONFIRMATION EMAIL
  // ===========================
  private async sendConfirmationEmail(order: any) {
    await this.mailer.sendMail({
      to: order.user.email,
      subject: `Tiket Berhasil — ${order.ticketType.event.title}`,
      template: 'payment-success',
      context: {
        name: order.user.name,
        eventTitle: order.ticketType.event.title,
        ticketType: order.ticketType.name,
        venue: order.ticketType.event.venue,
        eventDate: new Date(
          order.ticketType.event.eventDate,
        ).toLocaleDateString('id-ID', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
        orderId: order.id,
        quantity: order.quantity,
        totalAmount: order.totalAmount.toLocaleString('id-ID'),
      },
    });
  }
}
