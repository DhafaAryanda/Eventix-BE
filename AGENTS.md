# AGENTS.md — Eventix BE

Konteks & aturan untuk agen AI (Hermes, Claude Code, dll.) yang bekerja di repo ini.

## Stack
- NestJS 11 di atas Fastify, TypeScript, Node 22 (`.nvmrc`)
- Prisma 6 + PostgreSQL 16 (`prisma/schema.prisma`, migrasi di `prisma/migrations/`)
- Redis 7: cache (ioredis) + antrean (BullMQ) — modul `queue/`
- Object storage S3-compatible (Cloudflare R2) via `@aws-sdk/client-s3` — modul `storage/` (**nonaktif**, lihat di bawah)
- Email (Nodemailer + Handlebars, `mail/templates/`) (**nonaktif**), pembayaran Xendit (`payment/`)
- Metrik Prometheus di `/metrics` (modul `observability/`); semua route lain berprefix `/api`

## Struktur
```
src/<modul>/        controller, service, module, dto/, types/
                    modul: auth, users, events, ticket, order, payment, queue, storage, mail, observability, prisma
prisma/             schema + migrations
test/               e2e (butuh DB)
compose.yaml        Postgres + Redis untuk development lokal
deploy/compose.yaml compose PRODUCTION (disalin CI ke VPS)
.github/workflows/  ci.yml (PR) dan deploy.yml (push ke main)
```

## Perintah
```bash
npm ci
npx prisma generate      # wajib setelah install / ubah schema
npm run lint:check       # ESLint tanpa --fix (masih ada error bawaan, jangan menambah yang baru)
npm run typecheck
npm test                 # unit test (jest, *.spec.ts di src/)
npm run build
```
Di workspace Hermes **tidak ada database**. Jika `schema.prisma` berubah, tulis di deskripsi PR
bahwa migration harus dibuat dengan `npx prisma migrate dev --name <nama>` di mesin yang punya DB —
jangan menulis SQL migration tebakan.

## Fitur nonaktif (sementara)
Upload gambar (Cloudflare R2) dan email (SMTP) di-comment, bukan dihapus. Setiap titiknya ditandai:
- `[NONAKTIF-R2]` — `StorageModule`, route & method upload/hapus avatar (`users/`) dan banner (`events/`)
- `[NONAKTIF-SMTP]` — `MailModule`, verifikasi email, kirim ulang verifikasi, lupa/reset password (`auth/`),
  email konfirmasi tiket (`payment/`). Selama nonaktif, `register()` langsung set `isEmailVerified: true`.

Cari semua titik: `grep -rn "NONAKTIF-R2\|NONAKTIF-SMTP" src`. **Jangan mengaktifkan kembali** tanpa diminta
eksplisit — butuh kredensial di `.env` production. Blok `/* [NONAKTIF-…] mulai … selesai */` diaktifkan
dengan menghapus baris pembuka/penutupnya; baris `// … // [NONAKTIF-…]` dengan menghapus `// ` di depannya.

## Aturan kerja (wajib)
1. **Jangan pernah commit/push ke `main`.** Mulai dari main terbaru:
   `git switch main && git pull && git switch -c feat/<topik>` (atau `fix/…`, `chore/…`, `refactor/…`).
2. Commit memakai Conventional Commits berbahasa Indonesia, contoh: `feat(events): tambah filter kota`.
3. Sebelum push: `typecheck`, `test`, dan `build` harus lulus; `lint:check` tidak boleh bertambah error.
4. Push branch, lalu buka Pull Request ke `main` berisi ringkasan perubahan dan cara menguji.
   Merge dilakukan oleh manusia; deploy berjalan otomatis setelah merge.
5. Jangan mengubah `.github/workflows/`, `deploy/`, `Dockerfile`, atau file `.env*` (kecuali `.env.example`)
   kecuali diminta secara eksplisit. Jangan pernah menulis secret/token ke repo.
6. Ikuti pola yang ada: DTO dengan `class-validator`, logika di service, controller tipis,
   pesan & komentar dalam bahasa Indonesia.
