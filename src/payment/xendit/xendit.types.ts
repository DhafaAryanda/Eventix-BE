// src/payment/xendit/xendit.types.ts

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
