import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { ConfigService } from '@nestjs/config';
import fastifyCors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { PrismaExceptionFilter } from './prisma/prisma-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    { bufferLogs: true },
  );

  // Setup Pino logger sebagai logger global
  const logger = app.get(Logger);
  app.useLogger(logger);

  // Get ConfigService untuk akses environment variables
  const configService = app.get(ConfigService);
  const frontendUrl =
    configService.get<string>('FRONTEND_URL') || 'http://localhost:5173';
  const nodeEnv = configService.get<string>('NODE_ENV') || 'development';

  logger.log('DATABASE_URL configured', 'Bootstrap');

  // Konfigurasi CORS untuk Fastify
  await app.register(fastifyCors, {
    origin:
      nodeEnv === 'production'
        ? [frontendUrl] // Production: hanya izinkan frontend URL yang ditentukan
        : true, // Development: izinkan semua origin
    credentials: true, // Izinkan cookies dan authorization headers
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
    ],
    exposedHeaders: ['Authorization'],
    maxAge: 86400, // Cache preflight request selama 24 jam
  });

  await app.register(multipart, {
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  });

  // Prefix semua route dengan /api.
  // `/metrics` dikecualikan: itu konvensi baku Prometheus dan bukan bagian
  // dari API publik aplikasi. Endpoint-nya diblokir dari internet di nginx.
  app.setGlobalPrefix('api', { exclude: ['metrics'] });

  // Global filter untuk Prisma errors
  app.useGlobalFilters(new PrismaExceptionFilter());

  // Validasi otomatis semua request body
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // buang field tidak dikenal
      forbidNonWhitelisted: true, // error jika ada field tidak dikenal
      transform: true, // auto-convert tipe data
    }),
  );

  await app.listen(4000, '0.0.0.0');
  logger.log('Server running on: http://localhost:4000', 'Bootstrap');
  logger.log(
    `CORS enabled for: ${nodeEnv === 'production' ? frontendUrl : 'all origins (development)'}`,
    'Bootstrap',
  );
}

void bootstrap();
