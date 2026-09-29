/**
 * Helper giãn cách/chờ dùng chung cho vòng gửi của trang Gửi nhanh (Zalo + kênh adapter Telegram/WhatsApp).
 * Chuyển NGUYÊN VĂN từ QuickSend.jsx (PLAN_GUI_NHANH_ZALO_GIAN_CACH_2026-09-28 PR-1/PR-2) để
 * `QuickSendAdapterPanel.jsx` dùng lại — không đổi hành vi.
 */

export const QUICK_SEND_DELAY_COUNTDOWN_TICK_MS = 1000;

/**
 * Chỉ tự chờ rồi gửi lại NGAY trong phiên khi lý do là giãn cách bình thường VÀ thời gian chờ ngắn (≤5 phút);
 * lý do khác (giờ nghỉ/trần giờ/khoá tra số/nhà cung cấp) hoặc chờ dài hơn thì KHÔNG tự lặp mãi — dừng cả đợt,
 * để người dùng tự bấm gửi lại sau.
 */
export const MAX_DEFERRED_RESEND_WAIT_MS = 5 * 60 * 1000;

export function buildQuickSendAbortError() {
  const error = new Error('Quick send cancelled');
  error.name = 'AbortError';
  return error;
}

/**
 * Chờ `ms` mili-giây, huỷ ngay nếu `signal` bị abort giữa chừng (rời trang / unmount).
 *
 * @param {number} ms
 * @param {AbortSignal|undefined} signal
 * @returns {Promise<void>}
 */
export function quickSendSleepWithAbort(ms, signal) {
  return new Promise((resolve, reject) => {
    const waitMs = Math.max(0, Number.parseInt(ms, 10) || 0);
    if (signal?.aborted) {
      reject(buildQuickSendAbortError());
      return;
    }
    if (waitMs <= 0) {
      resolve();
      return;
    }
    const timeoutId = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, waitMs);
    const onAbort = () => {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onAbort);
      reject(buildQuickSendAbortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Chờ có đếm ngược mỗi giây (giống campaignBuilderNodeRunner.js sleepWithCountdownTicks — không
 * import lại được vì hàm đó là closure riêng của createCampaignNodeRunner) để trang "Đang gửi" không trông
 * như treo trong lúc chờ.
 *
 * @param {number} totalMs
 * @param {AbortSignal|undefined} signal
 * @param {(seconds: number) => void} [onTick]
 * @returns {Promise<void>}
 */
export async function quickSendSleepWithCountdown(totalMs, signal, onTick) {
  let remainingMs = Math.max(0, Number.parseInt(totalMs, 10) || 0);
  while (remainingMs > 0) {
    const seconds = Math.ceil(remainingMs / 1000);
    onTick?.(seconds);
    const stepMs = Math.min(QUICK_SEND_DELAY_COUNTDOWN_TICK_MS, remainingMs);
    await quickSendSleepWithAbort(stepMs, signal);
    remainingMs -= stepMs;
  }
}

export function getQuickSendRandomDelayMs(minMs, maxMs) {
  const safeMin = Math.max(0, Number.parseInt(minMs, 10) || 0);
  const safeMax = Math.max(safeMin, Number.parseInt(maxMs, 10) || safeMin);
  return Math.floor(Math.random() * (safeMax - safeMin + 1)) + safeMin;
}

/** Giờ:phút theo giờ Việt Nam (Asia/Ho_Chi_Minh) — KHÔNG dùng giờ hệ thống/trình duyệt của người xem. */
export function formatResumeTimeVn(resumeAtMs) {
  const date = new Date(Number(resumeAtMs));
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('vi-VN', {
    hourCycle: 'h23',
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
  });
}
