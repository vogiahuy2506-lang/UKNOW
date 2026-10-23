/**
 * CƠ CHẾ TỰ DỪNG an toàn khi Zalo "nuốt" tin (silent drop) — PLAN_SO_LIEU_DUNG_GON_KHOP, việc 2.
 *
 * BỐI CẢNH (sự cố production 23/10/2026): UI hiện "Đã gửi 19/200" trong khi Zalo thực tế chỉ
 * nhận ~5 tin, và phần mềm vẫn tiếp tục bắn 20–25 tin nữa. Hai tầng lỗi:
 *
 *  1. TẦNG PHÁT HIỆN ĐƯỢC — Zalo trả `msgId = 0` (không xác nhận phát tin). Backend bắt được
 *     qua `classifyZaloDispatchDelivery` → lỗi `ZALO_SEND_NOT_DELIVERED`, phân loại category
 *     `ZALO_SILENT_DROP`. Đây là tín hiệu MẠNH: Zalo đã từ chối phát tin.
 *
 *  2. TẦNG KHÔNG PHÁT HIỆN ĐƯỢC — Zalo nhận lệnh và trả `msgId > 0` nhưng âm thầm bỏ tin
 *     (anti-spam / giới hạn nhắn người lạ). Backend KHÔNG có kênh xác nhận lại từ phía máy
 *     người nhận, nên KHÔNG THỂ biết tin có tới nơi hay không. Số "đã gửi" phía backend chỉ là
 *     TRẦN trên thực tế.
 *
 * VÌ SAO CẦN CƠ CHẾ NÀY: trước đây tín hiệu silent-drop chỉ được ĐỌC để hiện cảnh báo trên
 * trang Giám sát gửi tin (deliveryMonitorSignals.util.js) — chiến dịch VẪN chạy tiếp, đốt slot
 * và rủi ro khoá nick. Ở đây ta dừng lượt chạy NGAY khi tín hiệu tầng 1 vượt ngưỡng.
 *
 * NGƯỠNG: mặc định dừng khi trong lượt chạy có ≥ `minDrops` lần silent-drop VÀ tỉ lệ silent-drop
 * ≥ `minRate` trên tổng `minAttempts` lần đã xử lý. Có thể ghi đè bằng env.
 */

/** Ngưỡng mặc định — xem `resolveZaloSilentDropGuardThresholds`. */
const DEFAULT_MIN_ATTEMPTS = 5;
const DEFAULT_MIN_RATE = 0.3;
const DEFAULT_MIN_DROPS = 3;

/** Lý do hoãn lượt chạy (ghi vào `run_metadata.zaloDeferredReason`). */
export const ZALO_SILENT_DROP_GUARD_DEFER_REASON = 'zalo_silent_drop_guard';

function parsePositiveInt(raw, fallback) {
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseRate(raw, fallback) {
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed > 1 ? parsed / 100 : parsed;
}

/**
 * Ngưỡng tự dừng. Env: ZALO_SILENT_DROP_GUARD_MIN_ATTEMPTS / _MIN_RATE / _MIN_DROPS.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ minAttempts: number, minRate: number, minDrops: number }}
 */
export function resolveZaloSilentDropGuardThresholds(env = process.env) {
  return {
    minAttempts: parsePositiveInt(env.ZALO_SILENT_DROP_GUARD_MIN_ATTEMPTS, DEFAULT_MIN_ATTEMPTS),
    minRate: parseRate(env.ZALO_SILENT_DROP_GUARD_MIN_RATE, DEFAULT_MIN_RATE),
    minDrops: parsePositiveInt(env.ZALO_SILENT_DROP_GUARD_MIN_DROPS, DEFAULT_MIN_DROPS),
  };
}

/**
 * Đánh giá có phải dừng lượt chạy vì silent-drop không.
 *
 * @param {{
 *   attempts?: number,        số lần đã xử lý (gửi được + lỗi + bỏ qua) trong lượt chạy
 *   silentDrops?: number,     số lần Zalo KHÔNG xác nhận phát tin (msgId = 0)
 *   consecutive?: number,     số lần silent-drop LIÊN TIẾP gần nhất
 * }} input
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ shouldStop: boolean, reason: string, rate: number, attempts: number, silentDrops: number, consecutive: number }}
 */
export function evaluateZaloSilentDropGuard(input = {}, env = process.env) {
  const { minAttempts, minRate, minDrops } = resolveZaloSilentDropGuardThresholds(env);
  const attempts = Math.max(0, Number(input.attempts) || 0);
  const silentDrops = Math.max(0, Number(input.silentDrops) || 0);
  const consecutive = Math.max(0, Number(input.consecutive) || 0);
  const rate = attempts > 0 ? silentDrops / attempts : 0;

  // Cửa sổ đủ rộng (đủ lượt xử lý) + đủ số lần drop + tỉ lệ drop cao.
  const shouldStop = attempts >= minAttempts
    && silentDrops >= minDrops
    && rate >= minRate;

  return {
    shouldStop,
    reason: shouldStop
      ? `silent-drop ${silentDrops}/${attempts} (${Math.round(rate * 100)}%) ≥ ngưỡng ${minDrops}/${minAttempts} @ ${Math.round(minRate * 100)}%`
      : '',
    rate,
    attempts,
    silentDrops,
    consecutive,
  };
}
