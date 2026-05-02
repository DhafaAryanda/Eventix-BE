import { Injectable, Logger } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { Redis } from 'ioredis';

// Redis key patterns — terpusat
const TicketKeys = {
  // Stok tiket real-time (di-seed saat event publish)
  stock: (eventId: string, ticketTypeId: string) =>
    `stock:${eventId}:${ticketTypeId}`,

  // Reservation lock milik user (TTL 5 menit)
  reservation: (token: string) => `reservation:${token}`,

  // Flag: user sudah punya reservation aktif di event ini
  // Mencegah satu user reserve berkali-kali
  userReservation: (userId: string, eventId: string) =>
    `user-reservation:${userId}:${eventId}`,
} as const;

const RESERVATION_TTL = 300; // 5 menit dalam detik

@Injectable()
export class TicketCache {
  private readonly logger = new Logger(TicketCache.name);

  constructor(@InjectRedis() private redis: Redis) {}

  // ===========================
  // LUA SCRIPT — ATOMIC RESERVE
  //
  // Kenapa Lua script?
  // Redis single-threaded, tapi operasi GET lalu SET
  // dari Node.js TIDAK atomic — ada jeda antar keduanya.
  // Lua script dijalankan atomically di Redis:
  // tidak ada operasi lain yang bisa menyela di tengah-tengah.
  //
  // Tanpa Lua: 1000 user bisa GET stock = 1 bersamaan,
  //            semua lolos cek, semua DECR → stock jadi -999
  // Dengan Lua: hanya satu yang lolos, sisanya dapat error
  // ===========================

  private readonly reserveScript = `
    -- KEYS[1] = stock key       (stock:{eventId}:{ticketTypeId})
    -- KEYS[2] = reservation key (reservation:{token})
    -- KEYS[3] = user lock key   (user-reservation:{userId}:{eventId})
    -- ARGV[1] = quantity
    -- ARGV[2] = reservation TTL (detik)
    -- ARGV[3] = reservation data (JSON string)
    -- ARGV[4] = user lock TTL

    -- Cek apakah user sudah punya reservation aktif di event ini
    local alreadyReserved = redis.call('EXISTS', KEYS[3])
    if alreadyReserved == 1 then
      return {-3, 0}   -- error: already reserved
    end

    -- Ambil stok saat ini
    local stock = tonumber(redis.call('GET', KEYS[1]))

    -- Stok key tidak ada (event belum publish atau salah key)
    if stock == nil then
      return {-1, 0}   -- error: stock not found
    end

    local qty = tonumber(ARGV[1])

    -- Stok tidak cukup
    if stock < qty then
      return {-2, stock}   -- error: insufficient stock, return sisa stok
    end

    -- ✅ Semua validasi lolos — jalankan operasi
    local remaining = stock - qty

    -- Kurangi stok
    redis.call('DECRBY', KEYS[1], qty)

    -- Simpan data reservation dengan TTL
    redis.call('SETEX', KEYS[2], tonumber(ARGV[2]), ARGV[3])

    -- Set user lock agar tidak bisa reserve lagi
    redis.call('SETEX', KEYS[3], tonumber(ARGV[4]), '1')

    -- Return: sisa stok setelah dikurangi
    return {remaining, remaining}
  `;

  // Lua script untuk release stok saat reservation expired/cancelled
  private readonly releaseScript = `
    -- KEYS[1] = stock key
    -- KEYS[2] = reservation key
    -- KEYS[3] = user lock key
    -- ARGV[1] = quantity yang dikembalikan

    -- Cek reservation masih ada (hindari double release)
    local exists = redis.call('EXISTS', KEYS[2])
    if exists == 0 then
      return 0   -- reservation sudah tidak ada, skip
    end

    -- Kembalikan stok
    redis.call('INCRBY', KEYS[1], tonumber(ARGV[1]))

    -- Hapus reservation & user lock
    redis.call('DEL', KEYS[2])
    redis.call('DEL', KEYS[3])

    return 1   -- sukses
  `;

