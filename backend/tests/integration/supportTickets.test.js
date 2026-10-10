/**
 * Integration (Postgres thật) — ticket góp ý / hỗ trợ PR-4 (PLAN_TICKET_GOP_Y_VA_CHUONG_THONG_BAO_2026-10-10):
 * bảng support_tickets / support_ticket_messages, ảnh đính kèm temp → active + tham chiếu, phát ảnh, thông báo qua dispatcher,
 * cron tự đóng, liên hệ từ trang chủ. `sendSystemEmail` tự no-op khi NODE_ENV=test; chuông đo qua bảng user_notifications.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { createUser, truncateAll } from './helpers/db.js';
import { LocalStorageBackend } from '../../src/services/storage/localStorageBackend.js';
import { resetStorageBackendForTest, setStorageBackendInstance } from '../../src/services/storage/storageBackend.js';
import { clearEventSettingsCache } from '../../src/services/notification/notificationDispatch.service.js';
import {
  autoCloseStaleTickets,
  settlePendingSupportNotifications,
} from '../../src/services/support/supportTicket.service.js';

const TEST_ROOT = path.join(os.tmpdir(), `uknow-support-${process.pid}-${Date.now()}`);
let app;

beforeAll(async () => {
  await fs.mkdir(path.join(TEST_ROOT, 'uploads'), { recursive: true });
  await fs.mkdir(path.join(TEST_ROOT, 'temp_uploads'), { recursive: true });
  setStorageBackendInstance(new LocalStorageBackend({
    uploadsRootDir: path.join(TEST_ROOT, 'uploads'),
    tempDir: path.join(TEST_ROOT, 'temp_uploads'),
  }));
  app = createApp();
});

afterAll(async () => {
  resetStorageBackendForTest();
  await fs.rm(TEST_ROOT, { recursive: true, force: true }).catch(() => {});
});

beforeEach(async () => {
  await truncateAll();
  clearEventSettingsCache();
  delete process.env.SUPPORT_TICKET_DAILY_LIMIT;
});

const tokenOf = (user) => jwt.sign(
  { userId: user.id, email: user.email, role: user.role || 'user' },
  process.env.JWT_SECRET || 'test-jwt-secret'
);
const as = (method, url, user, owner = null) => {
  const req = request(app)[method](url).set('Authorization', `Bearer ${tokenOf(user)}`);
  return owner ? req.set('X-Owner-Context', String(owner.id)) : req;
};
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 7)]);

async function uploadImage(user, owner = null, name = 'loi.png') {
  const res = await as('post', '/api/support/tickets/attachments', user, owner).attach('file', PNG, { filename: name, contentType: 'image/png' });
  expect(res.status).toBe(201);
  return res.body.data;
}
async function createTicket(user, body = {}, owner = null) {
  return as('post', '/api/support/tickets', user, owner).send({ subject: 'Lỗi gửi mail', category: 'bug', body: 'Không gửi được', ...body });
}
async function notificationsOf(userId, eventType) {
  const { rows } = await db.query(
    'SELECT * FROM user_notifications WHERE user_id = $1 AND event_type = $2 ORDER BY id',
    [userId, eventType]
  );
  return rows;
}
async function setup() {
  const user = await createUser({ username: 'khach_a' });
  const other = await createUser({ username: 'khach_b' });
  const admin1 = await createUser({ username: 'admin_1', role: 'admin' });
  const admin2 = await createUser({ username: 'admin_2', role: 'admin' });
  return { user, other, admin1, admin2 };
}

describe('luồng tạo → admin trả lời → user trả lời → đóng', () => {
  it('chạy trọn vẹn trên DB thật, trạng thái + thông báo đúng ở từng bước', async () => {
    const { user, admin1, admin2 } = await setup();

    const created = await createTicket(user);
    expect(created.status).toBe(201);
    const ticketId = created.body.data.ticket.id;
    await settlePendingSupportNotifications();
    // Cả 2 super admin có chuông "ticket mới" trỏ về màn admin.
    for (const admin of [admin1, admin2]) {
      const rows = await notificationsOf(admin.id, 'support_ticket_created');
      expect(rows).toHaveLength(1);
      expect(rows[0].link).toBe(`/admin/tickets/${ticketId}`);
    }
    expect(await notificationsOf(user.id, 'support_ticket_created')).toHaveLength(0);

    // Admin thấy, trả lời → awaiting_user; người tạo có chuông.
    const adminList = await as('get', '/api/admin/support/tickets?status=open', admin1);
    expect(adminList.body.data.items.map((t) => t.id)).toEqual([ticketId]);
    expect(adminList.body.data.counts).toMatchObject({ open: 1, awaiting_user: 0, closed: 0, all: 1 });

    const replied = await as('post', `/api/admin/support/tickets/${ticketId}/reply`, admin1).send({ body: 'Đã kiểm tra, mời bạn thử lại' });
    expect(replied.status).toBe(201);
    expect(replied.body.data.ticket.status).toBe('awaiting_user');
    expect(replied.body.data.ticket.lastAdminReplyAt).toBeTruthy();
    await settlePendingSupportNotifications();
    const replyRows = await notificationsOf(user.id, 'support_ticket_replied');
    expect(replyRows).toHaveLength(1);
    expect(replyRows[0].link).toBe(`/app/support/${ticketId}`);
    expect(replyRows[0].message).toContain('Đã kiểm tra');

    // Người dùng thấy thread, tên admin bị ẩn, rồi trả lời → open + admin có chuông.
    const thread = await as('get', `/api/support/tickets/${ticketId}`, user);
    expect(thread.body.data.messages.map((m) => m.authorRole)).toEqual(['user', 'admin']);
    expect(thread.body.data.messages[1].authorName).toBeNull();
    const userReply = await as('post', `/api/support/tickets/${ticketId}/messages`, user).send({ body: 'Vẫn lỗi' });
    expect(userReply.status).toBe(201);
    expect(userReply.body.data.ticket.status).toBe('open');
    await settlePendingSupportNotifications();
    expect(await notificationsOf(admin1.id, 'support_ticket_user_replied')).toHaveLength(1);
    expect(await notificationsOf(admin2.id, 'support_ticket_user_replied')).toHaveLength(1);

    // Admin đóng → người tạo có chuông "đã đóng"; người dùng nhắn lại → mở lại.
    const closed = await as('post', `/api/admin/support/tickets/${ticketId}/status`, admin1).send({ status: 'closed' });
    expect(closed.body.data.ticket.status).toBe('closed');
    await settlePendingSupportNotifications();
    expect(await notificationsOf(user.id, 'support_ticket_closed')).toHaveLength(1);
    const reopened = await as('post', `/api/support/tickets/${ticketId}/messages`, user).send({ body: 'Xin mở lại' });
    expect(reopened.body.data.ticket.status).toBe('open');

    // Người dùng tự đóng: không có chuông cho chính họ.
    const selfClose = await as('post', `/api/support/tickets/${ticketId}/close`, user);
    expect(selfClose.body.data.ticket.status).toBe('closed');
    await settlePendingSupportNotifications();
    expect(await notificationsOf(user.id, 'support_ticket_closed')).toHaveLength(1);

    const { rows } = await db.query('SELECT status, closed_by, closed_at FROM support_tickets WHERE id = $1', [ticketId]);
    expect(rows[0].status).toBe('closed');
    expect(Number(rows[0].closed_by)).toBe(Number(user.id));
  });

  it('người dùng khác: danh sách rỗng, đọc / nhắn / đóng ticket của người ta → 404', async () => {
    const { user, other } = await setup();
    const ticketId = (await createTicket(user)).body.data.ticket.id;

    expect((await as('get', '/api/support/tickets', other)).body.data.items).toEqual([]);
    expect((await as('get', `/api/support/tickets/${ticketId}`, other)).status).toBe(404);
    expect((await as('post', `/api/support/tickets/${ticketId}/messages`, other).send({ body: 'x' })).status).toBe(404);
    expect((await as('post', `/api/support/tickets/${ticketId}/close`, other)).status).toBe(404);
    expect((await as('get', '/api/admin/support/tickets', other)).status).toBe(403);
    const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM support_ticket_messages WHERE ticket_id = $1', [ticketId]);
    expect(rows[0].n).toBe(1);
  });

  it('hạn mức 10 ticket / 24 giờ / người: ticket thứ 11 → 429 và không có dòng mới', async () => {
    const { user, other } = await setup();
    for (let i = 0; i < 10; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      expect((await createTicket(user, { subject: `T${i}` })).status).toBe(201);
    }
    const blocked = await createTicket(user, { subject: 'T11' });
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('SUPPORT_TICKET_DAILY_LIMIT');
    const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM support_tickets WHERE user_id = $1', [user.id]);
    expect(rows[0].n).toBe(10);
    // Người khác không bị ảnh hưởng.
    expect((await createTicket(other)).status).toBe(201);
  });

  it('nhân viên: ticket gắn user_id nhân viên + workspace_owner_id chủ; chủ KHÔNG thấy ticket của nhân viên', async () => {
    const owner = await createUser({ username: 'chu_ws' });
    const employee = await createUser({ username: 'nv_ws', role: 'employee' });
    await db.query(
      `INSERT INTO user_members (owner_id, employee_id, permissions, status, accepted_at, created_at, updated_at)
       VALUES ($1, $2, '{}'::jsonb, 'active', NOW(), NOW(), NOW())`,
      [owner.id, employee.id]
    );

    const res = await createTicket(employee, {}, owner);
    expect(res.status).toBe(201);
    expect(res.body.data.ticket.workspaceOwnerId).toBe(Number(owner.id));
    const { rows } = await db.query('SELECT user_id, workspace_owner_id FROM support_tickets');
    expect(rows).toEqual([{ user_id: String(employee.id), workspace_owner_id: String(owner.id) }]);

    expect((await as('get', '/api/support/tickets', owner)).body.data.items).toEqual([]);
    expect((await as('get', '/api/support/tickets', employee, owner)).body.data.items).toHaveLength(1);
    expect((await as('get', `/api/support/tickets/${res.body.data.ticket.id}`, owner)).status).toBe(404);
  });
});

describe('ảnh đính kèm', () => {
  it('tải lên = temp (hết hạn ~24h, category support_ticket); gắn vào ticket = active + reference_type support_ticket + reference_id = ticket', async () => {
    const { user } = await setup();
    const file = await uploadImage(user);

    let { rows } = await db.query('SELECT state, category, reference_type, reference_id, expires_at, actor_user_id, owner_user_id FROM storage_objects WHERE id = $1', [file.storageObjectId]);
    expect(rows[0]).toMatchObject({ state: 'temp', category: 'support_ticket', reference_type: null, reference_id: null });
    expect(new Date(rows[0].expires_at).getTime()).toBeGreaterThan(Date.now() + 23 * 3600 * 1000);

    const created = await createTicket(user, { attachmentIds: [file.storageObjectId] });
    expect(created.status).toBe(201);
    const ticketId = created.body.data.ticket.id;
    expect(created.body.data.messages[0].attachments).toEqual([
      { storageObjectId: file.storageObjectId, name: 'loi.png', size: PNG.length, mime: 'image/png' },
    ]);

    ({ rows } = await db.query('SELECT state, reference_type, reference_id, expires_at FROM storage_objects WHERE id = $1', [file.storageObjectId]));
    expect(rows[0]).toEqual({ state: 'active', reference_type: 'support_ticket', reference_id: String(ticketId), expires_at: null });
    const { rows: msg } = await db.query('SELECT attachments FROM support_ticket_messages WHERE ticket_id = $1', [ticketId]);
    expect(msg[0].attachments[0]).toMatchObject({ storageObjectId: file.storageObjectId, key: file.key, mime: 'image/png' });
  });

  it('nhân viên tải ảnh: dung lượng tính cho CHỦ (owner_user_id), người thao tác ở actor_user_id', async () => {
    const owner = await createUser({ username: 'chu_up' });
    const employee = await createUser({ username: 'nv_up', role: 'employee' });
    await db.query(
      `INSERT INTO user_members (owner_id, employee_id, permissions, status, accepted_at, created_at, updated_at)
       VALUES ($1, $2, '{}'::jsonb, 'active', NOW(), NOW(), NOW())`,
      [owner.id, employee.id]
    );
    const file = await uploadImage(employee, owner);
    const { rows } = await db.query('SELECT owner_user_id, actor_user_id FROM storage_objects WHERE id = $1', [file.storageObjectId]);
    expect(rows[0]).toEqual({ owner_user_id: String(owner.id), actor_user_id: String(employee.id) });
    expect(file.key).toMatch(new RegExp(`^uploads/${owner.id}/support/`));
  });

  it('ảnh thứ 4 → 400; ảnh của người khác → 400 và ảnh đó vẫn temp; ảnh đã gắn không dùng lại được; không có dòng ticket mồ côi', async () => {
    const { user, other } = await setup();
    const four = [];
    for (let i = 0; i < 4; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      four.push((await uploadImage(user, null, `a${i}.png`)).storageObjectId);
    }
    expect((await createTicket(user, { attachmentIds: four })).body.code).toBe('SUPPORT_ATTACHMENT_LIMIT');

    const foreign = (await uploadImage(other)).storageObjectId;
    const stolen = await createTicket(user, { attachmentIds: [foreign] });
    expect(stolen.status).toBe(400);
    expect(stolen.body.code).toBe('SUPPORT_ATTACHMENT_INVALID');
    const { rows: still } = await db.query('SELECT state FROM storage_objects WHERE id = $1', [foreign]);
    expect(still[0].state).toBe('temp');

    const ok = await createTicket(user, { attachmentIds: [four[0]] });
    expect(ok.status).toBe(201);
    const reuse = await createTicket(user, { attachmentIds: [four[0]] });
    expect(reuse.status).toBe(400);
    const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM support_tickets');
    expect(rows[0].n).toBe(1); // giao dịch bị huỷ cả ticket lần 2 lẫn lần 3
  });

  it('ảnh hết hạn (expires_at đã qua) không gắn được', async () => {
    const { user } = await setup();
    const file = await uploadImage(user);
    await db.query(`UPDATE storage_objects SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1`, [file.storageObjectId]);
    const res = await createTicket(user, { attachmentIds: [file.storageObjectId] });
    expect(res.status).toBe(400);
  });

  it('sai loại / quá 5 MB bị từ chối ở bước tải lên, không để lại dòng sổ cái', async () => {
    const { user } = await setup();
    const pdf = await as('post', '/api/support/tickets/attachments', user).attach('file', Buffer.from('%PDF-1.4 hello world'), { filename: 'a.pdf', contentType: 'application/pdf' });
    expect(pdf.status).toBe(400);
    const big = await as('post', '/api/support/tickets/attachments', user)
      .attach('file', Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]), { filename: 'b.png', contentType: 'image/png' });
    expect(big.status).toBe(400);
    const { rows } = await db.query(`SELECT COUNT(*)::int AS n FROM storage_objects WHERE category = 'support_ticket'`);
    expect(rows[0].n).toBe(0);
  });

  it('phát ảnh: người tạo + super admin được; người lạ 404; ảnh của ticket khác 404', async () => {
    const { user, other, admin1 } = await setup();
    const file = await uploadImage(user);
    const ticketId = (await createTicket(user, { attachmentIds: [file.storageObjectId] })).body.data.ticket.id;
    const otherTicketId = (await createTicket(other)).body.data.ticket.id;
    const url = `/api/support/tickets/${ticketId}/attachments/${file.storageObjectId}`;

    const mine = await as('get', url, user);
    expect(mine.status).toBe(200);
    expect(mine.headers['cache-control']).toBe('private, no-store');
    expect(mine.headers['content-type']).toMatch(/image\/png/);
    expect((await as('get', url, admin1)).status).toBe(200);
    expect((await as('get', `/api/admin/support/tickets/${ticketId}/attachments/${file.storageObjectId}`, admin1)).status).toBe(200);

    expect((await as('get', url, other)).status).toBe(404);
    // Người lạ có ticket của riêng mình vẫn không lấy được ảnh của ticket khác qua ticket của mình.
    expect((await as('get', `/api/support/tickets/${otherTicketId}/attachments/${file.storageObjectId}`, other)).status).toBe(404);
    expect((await request(app).get(url)).status).toBe(401);
  });

  it('admin trả lời kèm ảnh: ảnh gắn đúng ticket, người dùng xem được', async () => {
    const { user, admin1 } = await setup();
    const ticketId = (await createTicket(user)).body.data.ticket.id;
    const file = await uploadImage(admin1, null, 'huong-dan.png');
    const reply = await as('post', `/api/admin/support/tickets/${ticketId}/reply`, admin1).send({ body: 'Xem ảnh', attachmentIds: [file.storageObjectId] });
    expect(reply.status).toBe(201);
    expect((await as('get', `/api/support/tickets/${ticketId}/attachments/${file.storageObjectId}`, user)).status).toBe(200);
  });
});

describe('cron tự đóng', () => {
  it('chỉ đóng ticket awaiting_user không ai đụng tới quá 7 ngày; báo người tạo bằng chuông; chạy lại không báo lần hai', async () => {
    const { user, admin1 } = await setup();
    const stale = (await createTicket(user, { subject: 'Cũ' })).body.data.ticket.id;
    const fresh = (await createTicket(user, { subject: 'Mới' })).body.data.ticket.id;
    const stillOpen = (await createTicket(user, { subject: 'Đang mở cũ' })).body.data.ticket.id;
    for (const id of [stale, fresh]) {
      // eslint-disable-next-line no-await-in-loop
      await as('post', `/api/admin/support/tickets/${id}/reply`, admin1).send({ body: 'Đã trả lời' }).expect(201);
    }
    await db.query(`UPDATE support_tickets SET updated_at = NOW() - INTERVAL '8 days' WHERE id IN ($1, $2)`, [stale, stillOpen]);
    await settlePendingSupportNotifications();

    const result = await autoCloseStaleTickets();
    expect(result).toMatchObject({ closed: 1, notified: 1, notifyFailed: 0, days: 7 });

    const { rows } = await db.query('SELECT id, status, closed_by FROM support_tickets ORDER BY id');
    const byId = Object.fromEntries(rows.map((r) => [String(r.id), r]));
    expect(byId[stale]).toMatchObject({ status: 'closed', closed_by: null });
    expect(byId[fresh].status).toBe('awaiting_user');
    expect(byId[stillOpen].status).toBe('open'); // open (chờ admin) không bị đóng dù cũ
    const closedRows = await notificationsOf(user.id, 'support_ticket_closed');
    expect(closedRows).toHaveLength(1);
    expect(closedRows[0].link).toBe(`/app/support/${stale}`);

    expect(await autoCloseStaleTickets()).toMatchObject({ closed: 0, notified: 0 });
    expect(await notificationsOf(user.id, 'support_ticket_closed')).toHaveLength(1);
  });
});

describe('liên hệ từ trang chủ (admin)', () => {
  async function seedContact(over = {}) {
    const { rows } = await db.query(
      `INSERT INTO contact_submissions (name, email, phone, company, message)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [over.name ?? 'Nguyễn Lan', over.email ?? 'lan@khach.vn', '0901234567', 'Công ty A', over.message ?? 'Cần tư vấn gói doanh nghiệp']
    );
    return Number(rows[0].id);
  }

  it('GET liệt kê + đếm theo trạng thái + tìm kiếm; PATCH đổi trạng thái và ghi chú rồi đọc lại đúng', async () => {
    const { user, admin1 } = await setup();
    const id = await seedContact();
    await seedContact({ name: 'Trần Minh', email: 'minh@khach.vn', message: 'Hỏi giá' });

    expect((await as('get', '/api/admin/support/contact-submissions', user)).status).toBe(403);
    const list = await as('get', '/api/admin/support/contact-submissions', admin1);
    expect(list.status).toBe(200);
    expect(list.body.data.items).toHaveLength(2);
    expect(list.body.data.counts).toEqual({ new: 2, contacted: 0, qualified: 0, closed: 0, all: 2 });
    const searched = await as('get', '/api/admin/support/contact-submissions?search=lan%40khach', admin1);
    expect(searched.body.data.items.map((i) => i.id)).toEqual([id]);

    const patched = await as('patch', `/api/admin/support/contact-submissions/${id}`, admin1).send({ status: 'contacted', notes: 'Đã gọi 10/10' });
    expect(patched.status).toBe(200);
    expect(patched.body.data).toMatchObject({ id, status: 'contacted', notes: 'Đã gọi 10/10' });

    const filtered = await as('get', '/api/admin/support/contact-submissions?status=contacted', admin1);
    expect(filtered.body.data.items.map((i) => i.id)).toEqual([id]);
    expect(filtered.body.data.counts).toMatchObject({ new: 1, contacted: 1, all: 2 });

    expect((await as('patch', `/api/admin/support/contact-submissions/${id}`, admin1).send({ status: 'bogus' })).status).toBe(400);
    expect((await as('patch', '/api/admin/support/contact-submissions/999999', admin1).send({ notes: 'x' })).status).toBe(404);
    // Chỉ ghi chú: giữ nguyên trạng thái.
    await as('patch', `/api/admin/support/contact-submissions/${id}`, admin1).send({ notes: '' }).expect(200);
    const { rows } = await db.query('SELECT status, notes FROM contact_submissions WHERE id = $1', [id]);
    expect(rows[0]).toEqual({ status: 'contacted', notes: null });
  });
});

describe('route chết /hero/contact đã xoá', () => {
  it('POST /api/public/hero/contact không còn là endpoint', async () => {
    const res = await request(app).post('/api/public/hero/contact').send({ name: 'a', email: 'a@b.co', message: 'xin chao' });
    expect(res.status).toBe(404);
  });
});
