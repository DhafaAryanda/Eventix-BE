// src/payment/xendit/xendit.types.ts

// ===========================
// REQUEST TYPES
// ===========================
// export type CreateVARequest = {
//   external_id: string;
//   bank_code: 'BCA' | 'BNI' | 'BRI' | 'MANDIRI' | 'BSI';
//   name: string; // nama yang tampil di layar ATM
//   expected_amount: number;
//   expiration_date: string; // ISO string
//   is_single_use: true; // satu VA hanya bisa dibayar sekali
//   is_closed: true; // VA hanya bisa dibayar dengan amount exact
// };

// export type CreateQRISRequest = {
//   external_id: string;
//   type: 'DYNAMIC';
//   callback_url: string;
//   amount: number;
// };

// export type CreateEWalletRequest = {
//   reference_id: string;
//   currency: 'IDR';
//   amount: number;
//   checkout_method: 'ONE_TIME_PAYMENT';
//   channel_code: 'GOPAY' | 'OVO' | 'DANA';
//   channel_properties: {
//     success_redirect_url: string;
//     failure_redirect_url: string;
//     mobile_number?: string; // wajib untuk OVO
//   };
// };

// // ===========================
// // RESPONSE TYPES
// // ===========================
// export type XenditVAResponse = {
//   id: string;
//   external_id: string;
//   bank_code: string;
//   account_number: string; // nomor VA
//   name: string;
//   status: 'PENDING' | 'ACTIVE' | 'INACTIVE';
//   expiration_date: string;
//   expected_amount: number;
// };

// export type XenditQRISResponse = {
//   id: string;
//   external_id: string;
//   status: 'ACTIVE' | 'INACTIVE';
//   qr_string: string; // string untuk generate QR code di frontend
//   expires_at: string;
//   amount: number;
// };

// export type XenditEWalletResponse = {
//   id: string;
//   reference_id: string;
//   status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
//   actions: {
//     desktop_web_checkout_url?: string;
//     mobile_web_checkout_url?: string;
//     mobile_deeplink_checkout_url?: string;
//   };
// };

// // ===========================
// // WEBHOOK PAYLOAD TYPES
// // ===========================
// export type XenditVAWebhookPayload = {
//   id: string;
//   payment_id: string;
//   external_id: string;
//   bank_code: string;
//   account_number: string;
//   amount: number;
//   transaction_timestamp: string;
//   merchant_code: string;
//   payment_detail: {
//     receipt_id: string;
//   };
// };

// export type XenditQRISWebhookPayload = {
//   id: string;
//   external_id: string;
//   status: 'COMPLETED' | 'EXPIRED';
//   amount: number;
//   qr_string: string;
//   payment_details: {
//     source: string;
//     receipt_id: string;
//   };
//   created: string;
//   updated: string;
// };

// export type XenditEWalletWebhookPayload = {
//   id: string;
//   reference_id: string;
//   status: 'SUCCEEDED' | 'FAILED' | 'VOIDED';
//   channel_code: string;
//   charge_amount: number;
//   capture_amount: number;
//   created: string;
//   updated: string;
//   failure_code?: string;
// };

// // Union type untuk semua kemungkinan webhook
// export type XenditWebhookPayload =
//   | (XenditVAWebhookPayload & { webhook_type: 'VIRTUAL_ACCOUNT_PAID' })
//   | (XenditQRISWebhookPayload & { webhook_type: 'QR_CODE_PAYMENT' })
//   | (XenditEWalletWebhookPayload & { webhook_type: 'EWALLET_PAYMENT' });

// BARU

// ===========================
// REQUEST
// ===========================
export type CreateInvoiceRequest = {
  external_id: string;
  amount: number;
  payer_email: string;
  description: string;
  invoice_duration: number; // dalam detik, misal 900 = 15 menit
  customer: {
    given_names: string;
    email: string;
  };
  customer_notification_preference: {
    invoice_created: string[]; // ["email"]
    invoice_paid: string[];
    invoice_expired: string[];
  };
  // Metode pembayaran yang tersedia di halaman invoice
  // Kosongkan = semua metode aktif
  payment_methods?: string[];
  success_redirect_url?: string;
  failure_redirect_url?: string;
  // Item yang dibeli — tampil di halaman invoice Xendit
  items: {
    name: string;
    quantity: number;
    price: number;
    category?: string;
  }[];
  // Metadata bebas — kita pakai untuk simpan orderId
  metadata?: Record<string, string>;
};

// ===========================
// RESPONSE — CREATE INVOICE
// ===========================
export type XenditInvoiceResponse = {
  id: string; // xenditInvoiceId
  external_id: string;
  status: 'PENDING' | 'PAID' | 'SETTLED' | 'EXPIRED';
  invoice_url: string; // URL yang dikirim ke user
  amount: number;
  expiry_date: string;
  payer_email: string;
  description: string;
  created: string;
  updated: string;
};

// ===========================
// WEBHOOK PAYLOAD
// Xendit kirim ini saat status invoice berubah
// ===========================
export type XenditInvoiceWebhookPayload = {
  id: string; // xenditInvoiceId
  external_id: string;
  status: 'PAID' | 'SETTLED' | 'EXPIRED';
  amount: number;
  payer_email: string;

  // Detail pembayaran — diisi Xendit saat PAID
  payment_method?: string; // "BANK_TRANSFER", "QRIS", "EWALLET", "RETAIL"
  payment_channel?: string; // "BCA", "GOPAY", "OVO", "DANA", "ALFAMART", dll
  paid_amount?: number;
  paid_at?: string;

  // Metadata yang kita kirim saat buat invoice
  metadata?: Record<string, string>;
};
