/**
 * Cấu hình đọc Google Sheet từ biến môi trường (timeout, BullMQ, nhường CPU khi parse).
 *
 * Luồng hoạt động:
 * 1. Đọc số ms tối đa cho HTTP tải CSV / htmlview.
 * 2. Đọc số dòng xử lý rồi `setImmediate` một nhịp để tránh block event loop quá lâu.
 * 3. Đọc thời gian chờ kết quả job BullMQ (khi đẩy đọc sheet sang worker).
 */

const MAX_FETCH_MS = 60 * 60 * 1000; // 1 giờ trần an toàn
const MAX_WAIT_MS = 60 * 60 * 1000;

/**
 * Timeout HTTP khi tải CSV / trang htmlview từ Google (mặc định 180s).
 *
 * @returns {number}
 */
export function getReadSheetFetchTimeoutMs() {
  const raw = Number.parseInt(process.env.READ_SHEET_FETCH_TIMEOUT_MS || '180000', 10);
  if (!Number.isFinite(raw) || raw <= 0) return 180000;
  return Math.min(raw, MAX_FETCH_MS);
}

/**
 * Cứ mỗi N dòng dữ liệu đã map xong thì nhường event loop (mặc định 500).
 *
 * @returns {number}
 */
export function getReadSheetParseYieldEveryRows() {
  const raw = Number.parseInt(process.env.READ_SHEET_PARSE_YIELD_EVERY_ROWS || '500', 10);
  if (!Number.isFinite(raw) || raw <= 0) return 500;
  return Math.min(raw, 10_000);
}

/**
 * Thời gian chờ job BullMQ `GOOGLE_SHEET_FETCH` hoàn tất (mặc định 10 phút).
 * Nên >= thời gian tải + parse sheet lớn.
 *
 * @returns {number}
 */
export function getReadSheetBullmqWaitTimeoutMs() {
  const raw = Number.parseInt(process.env.READ_SHEET_BULLMQ_WAIT_TIMEOUT_MS || '600000', 10);
  if (!Number.isFinite(raw) || raw <= 0) return 600000;
  return Math.min(raw, MAX_WAIT_MS);
}

/**
 * Chuẩn hóa boolean từ biến môi trường.
 *
 * @param {string|undefined|null} value
 * @param {boolean} defaultValue
 * @returns {boolean}
 */
function parseEnvBoolean(value, defaultValue) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return defaultValue;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

/**
 * Có đẩy bước tải + parse sheet sang worker BullMQ hay không (mặc định bật khi BULLMQ bật).
 *
 * @param {boolean} bullmqFeatureEnabled kết quả `outboundMessageQueueService.isQueueFeatureEnabled()`
 * @returns {boolean}
 */
export function shouldReadSheetUseBullMq(bullmqFeatureEnabled) {
  if (!bullmqFeatureEnabled) return false;
  return parseEnvBoolean(process.env.READ_SHEET_USE_BULLMQ, true);
}
