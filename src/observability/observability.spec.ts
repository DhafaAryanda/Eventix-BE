import {
  Controller,
  Get,
  Param,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  NestFastifyApplication,
  FastifyAdapter,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';

import { ObservabilityModule } from './observability.module';

@Controller('demo')
class DemoController {
  @Get('ok')
  ok() {
    return { ok: true };
  }

  @Get('item/:id')
  byId(@Param('id') id: string) {
    return { id };
  }

  @Get('boom')
  boom() {
    throw new ServiceUnavailableException('sengaja gagal');
  }
}

describe('ObservabilityModule', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ObservabilityModule],
      controllers: [DemoController],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    // Cerminkan main.ts: prefix global /api, dengan /metrics dikecualikan.
    app.setGlobalPrefix('api', { exclude: ['metrics'] });

    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('mengekspos /metrics DI LUAR prefix global /api', async () => {
    await request(app.getHttpServer()).get('/metrics').expect(200);
    await request(app.getHttpServer()).get('/api/metrics').expect(404);
  });

  it('menyertakan metrik runtime Node.js bawaan', async () => {
    const res = await request(app.getHttpServer()).get('/metrics').expect(200);

    expect(res.text).toContain('process_cpu_seconds_total');
    expect(res.text).toContain('nodejs_eventloop_lag_seconds');
    expect(res.text).toContain('nodejs_heap_size_used_bytes');
  });

  it('mencatat durasi request sebagai histogram', async () => {
    await request(app.getHttpServer()).get('/api/demo/ok').expect(200);

    const res = await request(app.getHttpServer()).get('/metrics').expect(200);

    expect(res.text).toContain('http_request_duration_seconds_bucket');
    expect(res.text).toMatch(
      /http_request_duration_seconds_count\{method="GET",route="\/api\/demo\/ok",status_code="200"\}/,
    );
  });

  it('memakai TEMPLATE rute, bukan URL mentah, agar cardinality tidak meledak', async () => {
    // Inilah jaminan terpenting dari interceptor ini: seratus id berbeda harus
    // tetap menghasilkan SATU time series, bukan seratus.
    await request(app.getHttpServer())
      .get('/api/demo/item/abc-123')
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/demo/item/def-456')
      .expect(200);

    const res = await request(app.getHttpServer()).get('/metrics').expect(200);

    expect(res.text).not.toContain('abc-123');
    expect(res.text).not.toContain('def-456');

    const countLines = res.text
      .split('\n')
      .filter(
        (line) =>
          line.startsWith('http_request_duration_seconds_count') &&
          line.includes('route="/api/demo/item/:id"'),
      );
    expect(countLines).toHaveLength(1);
    expect(countLines[0]).toMatch(/\s2$/); // dua request, satu series
  });

  it('tidak membuat time series untuk path yang tidak cocok rute mana pun', async () => {
    // Fastify menangani 404 di handler bawaannya, SEBELUM request masuk ke
    // pipeline Nest — jadi interceptor tidak pernah berjalan untuk path asing.
    // Efeknya justru diinginkan: scanner otomatis yang menembak ribuan path
    // acak tidak menghasilkan satu pun time series baru.
    // (Label 'unmatched' di resolveRoute tetap dipertahankan sebagai pengaman
    // bila adapter/versi Fastify mengubah perilaku ini.)
    await request(app.getHttpServer()).get('/api/tidak-ada-1').expect(404);
    await request(app.getHttpServer()).get('/api/tidak-ada-2').expect(404);

    const res = await request(app.getHttpServer()).get('/metrics').expect(200);

    expect(res.text).not.toContain('tidak-ada-1');
    expect(res.text).not.toContain('tidak-ada-2');
  });

  it('mencatat status code dari exception, bukan 200', async () => {
    await request(app.getHttpServer()).get('/api/demo/boom').expect(503);

    const res = await request(app.getHttpServer()).get('/metrics').expect(200);

    expect(res.text).toMatch(
      /http_request_duration_seconds_count\{method="GET",route="\/api\/demo\/boom",status_code="503"\}/,
    );
  });

  it('tidak mencatat /metrics itu sendiri', async () => {
    const res = await request(app.getHttpServer()).get('/metrics').expect(200);

    expect(res.text).not.toMatch(
      /http_request_duration_seconds_count\{[^}]*route="\/metrics"/,
    );
  });

  it('mengembalikan gauge in-flight ke nol setelah request selesai', async () => {
    await request(app.getHttpServer()).get('/api/demo/ok').expect(200);

    const res = await request(app.getHttpServer()).get('/metrics').expect(200);

    const inFlight = res.text
      .split('\n')
      .filter((line) => line.startsWith('http_requests_in_flight{'));
    expect(inFlight.length).toBeGreaterThan(0);
    for (const line of inFlight) {
      expect(line).toMatch(/\s0$/);
    }
  });
});
