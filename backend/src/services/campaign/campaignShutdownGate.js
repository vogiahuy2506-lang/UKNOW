/**
 * PLAN_AN_TOAN_KHI_DEPLOY_2026-09-28, PR-A — Engine biết "đang tắt".
 *
 * Module nhỏ, KHÔNG phụ thuộc gì khác — chỉ giữ 2 mẩu state process-wide (không phải theo run):
 * "có đang shutdown không" và "còn bao nhiêu lượt gọi nhà cung cấp (email/Zalo/adapter) đang bay".
 *
 * Engine (campaignRun.service.js, campaignChannelRunner.service.js) gọi `isShuttingDown()` ngay
 * TRƯỚC mỗi lần gọi nhà cung cấp — nếu true thì ném lỗi `code: 'RUN_YIELD_SLOT'` thay vì gửi, để
 * run giữ nguyên 'running' và container mới (sau deploy) resume tiếp. `trackInFlight()` bọc đúng
 * lời gọi nhà cung cấp đó, để `gracefulShutdown` (index.js) biết khi nào an toàn đóng DB pool —
 * xem "SỬA PR-6b"/PR-5 tách tầng kênh cho khuôn `channelDeferredUntil` tương tự (khoá defer khác
 * mục đích, module này KHÔNG ghi DB, chỉ giữ cờ + bộ đếm trong RAM tiến trình).
 */

let shuttingDown = false;
let inFlightCount = 0;

/** Gọi một lần khi bắt đầu shutdown (SIGTERM/SIGINT) — idempotent, gọi nhiều lần vô hại. */
export function beginShutdown() {
  shuttingDown = true;
}

/** @returns {boolean} true nếu tiến trình đang trong quá trình tắt. */
export function isShuttingDown() {
  return shuttingDown;
}

/**
 * Bọc đúng MỘT lời gọi nhà cung cấp (email/Zalo/adapter) — tăng bộ đếm trước khi gọi, giảm trong
 * `finally` bất kể thành công hay lỗi. KHÔNG nuốt lỗi — trả/ném nguyên trạng kết quả của `asyncFn`.
 *
 * @param {() => Promise<any>} asyncFn
 * @returns {Promise<any>}
 */
export async function trackInFlight(asyncFn) {
  inFlightCount += 1;
  try {
    return await asyncFn();
  } finally {
    inFlightCount -= 1;
  }
}

/**
 * Chờ tới khi không còn lượt gọi nhà cung cấp nào đang bay, hoặc hết `timeoutMs` (poll mỗi 100ms).
 *
 * @param {number} timeoutMs
 * @returns {Promise<{drained: boolean, remaining: number}>}
 */
export async function waitForInFlight(timeoutMs) {
  const deadline = Date.now() + Math.max(0, Number.parseInt(timeoutMs, 10) || 0);
  const pollMs = 100;
  while (inFlightCount > 0 && Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  return { drained: inFlightCount === 0, remaining: inFlightCount };
}

/** Reset state — CHỈ dùng trong test (mỗi test file có thể để lại cờ shutdown=true cho file sau). */
export function __resetForTest() {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('__resetForTest chỉ được gọi khi NODE_ENV=test');
  }
  shuttingDown = false;
  inFlightCount = 0;
}

export default {
  beginShutdown,
  isShuttingDown,
  trackInFlight,
  waitForInFlight,
  __resetForTest,
};
