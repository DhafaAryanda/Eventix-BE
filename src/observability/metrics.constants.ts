/**
 * Definisi terpusat nama & konfigurasi metrik Prometheus.
 *
 * Nama metrik mengikuti konvensi resmi Prometheus:
 *   - snake_case, diakhiri satuan dasar (`_seconds`, `_bytes`, `_total`)
 *   - counter selalu berakhiran `_total`
 * Mengikuti konvensi ini membuat dashboard & query komunitas langsung cocok.
 */

export const HTTP_REQUEST_DURATION = 'http_request_duration_seconds';
export const HTTP_REQUESTS_IN_FLIGHT = 'http_requests_in_flight';

/**
 * Bucket histogram (dalam detik).
 *
 * Setiap bucket = satu time series TAMBAHAN per kombinasi label, jadi jumlahnya
 * berpengaruh langsung ke pemakaian RAM Prometheus. 11 bucket di bawah adalah
 * default de-facto Prometheus dan cukup untuk menghitung p50/p95/p99 pada
 * rentang yang relevan untuk API ini (milidetik sampai beberapa detik).
 */
export const HTTP_DURATION_BUCKETS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
];

/**
 * Path yang TIDAK dicatat metriknya.
 * `/metrics` di-scrape tiap 30 detik; mencatatnya hanya menghasilkan noise
 * yang mengaburkan latensi trafik pengguna sebenarnya.
 */
export const METRICS_IGNORED_ROUTES = new Set(['/metrics', '/favicon.ico']);
