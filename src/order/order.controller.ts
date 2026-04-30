// src/order/order.controller.ts
import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { OrderService } from './order.service';
import { PaymentService } from '../payment/payment.service';
// import { CreatePaymentDto } from '../payment/dto/create-payment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { IsString, IsNotEmpty } from 'class-validator';

class CreateOrderDto {
  @IsString()
  @IsNotEmpty()
  reservationToken: string;
}

@Controller('orders')
@UseGuards(JwtAuthGuard) // semua endpoint order butuh login
export class OrderController {
  constructor(
    private orderService: OrderService,
    private paymentService: PaymentService,
  ) {}

  // POST /api/orders
  @Post()
  @HttpCode(HttpStatus.CREATED)
  createOrder(@Body() dto: CreateOrderDto, @CurrentUser('id') userId: string) {
    return this.orderService.createOrder(dto.reservationToken, userId);
  }

  // POST /api/orders/:id/pay
  // Tidak perlu body — Invoice API handle semua metode
  @Post(':id/pay')
  @HttpCode(HttpStatus.OK)
  createPayment(
    @Param('id', ParseUUIDPipe) orderId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.paymentService.createPayment(orderId, userId);
  }

  // GET /api/orders/:id/payment-status
  // Cek status pembayaran
  @Get(':id/payment-status')
  getPaymentStatus(
    @Param('id', ParseUUIDPipe) orderId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.paymentService.getPaymentStatus(orderId, userId);
  }

  // GET /api/orders
  @Get()
  getMyOrders(@CurrentUser('id') userId: string) {
    return this.orderService.getMyOrders(userId);
  }

  // GET /api/orders/:id
  @Get(':id')
  getOrder(
    @Param('id', ParseUUIDPipe) orderId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.orderService.getOrder(orderId, userId);
  }
}
