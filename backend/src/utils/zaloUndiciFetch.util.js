import { Agent, fetch as undiciFetch } from 'undici';

/**
 * Đọc số nguyên dương từ biến môi trường, fallback khi không hợp lệ.
 *
 * @param {string|undefined} raw
 * @param {number} fallback
 * @returns {number}
 */
function parsePositiveEnvInt(raw, fallback) {
  const n = Number.parseInt(String(raw || '').trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

let cachedAgent = null;
let cachedPolyfill = null;

/**
 * Agent HTTP dùng chung cho mọi request zca-js — tránh mặc định hẹp gây lỗi khi Zalo phản hồi chậm.
 *
 * Luồng hoạt động:
 * 1. Đọc timeout từ env (connect / headers / body).
 * 2. Khởi tạo `undici.Agent` một lần (singleton) để tái sử dụng kết nối.
 * 3. Mọi `fetch` qua polyfill gắn `dispatcher` là agent này.
 *
 * @returns {import('undici').Agent}
 */
function getZaloUndiciAgent() {
  if (cachedAgent) return cachedAgent;

  const connectTimeout = parsePositiveEnvInt(process.env.ZALO_HTTP_CONNECT_TIMEOUT_MS, 120_000);
  const headersTimeout = parsePositiveEnvInt(process.env.ZALO_HTTP_HEADERS_TIMEOUT_MS, 180_000);
  const bodyTimeout = parsePositiveEnvInt(process.env.ZALO_HTTP_BODY_TIMEOUT_MS, 180_000);

  cachedAgent = new Agent({
    connectTimeout,
    headersTimeout,
    bodyTimeout,
  });
  return cachedAgent;
}

/**
 * Hàm fetch tương thích giao diện `polyfill` của zca-js (`(url, options) => Promise<Response>`).
 * Tăng timeout so với stack mặc định khi server Zalo hoặc đường truyền chậm.
 *
 * @param {import('undici').RequestInfo} url
 * @param {import('undici').RequestInit} [options]
 * @returns {Promise<import('undici').Response>}
 */
function zaloUndiciPolyfillFetch(url, options = {}) {
  const agent = getZaloUndiciAgent();
  return undiciFetch(url, {
    ...options,
    dispatcher: agent,
  });
}

/**
 * Trả về cùng một hàm fetch (singleton) để gán vào `new Zalo({ polyfill })`.
 *
 * @returns {(url: import('undici').RequestInfo, options?: import('undici').RequestInit) => Promise<import('undici').Response>}
 */
export function getZaloFetchPolyfill() {
  if (cachedPolyfill) return cachedPolyfill;
  cachedPolyfill = zaloUndiciPolyfillFetch;
  return cachedPolyfill;
}

/**
 * Fragment options cho `new Zalo({ ... })` — chỉ thêm `polyfill` HTTP đã cấu hình timeout.
 *
 * @returns {{ polyfill: ReturnType<typeof getZaloFetchPolyfill> }}
 */
export function getZaloHttpPolyfillOption() {
  return { polyfill: getZaloFetchPolyfill() };
}
