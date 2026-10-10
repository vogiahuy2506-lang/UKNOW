import supportTicketRepository from '../../repositories/support/supportTicket.repository.js';
import { findSupportTicketStorageObject } from '../../repositories/storage.repository.js';
import { notifyAdmins, notifyUsers } from '../notification/notificationDispatch.service.js';
import {
  claimAttachments,
  normalizeAttachmentIds,
  toAttachmentDto,
} from './supportTicketAttachment.service.js';
import { isSuperAdmin } from '../../utils/roleScope.util.js';

/**
 * Ticket góp ý / hỗ trợ (PLAN_TICKET_GOP_Y_VA_CHUONG_THONG_BAO_2026-10-10 PR-4).
 *
 * Quy ước:
 *  - Ticket thuộc NGƯỜI TẠO thật (`req.user.id`; nhân viên có dòng `users` riêng). Người tạo chỉ thấy ticket của chính mình; ticket
 *    của người khác → 404 (không lộ việc nó có tồn tại). Super admin (`users.role='admin'`) thấy hết qua các hàm `admin*`.
 *  - Nội dung là văn bản thuần. Email do `buildNotificationEmail` của dispatcher escape HTML; FE hiển thị `whitespace-pre-wrap`.
 *  - Thông báo (chuông + email) chạy NỀN: lỗi chỉ log, không bao giờ làm hỏng nghiệp vụ chính, và request không đợi SMTP.
 *  - Đặt tên có tiền tố `support` — tránh trùng với vé SSE (`services/sseTicket.service.js`).
 */

export const SUPPORT_TICKET_CATEGORIES = Object.freeze(['feedback', 'bug', 'billing', 'other']);
export const SUPPORT_TICKET_STATUSES = Object.freeze(['open', 'awaiting_user', 'closed']);
export const SUPPORT_SUBJECT_MAX = 200;
export const SUPPORT_BODY_MAX = 5000;
export const SUPPORT_DAILY_TICKET_LIMIT_DEFAULT = 10;
export const SUPPORT_AUTO_CLOSE_DAYS_DEFAULT = 7;
const EXCERPT_CHARS = 300;
const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 100;

const CATEGORY_LABELS = Object.freeze({
  feedback: { vi: 'Góp ý', en: 'Feedback' },
  bug: { vi: 'Báo lỗi', en: 'Bug report' },
  billing: { vi: 'Thanh toán', en: 'Billing' },
  other: { vi: 'Khác', en: 'Other' },
});

function httpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function positiveIntFromEnv(name, fallback) {
  const value = Number.parseInt(process.env[name], 10);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

// ─── Chuẩn hoá đầu vào ───────────────────────────────────────────────────────

// Postgres từ chối ký tự NUL trong text (lỗi 500) và các ký tự điều khiển khác vô nghĩa trong văn bản thuần.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function normalizeSubject(raw) {
  const text = typeof raw === 'string' ? raw.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim() : '';
  if (!text) throw httpError(400, 'SUPPORT_SUBJECT_REQUIRED', 'Vui lòng nhập tiêu đề');
  if (text.length > SUPPORT_SUBJECT_MAX) {
    throw httpError(400, 'SUPPORT_SUBJECT_TOO_LONG', `Tiêu đề tối đa ${SUPPORT_SUBJECT_MAX} ký tự`);
  }
  return text;
}

function normalizeBody(raw) {
  const text = typeof raw === 'string' ? raw.replace(/\r\n?/g, '\n').replace(CONTROL_CHARS, '').trim() : '';
  if (!text) throw httpError(400, 'SUPPORT_BODY_REQUIRED', 'Vui lòng nhập nội dung');
  if (text.length > SUPPORT_BODY_MAX) {
    throw httpError(400, 'SUPPORT_BODY_TOO_LONG', `Nội dung tối đa ${SUPPORT_BODY_MAX} ký tự`);
  }
  return text;
}

function normalizeCategory(raw) {
  const value = String(raw ?? '').trim();
  if (!SUPPORT_TICKET_CATEGORIES.includes(value)) {
    throw httpError(400, 'SUPPORT_CATEGORY_INVALID', 'Loại góp ý không hợp lệ');
  }
  return value;
}

function parseTicketId(raw) {
  const text = String(raw ?? '').trim();
  if (!/^\d{1,18}$/.test(text) || Number(text) <= 0) {
    throw httpError(400, 'SUPPORT_TICKET_ID_INVALID', 'Mã ticket không hợp lệ');
  }
  return text;
}

