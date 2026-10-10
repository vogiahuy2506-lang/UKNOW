/**
 * Integration (Postgres thật) — bản tin admin chọn kênh email / chuông (PR-3,
 * PLAN_TICKET_GOP_Y_VA_CHUONG_THONG_BAO_2026-10-10 mục 5): cột `notifications.channels` / `in_app_count` (migration 290),
 * `sendNow` → dispatcher `notifyUsers` (chuông, MỘT câu INSERT) + đường email cũ có log và lọc tuỳ chọn người dùng.
 * `sendSystemEmail` tự no-op khi NODE_ENV=test nên "email đã gửi" được đo bằng `notification_email_logs`.
 */
import { beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { createUser, truncateAll } from './helpers/db.js';
import { clearEventSettingsCache } from '../../src/services/notification/notificationDispatch.service.js';

let app;
let admin;
let u1;
let u2;
let u3;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
  await db.query('DELETE FROM notification_email_logs');
  await db.query('DELETE FROM notifications');
  // Mặc định hệ thống là CHỈ CHUÔNG (migration 293); các ca dưới giả lập super admin đã bật email cho bản tin admin.
  await db.query(
    `INSERT INTO notification_event_settings (event_type, in_app_enabled, email_enabled, user_can_disable_email)
     VALUES ('admin_broadcast', true, true, true)
     ON CONFLICT (event_type) DO UPDATE SET email_enabled = true`
  );
  clearEventSettingsCache();
  admin = await createUser({ role: 'admin', username: 'bc_admin' });
  u1 = await createUser({ username: 'bc_user1' });
  u2 = await createUser({ username: 'bc_user2' });
  u3 = await createUser({ username: 'bc_user3' });
});

const tokenOf = (user) => jwt.sign(
  { userId: user.id, email: user.email, role: user.role || 'user' },
  process.env.JWT_SECRET || 'test-jwt-secret'
);
const asAdmin = (method, url) => request(app)[method](url).set('Authorization', `Bearer ${tokenOf(admin)}`);

const baseBody = (over = {}) => ({
  type: 'announcement',
  title: '[Founder AI] Cập nhật tháng 10',
  message: 'Chào {{user_name}}, có tính năng mới.',
  target_user_ids: [Number(u1.id), Number(u2.id), Number(u3.id)],
  ...over,
});

const bellRows = async () => (await db.query(
  'SELECT * FROM user_notifications WHERE event_type = $1 ORDER BY user_id',
  ['admin_broadcast']
)).rows;
const emailLogs = async (notificationId) => (await db.query(
  'SELECT user_id, status FROM notification_email_logs WHERE notification_id = $1 ORDER BY user_id',
  [notificationId]
)).rows;
const notificationRow = async (id) => (await db.query('SELECT * FROM notifications WHERE id = $1', [id])).rows[0];

async function optOutEmail(user) {
  await db.query(
    `INSERT INTO notification_preferences (user_id, event_type, email_enabled) VALUES ($1, 'admin_broadcast', false)`,
    [user.id]
  );
}

describe('migration 290 — cột kênh trên DB thật', () => {
  it('bản tin tạo không nói gì về kênh có channels = {email}, in_app_count = 0 (hành vi cũ)', async () => {
    const created = await asAdmin('post', '/api/admin/notifications').send(baseBody());
    expect(created.status).toBe(201);
    const row = await notificationRow(created.body.data.id);
    expect(row.channels).toEqual(['email']);
    expect(row.in_app_count).toBe(0);
  });
});

