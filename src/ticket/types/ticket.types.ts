export type ReserveResult =
  | {
      success: true;
      reservationToken: string;
      expiresInSeconds: number;
      remainingStock: number;
    }
  | {
      success: false;
      reason: 'OUT_OF_STOCK' | 'SESSION_INVALID' | 'ALREADY_RESERVED';
    };

export type StockInfo = {
  ticketTypeId: string;
  name: string;
  available: number; // stok di Redis (real-time)
  quota: number; // stok awal di DB
};
