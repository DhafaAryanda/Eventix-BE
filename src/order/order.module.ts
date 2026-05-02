import { Module } from '@nestjs/common';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { TicketModule } from '../ticket/ticket.module';
import { PaymentModule } from '../payment/payment.module';

@Module({
  imports: [
    TicketModule, // untuk TicketCache (consume reservation)
    PaymentModule, // untuk PaymentService (inject ke controller)
  ],
  controllers: [OrderController],
  providers: [OrderService],
  exports: [OrderService],
})
export class OrderModule {}
