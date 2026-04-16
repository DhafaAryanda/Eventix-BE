// Nama queue BullMQ — dipakai di module, processor, dan scheduler
export const QUEUE_NAME = 'virtual-queue';

// Nama job di dalam queue
export const JOB_NAMES = {
  PROCESS_BATCH: 'process-batch',
} as const;

// Redis key patterns — terpusat agar tidak typo di mana-mana
export const QueueKeys = {
  // Sorted set antrian: score = timestamp join (FIFO)
  waitingList: (eventId: string) => `queue:waiting:${eventId}`,

  // String: session token untuk user yang sudah giliran
  sessionToken: (userId: string, eventId: string) =>
    `queue:session:${userId}:${eventId}`,

  // String: flag bahwa user sudah pernah join antrian event ini
  userJoined: (userId: string, eventId: string) =>
    `queue:joined:${userId}:${eventId}`,

  // String: total kapasitas yang sudah diproses (untuk estimasi waktu)
  processedCount: (eventId: string) => `queue:processed:${eventId}`,
} as const;

// TTL dalam detik
export const QueueTTL = {
  SESSION_TOKEN: 600, // 10 menit untuk pilih & reserve tiket
  USER_JOINED: 86400, // 24 jam (reset tiap hari)
} as const;

// Berapa user diproses per batch
export const BATCH_SIZE = 50;

// Interval processor jalan (ms)
export const PROCESSOR_INTERVAL_MS = 30_000; // setiap 30 detik
