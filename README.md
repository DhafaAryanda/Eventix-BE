# Eventix BE

Backend platform tiket event Eventix — NestJS 11 (Fastify) + Prisma/PostgreSQL + Redis/BullMQ.

## Development lokal
Prasyarat: Node 22 (`nvm use`), Docker.

```bash
docker compose up -d            # Postgres + Redis (compose.yaml)
cp .env.example .env            # isi JWT_*, MAIL_*, XENDIT_*, STORAGE_*
npm ci
npx prisma migrate dev
npm run start:dev               # http://localhost:4000/api
```

| Script | Fungsi |
| --- | --- |
| `npm run start:dev` | dev server + watch |
| `npm run lint` / `lint:check` | ESLint (dengan / tanpa `--fix`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` / `test:e2e` | unit test / e2e (butuh DB) |
| `npm run build` | build ke `dist/` |

## Alur kerja & deploy
GitHub Flow: branch `feat/*` / `fix/*` → Pull Request ke `main` → CI (`.github/workflows/ci.yml`:
lint, typecheck, test, build) → merge → `deploy.yml`:

1. Build image → `ghcr.io/dhafaaryanda/eventix-be:sha-<commit>` (+ `latest`)
2. Salin `deploy/compose.yaml` ke VPS `~/stacks/eventix-be/compose.yaml`
3. `prisma migrate deploy`, lalu restart app dan tunggu healthy

Rollback: jalankan ulang workflow Deploy dari commit sebelumnya.

Secrets GitHub (Environment `production`): `VPS_HOST`, `VPS_PORT`, `VPS_USER`, `VPS_SSH_KEY`.
Konfigurasi runtime production ada di VPS `~/stacks/eventix-be/.env` (template: `.env.example`).

Panduan untuk agen AI: lihat [AGENTS.md](AGENTS.md).