  // ===========================
  // RESERVE TICKET
  // ===========================
  async atomicReserve(params: {
    eventId: string;
    ticketTypeId: string;
    userId: string;
    quantity: number;
    reservationToken: string;
    reservationData: object;
  }): Promise<{ code: number; remainingStock: number }> {
    const {
      eventId,
      ticketTypeId,
      userId,
      quantity,
      reservationToken,
      reservationData,
    } = params;

    const stockKey = TicketKeys.stock(eventId, ticketTypeId);
    const reservationKey = TicketKeys.reservation(reservationToken);
    const userLockKey = TicketKeys.userReservation(userId, eventId);

    try {
      const result = (await this.redis.eval(
        this.reserveScript,
        3, // jumlah KEYS
        stockKey,
        reservationKey,
        userLockKey,
        quantity, // ARGV[1]
        RESERVATION_TTL, // ARGV[2]
        JSON.stringify(reservationData), // ARGV[3]
        RESERVATION_TTL, // ARGV[4] — user lock TTL sama
      )) as [number, number];

      return {
        code: result[0],
        remainingStock: result[1],
      };
    } catch (err) {
      this.logger.error(`atomicReserve error: ${err.message}`, err.stack);
      throw err;
    }
  }

  // ===========================
  // RELEASE RESERVATION
  // Dipanggil saat: expired, cancel, atau payment gagal
  // ===========================
  async atomicRelease(params: {
    eventId: string;
    ticketTypeId: string;
    userId: string;
    reservationToken: string;
    quantity: number;
  }): Promise<boolean> {
    const { eventId, ticketTypeId, userId, reservationToken, quantity } =
      params;

    const stockKey = TicketKeys.stock(eventId, ticketTypeId);
    const reservationKey = TicketKeys.reservation(reservationToken);
    const userLockKey = TicketKeys.userReservation(userId, eventId);

    try {
      const result = (await this.redis.eval(
        this.releaseScript,
        3,
        stockKey,
        reservationKey,
        userLockKey,
        quantity,
      )) as number;

      const released = result === 1;
      if (released) {
        this.logger.log(
          `Stock released: ${quantity} units for ` +
            `event ${eventId}, type ${ticketTypeId}`,
        );
      }
      return released;
    } catch (err) {
      this.logger.error(`atomicRelease error: ${err.message}`, err.stack);
      return false;
    }
  }

  // ===========================
  // AMBIL DATA RESERVATION
  // ===========================
  async getReservation(token: string): Promise<{
    userId: string;
    eventId: string;
    ticketTypeId: string;
    quantity: number;
    ticketTypeName: string;
    totalAmount: number;
  } | null> {
    try {
      const raw = await this.redis.get(TicketKeys.reservation(token));
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (err) {
      this.logger.error(`getReservation error: ${err.message}`);
      return null;
    }
  }

  // Hapus reservation setelah order dibuat
  // (stok sudah dikurangi, tidak perlu dikembalikan)
  async consumeReservation(params: {
    token: string;
    userId: string;
    eventId: string;
  }): Promise<void> {
    const { token, userId, eventId } = params;
    const pipeline = this.redis.pipeline();
    pipeline.del(TicketKeys.reservation(token));
    pipeline.del(TicketKeys.userReservation(userId, eventId));
    await pipeline.exec();
  }

  // ===========================
  // CEK STOK
  // ===========================
  async getStock(eventId: string, ticketTypeId: string): Promise<number> {
    const raw = await this.redis.get(TicketKeys.stock(eventId, ticketTypeId));
    return raw ? parseInt(raw, 10) : 0;
  }

  async getStockBulk(
    eventId: string,
    ticketTypeIds: string[],
  ): Promise<Record<string, number>> {
    if (ticketTypeIds.length === 0) return {};

    // Ambil semua stok sekaligus via pipeline
    const pipeline = this.redis.pipeline();
    ticketTypeIds.forEach((id) => pipeline.get(TicketKeys.stock(eventId, id)));
    const results = await pipeline.exec();

    return ticketTypeIds.reduce(
      (acc, id, index) => {
        const val = results?.[index]?.[1];
        acc[id] = val ? parseInt(val as string, 10) : 0;
        return acc;
      },
      {} as Record<string, number>,
    );
  }
}
