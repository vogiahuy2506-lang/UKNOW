import * as aiCallEventRepo from '../../repositories/ai/aiCallEvent.repository.js';
import { setAiCallObserver } from '../../utils/aiCallObserver.util.js';

/**
 * MỘT CỬA ghi sổ bền các lần gọi AI (bảng `ai_call_events`, migration 285) — PLAN_SUA_AI_DOT4_PR10 mục 2.
 *
 * Vì sao có: lỗi AI trước đây chỉ nằm trong `console.*` / docker log, mà log bị xoá mỗi lần deploy, nên không ai biết tỉ lệ lỗi Gemini,
 * số lần chuyển model dự phòng, `AI_PROVIDER_BUSY`, ghi usage hỏng, lượt landing bị huỷ vì khách đóng tab, lượt trợ lý lỗi.
 *
 * Hai tầng (cột `layer`):
 *  - 'gemini': MỘT lần gọi thật tới Google (lõi `generateGeminiContent` / `embedTextRaw`, qua cổng `aiCallObserver.util.js`). Mỗi lần gọi đúng
 *    một dòng → tỉ lệ lỗi, số lần chuyển dự phòng CHỈ đếm tầng này.
 *  - 'app': sự kiện của ứng dụng (lượt landing, lượt trợ lý, ghi usage hỏng…). Không phải lần gọi tới Google nên KHÔNG vào mẫu/tử số tỉ lệ
 *    lỗi — nếu không một lỗi Google bị đếm hai lần (ở tầng gọi và ở tầng lượt).
 *
 * Ba bất biến:
 *  1. KHÔNG BAO GIỜ làm hỏng lượt AI: `recordAiCallEvent` không ném lỗi (cả lỗi đồng bộ của repository), không cần `await`.
 *  2. KHÔNG chặn đường nóng khi CSDL chậm: nơi gọi KHÔNG `await`; số lần ghi đang bay có trần (quá trần thì bỏ + đếm, không xếp hàng
 *     chen chỗ của truy vấn khách trong pool).
 *  3. KHÔNG ghi nội dung/PII: `meta` bị ép về chỉ số đếm, cờ, mã, id (xem `sanitizeMeta`); chuỗi có dấu cách/ký tự lạ bị loại.
 *
 * Công tắc: `AI_CALL_EVENTS_ENABLED=false` tắt hẳn. Mặc định BẬT, trừ khi `NODE_ENV=test` (test đơn vị không được tự chạm CSDL; test nào cần
 * ghi thì đặt `AI_CALL_EVENTS_ENABLED=true` và mock repository).
 */

export const AI_CALL_LAYER = Object.freeze({ GEMINI: 'gemini', APP: 'app' });

export const AI_CALL_OUTCOME = Object.freeze({
  OK: 'ok',
  ERROR: 'error',
  BUSY: 'busy',
  TIMEOUT: 'timeout',
  FALLBACK_OK: 'fallback_ok',
  PARSE_FAILED: 'parse_failed',
  CLIENT_CLOSED: 'client_closed',
  BLOCKED: 'blocked',
});

/** `error_code` của dòng "ghi usage hỏng" — cảnh báo `ai_usage_write_failed` đếm đúng mã này. */
export const USAGE_WRITE_FAILED_CODE = 'USAGE_WRITE_FAILED';

/** Giữ sự kiện 30 ngày (cron `data_retention_cleanup` dọn). Đủ để soi một sự cố tuần trước mà bảng không phình. */
export const AI_CALL_EVENTS_RETENTION_DAYS = 30;

/** Trần số lần ghi đang bay cùng lúc. Quá trần: bỏ sự kiện + đếm `dropped` (CSDL chậm thì mất số liệu chứ không mất khách). */
const MAX_IN_FLIGHT_WRITES = 200;
const MAX_META_KEYS = 24;
const MAX_META_ARRAY_ITEMS = 10;
const LOG_THROTTLE_MS = 60 * 1000;

const OUTCOMES = new Set(Object.values(AI_CALL_OUTCOME));
const LAYERS = new Set(Object.values(AI_CALL_LAYER));
const FEATURE_UNKNOWN = 'unknown';
/** Khoá meta: chữ + số + gạch dưới. Giá trị chuỗi: một "từ" (id, mã, tên model) — không dấu cách, không dấu tiếng Việt, ≤ 80 ký tự. */
const META_KEY_RE = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const META_TOKEN_RE = /^[A-Za-z0-9_.:,|/-]{1,80}$/;
const SAFE_CODE_CHARS_RE = /[^A-Za-z0-9_.:-]/g;

