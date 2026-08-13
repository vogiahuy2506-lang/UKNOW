/**
 * Integration tests cho `GET /api/admin/delivery-monitor/overview`.
 *
 * Service dùng safeQuery (bỏ qua lỗi 42P01/42703 nếu bảng thiếu) nên
 * response luôn thành công dù DB rỗng — test tập trung vào:
 *   - Authorization (chỉ admin)
 *   - Response shape đúng
 *   - windowDays được clamp vào [1, 90]
 *   - Isolation: chỉ admin mới truy cập được
 *
 * Covered:
 *   - GET /overview — response shape đầy đủ
 *   - GET /overview?windowDays=30 — custom window
 *   - GET /overview?windowDays=200 → clamp về 90
 *   - GET /overview?windowDays=0 → default về 7
 *   - Silent-drop signal: tỉ lệ 1 giờ, sàn 10 lượt, tenant không áp (admin thấy mọi TK)
 *   - Thiếu cột account_id → overview vẫn 200, không có tín hiệu silent-drop
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { truncateAll, createUser, insertZaloMonitorMessages } from './helpers/db.js';
import {
  ZALO_SILENT_DROP_SIGNAL_CODE,
} from '../../src/utils/deliveryMonitorSignals.util.js';
import { ZALO_SILENT_DROP_CATEGORY } from '../../src/utils/zaloDispatchDelivery.util.js';

let app;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
});

async function loginAs(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  return res.body.data.accessToken;
}

// ─── Authorization ──────────────────────────────────────────────────────────
describe('Authorization — /api/admin/delivery-monitor/*', () => {
  it('không có token → 401', async () => {
    const res = await request(app).get('/api/admin/delivery-monitor/overview');
    expect(res.status).toBe(401);
  });

  it('user role thường → 403', async () => {
    const user = await createUser({ role: 'user', username: 'plain' });
    const token = await loginAs(user);
    const res = await request(app)
      .get('/api/admin/delivery-monitor/overview')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('admin role → 200', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const token = await loginAs(admin);
    const res = await request(app)
      .get('/api/admin/delivery-monitor/overview')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

// ─── Response shape ─────────────────────────────────────────────────────────
describe('GET /api/admin/delivery-monitor/overview — response shape', () => {
  it('trả đầy đủ top-level fields', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const token = await loginAs(admin);
    const res = await request(app)
      .get('/api/admin/delivery-monitor/overview')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data;
    expect(data).toHaveProperty('generatedAt');
    expect(data).toHaveProperty('windowDays');
    expect(data).toHaveProperty('summary');
    expect(data).toHaveProperty('channels');
    expect(data).toHaveProperty('timeline');
    expect(data).toHaveProperty('topRuns');
    expect(data).toHaveProperty('failureGroups');
    expect(data).toHaveProperty('recentErrors');
    expect(data).toHaveProperty('queue');
    expect(data).toHaveProperty('redis');
    expect(data).toHaveProperty('signals');
    expect(data).toHaveProperty('health');
    expect(Array.isArray(data.signals)).toBe(true);
  });

  it('summary có đủ counter fields mặc định = 0', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const token = await loginAs(admin);
    const res = await request(app)
      .get('/api/admin/delivery-monitor/overview')
      .set('Authorization', `Bearer ${token}`);

    const { summary } = res.body.data;
    expect(summary).toMatchObject({
      sent: 0,
      failed: 0,
      opened: 0,
      clicked: 0,
      totalRuns: 0,
      runningRuns: 0,
      completedRuns: 0,
      failedRuns: 0,
    });
    expect(summary).toHaveProperty('successRate');
    expect(summary).toHaveProperty('attempts');
  });

  it('channels trả 3 kênh: email, zalo, zalo_group', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const token = await loginAs(admin);
    const res = await request(app)
      .get('/api/admin/delivery-monitor/overview')
      .set('Authorization', `Bearer ${token}`);

    const channels = res.body.data.channels;
    expect(Array.isArray(channels)).toBe(true);
    expect(channels).toHaveLength(3);
    const codes = channels.map((c) => c.channel);
    expect(codes).toContain('email');
    expect(codes).toContain('zalo');
    expect(codes).toContain('zalo_group');
  });

  it('health có zaloQuietHours với inQuietHours boolean', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const token = await loginAs(admin);
    const res = await request(app)
      .get('/api/admin/delivery-monitor/overview')
      .set('Authorization', `Bearer ${token}`);

    const { health } = res.body.data;
    expect(health).toHaveProperty('hardBounceCount');
    expect(health).toHaveProperty('zaloDisconnectedCount');
    expect(health).toHaveProperty('pendingRetryCount');
    expect(health).toHaveProperty('zaloSkipCount');
    expect(health).toHaveProperty('zaloQuietHours');
    expect(typeof health.zaloQuietHours.inQuietHours).toBe('boolean');
    expect(health.zaloQuietHours).toHaveProperty('start');
    expect(health.zaloQuietHours).toHaveProperty('end');
    expect(health.zaloQuietHours).toHaveProperty('currentHourVN');
  });

  it('generatedAt là ISO string hợp lệ', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const token = await loginAs(admin);
    const res = await request(app)
      .get('/api/admin/delivery-monitor/overview')
      .set('Authorization', `Bearer ${token}`);

    expect(typeof res.body.data.generatedAt).toBe('string');
    expect(new Date(res.body.data.generatedAt).toISOString()).toBe(res.body.data.generatedAt);
  });
});

// ─── windowDays param ────────────────────────────────────────────────────────
describe('GET /api/admin/delivery-monitor/overview — windowDays param', () => {
  it('?windowDays=30 → windowDays=30 trong response', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const token = await loginAs(admin);
    const res = await request(app)
      .get('/api/admin/delivery-monitor/overview?windowDays=30')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.data.windowDays).toBe(30);
  });

  it('?windowDays=200 → clamp về 90', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const token = await loginAs(admin);
    const res = await request(app)
      .get('/api/admin/delivery-monitor/overview?windowDays=200')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.data.windowDays).toBe(90);
  });

  it('?windowDays=0 → default về 7', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const token = await loginAs(admin);
    const res = await request(app)
      .get('/api/admin/delivery-monitor/overview?windowDays=0')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.data.windowDays).toBe(7);
  });

  it('?windowDays=abc → default về 7', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const token = await loginAs(admin);
    const res = await request(app)
      .get('/api/admin/delivery-monitor/overview?windowDays=abc')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.data.windowDays).toBe(7);
  });

  it('không có windowDays → default về 7', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const token = await loginAs(admin);
    const res = await request(app)
      .get('/api/admin/delivery-monitor/overview')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.data.windowDays).toBe(7);
  });
});

async function createCampaign({ userId, name = 'C', type = 'zalo' }) {
  const { rows } = await db.query(
    `INSERT INTO campaigns (id_user, campaign_name, campaign_type, status, published_at)
     VALUES ($1, $2, $3, 'running', NOW()) RETURNING id`,
    [userId, name, type]
  );
  return rows[0];
}

function silentDropSignals(data) {
  return (data?.signals || []).filter((item) => item.code === ZALO_SILENT_DROP_SIGNAL_CODE);
}

describe('GET /api/admin/delivery-monitor/overview — Zalo silent drop', () => {
  afterAll(async () => {
    await db.query('ALTER TABLE zalo_messages ADD COLUMN IF NOT EXISTS account_id BIGINT');
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_zalo_messages_account_created
        ON zalo_messages (account_id, created_at DESC)
        WHERE account_id IS NOT NULL
    `);
  });
  it('3/10 silent-drop trong 1 giờ → warning 30%; 9/9 không đủ sàn; bản ghi 2 giờ trước không tính', async () => {
    const admin = await createUser({ role: 'admin', username: 'adminSd' });
    const owner = await createUser({ role: 'user', username: 'ownerSd' });
    const camp = await createCampaign({ userId: owner.id, name: 'Zalo drip' });
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

    await insertZaloMonitorMessages({
      campaignId: camp.id, accountId: 42, accountName: 'MỸ - SHTT',
      status: 'failed', errorCategory: ZALO_SILENT_DROP_CATEGORY, count: 3,
    });
    await insertZaloMonitorMessages({
      campaignId: camp.id, accountId: 42, accountName: 'MỸ - SHTT',
      status: 'sent', count: 7,
    });
    await insertZaloMonitorMessages({
      campaignId: camp.id, accountId: 9, accountName: 'Too few',
      status: 'failed', errorCategory: ZALO_SILENT_DROP_CATEGORY, count: 9,
    });
    await insertZaloMonitorMessages({
      campaignId: camp.id, accountId: 8, accountName: 'Stale',
      status: 'failed', errorCategory: ZALO_SILENT_DROP_CATEGORY, count: 10,
      createdAt: twoHoursAgo,
    });

    const token = await loginAs(admin);
    const res = await request(app)
      .get('/api/admin/delivery-monitor/overview')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const silent = silentDropSignals(res.body.data);
    expect(silent).toHaveLength(1);
    expect(silent[0]).toMatchObject({
      level: 'warning',
      accountId: 42,
      accountName: 'MỸ - SHTT',
      silentDrops: 3,
      attempts: 10,
      value: 30,
    });
  });

  it('5/10 silent-drop → critical', async () => {
    const admin = await createUser({ role: 'admin', username: 'adminCrit' });
    const owner = await createUser({ role: 'user', username: 'ownerCrit' });
    const camp = await createCampaign({ userId: owner.id });
    await insertZaloMonitorMessages({
      campaignId: camp.id, accountId: 7, accountName: 'Hot',
      status: 'failed', errorCategory: ZALO_SILENT_DROP_CATEGORY, count: 5,
    });
    await insertZaloMonitorMessages({
      campaignId: camp.id, accountId: 7, accountName: 'Hot',
      status: 'sent', count: 5,
    });

    const token = await loginAs(admin);
    const res = await request(app)
      .get('/api/admin/delivery-monitor/overview')
      .set('Authorization', `Bearer ${token}`);

    const silent = silentDropSignals(res.body.data);
    expect(silent).toHaveLength(1);
    expect(silent[0]).toMatchObject({
      level: 'critical',
      accountId: 7,
      silentDrops: 5,
      attempts: 10,
      value: 50,
    });
  });

  it('thiếu cột account_id → overview vẫn 200 và không có tín hiệu silent-drop', async () => {
    const admin = await createUser({ role: 'admin', username: 'adminDropCol' });
    const owner = await createUser({ role: 'user', username: 'ownerDropCol' });
    const camp = await createCampaign({ userId: owner.id });
    await insertZaloMonitorMessages({
      campaignId: camp.id, accountId: 15, accountName: 'Will vanish',
      status: 'failed', errorCategory: ZALO_SILENT_DROP_CATEGORY, count: 10,
    });

    const token = await loginAs(admin);
    const before = await request(app)
      .get('/api/admin/delivery-monitor/overview')
      .set('Authorization', `Bearer ${token}`);
    expect(silentDropSignals(before.body.data)).toHaveLength(1);

    await db.query('ALTER TABLE zalo_messages DROP COLUMN IF EXISTS account_id CASCADE');
    try {
      const res = await request(app)
        .get('/api/admin/delivery-monitor/overview')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data.signals)).toBe(true);
      expect(silentDropSignals(res.body.data)).toHaveLength(0);
    } finally {
      await db.query('ALTER TABLE zalo_messages ADD COLUMN IF NOT EXISTS account_id BIGINT');
      await db.query(`
        CREATE INDEX IF NOT EXISTS idx_zalo_messages_account_created
          ON zalo_messages (account_id, created_at DESC)
          WHERE account_id IS NOT NULL
      `);
    }
  });
});
