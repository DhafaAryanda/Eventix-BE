# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Hapus cache incremental jika ada
RUN rm -f tsconfig.build.tsbuildinfo

ENV DATABASE_URL="postgresql://postgres:password@localhost:5432/eventix"
RUN npx prisma generate
RUN npm run build

RUN ls -la dist/

# Stage 2: Production
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma

EXPOSE 4000

CMD ["node", "dist/main.js"]