const stats = { written: 0, writeFailed: 0, dropped: 0 };
let inFlight = 0;
let lastErrorLogAt = 0;

export function isAiCallEventsEnabled() {
  const flag = String(process.env.AI_CALL_EVENTS_ENABLED ?? '').trim().toLowerCase();
  if (flag === 'false' || flag === '0' || flag === 'off') return false;
  if (flag === 'true' || flag === '1' || flag === 'on') return true;
  return process.env.NODE_ENV !== 'test';
}

/** Bộ đếm trong RAM (từ lúc tiến trình khởi động): ghi được / ghi hỏng / bỏ vì quá trần. Phục vụ ô giám sát admin. */
export function getAiCallEventStats() {
  return { ...stats, inFlight };
}

/** Chỉ cho test. */
export function resetAiCallEventStatsForTest() {
  stats.written = 0;
  stats.writeFailed = 0;
  stats.dropped = 0;
  inFlight = 0;
  lastErrorLogAt = 0;
}

function toId(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function toSafeCode(value, max = 60) {
  if (value == null) return null;
  const cleaned = String(value).replace(SAFE_CODE_CHARS_RE, '_').slice(0, max);
  return cleaned || null;
}

function toIntOrNull(value, { min, max }) {
  if (value == null || value === '') return null;
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

function safeMetaPrimitive(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' && META_TOKEN_RE.test(value)) return value;
  return undefined;
}

/**
 * Ép `meta` về dạng KHÔNG THỂ mang nội dung: chỉ số hữu hạn, cờ, "từ" ngắn kiểu mã/id/tên model, và mảng phẳng ≤ 10 phần tử loại đó.
 * Mọi thứ khác (câu chữ, object lồng, chuỗi dài, dấu tiếng Việt, email có `@`…) bị bỏ; số khoá bị bỏ ghi ở `droppedMeta` để dò ra
 * nơi gọi nào lỡ truyền nội dung. Hàm thuần, đã `export` để spec ghim.
 */
export function sanitizeMeta(meta) {
  const out = {};
  let dropped = 0;
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return out;
  let kept = 0;
  for (const [key, value] of Object.entries(meta)) {
    if (value == null) continue;
    if (!META_KEY_RE.test(key) || kept >= MAX_META_KEYS) {
      dropped += 1;
      continue;
    }
    if (Array.isArray(value)) {
      const items = value.slice(0, MAX_META_ARRAY_ITEMS).map(safeMetaPrimitive);
      if (items.some((item) => item === undefined)) {
        dropped += 1;
        continue;
      }
      out[key] = items;
      kept += 1;
      continue;
    }
    const safe = safeMetaPrimitive(value);
    if (safe === undefined) {
      dropped += 1;
      continue;
    }
    out[key] = safe;
    kept += 1;
  }
  if (dropped > 0) out.droppedMeta = dropped;
  return out;
}

/** Chuẩn hoá một sự kiện thành dòng ghi bảng. Hàm thuần (spec gọi trực tiếp). */
export function normalizeAiCallEvent(input) {
  const event = input && typeof input === 'object' ? input : {};
  const outcome = OUTCOMES.has(event.outcome) ? event.outcome : AI_CALL_OUTCOME.ERROR;
  const layer = LAYERS.has(event.layer) ? event.layer : AI_CALL_LAYER.GEMINI;
  return {
    ownerUserId: toId(event.ownerUserId),
    actorUserId: toId(event.actorUserId),
    layer,
    feature: toSafeCode(event.feature) || FEATURE_UNKNOWN,
    model: toSafeCode(event.model, 80),
    outcome,
    httpStatus: toIntOrNull(event.httpStatus, { min: 100, max: 599 }),
    errorCode: toSafeCode(event.errorCode),
    durationMs: toIntOrNull(event.durationMs, { min: 0, max: 2147483647 }),
    meta: sanitizeMeta(event.meta),
  };
}

/**
 * Phân loại một LỖI của lượt AI theo mã lỗi của lõi (không dò câu chữ): người dùng đóng kết nối → client_closed, hết giờ → timeout, quá tải
 * (hết lượt thử lại + dự phòng) → busy, còn lại → error. Dùng chung cho các sự kiện tầng 'app' của trợ lý / chatbot.
 */
export function outcomeFromError(error) {
  const code = error?.code;
  if (code === 'AI_CLIENT_ABORTED') return AI_CALL_OUTCOME.CLIENT_CLOSED;
  if (code === 'AI_TIMEOUT') return AI_CALL_OUTCOME.TIMEOUT;
  if (code === 'AI_PROVIDER_BUSY') return AI_CALL_OUTCOME.BUSY;
  return AI_CALL_OUTCOME.ERROR;
}

/** Mã lỗi ngắn, an toàn để ghi sổ: `error.code`, không thì `GEMINI_<status>` (lỗi từ Google), `HTTP_<status>`, tên lỗi. Không bao giờ chứa câu chữ của lỗi. */
export function errorCodeOf(error) {
  const raw = error?.code
    ?? (error?.geminiStatus != null ? `GEMINI_${error.geminiStatus}` : null)
    ?? (error?.status != null ? `HTTP_${error.status}` : null)
    ?? error?.name
    ?? 'UNKNOWN';
  return toSafeCode(raw) || 'UNKNOWN';
}

function logWriteFailure(error) {
  const now = Date.now();
  if (now - lastErrorLogAt < LOG_THROTTLE_MS) return;
  lastErrorLogAt = now;
  // Một dòng mỗi phút (kèm số tích luỹ): CSDL sập thì không để mỗi lượt AI in một dòng lỗi nữa.
  console.error(
    `[aiCallEvents] ghi sự kiện thất bại (tích luỹ: hỏng=${stats.writeFailed} bỏ=${stats.dropped} đã ghi=${stats.written}): ${error?.message || 'Unknown error'}`,
  );
}

/**
 * Ghi một sự kiện. KHÔNG ném lỗi, KHÔNG cần `await` (đường nóng gọi `void recordAiCallEvent(...)`); trả lời hứa luôn thành công với
 * `true` (đã ghi) / `false` (tắt, bỏ, hoặc ghi hỏng) để test chờ được.
 *
 * @param {{ layer?: 'gemini'|'app', feature?: string, model?: string|null, outcome?: string, httpStatus?: number|null,
 *   errorCode?: string|null, durationMs?: number|null, ownerUserId?: number|null, actorUserId?: number|null, meta?: object }} event
 * @returns {Promise<boolean>}
 */
export function recordAiCallEvent(event = {}) {
  try {
    if (!isAiCallEventsEnabled()) return Promise.resolve(false);
    if (inFlight >= MAX_IN_FLIGHT_WRITES) {
      stats.dropped += 1;
      return Promise.resolve(false);
    }
    const row = normalizeAiCallEvent(event);
    inFlight += 1;
    // `Promise.resolve().then(...)`: lỗi ném ĐỒNG BỘ từ repository cũng thành lời hứa bị từ chối, không lọt ra nơi gọi.
    return Promise.resolve()
      .then(() => aiCallEventRepo.insertEvent(row))
      .then(() => {
        stats.written += 1;
        return true;
      })
      .catch((error) => {
        stats.writeFailed += 1;
        logWriteFailure(error);
        return false;
      })
      .finally(() => {
        inFlight -= 1;
      });
  } catch (error) {
    stats.writeFailed += 1;
    logWriteFailure(error);
    return Promise.resolve(false);
  }
}

/**
 * Hàm quan sát gắn vào lõi (`aiCallObserver.util.js`): mỗi lần gọi Google xong là một sự kiện tầng 'gemini'.
 * @param {import('../../utils/aiCallObserver.util.js').AiCallEvent} event
 */
export function handleAiCallObserved(event) {
  return recordAiCallEvent({
    layer: AI_CALL_LAYER.GEMINI,
    feature: event?.feature,
    model: event?.model,
    outcome: event?.outcome,
    httpStatus: event?.httpStatus,
    errorCode: event?.errorCode,
    durationMs: event?.durationMs,
    ownerUserId: event?.ownerUserId,
    actorUserId: event?.actorUserId,
    meta: event?.meta,
  });
}

// Gắn vào lõi KHI ĐƯỢC NẠP (app.js nạp module này lúc khởi động; spec `aiCallEvents.appLoad.spec.js` ghim việc đó).
setAiCallObserver(handleAiCallObserved);

export default { recordAiCallEvent, handleAiCallObserved, getAiCallEventStats, outcomeFromError, errorCodeOf };
