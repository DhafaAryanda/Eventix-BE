import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import {
  PrometheusModule,
  makeGaugeProvider,
  makeHistogramProvider,
} from '@willsoto/nestjs-prometheus';

import { HttpMetricsInterceptor } from './http-metrics.interceptor';
import {
  HTTP_DURATION_BUCKETS,
  HTTP_REQUESTS_IN_FLIGHT,
  HTTP_REQUEST_DURATION,
} from './metrics.constants';

/**
 * Modul observability: mengekspos endpoint `/metrics` untuk di-scrape Prometheus.
 *
 * Endpoint SENGAJA berada di luar prefix global `/api` (lihat `exclude` pada
 * `setGlobalPrefix` di main.ts) karena `/metrics` adalah konvensi baku
 * Prometheus, dan itu bukan bagian dari API publik aplikasi.
 *
 * Keamanan: `/metrics` diblokir dari internet di level nginx (port 8081).
 * Prometheus men-scrape langsung ke `eventix-be:4000` lewat network `shared-net`,
 * sehingga pemblokiran tersebut tidak mengganggu monitoring.
 */
@Module({
  imports: [
    PrometheusModule.register({
      path: '/metrics',
      defaultMetrics: {
        // Metrik runtime Node.js bawaan prom-client: heap, event loop lag,
        // jumlah handle aktif, GC. Inilah yang memberi tahu apakah proses
        // sedang tercekik sebelum user melihat request-nya lambat.
        enabled: true,
      },
    }),
  ],
  providers: [
    makeHistogramProvider({
      name: HTTP_REQUEST_DURATION,
      help: 'Durasi request HTTP dalam detik',
      labelNames: ['method', 'route', 'status_code'],
      buckets: HTTP_DURATION_BUCKETS,
    }),
    makeGaugeProvider({
      name: HTTP_REQUESTS_IN_FLIGHT,
      help: 'Jumlah request HTTP yang sedang diproses',
      labelNames: ['method', 'route'],
    }),
    {
      // Didaftarkan di sini (bukan di AppModule) agar seluruh hal terkait
      // metrik terkumpul dalam satu modul.
      provide: APP_INTERCEPTOR,
      useClass: HttpMetricsInterceptor,
    },
  ],
})
export class ObservabilityModule {}
