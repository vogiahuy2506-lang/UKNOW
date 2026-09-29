/**
 * Khử echo tin CHÍNH TÀI KHOẢN gửi (WhatsApp/Telegram): khi bot hoặc Hộp thư vừa gửi một tin,
 * nhà cung cấp đẩy lại đúng tin đó về listener dưới dạng tin "của mình". Nếu coi nó là chủ gõ
 * tay từ điện thoại thì AI tự dừng sau MỖI câu trả lời (khuôn Zalo: isInboxSendEcho).
 *
 * Kiểm id trước (chắc chắn), nội dung sau (dự phòng khi id chưa kịp ghi vào dòng đã lưu).
 */

export const OWNER_ECHO_WINDOW_MS = 5 * 60 * 1000;

/**
 * @param {object} params
 * @param {string|number|null} params.incomingId - id tin phía nhà cung cấp (key.id / message id)
 * @param {string} [params.incomingContent]
 * @param {Array<{externalId?: string|null, content?: string|null, createdAt?: any}>} params.candidates
 *   dòng bot/agent gần đây của hội thoại
 * @param {number} [params.now]
 * @param {number} [params.windowMs]
 * @returns {boolean}
 */
export function isOwnerOutgoingEcho({
  incomingId,
  incomingContent = '',
  candidates = [],
  now = Date.now(),
  windowMs = OWNER_ECHO_WINDOW_MS,
}) {
  if (!Array.isArray(candidates) || candidates.length === 0) return false;
  const id = incomingId != null && incomingId !== '' ? String(incomingId) : null;
  const content = String(incomingContent || '').trim();

  for (const row of candidates) {
    const createdMs = row?.createdAt != null ? new Date(row.createdAt).getTime() : NaN;
    if (Number.isFinite(createdMs)) {
      const age = now - createdMs;
      if (age > windowMs) continue;
    }
    const rowId = row?.externalId != null && row.externalId !== '' ? String(row.externalId) : null;
    if (id && rowId && id === rowId) return true;
    const rowContent = String(row?.content || '').trim();
    if (content && rowContent && content === rowContent) return true;
  }
  return false;
}
