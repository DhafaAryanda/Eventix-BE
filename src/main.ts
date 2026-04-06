import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

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
  console.log('Server run in: http://localhost:3000');
}

void bootstrap();
