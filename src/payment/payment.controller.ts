// src/payment/payment.controller.ts
import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PaymentService } from './payment.service';

@Controller('payments')
export class PaymentController {
  constructor(private paymentService: PaymentService) {}

  // POST /api/payments/webhook
  // Dipanggil oleh Xendit — tidak pakai JwtAuthGuard
  // Verifikasi dilakukan via x-callback-token header
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Body() payload: any,
    @Headers('x-callback-token') callbackToken: string,
  ) {
    await this.paymentService.handleWebhook(payload, callbackToken);
    // Xendit butuh response 200 OK — apapun selain 2xx akan di-retry
    return { received: true };
  }
}
