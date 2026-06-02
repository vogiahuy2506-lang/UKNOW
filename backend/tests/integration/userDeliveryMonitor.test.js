/**
 * Integration tests cho `GET /api/delivery-monitor/overview` (user-facing).
 *
 * Endpoint này yêu cầu auth nhưng không cần admin role.
 * Service dùng safeQuery nên luôn trả kết quả ngay cả khi DB rỗng.
 *
 * Covered:
 *   - Authorization (cần auth, không cần admin)
 *   - Response shape đầy đủ
 *   - Tenant isolation — user chỉ thấy data của mình
 *   - windowDays param clamping
 */
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
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

async function createCampaign({ userId, name = 'C', type = 'email' }) {
  const { rows } = await db.query(
    `INSERT INTO campaigns (id_user, campaign_name, campaign_type, status, published_at)
     VALUES ($1, $2, $3, 'running', NOW()) RETURNING id`,
    [userId, name, type]
  );
  return rows[0];
}

async function createRun({ campaignId, status = 'completed' }) {
  const { rows } = await db.query(
    `INSERT INTO campaign_runs (id_campaign, status, started_at, total_recipients, successful_sends, failed_sends)
     VALUES ($1, $2, NOW(), 10, 9, 1) RETURNING id`,
    [campaignId, status]
  );
  return rows[0];
}

// ─── Authorization ──────────────────────────────────────────────────────────
describe('Authorization — /api/delivery-monitor/overview', () => {
  it('không có token → 401', async () => {
    const res = await request(app).get('/api/delivery-monitor/overview');
    expect(res.status).toBe(401);
  });

  it('user role thường có token → 200 (không cần admin)', async () => {
    const user = await createUser({ role: 'user', username: 'plain' });
    const token = await loginAs(user);
    const res = await request(app)
      .get('/api/delivery-monitor/overview')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('admin role cũng truy cập được', async () => {
    const admin = await createUser({ role: 'admin', username: 'admin1' });
    const token = await loginAs(admin);
    const res = await request(app)
      .get('/api/delivery-monitor/overview')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

// ─── Response shape ─────────────────────────────────────────────────────────
describe('GET /api/delivery-monitor/overview — response shape', () => {
  it('trả đầy đủ top-level fields', async () => {
    const user = await createUser({ username: 'u1' });
    const token = await loginAs(user);
    const res = await request(app)
      .get('/api/delivery-monitor/overview')
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
    expect(data).toHaveProperty('recentErrors');
    expect(data).toHaveProperty('health');
  });

  it('summary counter mặc định = 0 khi user chưa có campaign', async () => {
    const user = await createUser({ username: 'u1' });
    const token = await loginAs(user);
    const res = await request(app)
      .get('/api/delivery-monitor/overview')
      .set('Authorization', `Bearer ${token}`);

    const { summary } = res.body.data;
    expect(summary).toMatchObject({
      sent: 0,
      failed: 0,
      opened: 0,
      clicked: 0,
      totalRuns: 0,
    });
  });

  it('channels trả 3 kênh (email, zalo, zalo_group)', async () => {
    const user = await createUser({ username: 'u1' });
    const token = await loginAs(user);
    const res = await request(app)
      .get('/api/delivery-monitor/overview')
      .set('Authorization', `Bearer ${token}`);

    const channels = res.body.data.channels;
    expect(Array.isArray(channels)).toBe(true);
    expect(channels).toHaveLength(3);
    const codes = channels.map((c) => c.channel);
    expect(codes).toContain('email');
    expect(codes).toContain('zalo');
    expect(codes).toContain('zalo_group');
  });

  it('health có zaloQuietHours', async () => {
    const user = await createUser({ username: 'u1' });
    const token = await loginAs(user);
    const res = await request(app)
      .get('/api/delivery-monitor/overview')
      .set('Authorization', `Bearer ${token}`);

    const { health } = res.body.data;
    expect(health).toHaveProperty('zaloQuietHours');
    expect(typeof health.zaloQuietHours.inQuietHours).toBe('boolean');
  });

  it('timeline là mảng', async () => {
    const user = await createUser({ username: 'u1' });
    const token = await loginAs(user);
    const res = await request(app)
      .get('/api/delivery-monitor/overview')
      .set('Authorization', `Bearer ${token}`);
    expect(Array.isArray(res.body.data.timeline)).toBe(true);
    expect(Array.isArray(res.body.data.topRuns)).toBe(true);
    expect(Array.isArray(res.body.data.recentErrors)).toBe(true);
  });
});

// ─── Tenant isolation ───────────────────────────────────────────────────────
describe('Tenant isolation — /api/delivery-monitor/overview', () => {
  it('totalRuns chỉ đếm campaign_runs thuộc user đang login', async () => {
    const userA = await createUser({ username: 'uA' });
    const userB = await createUser({ username: 'uB' });

    const campA = await createCampaign({ userId: userA.id, name: 'A campaign' });
    const campB = await createCampaign({ userId: userB.id, name: 'B campaign' });

    await createRun({ campaignId: campA.id });
    await createRun({ campaignId: campA.id });
    await createRun({ campaignId: campB.id });

    const tokenA = await loginAs(userA);
    const resA = await request(app)
      .get('/api/delivery-monitor/overview')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(resA.body.data.summary.totalRuns).toBe(2);

    const tokenB = await loginAs(userB);
    const resB = await request(app)
      .get('/api/delivery-monitor/overview')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(resB.body.data.summary.totalRuns).toBe(1);
  });
});

// ─── windowDays param ────────────────────────────────────────────────────────
describe('GET /api/delivery-monitor/overview — windowDays param', () => {
  it('?windowDays=14 → windowDays=14 trong response', async () => {
    const user = await createUser({ username: 'u1' });
    const token = await loginAs(user);
    const res = await request(app)
      .get('/api/delivery-monitor/overview?windowDays=14')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.data.windowDays).toBe(14);
  });

  it('?windowDays=999 → clamp về 90', async () => {
    const user = await createUser({ username: 'u1' });
    const token = await loginAs(user);
    const res = await request(app)
      .get('/api/delivery-monitor/overview?windowDays=999')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.data.windowDays).toBe(90);
  });

  it('không có windowDays → default 7', async () => {
    const user = await createUser({ username: 'u1' });
    const token = await loginAs(user);
    const res = await request(app)
      .get('/api/delivery-monitor/overview')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.data.windowDays).toBe(7);
  });
});
