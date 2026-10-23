/**
 * Bộ đếm tiến độ gửi Zalo cá nhân — TÁCH "đã xử lý" khỏi "đã gửi thật".
 *
 * VÌ SAO CẦN FILE NÀY (sự cố production 23/10/2026):
 * UI hiện "Đã gửi 19/200" trong khi Zalo thực tế chỉ nhận ~5 tin. Nguyên nhân: bộ đếm cũ
 * cộng `successfulSends + failedSends + skippedSends` — tức là "số lần đã XỬ LÝ", chứ không
 * phải "số tin đã tới nơi". Người nhận bị lỗi / bị bỏ qua (không tìm thấy trên Zalo, người
 * nhận chặn tin, tin không được Zalo xác nhận) vẫn làm bộ đếm tăng, nên con số trên UI
 * luôn lớn hơn thực tế và không nói cho người dùng biết phần nào thực sự tới nơi.
 *
 * QUY ƯỚC MỚI (3 con số, tách bạch):
 *   - `processed` = đã xử lý xong (gửi được + gửi lỗi + bỏ qua) → mốc tiến độ.
 *   - `sent`      = gửi được (Zalo xác nhận / trả msgId hợp lệ).
 *   - `notDelivered` = KHÔNG tới nơi (gửi lỗi + bỏ qua) → phần chênh lệch với thực tế.
 *
 * Bộ đếm "Đã gửi" trên UI phải là `sent`; bộ đếm tiến độ (mốc X/Y) vẫn là `processed`
 * vì người dùng cần biết đã xử lý bao nhiêu để biết còn bao nhiêu việc. Phần chênh lệch
 * được hiện RIÊNG (xem `buildZaloPersonalProgressMessage`).
 *
 * LƯU Ý QUAN TRỌNG: `sent` là "Zalo ĐÃ NHẬN lệnh gửi", KHÔNG phải "tin đã tới máy người
 * nhận" — Zalo có thể âm thầm bỏ tin (anti-spam / giới hạn nhắn người lạ) mà không trả
 * msgId = 0, nên phía backend KHÔNG THỂ biết. Số này là trần trên thực tế.
 */

/**
 * Tính 3 con số từ bộ đếm thô của lượt gửi.
 *
 * @param {{
 *   successfulSends?: number,
 *   failedSends?: number,
 *   skippedSends?: number,
 * }} counters
 * @returns {{ processed: number, sent: number, notDelivered: number, failed: number, skipped: number }}
 */
export function resolveZaloProgressCounters(counters = {}) {
  const sent = Math.max(0, Number(counters.successfulSends) || 0);
  const failed = Math.max(0, Number(counters.failedSends) || 0);
  const skipped = Math.max(0, Number(counters.skippedSends) || 0);
  return {
    processed: sent + failed + skipped,
    sent,
    notDelivered: failed + skipped,
    failed,
    skipped,
  };
}

/**
 * Chuỗi tiến độ cho log execution Zalo cá nhân.
 *
 * Khi mọi lần xử lý đều gửi được → giữ nguyên dạng cũ "Đã gửi X/Y" (X = số đã xử lý) để
 * không phá khuôn hiển thị cũ và không làm loạn các test hiện có.
 * Khi CÓ phần không tới nơi → hiện rõ hai con số: "Đã gửi Z/Y" (thật) kèm ghi chú phần
 * không tới nơi, để người dùng không tưởng mình đã gửi cho tất cả.
 *
 * @param {{
 *   successfulSends?: number,
 *   failedSends?: number,
 *   skippedSends?: number,
 * }} counters bộ đếm thô của lượt gửi (tích luỹ trong run)
 * @param {number} total tổng số người nhận của phạm vi đếm
 * @param {number} [offset] số đã xử lý trước khi bắt đầu phạm vi đếm (dùng cho nhiều template)
 * @returns {string}
 */
export function buildZaloPersonalProgressMessage(counters = {}, total = 0, offset = 0) {
  const { processed, sent, notDelivered } = resolveZaloProgressCounters(counters);
  const processedInScope = Math.max(0, processed - offset);
  const safeTotal = Math.max(0, Number(total) || 0);
  if (notDelivered <= 0) {
    return `Đã gửi ${processedInScope}/${safeTotal}`;
  }
  return `Đã gửi ${sent}/${safeTotal} (không tới nơi: ${notDelivered})`;
}

/**
 * Số liệu tiến độ để ghi vào `campaign_executions.progress_current` / `progress_total`.
 *
 * `progress_current` = số đã XỬ LÝ (mốc tiến độ, không phải số tin đã tới nơi) — giữ
 * nguyên ý nghĩa cũ để các màn theo dõi tiến độ không bị lệch.
 *
 * @param {{
 *   successfulSends?: number,
 *   failedSends?: number,
 *   skippedSends?: number,
 * }} counters
 * @param {number} total
 * @param {number} [offset]
 * @returns {{ current: number, total: number, sent: number, notDelivered: number }}
 */
export function buildZaloProgressForLog(counters = {}, total = 0, offset = 0) {
  const { processed, sent, notDelivered } = resolveZaloProgressCounters(counters);
  return {
    current: Math.max(0, processed - offset),
    total: Math.max(0, Number(total) || 0),
    sent,
    notDelivered,
  };
}
