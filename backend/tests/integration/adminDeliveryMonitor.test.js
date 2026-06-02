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
 */
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { truncateAll, createUser } from './helpers/db.js';

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
