/**
 * Phần THUẦN của vòng tự kiểm → tự sửa hiển thị landing (PLAN_LANDING_TU_KIEM_HIEN_THI_TU_SUA,
 * PR-3): nhận diện câu than phiền lỗi hiển thị, tìm đúng thẻ trong danh sách tin, áp kết quả đo/sửa
 * vào thẻ, dựng instruction. Không React, không mạng — test riêng ở __tests__/landingLayoutFlow.spec.js.
 */
import { describeFindingsForAi } from './layoutAudit.js';

// Người dùng gõ câu than phiền về lỗi hiển thị → đo trước khi gửi để AI biết đúng chỗ (plan 12.3.5).
// Từ ngắn (đè, che) chỉ tính khi đứng riêng — "đèn", "check", "chèn" không phải than phiền. Ranh giới
// từ dùng \p{L} vì \b của JS không hiểu chữ có dấu tiếng Việt. KHÔNG dùng lookbehind: Safari < 16.4
// báo lỗi cú pháp lúc nạp module và làm sập cả trợ lý.
export const LAYOUT_COMPLAINT_RE = new RegExp(
  '(?:^|[^\\p{L}])(?:(?:đè|che)(?!\\p{L})|(?:cắt|lệch|tràn|khuất|chồng|mất chữ|overlap|cut off))',
  'iu',
);

export const looksLikeLayoutComplaint = (text) => LAYOUT_COMPLAINT_RE.test(String(text || ''));

/**
 * Nối kết quả đo vào instruction GỬI LÊN server (người dùng không thấy ở tin hiển thị — xem chú
 * thích ở handleEditLandingPageWithAi về chỗ còn lộ khi tải lại phiên). Không có finding → giữ
 * nguyên câu người dùng gõ.
 */
export function appendFindingsToInstruction(instruction, findings) {
  const described = describeFindingsForAi(findings);
  if (!described) return instruction;
  return `${instruction}\n\nHệ thống vừa đo trang này trong trình duyệt và thấy:\n${described}`;
}

/** Tên phần hay gặp nhất trong các finding còn lại ('' nếu không có) — để nói "phần X" bằng tiếng người. */
export function pickSectionTitle(findings) {
  const counts = new Map();
  for (const f of Array.isArray(findings) ? findings : []) {
    const title = String(f?.sectionTitle || '').trim();
    if (title) counts.set(title, (counts.get(title) || 0) + 1);
  }
  let best = '';
  let bestCount = 0;
  for (const [title, count] of counts) {
    if (count > bestCount) {
      best = title;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Tìm thẻ landing_page trong danh sách tin: theo `id` (tin đã lưu ở server) nếu có, không thì thẻ
 * CUỐI CÙNG đang mang đúng `html` đã đo. Thẻ đã bị sửa tay/đổi html trong lúc đo → -1, kết quả cũ
 * bị bỏ (không ghi đè bản mới hơn).
 */
export function findLandingMessageIndex(messages, { messageId = null, html = null } = {}) {
  const list = Array.isArray(messages) ? messages : [];
  if (messageId != null) {
    const byId = list.findIndex((m) => m?.type === 'landing_page' && m.id != null && String(m.id) === String(messageId));
    if (byId >= 0) return byId;
  }
  if (typeof html !== 'string') return -1;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (list[i]?.type === 'landing_page' && list[i]?.data?.html === html) return i;
  }
  return -1;
}

/**
 * Áp kết quả `autoFixLandingLayout` vào thẻ. Chỉ ghi khi thẻ VẪN đang mang `baseHtml` (đo/sửa xong
 * mà người dùng đã sửa tay giữa chừng → bỏ). `fixed` (máy đo lại thấy hết lỗi) mới thêm tin xác
 * nhận; `clean`/`unknown`/`still_broken` không nói "đã sửa".
 *
 * @returns {Array} danh sách mới, hoặc CHÍNH danh sách cũ nếu không có gì để ghi
 */
export function applyLayoutResultToMessages(messages, { messageId = null, baseHtml, result, ackContent = null }) {
  const idx = findLandingMessageIndex(messages, { messageId, html: baseHtml });
  if (idx < 0) return messages;
  const current = messages[idx];
  if (current.data?.html !== baseHtml) return messages;

  const changed = Boolean(result?.page) && result.page.html !== baseHtml;
  const data = {
    ...current.data,
    ...(changed ? { title: result.page.title ?? current.data.title, html: result.page.html } : {}),
    ...(result?.canRevert != null ? { canRevert: Boolean(result.canRevert) } : {}),
    layoutStatus: result?.status || 'unknown',
    layoutFindings: result?.status === 'still_broken' && Array.isArray(result.findings) ? result.findings : [],
  };
  const next = messages.map((m, i) => (i === idx ? { ...m, data } : m));
  if (result?.status === 'fixed' && changed && ackContent) {
    next.push({ role: 'assistant', content: ackContent, type: 'landing_edit_ack' });
  }
  return next;
}

/** Đặt riêng `layoutStatus` (vd 'checking') cho thẻ, cùng luật "chỉ ghi khi thẻ còn đúng html". */
export function setLayoutStatusOnMessages(messages, { messageId = null, html, status }) {
  const idx = findLandingMessageIndex(messages, { messageId, html });
  if (idx < 0 || messages[idx].data?.html !== html) return messages;
  return messages.map((m, i) => (i === idx
    ? { ...m, data: { ...m.data, layoutStatus: status, layoutFindings: [] } }
    : m));
}

/**
 * Ghi `patch` vào data của một thẻ landing_page. Tìm theo `messageId`, rồi `index` (nếu vẫn là thẻ
 * landing), rồi `html`. Không tìm thấy → trả CHÍNH danh sách cũ.
 */
export function patchLandingMessageData(messages, { messageId = null, index = null, html = null } = {}, patch) {
  const list = Array.isArray(messages) ? messages : [];
  let idx = findLandingMessageIndex(list, { messageId, html: null });
  if (idx < 0 && index != null && list[index]?.type === 'landing_page') idx = index;
  if (idx < 0) idx = findLandingMessageIndex(list, { messageId: null, html });
  if (idx < 0) return list;
  return list.map((m, i) => (i === idx ? { ...m, data: { ...m.data, ...patch } } : m));
}

/** Khoá của một thẻ để phân biệt lượt kiểm mới với lượt cũ (lượt bị thay thế thì bỏ kết quả). */
export const layoutCardKey = (sessionId, messageId) => `${sessionId ?? 'new'}:${messageId ?? 'latest'}`;

