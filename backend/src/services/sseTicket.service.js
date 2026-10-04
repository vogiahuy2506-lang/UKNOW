/**
 * Vé SSE ngắn hạn, dùng một lần cho luồng thời gian thực của Hộp thư.
 *
 * Vì sao có: `EventSource` không gửi được header `Authorization`, nên trước đây FE đặt luôn JWT
 * (sống 3 giờ) vào URL `?token=...` — URL bị ghi nguyên văn vào log truy cập (RA_SOAT_3_MAN H-04).
 * Giờ FE gọi `POST /inbox/stream-ticket` (Bearer + X-Owner-Context như mọi API) lấy một vé ngẫu nhiên,
 * sống 60 giây, đổi được ĐÚNG MỘT lần ở `GET /inbox/stream?ticket=...`. Lộ vé trong log thì gần như vô
 * dụng: hết hạn sau một phút và đã bị tiêu thụ ngay khi trình duyệt nối.
 *
 * Vé nằm trong RAM của tiến trình. Production chạy đúng một replica backend và bảng client SSE
 * (`sse.service.js`) cũng nằm trong RAM, nên vé cùng chỗ là nhất quán; backend khởi động lại thì vé mất
 * và FE chỉ việc xin vé mới khi nối lại. Không dùng để cấp quyền nào khác ngoài mở luồng SSE.
 */
import crypto from 'crypto';

export const SSE_TICKET_TTL_MS = 60 * 1000;
/** Trần số vé đang sống — chặn phình bộ nhớ nếu có ai xin vé dồn dập (đã có sseLimiter, đây là lớp đỡ). */
export const SSE_TICKET_MAX_ACTIVE = 5000;

/** @type {Map<string, { userId: number|string, ownerContextId: number|string|null, expiresAt: number }>} */
const tickets = new Map();

function sweepExpired(now) {
  for (const [key, claim] of tickets) {
    if (claim.expiresAt <= now) tickets.delete(key);
  }
}

/**
 * @param {{ userId: number|string, ownerContextId?: number|string|null, now?: number }} input
 * @returns {{ ticket: string, expiresInMs: number }}
 */
export function issueSseTicket({ userId, ownerContextId = null, now = Date.now() }) {
  if (userId == null || userId === '') {
    throw new Error('issueSseTicket: thiếu userId');
  }
  sweepExpired(now);
  while (tickets.size >= SSE_TICKET_MAX_ACTIVE) {
    // Map giữ thứ tự chèn → khoá đầu là vé cũ nhất.
    const oldest = tickets.keys().next().value;
    if (oldest === undefined) break;
    tickets.delete(oldest);
  }
  const ticket = crypto.randomBytes(32).toString('base64url');
  tickets.set(ticket, {
    userId,
    ownerContextId: ownerContextId == null || ownerContextId === '' ? null : ownerContextId,
    expiresAt: now + SSE_TICKET_TTL_MS,
  });
  return { ticket, expiresInMs: SSE_TICKET_TTL_MS };
}

/**
 * Đổi vé lấy claim — XOÁ vé ngay (dùng một lần). Hết hạn hoặc không có → null.
 * @returns {{ userId: number|string, ownerContextId: number|string|null }|null}
 */
export function consumeSseTicket(ticket, now = Date.now()) {
  if (typeof ticket !== 'string' || !ticket) return null;
  const claim = tickets.get(ticket);
  if (!claim) return null;
  tickets.delete(ticket);
  if (claim.expiresAt <= now) return null;
  return { userId: claim.userId, ownerContextId: claim.ownerContextId };
}

/** Xem claim mà KHÔNG tiêu thụ — chỉ để gắn khoá giới hạn tần suất theo user trước khi vào handler. */
export function peekSseTicket(ticket, now = Date.now()) {
  if (typeof ticket !== 'string' || !ticket) return null;
  const claim = tickets.get(ticket);
  if (!claim || claim.expiresAt <= now) return null;
  return { userId: claim.userId, ownerContextId: claim.ownerContextId };
}

/** Test helper. */
export function _resetSseTicketsForTests() {
  tickets.clear();
}

export function _activeSseTicketCountForTests() {
  return tickets.size;
}
