1. Admin buka penjualan
   PATCH /api/queue/events/:id/open-sale
   → Event status: PUBLISHED → SALE_OPEN
   → Batch pertama langsung di-trigger ke BullMQ

2. User join antrian (bisa ribuan bersamaan)
   POST /api/queue/join { eventId }
   → Redis ZADD queue:waiting:{eventId} {timestamp} {userId}
   → Return: posisi antrian & estimasi waktu

3. QueueScheduler (setiap 30 detik)
   → Cek event SALE_OPEN di PostgreSQL
   → Jika antrian tidak kosong → add job ke BullMQ

4. QueueProcessor (BullMQ worker)
   → Ambil 50 user teratas dari Redis sorted set
   → Issue session token untuk masing-masing (Redis SETEX TTL 10 menit)
   → ZREM dari waiting list
   → Emit event 'queue.batch.processed' (WebSocket fase 7)

5. User polling status (sementara WebSocket belum ada)
   GET /api/queue/status?eventId=xxx
   → Jika punya session token → { status: 'YOUR_TURN', sessionToken, expiresInSeconds }
   → Jika masih antri → { status: 'WAITING', position, estimatedWaitMinutes }

6. User yang dapat 'YOUR_TURN' → lanjut ke Fase 5 (Reserve Seat)
   Session token dipakai sekali, lalu dihapus dari Redis
