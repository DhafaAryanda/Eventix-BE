# Dockerfile

# ================================
# Stage 1: Development
# Dipakai oleh docker-compose.yml lokal
# ================================
FROM node:20-alpine AS development
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 3000
CMD ["npm", "run", "start:dev"]


# ================================
# Stage 2: Builder
# Build TypeScript → JavaScript
# ================================
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Hapus devDependencies, sisakan production only
RUN npm prune --production


# ================================
# Stage 3: Production
# Image sekecil mungkin, hanya berisi
# yang dibutuhkan untuk jalan
# ================================
FROM node:20-alpine AS production
WORKDIR /app

ENV NODE_ENV=production

# Copy hasil build dari stage builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist         ./dist
COPY --from=builder /app/prisma       ./prisma
COPY --from=builder /app/package.json ./package.json

EXPOSE 3000

# Jalankan migration dulu, baru start server
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]