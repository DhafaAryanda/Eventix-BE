User dapat 'YOUR_TURN' dari antrian
│
▼
POST /api/tickets/reserve
{
eventId,
ticketTypeId,
sessionToken, ← dari antrian
quantity
}
│
▼
[1] Validasi session token di Redis
→ Jika tidak valid → return SESSION_INVALID
│
▼
[2] Validasi event & ticket type di PostgreSQL
→ Pastikan event masih SALE_OPEN
→ Pastikan quantity ≤ maxPerUser
│
▼
[3] Jalankan Lua script atomic di Redis:

    -- Cek user sudah reserve? → return -3 (ALREADY_RESERVED)
    -- Ambil stock
    -- Stock nil?       → return -1 (NOT_FOUND)
    -- Stock < qty?     → return -2 (INSUFFICIENT)
    -- ✅ Semua lolos:
    --   DECRBY stock
    --   SETEX reservation:{token} 300 {data}
    --   SETEX user-reservation:{userId}:{eventId} 300 "1"
    --   return remaining stock

        │
        ├── Gagal → return reason ke client
        │
        └── Berhasil
                │
                ▼
            [4] Hapus session token (agar tidak bisa reserve lagi)
                │
                ▼
            Return reservationToken ke client
            → Client simpan token ini untuk dipakai di fase Order

Setelah 5 menit (TTL Redis):
→ reservation:{token} expired otomatis
→ user-reservation:{userId}:{eventId} expired otomatis
→ Scheduler cek order PENDING yang expired
→ Jika ada order PENDING terkait → status → EXPIRED
→ Jika tidak ada order → stok sudah kembali otomatis via TTL
