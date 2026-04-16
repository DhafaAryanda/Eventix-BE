import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { Logger } from 'nestjs-pino';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    { bufferLogs: true },
  );

  // Setup Pino logger sebagai logger global
  const logger = app.get(Logger);
  app.useLogger(logger);

  logger.log('DATABASE_URL configured', 'Bootstrap');

  // Prefix semua route dengan /api
  app.setGlobalPrefix('api');

  // Validasi otomatis semua request body
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // buang field tidak dikenal
      forbidNonWhitelisted: true, // error jika ada field tidak dikenal
      transform: true, // auto-convert tipe data
    }),
  );

  await app.listen(3000, '0.0.0.0');
  logger.log('Server running on: http://localhost:3000', 'Bootstrap');
}

void bootstrap();
