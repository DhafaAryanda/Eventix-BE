import { Injectable, Logger } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { Redis } from 'ioredis';
import {
  EventWithTicketTypes,
  EventListItem,
} from './types/event-with-types.type';

// Semua TTL dan key pattern di satu tempat → mudah diubah
const CACHE_TTL = {
  EVENT_DETAIL: 300, // 5 menit
  EVENT_LIST: 120, // 2 menit (lebih pendek karena data bisa sering berubah)
} as const;

// Fungsi helper untuk generate cache key yang konsisten
const CacheKey = {
  eventDetail: (id: string) => `event:detail:${id}`,
  eventList: (query: string) => `event:list:${query}`,
};

@Injectable()
export class EventsCache {
  private readonly logger = new Logger(EventsCache.name);

  constructor(@InjectRedis() private redis: Redis) {}

  // ===========================
  // EVENT DETAIL
  // ===========================
  async getEventDetail(id: string): Promise<EventWithTicketTypes | null> {
    try {
      const cached = await this.redis.get(CacheKey.eventDetail(id));
      if (!cached) return null;
      return JSON.parse(cached);
    } catch (err) {
      // Jika Redis error, jangan crash app — fallback ke DB
      this.logger.warn(`Cache GET error for event ${id}: ${err.message}`);
      return null;
    }
  }

  async setEventDetail(id: string, data: EventWithTicketTypes): Promise<void> {
    try {
      await this.redis.setex(
        CacheKey.eventDetail(id),
        CACHE_TTL.EVENT_DETAIL,
        JSON.stringify(data),
      );
    } catch (err) {
      this.logger.warn(`Cache SET error for event ${id}: ${err.message}`);
    }
  }

  async invalidateEventDetail(id: string): Promise<void> {
    try {
      await this.redis.del(CacheKey.eventDetail(id));
    } catch (err) {
      this.logger.warn(`Cache DEL error for event ${id}: ${err.message}`);
    }
  }

  // ===========================
  // EVENT LIST
  // ===========================
  async getEventList(queryKey: string): Promise<{
    data: EventListItem[];
    total: number;
    page: number;
    limit: number;
  } | null> {
    try {
      const cached = await this.redis.get(CacheKey.eventList(queryKey));
      if (!cached) return null;
      return JSON.parse(cached);
    } catch (err) {
      this.logger.warn(`Cache GET error for event list: ${err.message}`);
      return null;
    }
  }

  async setEventList(
    queryKey: string,
    data: { data: EventListItem[]; total: number; page: number; limit: number },
  ): Promise<void> {
    try {
      await this.redis.setex(
        CacheKey.eventList(queryKey),
        CACHE_TTL.EVENT_LIST,
        JSON.stringify(data),
      );
    } catch (err) {
      this.logger.warn(`Cache SET error for event list: ${err.message}`);
    }
  }

  // Invalidate semua list cache saat ada event baru/update
  // Pakai pattern scan karena key list bisa banyak variasinya
  async invalidateAllEventLists(): Promise<void> {
    try {
      // SCAN lebih aman dari KEYS di production (non-blocking)
      const keys = await this.scanKeys('event:list:*');
      if (keys.length === 0) return;

      // Hapus semua sekaligus dengan pipeline
      const pipeline = this.redis.pipeline();
      keys.forEach((key) => pipeline.del(key));
      await pipeline.exec();

      this.logger.log(`Invalidated ${keys.length} event list cache keys`);
    } catch (err) {
      this.logger.warn(`Cache invalidate list error: ${err.message}`);
    }
  }

  // ===========================
  // STOCK (untuk fase ticket nanti)
  // Disimpan di sini agar cache logic terpusat
  // ===========================
  async seedTicketStock(eventId: string, ticketTypeId: string, quota: number) {
    try {
      const key = `stock:${eventId}:${ticketTypeId}`;
      // SET NX = hanya set jika belum ada (tidak overwrite stok yang sudah berkurang)
      await this.redis.setnx(key, quota);
    } catch (err) {
      this.logger.warn(`Stock seed error: ${err.message}`);
    }
  }

  // ===========================
  // PRIVATE HELPERS
  // ===========================
  private async scanKeys(pattern: string): Promise<string[]> {
    const keys: string[] = [];
    let cursor = '0';

    do {
      const [nextCursor, batch] = await this.redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100,
      );
      cursor = nextCursor;
      keys.push(...batch);
    } while (cursor !== '0');

    return keys;
  }
}
