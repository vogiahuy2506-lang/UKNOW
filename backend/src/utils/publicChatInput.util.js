/**
 * Chặn đầu vào của chat CÔNG KHAI (widget, trang chatbot công khai) — không đăng nhập, ai cũng gọi được.
 * PLAN_SUA_AI_DOT1_2026-10-03 F1.3 (A P0-4).
 *
 * Trước: `history` do client gửi được ghép thẳng vào prompt — không giới hạn số tin, độ dài, vai; body tới 5 MB.
 * Một script gửi history ~3 MB (~800k token) tới widget của bất kỳ ai ≈ 1,2 USD/lượt tiền Google, chủ chỉ mất 1
 * credit; còn gửi vai lạ để dựng ảnh chụp "bot shop X xác nhận giảm 90%".
 *
 * Vì sao KHÔNG lấy lịch sử từ `webchat_messages` theo `sessionId` (phương án plan ưu tiên): `sessionId` do chính
 * client tự đặt (`sess_<Date.now()>_<9 ký tự>`) và hội thoại chỉ tồn tại khi có sessionId — dùng nó làm khoá ĐỌC
 * lịch sử vào prompt cho phép ai đoán/lộ sessionId moi nội dung khách khác qua bot; lại vẫn phải giữ nhánh
 * "không có sessionId" dựa vào body. Nên giữ body nhưng cắt trần cứng ở đây.
 */

export const PUBLIC_CHAT_MAX_MESSAGE_CHARS = 2000;
export const PUBLIC_CHAT_MAX_HISTORY_MESSAGES = 10;
export const PUBLIC_CHAT_MAX_HISTORY_ITEM_CHARS = 1000;
export const PUBLIC_CHAT_MAX_HISTORY_ITEM_ATTACHMENTS = 3;

const ALLOWED_HISTORY_ROLES = new Set(['user', 'assistant']);

export const PUBLIC_CHAT_MESSAGE_TOO_LONG_BODY = Object.freeze({
  success: false,
  code: 'MESSAGE_TOO_LONG',
  message: `Tin nhắn quá dài (tối đa ${PUBLIC_CHAT_MAX_MESSAGE_CHARS.toLocaleString('vi-VN')} ký tự). Bạn vui lòng chia nhỏ nội dung rồi gửi lại nhé.`,
});

export const PUBLIC_CHAT_MESSAGE_INVALID_BODY = Object.freeze({
  success: false,
  code: 'INVALID_MESSAGE',
  message: 'Tin nhắn không hợp lệ.',
});

/**
 * Kiểm `message` của chat công khai. Trả `null` nếu hợp lệ, ngược lại `{ status, body }` để trả thẳng cho client.
 * `undefined`/`null` hợp lệ ở đây (controller tự báo "message is required" khi cũng không có đính kèm).
 *
 * @param {unknown} message
 * @returns {null | { status: number, body: object }}
 */
export function validatePublicChatMessage(message) {
  if (message == null) return null;
  if (typeof message !== 'string') {
    return { status: 400, body: PUBLIC_CHAT_MESSAGE_INVALID_BODY };
  }
  if (message.length > PUBLIC_CHAT_MAX_MESSAGE_CHARS) {
    return { status: 400, body: PUBLIC_CHAT_MESSAGE_TOO_LONG_BODY };
  }
  return null;
}

/**
 * Làm sạch `history` do client gửi: chỉ vai user/assistant, mỗi tin ≤ 1.000 ký tự, ≤ 10 tin MỚI nhất, bỏ tin cuối
 * nếu trùng đúng tin hiện tại (widget.js đã push tin hiện tại vào chatHistory trước khi gửi `slice(-10)`, server
 * lại nối thêm lần nữa → tin khách lặp 2 lần trong prompt, A P3-2).
 *
 * @param {unknown} history
 * @param {string} [currentMessage] - tin hiện tại (đã trim) để khử trùng tin cuối
 * @returns {Array<{ role: 'user'|'assistant', content: string, attachments?: object[] }>}
 */
export function sanitizePublicChatHistory(history, currentMessage = '') {
  if (!Array.isArray(history)) return [];

  const cleaned = [];
  for (const item of history) {
    if (!item || typeof item !== 'object') continue;
    if (!ALLOWED_HISTORY_ROLES.has(item.role)) continue;
    if (typeof item.content !== 'string') continue;
    const content = item.content.trim().slice(0, PUBLIC_CHAT_MAX_HISTORY_ITEM_CHARS);
    const attachments = item.role === 'user' && Array.isArray(item.attachments)
      ? item.attachments
        .filter((a) => a && typeof a === 'object' && !Array.isArray(a))
        .slice(0, PUBLIC_CHAT_MAX_HISTORY_ITEM_ATTACHMENTS)
      : [];
    // Tin chỉ có tệp đính kèm (trang công khai gửi content '') vẫn giữ để lượt sau còn thấy tệp cũ.
    if (!content && attachments.length === 0) continue;

    const entry = { role: item.role, content };
    if (attachments.length > 0) entry.attachments = attachments;
    cleaned.push(entry);
  }

  const current = String(currentMessage || '').trim().slice(0, PUBLIC_CHAT_MAX_HISTORY_ITEM_CHARS);
  const last = cleaned[cleaned.length - 1];
  if (current && last && last.role === 'user' && last.content === current) {
    cleaned.pop();
  }

  return cleaned.slice(-PUBLIC_CHAT_MAX_HISTORY_MESSAGES);
}
