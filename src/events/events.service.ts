import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsCache } from './events.cache';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { CreateTicketTypeDto } from './dto/create-ticket-type.dto';
import { EventSortBy, QueryEventDto } from './dto/query-event.dto';
import { UpdateTicketTypeDto } from './dto/update-ticket-type.dto';
import { EventStatus, Role } from '@prisma/client';
import { EventListItem } from './types/event-with-types.type';
import { TicketCache } from 'src/ticket/ticket.cache';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private prisma: PrismaService,
    private cache: EventsCache,
    private ticketCache: TicketCache,
    private storage: StorageService,
  ) {}

  // ===========================
  // CREATE EVENT (ADMIN / ORGANIZER)
  // ===========================
  async createEvent(dto: CreateEventDto, userId: string) {
    // Validasi tanggal
    const eventDate = new Date(dto.eventDate);
    const saleOpenAt = new Date(dto.saleOpenAt);
    const saleCloseAt = dto.saleCloseAt ? new Date(dto.saleCloseAt) : null;

    if (eventDate <= new Date()) {
      throw new BadRequestException('Tanggal event harus di masa depan');
    }
    if (saleOpenAt >= eventDate) {
      throw new BadRequestException(
        'Waktu buka penjualan harus sebelum tanggal event',
      );
    }
    if (saleCloseAt && saleCloseAt >= eventDate) {
      throw new BadRequestException(
        'Waktu tutup penjualan harus sebelum tanggal event',
      );
    }

    const event = await this.prisma.event.create({
      data: {
        title: dto.title,
        description: dto.description,
        venue: dto.venue,
        city: dto.city,
        eventDate,
        saleOpenAt,
        saleCloseAt,
        bannerUrl: dto.bannerUrl,
        eventType: dto.eventType,
        tags: dto.tags ?? [],
        createdBy: userId,
        status: EventStatus.DRAFT,
      },
      include: {
        ticketTypes: true,
        creator: { select: { id: true, name: true } },
      },
    });

    // Invalidate list cache karena ada event baru
    await this.cache.invalidateAllEventLists();

    this.logger.log(`Event created: ${event.id} by user ${userId}`);
    return event;
  }

  // ===========================
  // ADD TICKET TYPE KE EVENT
  // ===========================
  async addTicketType(
    eventId: string,
    dto: CreateTicketTypeDto,
    userId: string,
    userRole: Role,
  ) {
    const event = await this.findEventOrThrow(eventId);

    // Organizer hanya bisa edit event miliknya sendiri
    this.checkEventOwnership(event, userId, userRole);

    if (event.status === EventStatus.SALE_OPEN) {
      throw new BadRequestException(
        'Tidak bisa menambah tipe tiket saat penjualan sudah dibuka',
      );
    }

    const ticketType = await this.prisma.ticketType.create({
      data: {
        eventId,
        name: dto.name,
        price: dto.price,
        quota: dto.quota,
        maxPerUser: dto.maxPerUser,
        description: dto.description,
        sortOrder: dto.sortOrder ?? 0,
      },
    });

    // Invalidate cache event ini
    await this.cache.invalidateEventDetail(eventId);
    await this.cache.invalidateAllEventLists();

    return ticketType;
  }

  // ===========================
  // UPDATE TICKET TYPE (ADMIN / ORGANIZER)
  // ===========================
  async updateTicketType(
    eventId: string,
    ticketTypeId: string,
    dto: UpdateTicketTypeDto,
    userId: string,
    userRole: Role,
  ) {
    const event = await this.findEventOrThrow(eventId);
    this.checkEventOwnership(event, userId, userRole);

    if (
      event.status === EventStatus.SALE_OPEN ||
      event.status === EventStatus.COMPLETED
    ) {
      throw new BadRequestException(
        'Tidak bisa mengubah tipe tiket saat penjualan sudah dibuka atau event selesai',
      );
    }

    const ticketType = event.ticketTypes.find((tt) => tt.id === ticketTypeId);
    if (!ticketType) throw new NotFoundException('Tipe tiket tidak ditemukan');

    const updated = await this.prisma.ticketType.update({
      where: { id: ticketTypeId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.price !== undefined && { price: dto.price }),
        ...(dto.quota !== undefined && { quota: dto.quota }),
        ...(dto.maxPerUser !== undefined && { maxPerUser: dto.maxPerUser }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
      },
    });

    await this.cache.invalidateEventDetail(eventId);
    await this.cache.invalidateAllEventLists();

    return updated;
  }

  // ===========================
  // DELETE TICKET TYPE (ADMIN / ORGANIZER)
  // ===========================
  async deleteTicketType(
    eventId: string,
    ticketTypeId: string,
    userId: string,
    userRole: Role,
  ) {
    const event = await this.findEventOrThrow(eventId);
    this.checkEventOwnership(event, userId, userRole);

    if (
      event.status === EventStatus.SALE_OPEN ||
      event.status === EventStatus.COMPLETED
    ) {
      throw new BadRequestException(
        'Tidak bisa menghapus tipe tiket saat penjualan sudah dibuka atau event selesai',
      );
    }

    const ticketType = event.ticketTypes.find((tt) => tt.id === ticketTypeId);
    if (!ticketType) throw new NotFoundException('Tipe tiket tidak ditemukan');

    const orderCount = await this.prisma.order.count({
      where: { ticketTypeId, status: { not: 'CANCELLED' } },
    });

    if (orderCount > 0) {
      throw new BadRequestException(
        'Tidak bisa menghapus tipe tiket yang sudah memiliki order',
      );
    }

    await this.prisma.ticketType.delete({ where: { id: ticketTypeId } });

    await this.cache.invalidateEventDetail(eventId);
    await this.cache.invalidateAllEventLists();

    return { message: 'Tipe tiket berhasil dihapus' };
  }

  // ===========================
  // PUBLISH EVENT
  // Mengubah status DRAFT → PUBLISHED
  // Seed stok tiket ke Redis
  // ===========================
  async publishEvent(eventId: string, userId: string, userRole: Role) {
    const event = await this.findEventOrThrow(eventId);
    this.checkEventOwnership(event, userId, userRole);

    if (event.status !== EventStatus.DRAFT) {
      throw new BadRequestException(
        `Event tidak bisa dipublish dari status ${event.status}`,
      );
    }

    if (event.ticketTypes.length === 0) {
      throw new BadRequestException(
        'Tambahkan minimal satu tipe tiket sebelum publish',
      );
    }

    const updated = await this.prisma.event.update({
      where: { id: eventId },
      data: { status: EventStatus.PUBLISHED },
      include: {
        ticketTypes: true,
        creator: { select: { id: true, name: true } },
      },
    });

    // Seed stok semua ticket type ke Redis
    // Menggunakan Promise.all agar parallel, bukan sequential
    await Promise.all(
      updated.ticketTypes.map((tt) =>
        this.cache.seedTicketStock(eventId, tt.id, tt.quota),
      ),
    );

    // Update cache
    await this.cache.invalidateEventDetail(eventId);
    await this.cache.invalidateAllEventLists();

    this.logger.log(`Event published: ${eventId}`);
    return updated;
  }

  // ===========================
  // GET LIST EVENTS (PUBLIC)
  // Dengan pagination, filter, search, dan caching
  // ===========================
  async getEvents(query: QueryEventDto, isAdmin: boolean) {
    // Generate cache key unik berdasarkan semua parameter query
    const cacheKey = this.buildQueryCacheKey(query, isAdmin);

    // Cek cache dulu
    const cached = await this.cache.getEventList(cacheKey);
    if (cached) {
      this.logger.debug(`Cache HIT: event list [${cacheKey}]`);
      return cached;
    }

    this.logger.debug(`Cache MISS: event list [${cacheKey}]`);

    const {
      page = 1,
      limit = 12,
      search,
      city,
      status,
      eventType,
      tag,
      sortBy,
    } = query;
    const skip = (page - 1) * limit;

    // Build where clause dinamis
    const where: any = {};

    // User biasa hanya lihat event PUBLISHED dan SALE_OPEN
    // Admin bisa lihat semua status
    if (!isAdmin) {
      where.status = { in: [EventStatus.PUBLISHED, EventStatus.SALE_OPEN] };
    } else if (status) {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { venue: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (city) {
      where.city = { contains: city, mode: 'insensitive' };
    }

    if (eventType) {
      where.eventType = eventType;
    }

    if (tag) {
      where.tags = { has: tag };
    }

    let orderBy: any;
    const isAppLayerSort =
      sortBy === EventSortBy.LOWEST_PRICE ||
      sortBy === EventSortBy.HIGHEST_PRICE ||
      sortBy === EventSortBy.NEAREST ||
      sortBy === undefined;

    switch (sortBy) {
      case EventSortBy.NEWEST:
        orderBy = { createdAt: 'desc' };
        break;
      case EventSortBy.LOWEST_PRICE:
      case EventSortBy.HIGHEST_PRICE:
      case EventSortBy.NEAREST:
      default:
        orderBy = { eventDate: 'asc' };
        break;
    }

    // Jalankan query count & data secara parallel
    const [total, events] = await Promise.all([
      this.prisma.event.count({ where }),
      this.prisma.event.findMany({
        where,
        // App-layer sorts require fetching all records before paginating
        ...(isAppLayerSort ? {} : { skip, take: limit }),
        orderBy,
        select: {
          id: true,
          title: true,
          venue: true,
          city: true,
          eventDate: true,
          saleOpenAt: true,
          saleCloseAt: true,
          status: true,
          bannerUrl: true,
          eventType: true,
          tags: true,
          ticketTypes: {
            select: {
              id: true,
              name: true,
              price: true,
              quota: true,
            },
            orderBy: { sortOrder: 'asc' as const },
          },
        },
      }),
    ]);

    // Compute lowestPrice di application layer, bukan di DB
    let data: EventListItem[] = events.map((event) => ({
      ...event,
      lowestPrice:
        event.ticketTypes.length > 0
          ? Math.min(...event.ticketTypes.map((tt) => tt.price))
          : 0,
    }));

    if (sortBy === EventSortBy.LOWEST_PRICE) {
      data.sort((a, b) => a.lowestPrice - b.lowestPrice);
    } else if (sortBy === EventSortBy.HIGHEST_PRICE) {
      data.sort((a, b) => b.lowestPrice - a.lowestPrice);
    } else if (sortBy === EventSortBy.NEAREST || sortBy === undefined) {
      const now = Date.now();
      data.sort(
        (a, b) =>
          Math.abs(a.eventDate.getTime() - now) -
          Math.abs(b.eventDate.getTime() - now),
      );
    }

    if (isAppLayerSort) {
      data = data.slice(skip, skip + limit);
    }

    const result = {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };

    // Simpan ke cache
    await this.cache.setEventList(cacheKey, result);

    return result;
  }

  // ===========================
  // GET DETAIL EVENT (PUBLIC)
  // ===========================
  async getEventById(eventId: string, isAdmin: boolean) {
    // Cek cache dulu
    const cached = await this.cache.getEventDetail(eventId);
    if (cached) {
      this.logger.debug(`Cache HIT: event detail [${eventId}]`);

      // Non-admin tidak boleh lihat event DRAFT
      if (!isAdmin && cached.status === EventStatus.DRAFT) {
        throw new NotFoundException('Event tidak ditemukan');
      }
      return cached;
    }

    this.logger.debug(`Cache MISS: event detail [${eventId}]`);

    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: {
        ticketTypes: {
          orderBy: { sortOrder: 'asc' },
        },
        creator: {
          select: { id: true, name: true },
        },
      },
    });

    if (!event) throw new NotFoundException('Event tidak ditemukan');

    if (!isAdmin && event.status === EventStatus.DRAFT) {
      throw new NotFoundException('Event tidak ditemukan');
    }

    // Simpan ke cache
    await this.cache.setEventDetail(eventId, event);

    return event;
  }

  // ===========================
  // UPDATE EVENT (ADMIN / ORGANIZER)
  // ===========================
  async updateEvent(
    eventId: string,
    dto: UpdateEventDto,
    userId: string,
    userRole: Role,
  ) {
    const event = await this.findEventOrThrow(eventId);
    this.checkEventOwnership(event, userId, userRole);

    // Tidak boleh edit event yang sudah selesai
    if (event.status === EventStatus.COMPLETED) {
      throw new BadRequestException(
        'Event yang sudah selesai tidak bisa diedit',
      );
    }

    const updated = await this.prisma.event.update({
      where: { id: eventId },
      data: {
        ...(dto.title && { title: dto.title }),
        ...(dto.description && { description: dto.description }),
        ...(dto.venue && { venue: dto.venue }),
        ...(dto.city && { city: dto.city }),
        ...(dto.eventDate && { eventDate: new Date(dto.eventDate) }),
        ...(dto.saleOpenAt && { saleOpenAt: new Date(dto.saleOpenAt) }),
        ...(dto.saleCloseAt && { saleCloseAt: new Date(dto.saleCloseAt) }),
        ...(dto.bannerUrl && { bannerUrl: dto.bannerUrl }),
        ...(dto.status && { status: dto.status }),
        ...(dto.eventType !== undefined && { eventType: dto.eventType }),
        ...(dto.tags !== undefined && { tags: dto.tags }),
      },
      include: {
        ticketTypes: true,
        creator: { select: { id: true, name: true } },
      },
    });

    // Invalidate cache setelah update
    await Promise.all([
      this.cache.invalidateEventDetail(eventId),
      this.cache.invalidateAllEventLists(),
    ]);

    return updated;
  }

  // ===========================
  // DELETE EVENT (ADMIN ONLY)
  // ===========================
  async deleteEvent(eventId: string, userRole: Role) {
    // Hanya ADMIN yang bisa hapus, bukan ORGANIZER
    if (userRole !== Role.ADMIN) {
      throw new ForbiddenException('Hanya ADMIN yang bisa menghapus event');
    }

    const event = await this.findEventOrThrow(eventId);

    if (event.status === EventStatus.SALE_OPEN) {
      throw new BadRequestException(
        'Tidak bisa menghapus event yang sedang dalam penjualan',
      );
    }

    await this.prisma.event.delete({ where: { id: eventId } });

    await Promise.all([
      this.cache.invalidateEventDetail(eventId),
      this.cache.invalidateAllEventLists(),
    ]);

    return { message: 'Event berhasil dihapus' };
  }

  async getMyEvents(userId: string, userRole: Role, query: QueryEventDto) {
    const { page = 1, limit = 12, status } = query;
    const skip = (page - 1) * limit;

    const where = {
      // ADMIN lihat semua, ORGANIZER hanya miliknya
      ...(userRole === Role.ORGANIZER && { createdBy: userId }),
      ...(status && { status }),
    };

    // Jalankan count & fetch parallel
    const [total, events] = await Promise.all([
      this.prisma.event.count({ where }),
      this.prisma.event.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          ticketTypes: {
            orderBy: { sortOrder: 'asc' },
          },
          creator: {
            select: { id: true, name: true },
          },
        },
      }),
    ]);

    // ===========================
    // HITUNG TOTAL ORDER PER EVENT
    // Dilakukan terpisah karena Order tidak berelasi
    // langsung ke Event (via TicketType)
    // ===========================
    const allTicketTypeIds = events.flatMap((e) =>
      e.ticketTypes.map((tt) => tt.id),
    );

    // Satu query untuk semua event sekaligus — efisien
    const orderCounts =
      allTicketTypeIds.length > 0
        ? await this.prisma.order.groupBy({
            by: ['ticketTypeId'],
            where: {
              ticketTypeId: { in: allTicketTypeIds },
              status: { not: 'CANCELLED' },
            },
            _count: { id: true },
          })
        : [];

    // Buat map: ticketTypeId → jumlah order
    const orderCountByTicketType = new Map<string, number>(
      orderCounts.map((oc) => [oc.ticketTypeId, oc._count.id]),
    );

    // Buat map: eventId → total order (jumlahkan semua ticket type)
    const orderCountByEvent = new Map<string, number>();
    for (const event of events) {
      const total = event.ticketTypes.reduce((acc, tt) => {
        return acc + (orderCountByTicketType.get(tt.id) ?? 0);
      }, 0);
      orderCountByEvent.set(event.id, total);
    }

    // ===========================
    // GABUNGKAN STOK REDIS
    // Hanya untuk event yang aktif (PUBLISHED / SALE_OPEN)
    // ===========================
    const activeEvents = events.filter(
      (e) =>
        e.status === EventStatus.PUBLISHED ||
        e.status === EventStatus.SALE_OPEN,
    );

    // Ambil semua stok aktif sekaligus — satu round-trip per event aktif
    const stockMaps = await Promise.all(
      activeEvents.map(async (event) => ({
        eventId: event.id,
        stockMap: await this.ticketCache.getStockBulk(
          event.id,
          event.ticketTypes.map((tt) => tt.id),
        ),
      })),
    );

    // Konversi ke Map untuk lookup O(1)
    const stockByEvent = new Map(stockMaps.map((s) => [s.eventId, s.stockMap]));

    // ===========================
    // BENTUK RESPONSE AKHIR
    // ===========================
    const data = events.map((event) => {
      const stockMap = stockByEvent.get(event.id) ?? {};

      return {
        ...event,
        ticketTypes: event.ticketTypes.map((tt) => ({
          ...tt,
          // Stok real-time dari Redis, fallback ke quota jika tidak aktif
          available: stockMap[tt.id] ?? tt.quota,
        })),
        totalOrders: orderCountByEvent.get(event.id) ?? 0,
      };
    });

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ===========================
  // GET DETAIL MY EVENT (ADMIN / ORGANIZER)
  // Includes totalOrders + real-time stock per ticket type
  // ===========================
  async getMyEventById(eventId: string, userId: string, userRole: Role) {
    const event = await this.findEventOrThrow(eventId);
    this.checkEventOwnership(event, userId, userRole);

    const ticketTypeIds = event.ticketTypes.map((tt) => tt.id);

    const orderCounts =
      ticketTypeIds.length > 0
        ? await this.prisma.order.groupBy({
            by: ['ticketTypeId'],
            where: {
              ticketTypeId: { in: ticketTypeIds },
              status: { not: 'CANCELLED' },
            },
            _count: { id: true },
          })
        : [];

    const orderCountByTicketType = new Map<string, number>(
      orderCounts.map((oc) => [oc.ticketTypeId, oc._count.id]),
    );

    const totalOrders = event.ticketTypes.reduce(
      (acc, tt) => acc + (orderCountByTicketType.get(tt.id) ?? 0),
      0,
    );

    const isActive =
      event.status === EventStatus.PUBLISHED ||
      event.status === EventStatus.SALE_OPEN;

    const stockMap = isActive
      ? await this.ticketCache.getStockBulk(eventId, ticketTypeIds)
      : {};

    return {
      ...event,
      ticketTypes: event.ticketTypes.map((tt) => ({
        ...tt,
        available: stockMap[tt.id] ?? tt.quota,
        orders: orderCountByTicketType.get(tt.id) ?? 0,
      })),
      totalOrders,
    };
  }

  // ===========================
  // UPLOAD BANNER (ADMIN / ORGANIZER)
  // ===========================
  async uploadBanner(
    eventId: string,
    buffer: Buffer,
    mimetype: string,
    userId: string,
    userRole: Role,
  ) {
    const event = await this.findEventOrThrow(eventId);
    this.checkEventOwnership(event, userId, userRole);

    const oldKey = this.storage.extractKeyFromUrl(event.bannerUrl);
    const { url } = await this.storage.uploadImage({
      buffer,
      mimetype,
      folder: 'banners',
      oldKey,
    });

    await this.prisma.event.update({
      where: { id: eventId },
      data: { bannerUrl: url },
    });

    await Promise.all([
      this.cache.invalidateEventDetail(eventId),
      this.cache.invalidateAllEventLists(),
    ]);

    return { message: 'Banner berhasil diupload', bannerUrl: url };
  }

  // ===========================
  // DELETE BANNER (ADMIN / ORGANIZER)
  // ===========================
  async deleteBanner(eventId: string, userId: string, userRole: Role) {
    const event = await this.findEventOrThrow(eventId);
    this.checkEventOwnership(event, userId, userRole);

    if (!event.bannerUrl) {
      throw new BadRequestException('Event tidak memiliki banner');
    }

    const key = this.storage.extractKeyFromUrl(event.bannerUrl);
    if (key) await this.storage.deleteImage(key);

    await this.prisma.event.update({
      where: { id: eventId },
      data: { bannerUrl: null },
    });

    await Promise.all([
      this.cache.invalidateEventDetail(eventId),
      this.cache.invalidateAllEventLists(),
    ]);

    return { message: 'Banner berhasil dihapus' };
  }

  // ===========================
  // PRIVATE HELPERS
  // ===========================
  private async findEventOrThrow(eventId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: {
        ticketTypes: true,
        creator: { select: { id: true, name: true } },
      },
    });
    if (!event) throw new NotFoundException('Event tidak ditemukan');
    return event;
  }

  private checkEventOwnership(event: any, userId: string, userRole: Role) {
    // ADMIN bisa edit semua event
    // ORGANIZER hanya bisa edit event yang dia buat
    if (userRole === Role.ADMIN) return;

    if (event.createdBy !== userId) {
      throw new ForbiddenException('Kamu tidak memiliki akses ke event ini');
    }
  }

  private buildQueryCacheKey(query: QueryEventDto, isAdmin: boolean): string {
    // Buat key deterministik dari semua parameter
    const parts = [
      `p:${query.page ?? 1}`,
      `l:${query.limit ?? 12}`,
      `s:${query.search ?? ''}`,
      `c:${query.city ?? ''}`,
      `st:${query.status ?? ''}`,
      `et:${query.eventType ?? ''}`,
      `tg:${query.tag ?? ''}`,
      `sb:${query.sortBy ?? EventSortBy.NEAREST}`,
      `admin:${isAdmin}`,
    ];
    return parts.join('|');
  }
}
