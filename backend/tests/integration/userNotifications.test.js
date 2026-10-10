/**
 * Integration (Postgres thật) — chuông thông báo PR-1 (PLAN_TICKET_GOP_Y_VA_CHUONG_THONG_BAO_2026-10-10):
 * bảng user_notifications / notification_preferences / notification_event_settings, dispatcher, API `/api/notifications/*` và
 * `/api/admin/notification-events/*`, finalizeRun trả trạng thái thật, cron dọn.
 * `sendSystemEmail` tự no-op khi NODE_ENV=test nên "email đã gửi" được đo bằng bộ đếm kết quả của dispatcher.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { createUser, truncateAll } from './helpers/db.js';
import userNotificationRepository from '../../src/repositories/notification/userNotification.repository.js';
import campaignRunRepository from '../../src/repositories/campaign/campaignRun.repository.js';
import { notifyUsers, clearEventSettingsCache } from '../../src/services/notification/notificationDispatch.service.js';
import { getNotificationEvent } from '../../src/config/notificationEventCatalog.js';
import { cleanupUserNotifications } from '../../src/services/notification/userNotificationCleanup.service.js';
import { notifyCampaignRunCompleted } from '../../src/utils/campaignRunCompletedNotify.util.js';
import {
  notifyCampaignApprovalRequired, notifyCampaignRunFailed, notifyCampaignQuotaPaused, notifyCampaignQuotaStopped,
} from '../../src/utils/campaignQuotaPauseNotify.util.js';
import { notifyCampaignScheduleSkipped } from '../../src/utils/campaignScheduleSkipNotify.util.js';

let app;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
  clearEventSettingsCache();
});

afterEach(() => {
  jest.restoreAllMocks();
});

const tokenOf = (user) => jwt.sign(
  { userId: user.id, email: user.email, role: user.role || 'user' },
  process.env.JWT_SECRET || 'test-jwt-secret'
);
const as = (method, url, user) => request(app)[method](url).set('Authorization', `Bearer ${tokenOf(user)}`);

async function rowsOf(userId) {
  const { rows } = await db.query(
    'SELECT * FROM user_notifications WHERE user_id = $1 ORDER BY id',
    [userId]
  );
  return rows;
}

async function insertBulkUsers(count) {
  const { rows } = await db.query(
    `INSERT INTO users (username, email, password_hash, status, role, is_verified)
     SELECT 'bulk_' || g, 'bulk_' || g || '@test.local', 'x', 'active', 'user', true
       FROM generate_series(1, $1::int) g
     RETURNING id`,
    [count]
  );
  return rows.map((row) => Number(row.id));
}

async function createCampaignWithRun(owner, { status = 'running', triggeredBy = null } = {}) {
  const { rows: campaigns } = await db.query(
    `INSERT INTO campaigns (id_user, workspace_owner_id, campaign_name, campaign_type, status)
     VALUES ($1, $1, 'Khuyến mãi tháng 10', 'email', 'active') RETURNING id`,
    [owner.id]
  );
  const { rows: runs } = await db.query(
    `INSERT INTO campaign_runs (id_campaign, workspace_owner_id, run_type, status, triggered_by, run_metadata)
     VALUES ($1, $2, 'manual', $3, $4, '{}'::jsonb) RETURNING id`,
    [campaigns[0].id, owner.id, status, triggeredBy]
  );
  return { campaignId: Number(campaigns[0].id), runId: Number(runs[0].id) };
}

describe('user_notifications — lược đồ + repository trên DB thật', () => {
  it('chèn cho 300 người bằng ĐÚNG MỘT câu INSERT; id không tồn tại / tài khoản vô hiệu bị bỏ qua, không làm hỏng cả lô', async () => {
    const ids = await insertBulkUsers(300);
    const inactive = await createUser({ username: 'inactive_user', status: 'inactive' });
    const spy = jest.spyOn(db, 'query');

    const inserted = await userNotificationRepository.insertMany({
      userIds: [...ids, inactive.id, 999999999],
      eventType: 'admin_broadcast',
      title: 'Bảo trì',
      message: 'Hệ thống bảo trì 22h',
    });

    const insertCalls = spy.mock.calls.filter(([sql]) => /INSERT INTO user_notifications/.test(sql));
    expect(insertCalls).toHaveLength(1);
    expect(inserted).toHaveLength(300);
    const { rows } = await db.query('SELECT COUNT(*)::int AS n, COUNT(DISTINCT user_id)::int AS u FROM user_notifications');
    expect(rows[0]).toEqual({ n: 300, u: 300 });
    expect(await rowsOf(inactive.id)).toHaveLength(0);
  });

  it('dedupe: gọi lại cùng (user, dedupeKey) KHÔNG ném và KHÔNG chèn thêm — insertMany trả [] ở lần hai', async () => {
    const user = await createUser({ username: 'dedupe_user' });
    const args = {
      userIds: [user.id], eventType: 'campaign_run_failed', title: 'T', message: 'M', dedupeKey: 'run:1:failed',
    };

    expect(await userNotificationRepository.insertMany(args)).toEqual([Number(user.id)]);
    await expect(userNotificationRepository.insertMany(args)).resolves.toEqual([]);

    expect(await rowsOf(user.id)).toHaveLength(1);
  });

  it('chỉ chèn thêm cho người CHƯA có dòng cùng khoá (nhóm trộn)', async () => {
    const a = await createUser({ username: 'mix_a' });
    const b = await createUser({ username: 'mix_b' });
    await userNotificationRepository.insertMany({ userIds: [a.id], eventType: 'admin_broadcast', title: 'T', message: 'M', dedupeKey: 'broadcast:9' });

    const inserted = await userNotificationRepository.insertMany({
      userIds: [a.id, b.id], eventType: 'admin_broadcast', title: 'T', message: 'M', dedupeKey: 'broadcast:9',
    });

    expect(inserted).toEqual([Number(b.id)]);
  });

  it('unique partial index: cùng (user, key) → 23505; khác user cùng key OK; nhiều dòng KHÔNG có key OK', async () => {
    const a = await createUser({ username: 'uniq_a' });
    const b = await createUser({ username: 'uniq_b' });
    const insert = (userId, key) => db.query(
      `INSERT INTO user_notifications (user_id, event_type, title, message, dedupe_key) VALUES ($1, 'x', 't', 'm', $2)`,
      [userId, key]
    );

    await insert(a.id, 'k1');
    await expect(insert(a.id, 'k1')).rejects.toMatchObject({ code: '23505' });
    await expect(insert(b.id, 'k1')).resolves.toBeDefined();
    await insert(a.id, null);
    await insert(a.id, null);
    expect(await rowsOf(a.id)).toHaveLength(3);
  });

  it("CHECK severity: giá trị lạ → 23514; mặc định 'info'; metadata mặc định {}", async () => {
    const user = await createUser({ username: 'sev_user' });
    await expect(db.query(
      `INSERT INTO user_notifications (user_id, event_type, title, message, severity) VALUES ($1, 'x', 't', 'm', 'critical')`,
      [user.id]
    )).rejects.toMatchObject({ code: '23514' });

    await db.query(`INSERT INTO user_notifications (user_id, event_type, title, message) VALUES ($1, 'x', 't', 'm')`, [user.id]);
    const [row] = await rowsOf(user.id);
    expect(row.severity).toBe('info');
    expect(row.metadata).toEqual({});
    expect(row.read_at).toBeNull();
  });

  it('xoá người dùng → thông báo + tuỳ chọn của họ bị xoá theo (ON DELETE CASCADE)', async () => {
    const user = await createUser({ username: 'cascade_user' });
    await userNotificationRepository.insertMany({ userIds: [user.id], eventType: 'admin_broadcast', title: 'T', message: 'M' });
    await db.query(`INSERT INTO notification_preferences (user_id, event_type, email_enabled) VALUES ($1, 'campaign_run_failed', false)`, [user.id]);

    await db.query('DELETE FROM users WHERE id = $1', [user.id]);

    expect((await db.query('SELECT 1 FROM user_notifications WHERE user_id = $1', [user.id])).rows).toHaveLength(0);
    expect((await db.query('SELECT 1 FROM notification_preferences WHERE user_id = $1', [user.id])).rows).toHaveLength(0);
  });

  it('notification_preferences: khoá chính (user_id, event_type) — chèn trùng → 23505; upsert ghi đè đúng một dòng', async () => {
    const user = await createUser({ username: 'pref_user' });
    const insert = () => db.query(
      `INSERT INTO notification_preferences (user_id, event_type, email_enabled) VALUES ($1, 'campaign_run_failed', false)`,
      [user.id]
    );
    await insert();
    await expect(insert()).rejects.toMatchObject({ code: '23505' });

    const { default: preferenceRepository } = await import('../../src/repositories/notification/notificationPreference.repository.js');
    await preferenceRepository.upsert(user.id, 'campaign_run_failed', true);
    await preferenceRepository.upsert(user.id, 'campaign_run_completed', false);
    const { rows } = await db.query('SELECT event_type, email_enabled FROM notification_preferences WHERE user_id = $1 ORDER BY event_type', [user.id]);
    expect(rows).toEqual([
      { event_type: 'campaign_run_completed', email_enabled: false },
      { event_type: 'campaign_run_failed', email_enabled: true },
    ]);
  });

  it('notification_event_settings: mặc định true/true/true; updated_by về NULL khi admin bị xoá', async () => {
    const admin = await createUser({ username: 'setting_admin', role: 'admin' });
    await db.query(`INSERT INTO notification_event_settings (event_type, updated_by) VALUES ('campaign_run_failed', $1)`, [admin.id]);
    let [row] = (await db.query(`SELECT * FROM notification_event_settings WHERE event_type = 'campaign_run_failed'`)).rows;
    expect(row).toMatchObject({ in_app_enabled: true, email_enabled: true, user_can_disable_email: true, updated_by: Number(admin.id) });

    await db.query('DELETE FROM users WHERE id = $1', [admin.id]);
    [row] = (await db.query(`SELECT * FROM notification_event_settings WHERE event_type = 'campaign_run_failed'`)).rows;
    expect(row.updated_by).toBeNull();
  });
});

// Mặc định hệ thống là CHỈ CHUÔNG (migration 293): ca nào cần email phải giả lập super admin đã bật email cho loại đó.
async function enableEmailFor(...eventTypes) {
  for (const eventType of eventTypes) {
    await db.query(
      `INSERT INTO notification_event_settings (event_type, email_enabled, user_can_disable_email) VALUES ($1, true, $2)
       ON CONFLICT (event_type) DO UPDATE SET email_enabled = true`,
      [eventType, getNotificationEvent(eventType).userCanDisableEmail]
    );
  }
  clearEventSettingsCache();
}

describe('dispatcher trên DB thật', () => {
  it('mặc định hệ thống chỉ chuông: chưa có dòng cấu hình → có dòng in-app, KHÔNG email', async () => {
    const user = await createUser({ username: 'default_bell_only' });

    const result = await notifyUsers({ eventType: 'campaign_run_failed', userIds: [user.id], title: 'T', message: 'M' });

    expect(result).toMatchObject({ inApp: 1, emailSent: 0 });
  });

  it('chuông + email theo tuỳ chọn: người tắt email chỉ có dòng in-app, người còn lại có cả email; gọi lại cùng dedupeKey → không gì thêm', async () => {
    await enableEmailFor('campaign_run_failed');
    const a = await createUser({ username: 'disp_a' });
    const b = await createUser({ username: 'disp_b' });
    await db.query(`INSERT INTO notification_preferences (user_id, event_type, email_enabled) VALUES ($1, 'campaign_run_failed', false)`, [b.id]);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const payload = {
      eventType: 'campaign_run_failed', userIds: [a.id, b.id], title: 'Lỗi', message: 'Chi tiết', dedupeKey: 'run:77:failed',
    };

    const first = await notifyUsers(payload);
    expect(first).toEqual({ inApp: 2, emailSent: 1, emailSkipped: 1, emailFailed: 0 });
    expect(await rowsOf(a.id)).toHaveLength(1);
    expect(await rowsOf(b.id)).toHaveLength(1);

    const second = await notifyUsers(payload);
    expect(second).toEqual({ inApp: 0, emailSent: 0, emailSkipped: 2, emailFailed: 0 });
    expect(errorSpy).not.toHaveBeenCalled(); // dedupe nằm ở SQL (ON CONFLICT), không phải lỗi bị nuốt
    expect(await rowsOf(a.id)).toHaveLength(1);
  });

  it('loại KHÔNG cho tắt (campaign_approval_required): email vẫn tới người có dòng tuỳ chọn "tắt"', async () => {
    await enableEmailFor('campaign_approval_required');
    const user = await createUser({ username: 'locked_user' });
    await db.query(`INSERT INTO notification_preferences (user_id, event_type, email_enabled) VALUES ($1, 'campaign_approval_required', false)`, [user.id]);

    const result = await notifyUsers({ eventType: 'campaign_approval_required', userIds: [user.id], title: 'T', message: 'M' });

    expect(result).toMatchObject({ inApp: 1, emailSent: 1, emailSkipped: 0 });
  });

  it('super admin tắt chuông của sự kiện (dòng settings) → không có dòng in-app', async () => {
    const user = await createUser({ username: 'noapp_user' });
    await db.query(`INSERT INTO notification_event_settings (event_type, in_app_enabled) VALUES ('campaign_run_completed', false)`);

    const result = await notifyUsers({ eventType: 'campaign_run_completed', userIds: [user.id], title: 'T', message: 'M' });

    expect(result.inApp).toBe(0);
    expect(await rowsOf(user.id)).toHaveLength(0);
  });
});

describe('API /api/notifications', () => {
  it('user MỚI (kể cả chưa có gói) → 200, rỗng, unreadCount 0 — hết hạn gói vẫn thấy chuông', async () => {
    const user = await createUser({ username: 'api_noplan', withPlan: false });

    const list = await as('get', '/api/notifications', user);
    expect(list.status).toBe(200);
    expect(list.body.data).toEqual({
      items: [], unreadCount: 0, pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
    const count = await as('get', '/api/notifications/unread-count', user);
    expect(count.body.data).toEqual({ unreadCount: 0 });
  });

  it('không token → 401', async () => {
    expect((await request(app).get('/api/notifications')).status).toBe(401);
    expect((await request(app).get('/api/notifications/unread-count')).status).toBe(401);
  });

  it('luồng đầy đủ: nhận → liệt kê (mới nhất trước) → lọc chưa đọc → đánh dấu đọc → đọc hết', async () => {
    const user = await createUser({ username: 'api_flow' });
    for (const n of [1, 2, 3]) {
      // eslint-disable-next-line no-await-in-loop
      await notifyUsers({
        eventType: 'campaign_run_completed', userIds: [user.id], title: `Lượt ${n}`, message: `Nội dung ${n}`, link: '/app/delivery-monitor',
      });
    }

    const list = await as('get', '/api/notifications', user);
    expect(list.body.data.items.map((item) => item.title)).toEqual(['Lượt 3', 'Lượt 2', 'Lượt 1']);
    expect(list.body.data.unreadCount).toBe(3);
    expect(list.body.data.items[0]).toMatchObject({ eventType: 'campaign_run_completed', read: false, link: '/app/delivery-monitor', severity: 'info' });

    const firstId = list.body.data.items[2].id;
    const read = await as('post', `/api/notifications/${firstId}/read`, user);
    expect(read.status).toBe(200);
    expect(read.body.data.id).toBe(firstId);

    const unread = await as('get', '/api/notifications?unread=1', user);
    expect(unread.body.data.items.map((item) => item.title)).toEqual(['Lượt 3', 'Lượt 2']);
    expect(unread.body.data.pagination.total).toBe(2);
    expect(unread.body.data.unreadCount).toBe(2);

    const paged = await as('get', '/api/notifications?limit=2&page=2', user);
    expect(paged.body.data.items.map((item) => item.title)).toEqual(['Lượt 1']);
    expect(paged.body.data.pagination).toEqual({ page: 2, limit: 2, total: 3, totalPages: 2 });

    const all = await as('post', '/api/notifications/read-all', user);
    expect(all.body.data).toEqual({ updated: 2 });
    expect((await as('get', '/api/notifications/unread-count', user)).body.data.unreadCount).toBe(0);
  });

  it('đánh dấu đọc thông báo của NGƯỜI KHÁC → 404 và dòng đó vẫn chưa đọc; id sai dạng → 400', async () => {
    const owner = await createUser({ username: 'api_owner' });
    const other = await createUser({ username: 'api_other' });
    await notifyUsers({ eventType: 'campaign_run_completed', userIds: [owner.id], title: 'Của chủ', message: 'M' });
    const [row] = await rowsOf(owner.id);

    const res = await as('post', `/api/notifications/${row.id}/read`, other);
    expect(res.status).toBe(404);
    expect((await rowsOf(owner.id))[0].read_at).toBeNull();
    expect((await as('post', '/api/notifications/abc/read', other)).status).toBe(400);
    expect((await as('post', '/api/notifications/999999/read', other)).status).toBe(404);

    // read-all của người khác không chạm dòng của chủ
    await as('post', '/api/notifications/read-all', other).expect(200);
    expect((await rowsOf(owner.id))[0].read_at).toBeNull();
  });

  it('NHÂN VIÊN (kể cả khi gửi X-Owner-Context) đọc thông báo của CHÍNH MÌNH, không thấy của chủ', async () => {
    const owner = await createUser({ username: 'emp_owner' });
    const employee = await createUser({ username: 'emp_staff', role: 'employee' });
    await db.query(
      `INSERT INTO user_members (owner_id, employee_id, permissions, status, accepted_at, created_at, updated_at)
       VALUES ($1, $2, '{}'::jsonb, 'active', NOW(), NOW(), NOW())`,
      [owner.id, employee.id]
    );
    await notifyUsers({ eventType: 'campaign_run_completed', userIds: [owner.id], title: 'Của chủ', message: 'M' });
    await notifyUsers({ eventType: 'campaign_approval_required', userIds: [employee.id], title: 'Của nhân viên 1', message: 'M' });
    await notifyUsers({ eventType: 'campaign_run_failed', userIds: [employee.id], title: 'Của nhân viên 2', message: 'M' });

    const res = await as('get', '/api/notifications', employee).set('X-Owner-Context', String(owner.id));

    expect(res.status).toBe(200);
    expect(res.body.data.items.map((item) => item.title).sort()).toEqual(['Của nhân viên 1', 'Của nhân viên 2']);
    expect(res.body.data.unreadCount).toBe(2);
    const ownerRes = await as('get', '/api/notifications', owner);
    expect(ownerRes.body.data.items.map((item) => item.title)).toEqual(['Của chủ']);
  });

  it('preferences: GET 13 mục (audience=user); PUT khoá → 400 và KHÔNG ghi; PUT cho phép → ghi DB, GET phản ánh emailEnabled hiệu lực', async () => {
    await enableEmailFor('campaign_run_failed', 'campaign_approval_required');
    const user = await createUser({ username: 'api_pref' });

    const list = await as('get', '/api/notifications/preferences', user);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(13);
    const failed = list.body.data.find((item) => item.eventType === 'campaign_run_failed');
    expect(failed).toMatchObject({ emailEnabled: true, userCanDisableEmail: true, inAppEnabled: true, systemEmailEnabled: true });

    const locked = await as('put', '/api/notifications/preferences', user).send({ eventType: 'campaign_approval_required', emailEnabled: false });
    expect(locked.status).toBe(400);
    expect(locked.body.code).toBe('NOTIFICATION_EMAIL_LOCKED');
    expect((await db.query('SELECT 1 FROM notification_preferences WHERE user_id = $1', [user.id])).rows).toHaveLength(0);

    const ok = await as('put', '/api/notifications/preferences', user).send({ eventType: 'campaign_run_failed', emailEnabled: false });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ eventType: 'campaign_run_failed', emailEnabled: false });
    const after = await as('get', '/api/notifications/preferences', user);
    expect(after.body.data.find((item) => item.eventType === 'campaign_run_failed').emailEnabled).toBe(false);
    const { rows } = await db.query('SELECT event_type, email_enabled FROM notification_preferences WHERE user_id = $1', [user.id]);
    expect(rows).toEqual([{ event_type: 'campaign_run_failed', email_enabled: false }]);
  });
});

describe('API /api/admin/notification-events', () => {
  it('user thường → 403; admin GET đủ 15 mục; PUT ghi DB + có hiệu lực NGAY với dispatcher (xoá cache)', async () => {
    const admin = await createUser({ username: 'ev_admin', role: 'admin' });
    const user = await createUser({ username: 'ev_user' });

    expect((await as('get', '/api/admin/notification-events', user)).status).toBe(403);

    const list = await as('get', '/api/admin/notification-events', admin);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(15);

    // campaign_run_completed mặc định tắt email → bật qua API → dispatcher gửi email ngay (cache đã bị xoá).
    const before = await notifyUsers({ eventType: 'campaign_run_completed', userIds: [user.id], title: 'T', message: 'M' });
    expect(before.emailSent).toBe(0);

    const put = await as('put', '/api/admin/notification-events/campaign_run_completed', admin).send({ emailEnabled: true });
    expect(put.status).toBe(200);
    expect(put.body.data.settings).toMatchObject({ emailEnabled: true, isDefault: false, updatedBy: Number(admin.id) });
    const { rows } = await db.query(`SELECT * FROM notification_event_settings WHERE event_type = 'campaign_run_completed'`);
    expect(rows[0]).toMatchObject({ email_enabled: true, in_app_enabled: true, user_can_disable_email: true });

    const afterPut = await notifyUsers({ eventType: 'campaign_run_completed', userIds: [user.id], title: 'T', message: 'M' });
    expect(afterPut.emailSent).toBe(1);
  });

  it('admin khoá email của loại không-cho-tắt → người dùng vẫn bị chặn; mở khoá → tắt được', async () => {
    await enableEmailFor('campaign_approval_required');
    const admin = await createUser({ username: 'ev_admin2', role: 'admin' });
    const user = await createUser({ username: 'ev_user2' });

    await as('put', '/api/admin/notification-events/campaign_approval_required', admin).send({ userCanDisableEmail: true }).expect(200);

    const res = await as('put', '/api/notifications/preferences', user).send({ eventType: 'campaign_approval_required', emailEnabled: false });
    expect(res.status).toBe(200);
  });

  it('PUT khoá lạ → 404; body sai → 400', async () => {
    const admin = await createUser({ username: 'ev_admin3', role: 'admin' });
    expect((await as('put', '/api/admin/notification-events/khong_co', admin).send({ emailEnabled: true })).status).toBe(404);
    expect((await as('put', '/api/admin/notification-events/campaign_run_failed', admin).send({ emailEnabled: 'x' })).status).toBe(400);
  });
});

describe('finalizeRun trả trạng thái thật (cho thông báo "chạy xong")', () => {
  const counts = { totalRecipients: 5, successfulSends: 4, failedSends: 1, skippedSends: 0 };

  it("lượt đang running, hết người nhận chờ → { status: 'completed' } và DB ghi completed; gọi lại lần hai → null (không còn running)", async () => {
    const owner = await createUser({ username: 'fin_owner' });
    const { runId } = await createCampaignWithRun(owner);

    expect(await campaignRunRepository.finalizeRun(runId, false, counts)).toEqual({ status: 'completed' });
    const { rows } = await db.query('SELECT status, total_recipients, successful_sends, failed_sends FROM campaign_runs WHERE id = $1', [runId]);
    expect(rows[0]).toEqual({ status: 'completed', total_recipients: 5, successful_sends: 4, failed_sends: 1 });

    expect(await campaignRunRepository.finalizeRun(runId, false, counts)).toBeNull();
  });

  it("còn người nhận chờ thử lại → { status: 'running' } và DB vẫn running", async () => {
    const owner = await createUser({ username: 'fin_pending' });
    const { runId } = await createCampaignWithRun(owner);

    expect(await campaignRunRepository.finalizeRun(runId, true, counts, { nonContinuousDeferredUntil: '2030-01-01T00:00:00.000Z' }))
      .toEqual({ status: 'running' });
    const { rows } = await db.query('SELECT status, run_metadata FROM campaign_runs WHERE id = $1', [runId]);
    expect(rows[0].status).toBe('running');
    expect(rows[0].run_metadata.nonContinuousDeferredUntil).toBe('2030-01-01T00:00:00.000Z');
  });

  it('lượt đã bị dừng (stopped) → finalizeRun trả null và KHÔNG ghi đè trạng thái', async () => {
    const owner = await createUser({ username: 'fin_stopped' });
    const { runId } = await createCampaignWithRun(owner, { status: 'stopped' });

    expect(await campaignRunRepository.finalizeRun(runId, false, counts)).toBeNull();
    expect((await db.query('SELECT status FROM campaign_runs WHERE id = $1', [runId])).rows[0].status).toBe('stopped');
  });
});

describe('4 sự kiện chiến dịch ghi thông báo thật', () => {
  it('campaign_run_completed: chủ + người kích hoạt (khác chủ) mỗi người một dòng; gọi lại cùng lượt không thêm dòng', async () => {
    const owner = await createUser({ username: 'ev_c_owner' });
    const staff = await createUser({ username: 'ev_c_staff' });
    const { campaignId, runId } = await createCampaignWithRun(owner);
    const input = {
      runId, campaignId, campaignName: 'Khuyến mãi tháng 10', ownerId: owner.id, triggeredBy: staff.id,
      totalRecipients: 5, successfulSends: 4, failedSends: 1, skippedSends: 0,
    };

    const first = await notifyCampaignRunCompleted(input);
    expect(first.inApp).toBe(2);
    const ownerRows = await rowsOf(owner.id);
    expect(ownerRows).toHaveLength(1);
    expect(ownerRows[0]).toMatchObject({
      event_type: 'campaign_run_completed', severity: 'warning', link: '/app/delivery-monitor', dedupe_key: `run:${runId}:completed`,
    });
    expect(ownerRows[0].title).toBe('Chiến dịch «Khuyến mãi tháng 10» đã chạy xong');
    expect(ownerRows[0].message).toBe('Đã gửi thành công 4, lỗi 1.');
    expect(ownerRows[0].metadata).toMatchObject({ runId, campaignId, successfulSends: 4, failedSends: 1 });
    expect(await rowsOf(staff.id)).toHaveLength(1);

    const second = await notifyCampaignRunCompleted(input);
    expect(second.inApp).toBe(0);
    expect(await rowsOf(owner.id)).toHaveLength(1);
    // Mặc định email của sự kiện này TẮT → không email.
    expect(first.emailSent).toBe(0);
  });

  it('campaign_run_failed: claim giành cờ → một dòng in-app cho người tạo chiến dịch + email; claim lần hai không báo lại', async () => {
    const owner = await createUser({ username: 'ev_f_owner' });
    const { campaignId, runId } = await createCampaignWithRun(owner);

    const first = await notifyCampaignRunFailed({ runId, campaignId, reason: 'Tài khoản Zalo đã chọn chưa ở trạng thái sẵn sàng', source: 'catch_all' });
    expect(first).toEqual({ sent: true });
    const rows = await rowsOf(owner.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ event_type: 'campaign_run_failed', severity: 'error', link: '/app/campaigns', dedupe_key: `run:${runId}:failed` });
    expect(rows[0].message).toContain('Tài khoản Zalo dùng để gửi chưa sẵn sàng');

    expect(await notifyCampaignRunFailed({ runId, campaignId, reason: 'x', source: 'catch_all' }))
      .toEqual({ skipped: true, reason: 'already_notified' });
    expect(await rowsOf(owner.id)).toHaveLength(1);
  });

  it('campaign_approval_required: dòng in-app cho đúng CHỦ truyền vào (ownerId), không phải người tạo chiến dịch', async () => {
    const owner = await createUser({ username: 'ev_a_owner' });
    const staff = await createUser({ username: 'ev_a_staff' });
    const { campaignId } = await createCampaignWithRun(staff);

    const result = await notifyCampaignApprovalRequired({ campaignId, ownerId: owner.id, threshold: 50, totalCustomers: 120 });

    expect(result).toEqual({ sent: true });
    expect(await rowsOf(staff.id)).toHaveLength(0);
    const rows = await rowsOf(owner.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ event_type: 'campaign_approval_required', severity: 'warning' });
    expect(rows[0].metadata).toEqual({ campaignId, threshold: 50, totalCustomers: 120 });
  });

  // PR-6 — hết hạn mức (campaign_quota_exhausted) trên DB thật: bảng user_notifications nhận đúng dòng, seed 294 có mặt.
  it('campaign_quota_exhausted (tạm dừng): một dòng chuông cho người tạo chiến dịch, link /app/campaigns; gọi lại cùng đợt (cờ đã claim) không thêm; email mặc định tắt', async () => {
    const owner = await createUser({ username: 'ev_q_owner' });
    const { campaignId, runId } = await createCampaignWithRun(owner);
    const input = { runId, campaignId, reason: 'plan_quota_zalo_daily', resetAt: new Date('2026-10-12T00:00:00.000Z') };

    expect(await notifyCampaignQuotaPaused(input)).toEqual({ sent: true });
    const rows = await rowsOf(owner.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ event_type: 'campaign_quota_exhausted', severity: 'warning', link: '/app/campaigns' });
    expect(rows[0].dedupe_key).toMatch(new RegExp(`^run:${runId}:quota_paused:`));
    expect(rows[0].metadata).toEqual({ runId, campaignId, reason: 'plan_quota_zalo_daily' });
    expect(rows[0].message).toContain('Zalo');

    expect(await notifyCampaignQuotaPaused(input)).toEqual({ skipped: true, reason: 'already_notified' });
    expect(await rowsOf(owner.id)).toHaveLength(1);
  });

  it('campaign_quota_exhausted (dừng hẳn): một dòng chuông link /app/billing; gọi lại cùng ngày không thêm dòng (khoá theo chiến dịch + ngày VN)', async () => {
    const owner = await createUser({ username: 'ev_q2_owner' });
    const { campaignId } = await createCampaignWithRun(owner);

    expect(await notifyCampaignQuotaStopped({ campaignId, reason: 'Gói đã hết hạn.' })).toEqual({ sent: true });
    expect(await notifyCampaignQuotaStopped({ campaignId, reason: 'Gói đã hết hạn.' })).toEqual({ skipped: true, reason: 'no_delivery' });
    const rows = await rowsOf(owner.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ event_type: 'campaign_quota_exhausted', severity: 'error', link: '/app/billing' });
    expect(rows[0].dedupe_key).toMatch(new RegExp(`^campaign:${campaignId}:quota_stopped:\\d{8}$`));
  });

  it('campaign_schedule_skipped: một dòng in-app cho chủ; claim lần hai không báo lại', async () => {
    const owner = await createUser({ username: 'ev_s_owner' });
    const { campaignId, runId } = await createCampaignWithRun(owner);
    const input = { runId, campaignId, ownerId: owner.id, scheduleName: 'Gửi sáng', blockingRunId: 12, blockingStartedAt: '05:00 04/10' };

    expect(await notifyCampaignScheduleSkipped(input)).toEqual({ sent: true });
    const rows = await rowsOf(owner.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ event_type: 'campaign_schedule_skipped', severity: 'warning', dedupe_key: `run:${runId}:schedule_skipped` });

    expect(await notifyCampaignScheduleSkipped(input)).toEqual({ skipped: true, reason: 'already_notified' });
    expect(await rowsOf(owner.id)).toHaveLength(1);
  });
});

describe('cron dọn user_notifications', () => {
  it('xoá đã đọc > 90 ngày và chưa đọc > 180 ngày; giữ phần còn lại', async () => {
    const user = await createUser({ username: 'clean_user' });
    const insert = (title, createdDaysAgo, readDaysAgo) => db.query(
      `INSERT INTO user_notifications (user_id, event_type, title, message, created_at, read_at)
       VALUES ($1, 'x', $2, 'm', NOW() - make_interval(days => $3::int),
               CASE WHEN $4::int IS NULL THEN NULL ELSE NOW() - make_interval(days => $4::int) END)`,
      [user.id, title, createdDaysAgo, readDaysAgo]
    );
    await insert('đã đọc 100 ngày', 120, 100);
    await insert('đã đọc 10 ngày (tạo cách đây 200)', 200, 10);
    await insert('chưa đọc 200 ngày', 200, null);
    await insert('chưa đọc 100 ngày', 100, null);
    await insert('mới', 1, null);

    const result = await cleanupUserNotifications();

    expect(result).toMatchObject({ readDeleted: 1, unreadDeleted: 1, readDays: 90, unreadDays: 180 });
    const titles = (await rowsOf(user.id)).map((row) => row.title).sort();
    expect(titles).toEqual(['chưa đọc 100 ngày', 'mới', 'đã đọc 10 ngày (tạo cách đây 200)']);
  });
});
