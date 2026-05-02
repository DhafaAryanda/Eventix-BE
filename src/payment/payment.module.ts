import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { XenditClient } from './xendit/xendit.client';

@Module({
  controllers: [PaymentController],
  providers: [PaymentService, XenditClient],
  exports: [PaymentService],
})
export class PaymentModule {}
