/**
 * P11 — phân loại lỗi gửi tay Telegram/WhatsApp ở Hộp thư để quyết định số phận đặt chỗ hạn mức (mode enforce).
 * KHÔNG dùng `classifyZaloSendError` (mã lỗi của zca-js, không áp cho Telegram/Baileys).
 *
 * Thuần (không I/O). Trả về:
 *   - `uncertain: true`  → khách CÓ THỂ đã nhận tin: giữ 'uncertain' để đối soát, KHÔNG release (release cho gửi lại toàn bộ → khách nhận trùng).
 *   - `uncertain: false` → provider chưa gửi gì: release để mở lại hạn mức, `failureCode = 'PROVIDER_ERROR'`.
 *
 * Nguồn dấu hiệu "một phần đã tới khách": adapter WhatsApp trả `{ success:false, partial:true, messageId }`; adapter Hộp thư Telegram
 * bỏ cờ `partial` nhưng vẫn giữ `messageId` của tin đầu đã tới — nên `success:false` mà có `messageId` cũng là một phần.
 */
const TIMEOUT_PATTERN = /timeout|ETIMEDOUT|ECONNRESET|socket hang up/i;

/**
 * @param {object|null|undefined} result kết quả `adapter.sendReply` (có thể null khi adapter ném lỗi)
 * @param {Error|string|null|undefined} err lỗi ném ra / chuỗi lỗi
 * @returns {{ uncertain: boolean, failureCode: 'PARTIAL_DELIVERY'|'TIMEOUT'|'PROVIDER_ERROR', reason: string }}
 */
export function classifyInboxChannelSendFailure(result, err) {
  const message = String(
    (typeof err === 'string' ? err : err?.message)
      || result?.error
      || ''
  );
  const hasDeliveredId = result?.messageId != null && String(result.messageId).trim() !== '';
  if (result?.partial === true || (result?.success === false && hasDeliveredId)) {
    return { uncertain: true, failureCode: 'PARTIAL_DELIVERY', reason: message || 'Partial delivery' };
  }
  if (TIMEOUT_PATTERN.test(message)) {
    return { uncertain: true, failureCode: 'TIMEOUT', reason: message };
  }
  return { uncertain: false, failureCode: 'PROVIDER_ERROR', reason: message || 'Send failed' };
}
