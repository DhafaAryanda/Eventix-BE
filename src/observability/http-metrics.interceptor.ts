import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Gauge, Histogram } from 'prom-client';
import { Observable, tap } from 'rxjs';

import {
  HTTP_REQUESTS_IN_FLIGHT,
  HTTP_REQUEST_DURATION,
  METRICS_IGNORED_ROUTES,
} from './metrics.constants';

/**
 * Mencatat durasi setiap request HTTP sebagai histogram Prometheus.
 *
 * Dari satu metrik ini bisa diturunkan tiga sinyal RED sekaligus:
 *   Rate     -> rate(http_request_duration_seconds_count[5m])
 *   Errors   -> rate(...{status_code=~"5.."}[5m])
 *   Duration -> histogram_quantile(0.95, rate(..._bucket[5m]))
 */
@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(
    @InjectMetric(HTTP_REQUEST_DURATION)
    private readonly duration: Histogram<string>,
    @InjectMetric(HTTP_REQUESTS_IN_FLIGHT)
    private readonly inFlight: Gauge<string>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // Aplikasi ini juga melayani Socket.IO. Interceptor global ikut terpasang di
    // konteks `ws`, yang tidak punya request/response HTTP — lewati agar tidak
    // melempar error saat mengakses properti yang tidak ada.
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<FastifyLikeRequest>();
    const route = resolveRoute(request);

    if (METRICS_IGNORED_ROUTES.has(route)) {
      return next.handle();
    }

    const method = (request.method ?? 'UNKNOWN').toUpperCase();
    const stopTimer = this.duration.startTimer({ method, route });
    this.inFlight.inc({ method, route });

    const finish = (statusCode: number) => {
      this.inFlight.dec({ method, route });
      stopTimer({ status_code: String(statusCode) });
    };

    return next.handle().pipe(
      tap({
        next: () => {
          const response = context.switchToHttp().getResponse<{
            statusCode?: number;
          }>();
          finish(response?.statusCode ?? 200);
        },
        error: (error: unknown) => {
          // Exception filter baru menetapkan status code SETELAH interceptor,
          // jadi statusnya diambil dari exception itu sendiri.
          finish(extractStatusCode(error));
        },
      }),
    );
  }
}

interface FastifyLikeRequest {
  method?: string;
  url?: string;
  /** Fastify v5 */
  routeOptions?: { url?: string };
  /** Fastify v4 */
  routerPath?: string;
}

/**
 * Mengambil TEMPLATE rute (mis. `/api/events/:id`), bukan URL mentah
 * (`/api/events/9f3c...`).
 *
 * Ini bukan sekadar kerapian: URL mentah akan membuat satu time series BARU
 * untuk setiap UUID yang pernah diakses. Pada VPS 1.9 GB, ledakan cardinality
 * seperti itu akan menghabiskan RAM Prometheus dalam hitungan jam.
 *
 * Request yang tidak cocok dengan rute mana pun (404) dikelompokkan ke satu
 * label `unmatched` — scanner otomatis di internet bisa menembak ribuan path
 * acak, dan semuanya harus jatuh ke satu series saja.
 */
function resolveRoute(request: FastifyLikeRequest): string {
  return request.routeOptions?.url ?? request.routerPath ?? 'unmatched';
}

function extractStatusCode(error: unknown): number {
  // HttpException (dan seluruh turunannya seperti NotFoundException) menyediakan
  // getStatus(). Apa pun selain itu diperlakukan sebagai 500.
  if (
    typeof error === 'object' &&
    error !== null &&
    'getStatus' in error &&
    typeof error.getStatus === 'function'
  ) {
    return (error as { getStatus: () => number }).getStatus();
  }
  return 500;
}
