/**
 * Chuẩn hoá lỗi đi qua hàng đợi BullMQ (PLAN_RA_SOAT_DOT3 PR-Q2 việc d).
 *
 * Vì sao cần: job BullMQ lỗi thì `waitUntilFinished()` chỉ trả `new Error(failedReason)` — mất sạch
 * thuộc tính của lỗi gốc (`code`, `zaloRetry`, `stage`, `responseCode`, `resetAt`...). Đường chạy thẳng
 * (BULLMQ_ENABLED=false) thì bên gọi nhận đúng đối tượng lỗi gốc, nên bật BullMQ làm bộ phân loại lỗi
 * (`classifyZaloSendError`, nhánh `error.code === 'RESOURCE_LIMIT_EXCEEDED'`, `error.zaloRetry`...) chạy
 * khác đi. Giải pháp: worker bắt lỗi, trả về MỘT OBJECT lỗi chuẩn hoá (job "completed"); bên gọi
 * (`enqueueAndWait`) dựng lại `Error` có đủ thuộc tính rồi ném — giống hệt đường chạy thẳng.
 */

/** Cờ nhận diện object lỗi chuẩn hoá (tránh nhầm với kết quả nghiệp vụ tình cờ có `ok:false`). */
export const QUEUE_JOB_ERROR_MARK = '__outboundQueueError';

/** Trần kích thước của một thuộc tính phụ khi serialize (ký tự JSON) — chặn rác lọt vào Redis. */
const MAX_DETAIL_JSON_LENGTH = 4096;

/** Thuộc tính đã có chỗ riêng trong object chuẩn hoá, không lặp lại trong `details`. */
const RESERVED_KEYS = new Set(['name', 'message', 'code', 'stack', 'zaloRetry', 'stage', 'cause']);

/** Khoá thuộc tính phụ có dạng thời điểm — dựng lại thành Date khi revive (vd `resetAt`). */
const DATE_KEY_PATTERN = /(At|Until)$/;

function toJsonSafe(value) {
  if (value === undefined) return undefined;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') return undefined;
  if (value === null || typeof value !== 'object') return value;
  try {
    const json = JSON.stringify(value);
    if (json == null || json.length > MAX_DETAIL_JSON_LENGTH) return undefined;
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}

/**
 * Nhận diện object lỗi chuẩn hoá do worker trả về.
 * Chấp nhận cả dạng có cờ lẫn dạng rút gọn `{ ok:false, message }` (đủ cho bộ phân loại lỗi).
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isSerializedJobError(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (value[QUEUE_JOB_ERROR_MARK] === true) return true;
  return value.ok === false && typeof value.message === 'string' && 'code' in value;
}

/**
 * Chuẩn hoá một lỗi bất kỳ thành object an toàn để đi qua Redis.
 *
 * @param {unknown} error
 * @param {{ jobType?: string }} [meta]
 * @returns {{ ok: false, code: string|null, message: string, name: string, zaloRetry: object|null, stage: string|null, details: object, jobType: string|null }}
 */
export function serializeJobError(error, { jobType = null } = {}) {
  const isObject = error && typeof error === 'object';
  const message = String(
    isObject ? (error.message ?? error.code ?? '') : (error ?? '')
  ) || 'Lỗi không xác định';

  const details = {};
  if (isObject) {
    for (const key of Object.keys(error)) {
      if (RESERVED_KEYS.has(key)) continue;
      const safe = toJsonSafe(error[key]);
      if (safe !== undefined) details[key] = safe;
    }
  }

  const cause = isObject && error.cause && typeof error.cause === 'object'
    ? toJsonSafe({ message: error.cause.message, code: error.cause.code })
    : undefined;

  return {
    [QUEUE_JOB_ERROR_MARK]: true,
    ok: false,
    code: isObject && error.code != null ? String(error.code) : null,
    message,
    name: isObject && error.name ? String(error.name) : 'Error',
    zaloRetry: isObject ? (toJsonSafe(error.zaloRetry) ?? null) : null,
    stage: isObject && error.stage != null ? String(error.stage) : null,
    details,
    ...(cause ? { cause } : {}),
    jobType: jobType ? String(jobType) : null,
  };
}

/**
 * Dựng lại `Error` có đủ thuộc tính từ object lỗi chuẩn hoá (phía bên gọi `enqueueAndWait`).
 *
 * @param {object} serialized
 * @returns {Error}
 */
export function reviveJobError(serialized) {
  const source = serialized && typeof serialized === 'object' ? serialized : {};
  const error = new Error(String(source.message || 'Lỗi không xác định'));
  if (source.name && source.name !== 'Error') error.name = String(source.name);
  const details = source.details && typeof source.details === 'object' ? source.details : {};
  for (const [key, value] of Object.entries(details)) {
    if (typeof value === 'string' && DATE_KEY_PATTERN.test(key)) {
      const asDate = new Date(value);
      error[key] = Number.isNaN(asDate.getTime()) ? value : asDate;
    } else {
      error[key] = value;
    }
  }
  if (source.code != null) error.code = source.code;
  if (source.zaloRetry) error.zaloRetry = source.zaloRetry;
  if (source.stage) error.stage = source.stage;
  if (source.cause) error.cause = source.cause;
  error.fromQueueJob = true;
  return error;
}
