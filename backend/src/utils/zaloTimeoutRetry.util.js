/**
 * Trễ cơ sở giữa các lần thử lại khi gặp lỗi timeout mạng (không phải timeout HTTP từng request).
 * Mặc định 10s; có thể tăng qua `ZALO_TIMEOUT_RETRY_BASE_DELAY_MS` trong `.env`.
 */
const ZALO_TIMEOUT_BASE_DELAY_MS = (() => {
  const raw = Number.parseInt(process.env.ZALO_TIMEOUT_RETRY_BASE_DELAY_MS || '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 10_000;
})();

const ZALO_TIMEOUT_MAX_ATTEMPTS = 4;
const RETRYABLE_TIMEOUT_CODES = new Set([
  'UND_ERR_CONNECT_TIMEOUT',
  'ETIMEDOUT',
  'ECONNABORTED',
  'ECONNRESET',
]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Kiểm tra lỗi timeout kết nối từ lớp fetch/undici của Node.js.
 *
 * Luồng hoạt động:
 * 1. Đọc mã lỗi từ error và error.cause.
 * 2. Nếu có mã `UND_ERR_CONNECT_TIMEOUT` thì coi là timeout kết nối.
 * 3. Fallback theo message để bắt các trường hợp timeout không gắn code.
 *
 * @param {any} error lỗi phát sinh từ API call
 * @returns {boolean} true nếu là lỗi timeout cần retry
 */
export function isZaloTimeoutError(error) {
  const directCode = String(error?.code || '').trim().toUpperCase();
  const causeCode = String(error?.cause?.code || '').trim().toUpperCase();
  if (RETRYABLE_TIMEOUT_CODES.has(directCode) || RETRYABLE_TIMEOUT_CODES.has(causeCode)) {
    return true;
  }

  const message = String(error?.message || '').trim().toLowerCase();
  const causeMessage = String(error?.cause?.message || '').trim().toLowerCase();
  return message.includes('timeout') || causeMessage.includes('timeout');
}

/**
 * Alias tổng quát cho toàn bộ node cần retry lỗi timeout.
 *
 * @param {any} error lỗi phát sinh từ network/API
 * @returns {boolean}
 */
export function isNetworkTimeoutError(error) {
  return isZaloTimeoutError(error);
}

/**
 * Thực thi callback với cơ chế retry cho lỗi timeout Zalo.
 *
 * Luồng hoạt động:
 * 1. Chạy callback theo số lần tối đa `maxAttempts`.
 * 2. Nếu lỗi không phải timeout, ném lỗi ngay để giữ hành vi cũ.
 * 3. Nếu là timeout và còn lượt retry, chờ theo cấp số nhân rồi chạy lại.
 * 4. Nếu đã hết lượt retry, gắn metadata retry vào lỗi trước khi ném ra.
 *
 * @template T
 * @param {object} input dữ liệu điều khiển retry
 * @param {() => Promise<T>} input.operation callback cần chạy
 * @param {string} [input.operationName] tên thao tác để log dễ đọc
 * @param {number} [input.maxAttempts] tổng số lần thử (mặc định 4)
 * @param {number} [input.baseDelayMs] delay cơ sở cho lần retry đầu (mặc định từ env hoặc 10s)
 * @param {(ctx: { attempt: number, maxAttempts: number, delayMs: number, error: any, operationName: string }) => Promise<void>|void} [input.onRetry]
 * @returns {Promise<T>}
 */
export async function executeWithZaloTimeoutRetry({
  operation,
  operationName = 'zalo_operation',
  maxAttempts = ZALO_TIMEOUT_MAX_ATTEMPTS,
  baseDelayMs = ZALO_TIMEOUT_BASE_DELAY_MS,
  onRetry,
}) {
  const safeMaxAttempts = Number.isFinite(maxAttempts) && maxAttempts > 0
    ? Math.floor(maxAttempts)
    : ZALO_TIMEOUT_MAX_ATTEMPTS;
  const safeBaseDelayMs = Number.isFinite(baseDelayMs) && baseDelayMs > 0
    ? Math.floor(baseDelayMs)
    : ZALO_TIMEOUT_BASE_DELAY_MS;

  let lastTimeoutError = null;
  for (let attempt = 1; attempt <= safeMaxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isZaloTimeoutError(error)) {
        throw error;
      }
      lastTimeoutError = error;

      const isLastAttempt = attempt >= safeMaxAttempts;
      if (isLastAttempt) {
        error.zaloRetry = {
          operationName,
          attempt,
          maxAttempts: safeMaxAttempts,
          baseDelayMs: safeBaseDelayMs,
        };
        throw error;
      }

      const delayMs = safeBaseDelayMs * (2 ** (attempt - 1));
      if (typeof onRetry === 'function') {
        await onRetry({
          attempt,
          maxAttempts: safeMaxAttempts,
          delayMs,
          error,
          operationName,
        });
      }
      await sleep(delayMs);
    }
  }

  throw lastTimeoutError || new Error('Retry Zalo thất bại không rõ nguyên nhân');
}

/**
 * Alias tổng quát để dùng cho các node email, data, zalo.
 *
 * @template T
 * @param {object} input cấu hình retry
 * @returns {Promise<T>}
 */
export async function executeWithTimeoutRetry(input) {
  return executeWithZaloTimeoutRetry(input);
}

