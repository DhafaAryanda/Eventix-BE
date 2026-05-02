// src/payment/types/payment.types.ts
// import { PaymentMethod } from '@prisma/client';

export type CreatePaymentParams = {
  orderId: string;
  externalId: string;
  amount: number;
  customerName: string;
  paymentMethod: string;
  bankCode?: string; // untuk VA
  ewalletChannel?: string; // untuk E-Wallet
  mobileNumber?: string; // untuk OVO
  paymentExpiry: Date;
};

export type PaymentCreatedResult = {
  paymentId: string; // ID di DB kita
  paymentMethod: string;

  // VA
  vaNumber?: string;
  vaBankCode?: string;

  // QRIS
  qrString?: string;

  // E-Wallet
  ewalletCheckoutUrl?: string;
  ewalletChannel?: string;

  expiresAt: Date;
};
