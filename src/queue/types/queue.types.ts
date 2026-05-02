export type QueueStatus =
  | 'NOT_IN_QUEUE' // belum join
  | 'WAITING' // sedang antri
  | 'YOUR_TURN' // sudah giliran, punya session token
  | 'USED' // session token sudah dipakai untuk reserve
  | 'EVENT_CLOSED'; // penjualan sudah tutup

export type JoinQueueResult = {
  status: 'JOINED' | 'ALREADY_IN_QUEUE';
  position: number;
  estimatedWaitMinutes: number;
  queueSize: number;
};

export type QueueStatusResult =
  | {
      status: 'WAITING';
      position: number;
      estimatedWaitMinutes: number;
      queueSize: number;
    }
  | { status: 'YOUR_TURN'; sessionToken: string; expiresInSeconds: number }
  | { status: 'NOT_IN_QUEUE' | 'EVENT_CLOSED' };

export type ProcessBatchJobData = {
  eventId: string;
  batchSize: number;
};