describe('POST /api/admin/notifications/send-direct — kênh', () => {
  it('{in_app}: 3 dòng chuông (một câu INSERT), KHÔNG log email, in_app_count = 3, link + severity + nội dung trung tính', async () => {
    const res = await asAdmin('post', '/api/admin/notifications/send-direct').send(baseBody({
      channels: ['in_app'],
      priority: 'high',
      metadata: { link: '/app/plans' },
    }));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({ inApp: 3, emailTotal: 0, sent: 0, channels: ['in_app'] });
    expect(res.body.message).toBe('Đã gửi 3 thông báo chuông');

    const rows = await bellRows();
    expect(rows.map((row) => Number(row.user_id))).toEqual([u1.id, u2.id, u3.id].map(Number));
    const notificationId = rows[0].notification_id;
    expect(rows.every((row) => row.notification_id === notificationId)).toBe(true);
    expect(rows.every((row) => row.dedupe_key === `broadcast:${notificationId}`)).toBe(true);
    expect(rows[0]).toMatchObject({
      title: 'Cập nhật tháng 10', // bỏ tiền tố "[Founder AI] "
      message: 'Chào bạn, có tính năng mới.', // biến theo người được thay bằng cách gọi trung tính
      link: '/app/plans',
      severity: 'warning',
      read_at: null,
    });

    expect(await emailLogs(notificationId)).toHaveLength(0);
    const row = await notificationRow(notificationId);
    expect(row).toMatchObject({ status: 'sent', in_app_count: 3, recipient_count: 3, sent_count: 0, channels: ['in_app'] });
  });

  it('{email, in_app}: chuông đủ 3 người; email chỉ tới người KHÔNG tắt (u2 đã tắt → không log, không email)', async () => {
    await optOutEmail(u2);

    const res = await asAdmin('post', '/api/admin/notifications/send-direct').send(baseBody({ channels: ['email', 'in_app'] }));

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ inApp: 3, sent: 2, emailTotal: 2, emailSkipped: 1, total: 3 });
    const rows = await bellRows();
    expect(rows).toHaveLength(3);
    const notificationId = rows[0].notification_id;
    const logs = await emailLogs(notificationId);
    expect(logs.map((log) => Number(log.user_id))).toEqual([u1.id, u3.id].map(Number));
    expect(logs.every((log) => log.status === 'sent')).toBe(true);
    expect(await notificationRow(notificationId)).toMatchObject({ in_app_count: 3, sent_count: 2, recipient_count: 3 });
  });

  it('{email}: KHÔNG có dòng chuông nào; u2 đã tắt vẫn bị lọc', async () => {
    await optOutEmail(u2);

    const res = await asAdmin('post', '/api/admin/notifications/send-direct').send(baseBody({ channels: ['email'] }));

    expect(res.status).toBe(200);
    expect(await bellRows()).toHaveLength(0);
    expect(res.body.data).toMatchObject({ inApp: 0, sent: 2, emailSkipped: 1 });
  });

  it('priority urgent: khoá — u2 đã tắt email vẫn nhận email', async () => {
    await optOutEmail(u2);

    const res = await asAdmin('post', '/api/admin/notifications/send-direct').send(baseBody({ channels: ['email'], priority: 'urgent' }));

    expect(res.body.data).toMatchObject({ sent: 3, emailSkipped: 0 });
  });

  it('loại security / maintenance: khoá — u2 đã tắt email vẫn nhận email', async () => {
    await optOutEmail(u2);
    for (const type of ['security', 'maintenance']) {
      // eslint-disable-next-line no-await-in-loop
      const res = await asAdmin('post', '/api/admin/notifications/send-direct').send(baseBody({ channels: ['email'], type }));
      expect(res.body.data).toMatchObject({ sent: 3, emailSkipped: 0 });
    }
  });

  it('công tắc chuông hệ thống của admin_broadcast TẮT mà bản tin chọn chuông → 400 "Kênh Chuông đang tắt...", không tạo bản tin, không chèn dòng nào', async () => {
    await db.query(
      `INSERT INTO notification_event_settings (event_type, in_app_enabled, email_enabled, user_can_disable_email)
       VALUES ('admin_broadcast', false, true, true)
       ON CONFLICT (event_type) DO UPDATE SET in_app_enabled = EXCLUDED.in_app_enabled,
         email_enabled = EXCLUDED.email_enabled, user_can_disable_email = EXCLUDED.user_can_disable_email`
    );
    clearEventSettingsCache();

    const res = await asAdmin('post', '/api/admin/notifications/send-direct').send(baseBody({ channels: ['email', 'in_app'] }));

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Kênh Chuông đang tắt trong Cấu hình kênh');
    expect(await bellRows()).toHaveLength(0);
    expect((await db.query('SELECT COUNT(*)::int AS n FROM notifications')).rows[0].n).toBe(0);

    // Kênh còn bật vẫn gửi được.
    const ok = await asAdmin('post', '/api/admin/notifications/send-direct').send(baseBody({ channels: ['email'] }));
    expect(ok.status).toBe(200);
    expect(ok.body.data.sent).toBe(3);
  });

  it('công tắc email hệ thống TẮT: tạo nháp / PATCH / gửi bản tin có email → 400; bản tin chỉ-chuông gửi được', async () => {
    await db.query(
      `INSERT INTO notification_event_settings (event_type, in_app_enabled, email_enabled, user_can_disable_email)
       VALUES ('admin_broadcast', true, false, true)
       ON CONFLICT (event_type) DO UPDATE SET in_app_enabled = EXCLUDED.in_app_enabled,
         email_enabled = EXCLUDED.email_enabled, user_can_disable_email = EXCLUDED.user_can_disable_email`
    );
    clearEventSettingsCache();

    const create = await asAdmin('post', '/api/admin/notifications').send(baseBody({ channels: ['email'] }));
    expect(create.status).toBe(400);
    expect(create.body.message).toBe('Kênh Email đang tắt trong Cấu hình kênh');

    const okDraft = await asAdmin('post', '/api/admin/notifications').send(baseBody({ channels: ['in_app'] }));
    expect(okDraft.status).toBe(201);
    const patch = await asAdmin('patch', `/api/admin/notifications/${okDraft.body.data.id}`).send({ channels: ['email', 'in_app'] });
    expect(patch.status).toBe(400);
    expect((await notificationRow(okDraft.body.data.id)).channels).toEqual(['in_app']);

    const sent = await asAdmin('post', `/api/admin/notifications/${okDraft.body.data.id}/send`).send({});
    expect(sent.status).toBe(200);
    expect(sent.body.data).toMatchObject({ inApp: 3, sent: 0 });
  });

  it('hẹn giờ rồi admin tắt kênh: tới giờ gửi → 400, bản tin giữ nguyên trạng thái, không gửi gì', async () => {
    const draft = await asAdmin('post', '/api/admin/notifications').send(baseBody({ channels: ['in_app'] }));
    const id = draft.body.data.id;
    await db.query(
      `INSERT INTO notification_event_settings (event_type, in_app_enabled, email_enabled, user_can_disable_email)
       VALUES ('admin_broadcast', false, true, true)
       ON CONFLICT (event_type) DO UPDATE SET in_app_enabled = EXCLUDED.in_app_enabled,
         email_enabled = EXCLUDED.email_enabled, user_can_disable_email = EXCLUDED.user_can_disable_email`
    );
    clearEventSettingsCache();

    const sent = await asAdmin('post', `/api/admin/notifications/${id}/send`).send({});

    expect(sent.status).toBe(400);
    expect((await notificationRow(id)).status).toBe('draft');
    expect(await bellRows()).toHaveLength(0);
  });

  it('user đã tắt-email nhưng admin_broadcast bị admin khoá (user_can_disable_email = false) → vẫn nhận email', async () => {
    await optOutEmail(u2);
    await db.query(
      `INSERT INTO notification_event_settings (event_type, in_app_enabled, email_enabled, user_can_disable_email)
       VALUES ('admin_broadcast', true, true, false)
       ON CONFLICT (event_type) DO UPDATE SET in_app_enabled = EXCLUDED.in_app_enabled,
         email_enabled = EXCLUDED.email_enabled, user_can_disable_email = EXCLUDED.user_can_disable_email`
    );
    clearEventSettingsCache();

    const res = await asAdmin('post', '/api/admin/notifications/send-direct').send(baseBody({ channels: ['email'] }));

    expect(res.body.data).toMatchObject({ sent: 3, emailSkipped: 0 });
  });

  it.each([[[]], [['sms']], ['email']])('channels = %j → 400 và KHÔNG sinh bản tin nào', async (channels) => {
    const res = await asAdmin('post', '/api/admin/notifications/send-direct').send(baseBody({ channels }));

    expect(res.status).toBe(400);
    expect((await db.query('SELECT COUNT(*)::int AS n FROM notifications')).rows[0].n).toBe(0);
    expect(await bellRows()).toHaveLength(0);
  });

  it('không có tài khoản vô hiệu nào nhận chuông: người dùng inactive bị bỏ qua, không làm hỏng cả lô', async () => {
    const inactive = await createUser({ username: 'bc_inactive', status: 'inactive' });

    const res = await asAdmin('post', '/api/admin/notifications/send-direct').send(baseBody({
      channels: ['in_app'],
      target_user_ids: [Number(u1.id), Number(inactive.id)],
    }));

    expect(res.status).toBe(200);
    expect(res.body.data.inApp).toBe(1);
    expect(res.body.data.total).toBe(2);
  });
});

