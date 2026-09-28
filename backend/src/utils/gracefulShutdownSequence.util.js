/**
 * PLAN_AN_TOAN_KHI_DEPLOY_2026-09-28, PR-A, Việc 3 — trình tự drain khi shutdown.
 *
 * Tách riêng khỏi index.js: file đó có side-effect nặng ở MODULE SCOPE (kết nối DB, chạy
 * migration, khởi động cron/Telegram gateway/Baileys...) — import thẳng trong Jest sẽ đụng vào tất
 * cả những thứ đó. Hàm ở đây nhận MỌI phụ thuộc qua tham số nên test tiêm mock được, không cần
 * DB/BullMQ/cron thật.
 *
 * THỨ TỰ BẮT BUỘC, đừng đảo (plan mục 2 PR-A, mục 4 Bẫy):
 * 1. `gate.beginShutdown()` — engine ngừng MỞ lượt gửi mới (email/Zalo/adapter tự ném
 *    RUN_YIELD_SLOT trước khi gọi nhà cung cấp).
 * 2. `gate.waitForInFlight(timeoutMs)` — lượt ĐANG BAY ghi xong ledger/sent TRƯỚC khi đóng gì cả.
 * 3. Dừng cron lịch chiến dịch (`stopCron`) — hết lượt bay rồi mới cần lo cron bắn thêm run.
 * 4. Đóng BullMQ (`closeOutboundQueue`/`closeKbQueue`).
 * 5. Đóng DB pool CUỐI CÙNG (`closeDbPool`) — đóng trước khi lượt bay ghi xong là lỗi đã có
 *    trước PR-A.
 */

/**
 * @param {object} deps
 * @param {{beginShutdown: Function, waitForInFlight: Function}} deps.gate
 * @param {number} [deps.waitForInFlightMs]
 * @param {() => (void|Promise<void>)} deps.stopCron
 * @param {() => Promise<void>} deps.closeOutboundQueue
 * @param {() => Promise<void>} deps.closeKbQueue
 * @param {() => Promise<void>} deps.closeDbPool
 * @param {(msg: string) => void} [deps.logStep]
 * @param {(msg: string) => void} [deps.logError]
 * @returns {Promise<{drained: boolean, remaining: number}>}
 */
export async function runGracefulShutdownSequence({
  gate,
  waitForInFlightMs = 25_000,
  stopCron,
  closeOutboundQueue,
  closeKbQueue,
  closeDbPool,
  logStep = () => {},
  logError = () => {},
}) {
  const startedAt = Date.now();
  const elapsed = () => `t+${Date.now() - startedAt}ms`;

  gate.beginShutdown();
  logStep(`beginShutdown() — engine ngừng mở lượt gửi mới (${elapsed()})`);

  const waitResult = await gate.waitForInFlight(waitForInFlightMs);
  logStep(
    `waitForInFlight xong: drained=${waitResult.drained} remaining=${waitResult.remaining} (${elapsed()})`
  );

  try {
    await stopCron();
    logStep(`Đã dừng cron lịch chiến dịch (${elapsed()})`);
  } catch (error) {
    logError(`Lỗi khi dừng cron lịch chiến dịch: ${error?.message || error}`);
  }

  try {
    await closeOutboundQueue();
    await closeKbQueue();
    logStep(`Đã đóng BullMQ (${elapsed()})`);
  } catch (error) {
    logError(`Lỗi khi đóng BullMQ: ${error?.message || error}`);
  }

  try {
    await closeDbPool();
    logStep(`Đã đóng pool PostgreSQL (${elapsed()})`);
  } catch (error) {
    logError(`Lỗi khi đóng pool PostgreSQL: ${error?.message || error}`);
  }

  return waitResult;
}

export default { runGracefulShutdownSequence };
