import { Injectable, Logger } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { Redis } from 'ioredis';
import { QueueKeys, QueueTTL, BATCH_SIZE } from './constants/queue.constants';
import { QueueStatusResult } from './types/queue.types';

@Injectable()
export class QueueCache {
  private readonly logger = new Logger(QueueCache.name);

  constructor(@InjectRedis() private redis: Redis) {}

  // ===========================
  // JOIN ANTRIAN
  // ===========================
  async joinQueue(
    eventId: string,
    userId: string,
  ): Promise<{
    isNew: boolean;
    position: number;
    queueSize: number;
  }> {
    const waitingKey = QueueKeys.waitingList(eventId);
    const joinedKey = QueueKeys.userJoined(userId, eventId);

    // Cek apakah sudah pernah join
    const alreadyJoined = await this.redis.exists(joinedKey);
    if (alreadyJoined) {
      // Ambil posisi terkini
      const [rank, size] = await Promise.all([
        this.redis.zrank(waitingKey, userId),
        this.redis.zcard(waitingKey),
      ]);
      return {
        isNew: false,
        position: rank !== null ? rank + 1 : 0,
        queueSize: size,
      };
    }

    // Masukkan ke sorted set dengan score = timestamp sekarang
    // Score = timestamp menjamin FIFO (siapa duluan join, duluan diproses)
    const score = Date.now();

    // Jalankan kedua operasi sekaligus via pipeline
    const pipeline = this.redis.pipeline();
    pipeline.zadd(waitingKey, score, userId);
    pipeline.setex(joinedKey, QueueTTL.USER_JOINED, '1');
    const results = await pipeline.exec();

    // Ambil posisi setelah masuk
    const [rank, size] = await Promise.all([
      this.redis.zrank(waitingKey, userId),
      this.redis.zcard(waitingKey),
    ]);

    return {
      isNew: true,
      position: rank !== null ? rank + 1 : 1,
      queueSize: size,
    };
  }

  // ===========================
  // CEK STATUS ANTRIAN
  // ===========================
  async getStatus(eventId: string, userId: string): Promise<QueueStatusResult> {
    // Cek apakah sudah giliran (punya session token)
    const sessionKey = QueueKeys.sessionToken(userId, eventId);
    const sessionToken = await this.redis.get(sessionKey);

    if (sessionToken) {
      const ttl = await this.redis.ttl(sessionKey);
      return {
        status: 'YOUR_TURN',
        sessionToken,
        expiresInSeconds: ttl,
      };
    }

    // Cek posisi di antrian
    const waitingKey = QueueKeys.waitingList(eventId);
    const [rank, size] = await Promise.all([
      this.redis.zrank(waitingKey, userId),
      this.redis.zcard(waitingKey),
    ]);

    if (rank === null) {
      return { status: 'NOT_IN_QUEUE' };
    }

    const position = rank + 1;
    const estimatedWaitMinutes = Math.ceil(position / BATCH_SIZE) * 0.5;

    return {
      status: 'WAITING',
      position,
      queueSize: size,
      estimatedWaitMinutes,
    };
  }

  // ===========================
  // AMBIL BATCH UNTUK DIPROSES
  // Dipanggil oleh QueueProcessor
  // ===========================
  async popBatch(eventId: string, batchSize: number): Promise<string[]> {
    const waitingKey = QueueKeys.waitingList(eventId);

    // Ambil N user teratas (paling lama menunggu)
    const users = await this.redis.zrange(waitingKey, 0, batchSize - 1);
    if (users.length === 0) return [];

    // Issue session token untuk semua user dalam satu pipeline
    // ZREM dan SETEX dijalankan atomic per user
    const pipeline = this.redis.pipeline();
    for (const userId of users) {
      const sessionToken = this.generateSessionToken();
      const sessionKey = QueueKeys.sessionToken(userId, eventId);

      pipeline.zrem(waitingKey, userId);
      pipeline.setex(sessionKey, QueueTTL.SESSION_TOKEN, sessionToken);
    }
    await pipeline.exec();

    // Increment counter untuk tracking
    await this.redis.incrby(QueueKeys.processedCount(eventId), users.length);

    this.logger.log(
      `Batch processed: ${users.length} users for event ${eventId}`,
    );

    return users;
  }

  // ===========================
  // VALIDASI SESSION TOKEN
  // Dipanggil oleh TicketService saat user mau reserve
  // ===========================
  async validateSessionToken(
    userId: string,
    eventId: string,
    token: string,
  ): Promise<boolean> {
    const sessionKey = QueueKeys.sessionToken(userId, eventId);
    const storedToken = await this.redis.get(sessionKey);
    return storedToken === token;
  }

  // Hapus session token setelah dipakai (agar tidak bisa reserve dua kali)
  async consumeSessionToken(userId: string, eventId: string): Promise<void> {
    await this.redis.del(QueueKeys.sessionToken(userId, eventId));
  }

  // ===========================
  // HELPERS
  // ===========================
  async getQueueSize(eventId: string): Promise<number> {
    return this.redis.zcard(QueueKeys.waitingList(eventId));
  }

  async isEventQueueEmpty(eventId: string): Promise<boolean> {
    const size = await this.getQueueSize(eventId);
    return size === 0;
  }

  // Buat session token — cukup random string, tidak perlu JWT
  // karena hanya dipakai sementara & divalidasi via Redis
  private generateSessionToken(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }
}