describe('hẹn giờ: create + schedule giữ nguyên kênh', () => {
  it('POST / với channels rồi PATCH đổi kênh → cột channels đổi đúng; gửi bằng /:id/send theo kênh đã lưu', async () => {
    const created = await asAdmin('post', '/api/admin/notifications').send(baseBody({ channels: ['email'] }));
    const id = created.body.data.id;
    expect((await notificationRow(id)).channels).toEqual(['email']);

    const patched = await asAdmin('patch', `/api/admin/notifications/${id}`).send({ channels: ['in_app', 'email'] });
    expect(patched.status).toBe(200);
    expect((await notificationRow(id)).channels).toEqual(['email', 'in_app']);

    const sent = await asAdmin('post', `/api/admin/notifications/${id}/send`).send({});
    expect(sent.status).toBe(200);
    expect(sent.body.data).toMatchObject({ inApp: 3, sent: 3 });
    expect(await notificationRow(id)).toMatchObject({ in_app_count: 3, sent_count: 3, status: 'sent' });
  });

  it('createRecurringChild chép kênh của bản tin cha (và INSERT hợp lệ)', async () => {
    const { default: notificationRepo } = await import('../../src/repositories/admin/notification.repository.js');
    const parent = await notificationRepo.create({ ...baseBody(), channels: ['in_app'], created_by: admin.id });

    const child = await notificationRepo.createRecurringChild(parent.id, new Date(Date.now() + 86400000));

    expect(child.channels).toEqual(['in_app']);
    expect(child.in_app_count).toBe(0);
  });
});