function parseOptionalFilter(raw, allowed, code, message) {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  if (!allowed.includes(value)) throw httpError(400, code, message);
  return value;
}

function parsePaging({ page, limit } = {}) {
  const safePage = Math.max(Number.parseInt(page, 10) || 1, 1);
  const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || DEFAULT_PAGE_LIMIT, 1), MAX_PAGE_LIMIT);
  return { page: safePage, limit: safeLimit };
}

function notFound() {
  return httpError(404, 'SUPPORT_TICKET_NOT_FOUND', 'Không tìm thấy ticket');
}

// ─── DTO ─────────────────────────────────────────────────────────────────────

function toIso(value) {
  return value == null ? null : value;
}

function toTicketDto(row, { withUser = false } = {}) {
  const dto = {
    id: Number(row.id),
    subject: row.subject,
    category: row.category,
    status: row.status,
    workspaceOwnerId: row.workspace_owner_id == null ? null : Number(row.workspace_owner_id),
    lastMessageAt: toIso(row.last_message_at),
    lastAdminReplyAt: toIso(row.last_admin_reply_at),
    closedAt: toIso(row.closed_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
  if (row.message_count !== undefined) dto.messageCount = row.message_count;
  if (row.last_author_role !== undefined) {
    dto.lastMessage = row.last_author_role
      ? { authorRole: row.last_author_role, excerpt: row.last_excerpt || '', createdAt: toIso(row.last_message_created_at) }
      : null;
  }
  if (withUser) {
    dto.user = {
      id: Number(row.user_id),
      fullName: row.user_full_name || null,
      email: row.user_email || null,
      username: row.user_username || null,
    };
    dto.closedBy = row.closed_by == null ? null : Number(row.closed_by);
  }
  return dto;
}

/**
 * @param {object} row hàng `support_ticket_messages` (+ author_full_name / author_username khi có JOIN)
 * @param {{ revealAdmin?: boolean }} [options] `revealAdmin`: hiện tên thật của admin (chỉ màn admin) — người dùng chỉ thấy "đội hỗ trợ"
 */
function toMessageDto(row, { revealAdmin = false } = {}) {
  const attachments = Array.isArray(row.attachments) ? row.attachments : [];
  const isAdminAuthor = row.author_role === 'admin';
  const authorName = isAdminAuthor && !revealAdmin
    ? null
    : (row.author_full_name || row.author_username || null);
  return {
    id: Number(row.id),
    authorRole: row.author_role,
    authorName,
    body: row.body,
    attachments: attachments.map(toAttachmentDto),
    createdAt: toIso(row.created_at),
  };
}

function paginationOf(page, limit, total) {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}

// ─── Thông báo nền ───────────────────────────────────────────────────────────

/** Các lời gọi thông báo đang bay — để test / tắt máy có thể đợi (`settlePendingSupportNotifications`). */
const pendingNotifications = new Set();

function dispatchInBackground(label, work) {
  const promise = Promise.resolve()
    .then(work)
    .catch((error) => {
      console.error(`[SupportTicket] thông báo ${label} lỗi:`, error?.message || error);
    })
    .finally(() => pendingNotifications.delete(promise));
  pendingNotifications.add(promise);
  return promise;
}

/** Đợi mọi thông báo nền đang chạy xong (không ném). Dùng trong test. */
export async function settlePendingSupportNotifications() {
  await Promise.allSettled([...pendingNotifications]);
}

function excerptOf(body) {
  const text = String(body || '').trim();
  return text.length > EXCERPT_CHARS ? `${text.slice(0, EXCERPT_CHARS).trimEnd()}…` : text;
}

function clipSubject(subject) {
  const text = String(subject || '');
  return text.length > 120 ? `${text.slice(0, 120).trimEnd()}…` : text;
}

function senderLabel(user) {
  const name = user?.full_name || user?.username || `#${user?.id}`;
  return user?.email ? `${name} (${user.email})` : name;
}

function notifyAdminsTicketCreated({ ticket, user, body }) {
  const category = CATEGORY_LABELS[ticket.category] || CATEGORY_LABELS.other;
  const subject = clipSubject(ticket.subject);
  const sender = senderLabel(user);
  return dispatchInBackground('created', () => notifyAdmins({
    eventType: 'support_ticket_created',
    title: `Góp ý mới: ${subject}`,
    titleEn: `New ticket: ${subject}`,
    message: `${sender} gửi ${category.vi}:\n${excerptOf(body)}`,
    messageEn: `${sender} sent ${category.en}:\n${excerptOf(body)}`,
    link: `/admin/tickets/${ticket.id}`,
    metadata: { ticketId: Number(ticket.id), userId: Number(ticket.user_id), category: ticket.category },
    dedupeKey: `support_ticket:${ticket.id}:created`,
  }));
}

function notifyAdminsUserReplied({ ticket, user, message }) {
  const subject = clipSubject(ticket.subject);
  const sender = senderLabel(user);
  return dispatchInBackground('user_replied', () => notifyAdmins({
    eventType: 'support_ticket_user_replied',
    title: `Người dùng trả lời: ${subject}`,
    titleEn: `User replied: ${subject}`,
    message: `${sender}:\n${excerptOf(message.body)}`,
    messageEn: `${sender}:\n${excerptOf(message.body)}`,
    link: `/admin/tickets/${ticket.id}`,
    metadata: { ticketId: Number(ticket.id), userId: Number(ticket.user_id), messageId: Number(message.id) },
    dedupeKey: `support_ticket:${ticket.id}:msg:${message.id}`,
  }));
}

function notifyUserAdminReplied({ ticket, message }) {
  const subject = clipSubject(ticket.subject);
  return dispatchInBackground('replied', () => notifyUsers({
    eventType: 'support_ticket_replied',
    userIds: [Number(ticket.user_id)],
    title: `Phản hồi cho góp ý: ${subject}`,
    titleEn: `Reply to your feedback: ${subject}`,
    message: excerptOf(message.body),
    messageEn: excerptOf(message.body),
    link: `/app/support/${ticket.id}`,
    metadata: { ticketId: Number(ticket.id), messageId: Number(message.id) },
    dedupeKey: `support_ticket:${ticket.id}:msg:${message.id}`,
  }));
}

function closedNoticeInput({ ticket, auto, days }) {
  const subject = clipSubject(ticket.subject);
  const closedAtKey = ticket.closed_at ? new Date(ticket.closed_at).getTime() : Date.now();
  return {
    eventType: 'support_ticket_closed',
    userIds: [Number(ticket.user_id)],
    title: `Góp ý đã được đóng: ${subject}`,
    titleEn: `Your feedback was closed: ${subject}`,
    message: auto
      ? `Góp ý này đã tự động đóng sau ${days} ngày chưa có phản hồi từ bạn. Bạn có thể trả lời lại để mở lại.`
      : 'Quản trị viên đã đóng góp ý này. Bạn có thể trả lời lại để mở lại.',
    messageEn: auto
      ? `This ticket was closed automatically after ${days} days without a reply from you. Reply to reopen it.`
      : 'An administrator closed this ticket. Reply to reopen it.',
    link: `/app/support/${ticket.id}`,
    metadata: { ticketId: Number(ticket.id), auto: Boolean(auto) },
    dedupeKey: `support_ticket:${ticket.id}:closed:${closedAtKey}`,
  };
}

// ─── Người dùng ──────────────────────────────────────────────────────────────

function dailyTicketLimit() {
  return positiveIntFromEnv('SUPPORT_TICKET_DAILY_LIMIT', SUPPORT_DAILY_TICKET_LIMIT_DEFAULT);
}

/**
 * Tạo ticket (kèm tin đầu tiên + tối đa 3 ảnh). Hạn mức: `SUPPORT_TICKET_DAILY_LIMIT` (mặc định 10) ticket / 24 giờ / người.
 *
 * @param {object} user `req.user`
 * @param {{ subject?: unknown, category?: unknown, body?: unknown, attachmentIds?: unknown }} input
 * @returns {Promise<{ ticket: object, messages: object[] }>}
 * @throws {Error & { status: number, code: string }} 400 đầu vào / ảnh sai, 429 quá hạn mức ngày
 */
export async function createTicket(user, input = {}) {
  const subject = normalizeSubject(input.subject);
  const category = normalizeCategory(input.category);
  const body = normalizeBody(input.body);
  const attachmentIds = normalizeAttachmentIds(input.attachmentIds);
  const workspaceOwnerId = user.activeContext?.type === 'employee' ? Number(user.activeContext.ownerId) : null;
  const limit = dailyTicketLimit();

  const { ticket, message } = await supportTicketRepository.runInTransaction(async (client) => {
    await supportTicketRepository.lockUserTicketCreation(client, user.id);
    const createdToday = await supportTicketRepository.countCreatedSince(client, user.id, 24);
    if (createdToday >= limit) {
      throw httpError(
        429,
        'SUPPORT_TICKET_DAILY_LIMIT',
        `Bạn đã gửi tối đa ${limit} ticket trong 24 giờ. Vui lòng thử lại sau hoặc trả lời trong ticket đang mở.`
      );
    }
    const ticketRow = await supportTicketRepository.insertTicket(client, {
      userId: user.id,
      workspaceOwnerId,
      subject,
      category,
    });
    const attachments = await claimAttachments(client, {
      objectIds: attachmentIds,
      actorUserId: user.id,
      ticketId: ticketRow.id,
    });
    const messageRow = await supportTicketRepository.insertMessage(client, {
      ticketId: ticketRow.id,
      authorUserId: user.id,
      authorRole: 'user',
      body,
      attachments,
    });
    return { ticket: ticketRow, message: messageRow };
  });

  notifyAdminsTicketCreated({ ticket, user, body });
  return {
    ticket: toTicketDto(ticket),
    messages: [toMessageDto({ ...message, author_full_name: user.full_name, author_username: user.username })],
  };
}

/**
 * Ticket của CHÍNH người gọi, mới nhất trước.
 *
 * @param {object} user
 * @param {{ page?: unknown, limit?: unknown, status?: unknown }} [query]
 */
export async function listMyTickets(user, query = {}) {
  const status = parseOptionalFilter(query.status, SUPPORT_TICKET_STATUSES, 'SUPPORT_STATUS_INVALID', 'Trạng thái không hợp lệ');
  const { page, limit } = parsePaging(query);
  const [{ rows, total }, counts] = await Promise.all([
    supportTicketRepository.list({ userId: user.id, status, page, limit }),
    supportTicketRepository.countByStatus({ userId: user.id }),
  ]);
  return {
    items: rows.map((row) => toTicketDto(row)),
    counts: { ...counts, all: counts.open + counts.awaiting_user + counts.closed },
    pagination: paginationOf(page, limit, total),
  };
}

/**
 * Chi tiết + toàn bộ tin của ticket do CHÍNH người gọi tạo. Ticket của người khác / không tồn tại → 404.
 *
 * @param {object} user
 * @param {string|number} ticketId
 */
export async function getMyTicket(user, ticketId) {
  const id = parseTicketId(ticketId);
  const ticket = await supportTicketRepository.findById(id, { userId: user.id });
  if (!ticket) throw notFound();
  const messages = await supportTicketRepository.listMessages(id);
  return { ticket: toTicketDto(ticket), messages: messages.map((row) => toMessageDto(row)) };
}

/**
 * Người dùng nhắn thêm vào ticket của mình: ticket về `open` (kể cả khi đã đóng — nhắn lại là mở lại).
 *
 * @param {object} user
 * @param {string|number} ticketId
 * @param {{ body?: unknown, attachmentIds?: unknown }} input
 * @returns {Promise<{ ticket: object, message: object }>}
 */
export async function addUserMessage(user, ticketId, input = {}) {
  const id = parseTicketId(ticketId);
  const body = normalizeBody(input.body);
  const attachmentIds = normalizeAttachmentIds(input.attachmentIds);

  const { ticket, message } = await supportTicketRepository.runInTransaction(async (client) => {
    const current = await supportTicketRepository.lockTicketById(client, id);
    if (!current || Number(current.user_id) !== Number(user.id)) throw notFound();
    const attachments = await claimAttachments(client, {
      objectIds: attachmentIds,
      actorUserId: user.id,
      ticketId: id,
    });
    const messageRow = await supportTicketRepository.insertMessage(client, {
      ticketId: id,
      authorUserId: user.id,
      authorRole: 'user',
      body,
      attachments,
    });
    const updated = await supportTicketRepository.touchAfterUserMessage(client, id);
    return { ticket: updated, message: messageRow };
  });

  notifyAdminsUserReplied({ ticket, user, message });
  return {
    ticket: toTicketDto(ticket),
    message: toMessageDto({ ...message, author_full_name: user.full_name, author_username: user.username }),
  };
}

/**
 * Người dùng tự đóng ticket của mình. Đã đóng rồi → trả nguyên trạng (không lỗi). Không bắn thông báo "đã đóng" cho chính họ.
 *
 * @param {object} user
 * @param {string|number} ticketId
 * @returns {Promise<{ ticket: object }>}
 */
export async function closeMyTicket(user, ticketId) {
  const id = parseTicketId(ticketId);
  const ticket = await supportTicketRepository.runInTransaction(async (client) => {
    const current = await supportTicketRepository.lockTicketById(client, id);
    if (!current || Number(current.user_id) !== Number(user.id)) throw notFound();
    if (current.status === 'closed') return current;
    return supportTicketRepository.setStatus(client, id, 'closed', user.id);
  });
  return { ticket: toTicketDto(ticket) };
}

/**
 * Tệp đính kèm có phát được cho người này không? Người tạo ticket HOẶC super admin; tệp phải nằm trong một tin của CHÍNH ticket đó,
 * còn `active` và khớp khoá trong sổ cái. Mọi trường hợp khác → 404 (không lộ tệp của ticket khác tồn tại).
 *
 * @param {object} user
 * @param {string|number} ticketId
 * @param {string|number} objectId id `storage_objects` (= `storageObjectId` trong tin)
 * @returns {Promise<{ storageKey: string, name: string, mime: string }>}
 */
export async function resolveAttachmentForDownload(user, ticketId, objectId) {
  const id = parseTicketId(ticketId);
  const rawObjectId = String(objectId ?? '').trim();
  if (!/^\d{1,18}$/.test(rawObjectId)) {
    throw httpError(400, 'SUPPORT_ATTACHMENT_INVALID', 'Mã ảnh không hợp lệ');
  }
  const ticket = await supportTicketRepository.findById(id, { userId: isSuperAdmin(user.role) ? null : user.id });
  if (!ticket) throw notFound();
  const attachment = await supportTicketRepository.findAttachmentInTicket(id, rawObjectId);
  if (!attachment) throw httpError(404, 'SUPPORT_ATTACHMENT_NOT_FOUND', 'Không tìm thấy ảnh đính kèm');
  const object = await findSupportTicketStorageObject(rawObjectId);
  if (
    !object
    || object.state !== 'active'
    || String(object.reference_id) !== String(id)
    || object.storage_key !== attachment.key
  ) {
    throw httpError(404, 'SUPPORT_ATTACHMENT_NOT_FOUND', 'Không tìm thấy ảnh đính kèm');
  }
  return { storageKey: object.storage_key, name: attachment.name, mime: attachment.mime };
}

// ─── Super admin ─────────────────────────────────────────────────────────────

/**
 * Danh sách mọi ticket (lọc status / category / tìm kiếm) kèm đếm theo trạng thái cho các tab.
 *
 * @param {{ page?: unknown, limit?: unknown, status?: unknown, category?: unknown, search?: unknown }} [query]
 */
export async function adminListTickets(query = {}) {
  const status = parseOptionalFilter(query.status, SUPPORT_TICKET_STATUSES, 'SUPPORT_STATUS_INVALID', 'Trạng thái không hợp lệ');
  const category = parseOptionalFilter(query.category, SUPPORT_TICKET_CATEGORIES, 'SUPPORT_CATEGORY_INVALID', 'Loại góp ý không hợp lệ');
  const search = String(query.search ?? '').trim().slice(0, 100) || null;
  const { page, limit } = parsePaging(query);
  const [{ rows, total }, counts] = await Promise.all([
    supportTicketRepository.list({ status, category, search, page, limit }),
    supportTicketRepository.countByStatus({ category, search }),
  ]);
  return {
    items: rows.map((row) => toTicketDto(row, { withUser: true })),
    counts: { ...counts, all: counts.open + counts.awaiting_user + counts.closed },
    pagination: paginationOf(page, limit, total),
  };
}

/** @param {string|number} ticketId */
export async function adminGetTicket(ticketId) {
  const id = parseTicketId(ticketId);
  const ticket = await supportTicketRepository.findById(id);
  if (!ticket) throw notFound();
  const messages = await supportTicketRepository.listMessages(id);
  return {
    ticket: toTicketDto(ticket, { withUser: true }),
    messages: messages.map((row) => toMessageDto(row, { revealAdmin: true })),
  };
}

/**
 * Admin trả lời: ticket sang `awaiting_user` (kể cả khi đang đóng), ghi mốc `last_admin_reply_at`, báo người tạo ticket.
 *
 * @param {object} admin `req.user` của super admin
 * @param {string|number} ticketId
 * @param {{ body?: unknown, attachmentIds?: unknown }} input
 * @returns {Promise<{ ticket: object, message: object }>}
 */
export async function adminReply(admin, ticketId, input = {}) {
  const id = parseTicketId(ticketId);
  const body = normalizeBody(input.body);
  const attachmentIds = normalizeAttachmentIds(input.attachmentIds);

  const { ticket, message } = await supportTicketRepository.runInTransaction(async (client) => {
    const current = await supportTicketRepository.lockTicketById(client, id);
    if (!current) throw notFound();
    const attachments = await claimAttachments(client, {
      objectIds: attachmentIds,
      actorUserId: admin.id,
      ticketId: id,
    });
    const messageRow = await supportTicketRepository.insertMessage(client, {
      ticketId: id,
      authorUserId: admin.id,
      authorRole: 'admin',
      body,
      attachments,
    });
    const updated = await supportTicketRepository.touchAfterAdminReply(client, id);
    return { ticket: updated, message: messageRow };
  });

  notifyUserAdminReplied({ ticket, message });
  return {
    ticket: toTicketDto(ticket),
    message: toMessageDto({ ...message, author_full_name: admin.full_name, author_username: admin.username }, { revealAdmin: true }),
  };
}

/**
 * Admin đổi trạng thái ticket. `closed` báo người tạo ticket (chuông); trạng thái khác xoá dấu đóng. Không đổi gì nếu trạng thái đã đúng.
 *
 * @param {object} admin
 * @param {string|number} ticketId
 * @param {unknown} rawStatus
 * @returns {Promise<{ ticket: object }>}
 */
export async function adminSetStatus(admin, ticketId, rawStatus) {
  const id = parseTicketId(ticketId);
  const status = String(rawStatus ?? '').trim();
  if (!SUPPORT_TICKET_STATUSES.includes(status)) {
    throw httpError(400, 'SUPPORT_STATUS_INVALID', 'Trạng thái không hợp lệ');
  }

  const { ticket, changed } = await supportTicketRepository.runInTransaction(async (client) => {
    const current = await supportTicketRepository.lockTicketById(client, id);
    if (!current) throw notFound();
    if (current.status === status) return { ticket: current, changed: false };
    const updated = await supportTicketRepository.setStatus(client, id, status, status === 'closed' ? admin.id : null);
    return { ticket: updated, changed: true };
  });

  if (changed && status === 'closed') {
    dispatchInBackground('closed', () => notifyUsers(closedNoticeInput({ ticket, auto: false })));
  }
  return { ticket: toTicketDto(ticket) };
}

// ─── Cron ────────────────────────────────────────────────────────────────────

/**
 * Cron `support_ticket_auto_close` (03:20 hằng ngày): đóng ticket `awaiting_user` quá `SUPPORT_TICKET_AUTO_CLOSE_DAYS` (mặc định 7)
 * ngày không ai đụng tới, rồi báo từng người tạo ticket (chuông). Lỗi báo từng người không làm dừng cả lượt.
 *
 * @param {{ days?: number }} [options]
 * @returns {Promise<{ closed: number, notified: number, notifyFailed: number, days: number }>}
 */
export async function autoCloseStaleTickets({ days } = {}) {
  const effectiveDays = days ?? positiveIntFromEnv('SUPPORT_TICKET_AUTO_CLOSE_DAYS', SUPPORT_AUTO_CLOSE_DAYS_DEFAULT);
  const closedRows = await supportTicketRepository.closeStaleAwaitingUser({ days: effectiveDays });
  let notified = 0;
  let notifyFailed = 0;
  for (const row of closedRows) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await notifyUsers(closedNoticeInput({ ticket: row, auto: true, days: effectiveDays }));
      notified += 1;
    } catch (error) {
      notifyFailed += 1;
      console.error(`[SupportTicket] báo đóng tự động ticket ${row.id} lỗi:`, error?.message || error);
    }
  }
  return { closed: closedRows.length, notified, notifyFailed, days: effectiveDays };
}

export default {
  createTicket,
  listMyTickets,
  getMyTicket,
  addUserMessage,
  closeMyTicket,
  resolveAttachmentForDownload,
  adminListTickets,
  adminGetTicket,
  adminReply,
  adminSetStatus,
  autoCloseStaleTickets,
  settlePendingSupportNotifications,
};
