/**
 * Integration tests cho `/api/dashboard/*`.
 *
 * Phạm vi:
 *   - Authorization (token bắt buộc cho mọi endpoint).
 *   - GET /overview — KPI: campaign count, run headline, email metrics,
 *     attachment download count, zalo clicks, orders by type, journey events.
 *     * Tenant isolation cho user role; admin thấy toàn bộ.
 *   - GET /analytics — timeline rỗng có rows theo date range mặc định.
 *   - GET /top-lists — topCourses + topCampaignsByOrders + topCampaignsByClicks.
 *   - GET /orders — pagination + filter orderStatus.
 *   - GET /runs — pagination + scope.
 *   - GET /compare — validation (400 nếu thiếu campaignIds hoặc invalid).
 *     * Trả metric kèm openRate/clickRate/conversionRate tính từ counters.
 *     * User chỉ xem campaign của mình; admin global view.
 *   - GET /landing-pages-stats — gộp events + leads + published slugs.
 *   - GET /insights/saved — trả null khi chưa có; trả payload đã lưu.
 *
 * KHÔNG cover:
 *   - POST /insights (cần Gemini API thật).
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
  const res = await request(app).post('/api/auth/login').send({ username: user.username, password: user.plainPassword });
  return res.body.data.accessToken;
}

async function createCampaign({ userId, name = 'C', type = 'email', status = 'running', stats = {} }) {
  const { rows } = await db.query(
    `INSERT INTO campaigns
       (id_user, campaign_name, campaign_type, status,
        total_customers, total_sent, total_delivered, total_opened, total_clicked, total_converted, total_revenue,
        published_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
     RETURNING *`,
    [
      userId, name, type, status,
      stats.totalCustomers ?? 100,
      stats.totalSent ?? 100,
      stats.totalDelivered ?? 90,
      stats.totalOpened ?? 50,
      stats.totalClicked ?? 20,
      stats.totalConverted ?? 5,
      stats.totalRevenue ?? 1500000,
    ]
  );
  return rows[0];
}

async function createRun({ campaignId, status = 'completed', stats = {} }) {
  const { rows } = await db.query(
    `INSERT INTO campaign_runs (id_campaign, status, started_at, total_recipients, successful_sends, failed_sends)
     VALUES ($1, $2, NOW(), $3, $4, $5) RETURNING *`,
    [
      campaignId, status,
      stats.totalRecipients ?? 100,
      stats.successfulSends ?? 95,
      stats.failedSends ?? 5,
    ]
  );
  return rows[0];
}

// ─────────────────────────────────────────────────────────────────────────
describe('Dashboard routes — authorization', () => {
  it.each([
    'overview',
    'analytics',
    'runs',
    'orders',
    'top-lists',
    'compare',
    'insights/saved',
    'landing-pages-stats',
  ])('GET /api/dashboard/%s yêu cầu auth → 401', async (path) => {
    const res = await request(app).get(`/api/dashboard/${path}`);
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('GET /api/dashboard/overview', () => {
  it('trả về 200 với headline/channels/journeyEvents khi user chưa có data', async () => {
    const user = await createUser();
    const token = await loginAs(user);
    const res = await request(app).get('/api/dashboard/overview').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('headline');
    expect(res.body.data).toHaveProperty('channels.email');
    expect(res.body.data).toHaveProperty('channels.zalo');
    expect(res.body.data).toHaveProperty('channels.zaloGroup');
    expect(res.body.data).toHaveProperty('journeyEvents');
    expect(res.body.data.headline.totalCampaigns).toBe(0);
    expect(res.body.data.headline.totalRuns).toBe(0);
  });

  it('totalCampaigns chỉ đếm campaigns của user (isolation cho role=user)', async () => {
    const userA = await createUser();
    const userB = await createUser();
    await createCampaign({ userId: userA.id, name: 'A1' });
    await createCampaign({ userId: userA.id, name: 'A2' });
    await createCampaign({ userId: userB.id, name: 'B1' });

    const tokenA = await loginAs(userA);
    const res = await request(app).get('/api/dashboard/overview').set('Authorization', `Bearer ${tokenA}`);
    expect(res.body.data.headline.totalCampaigns).toBe(2);
  });

  it('admin role thấy toàn bộ campaigns', async () => {
    const admin = await createUser({ role: 'admin' });
    const userA = await createUser();
    await createCampaign({ userId: userA.id });
    await createCampaign({ userId: admin.id });
    await createCampaign({ userId: admin.id });

    const tokenAdmin = await loginAs(admin);
    const res = await request(app).get('/api/dashboard/overview').set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.body.data.headline.totalCampaigns).toBe(3);
  });

  it('run headline tổng hợp total_recipients / successful / failed từ campaign_runs', async () => {
    const user = await createUser();
    const camp = await createCampaign({ userId: user.id });
    await createRun({ campaignId: camp.id, status: 'completed', stats: { totalRecipients: 200, successfulSends: 180, failedSends: 20 } });
    await createRun({ campaignId: camp.id, status: 'running', stats: { totalRecipients: 100, successfulSends: 0, failedSends: 0 } });

    const token = await loginAs(user);
    const res = await request(app).get('/api/dashboard/overview').set('Authorization', `Bearer ${token}`);
    expect(res.body.data.headline).toMatchObject({
      totalRuns: 2,
      runningRuns: 1,
      completedRuns: 1,
      totalRecipients: 300,
      successfulSends: 180,
      failedSends: 20,
    });
    expect(res.body.data.headline.successRate).toBeCloseTo(60, 1);
  });

  it('filter campaignType=email chỉ tính campaign email', async () => {
    const user = await createUser();
    await createCampaign({ userId: user.id, name: 'Email1', type: 'email' });
    await createCampaign({ userId: user.id, name: 'Zalo1', type: 'zalo' });
    const token = await loginAs(user);
    const res = await request(app)
      .get('/api/dashboard/overview?campaignType=email')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.data.headline.totalCampaigns).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('GET /api/dashboard/analytics', () => {
  it('trả timeline có đủ rows theo date range mặc định (30d)', async () => {
    const user = await createUser();
    const token = await loginAs(user);
    const res = await request(app).get('/api/dashboard/analytics').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.timeline)).toBe(true);
    expect(res.body.data.timeline.length).toBe(30); // 30 ngày inclusive
    // Mỗi item có các trường counters mặc định 0
    expect(res.body.data.timeline[0]).toMatchObject({
      emailSent: 0,
      emailOpened: 0,
      emailClicked: 0,
      pendingOrders: 0,
      completedOrders: 0,
    });
  });

  it('?period=7d trả timeline 7 rows', async () => {
    const user = await createUser();
    const token = await loginAs(user);
    const res = await request(app).get('/api/dashboard/analytics?period=7d').set('Authorization', `Bearer ${token}`);
    expect(res.body.data.timeline.length).toBe(7);
  });

  it('explicit startDate/endDate được tôn trọng', async () => {
    const user = await createUser();
    const token = await loginAs(user);
    const res = await request(app)
      .get('/api/dashboard/analytics?startDate=2025-06-01&endDate=2025-06-05')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.data.timeline.length).toBe(5);
    expect(res.body.data.timeline[0].date).toBe('2025-06-01');
    expect(res.body.data.timeline[4].date).toBe('2025-06-05');
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('GET /api/dashboard/top-lists', () => {
  it('trả 3 mảng (topCourses, topCampaignsByOrders, topCampaignsByClicks) — rỗng khi không có data', async () => {
    const user = await createUser();
    const token = await loginAs(user);
    const res = await request(app).get('/api/dashboard/top-lists').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('topCourses');
    expect(res.body.data).toHaveProperty('topCampaignsByOrders');
    expect(res.body.data).toHaveProperty('topCampaignsByClicks');
    expect(Array.isArray(res.body.data.topCourses)).toBe(true);
  });

  it('limit ≤ 20 (input 50 → bị giới hạn về 20)', async () => {
    const user = await createUser();
    const token = await loginAs(user);
    const res = await request(app).get('/api/dashboard/top-lists?limit=50').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.topCourses.length).toBeLessThanOrEqual(20);
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('GET /api/dashboard/orders', () => {
  it('trả items=[] + pagination khi không có purchase', async () => {
    const user = await createUser();
    const token = await loginAs(user);
    const res = await request(app).get('/api/dashboard/orders').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual([]);
    expect(res.body.data.pagination).toMatchObject({ page: 1, limit: 20, total: 0, totalPages: 1 });
  });

  it('?orderStatus=invalid được fallback về "all"', async () => {
    const user = await createUser();
    const token = await loginAs(user);
    const res = await request(app)
      .get('/api/dashboard/orders?orderStatus=invalid')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.data.filters.orderStatus).toBe('all');
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('GET /api/dashboard/runs', () => {
  it('trả pagination + items=[] khi không có run', async () => {
    const user = await createUser();
    const token = await loginAs(user);
    const res = await request(app).get('/api/dashboard/runs').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.pagination).toMatchObject({ page: 1, limit: 20 });
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('GET /api/dashboard/compare', () => {
  it('thiếu campaignIds → 400', async () => {
    const user = await createUser();
    const token = await loginAs(user);
    const res = await request(app).get('/api/dashboard/compare').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('campaignIds toàn ký tự không hợp lệ → 400', async () => {
    const user = await createUser();
    const token = await loginAs(user);
    const res = await request(app).get('/api/dashboard/compare?campaignIds=abc,xyz').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('trả metrics + tính openRate/clickRate/conversionRate', async () => {
    const user = await createUser();
    const c1 = await createCampaign({
      userId: user.id, name: 'C1', stats: {
        totalSent: 100, totalDelivered: 100, totalOpened: 50, totalClicked: 20, totalConverted: 5,
      },
    });

    const token = await loginAs(user);
    const res = await request(app).get(`/api/dashboard/compare?campaignIds=${c1.id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      campaignName: 'C1',
      totalOpened: 50,
      totalClicked: 20,
      totalConverted: 5,
    });
    expect(parseFloat(res.body.data[0].openRate)).toBeCloseTo(50.0, 1);
    expect(parseFloat(res.body.data[0].clickRate)).toBeCloseTo(40.0, 1);
    expect(parseFloat(res.body.data[0].conversionRate)).toBeCloseTo(25.0, 1);
  });

  it('isolation — user thường không thấy campaign user khác', async () => {
    const userA = await createUser();
    const userB = await createUser();
    const cA = await createCampaign({ userId: userA.id, name: 'A' });
    const cB = await createCampaign({ userId: userB.id, name: 'B' });

    const tokenA = await loginAs(userA);
    const res = await request(app).get(`/api/dashboard/compare?campaignIds=${cA.id},${cB.id}`).set('Authorization', `Bearer ${tokenA}`);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].campaignName).toBe('A');
  });

  it('admin thấy hết campaigns trong compare', async () => {
    const admin = await createUser({ role: 'admin' });
    const userA = await createUser();
    const cA = await createCampaign({ userId: userA.id, name: 'UserA' });
    const cAdmin = await createCampaign({ userId: admin.id, name: 'AdminC' });

    const tokenAdmin = await loginAs(admin);
    const res = await request(app).get(`/api/dashboard/compare?campaignIds=${cA.id},${cAdmin.id}`).set('Authorization', `Bearer ${tokenAdmin}`);
    expect(res.body.data).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('GET /api/dashboard/landing-pages-stats', () => {
  it('trả mảng rỗng khi chưa có landing_pages + events + leads', async () => {
    const user = await createUser();
    const token = await loginAs(user);
    const res = await request(app).get('/api/dashboard/landing-pages-stats').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.rows).toEqual([]);
    expect(res.body.data.filters).toHaveProperty('startDate');
    expect(res.body.data.filters).toHaveProperty('endDate');
  });

  it('?allTime=1 → filters.allTime=true (không có startDate/endDate)', async () => {
    const user = await createUser();
    const token = await loginAs(user);
    const res = await request(app).get('/api/dashboard/landing-pages-stats?allTime=1').set('Authorization', `Bearer ${token}`);
    expect(res.body.data.filters.allTime).toBe(true);
  });

  it('gộp published landing pages với events + leads', async () => {
    const user = await createUser();
    // Published page
    await db.query(
      `INSERT INTO landing_pages (id_user, slug, title, status, is_published, published_at)
       VALUES ($1, 'promo-1', 'Promo 1', 'published', TRUE, NOW())`,
      [user.id]
    );
    // events
    await db.query(
      `INSERT INTO landing_page_events (event_type, landing_page_slug) VALUES
        ('view', 'promo-1'), ('view', 'promo-1'), ('click', 'promo-1')`
    );
    // leads (submits)
    await db.query(
      `INSERT INTO leads (landing_page_slug, email) VALUES ('promo-1', 'l@u.local')`
    );

    const token = await loginAs(user);
    const res = await request(app).get('/api/dashboard/landing-pages-stats?allTime=1').set('Authorization', `Bearer ${token}`);
    const row = res.body.data.rows.find((r) => r.slug === 'promo-1');
    expect(row).toBeTruthy();
    expect(row).toMatchObject({
      viewCount: 2,
      clickCount: 1,
      submitCount: 1,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('GET /api/dashboard/insights/saved', () => {
  it('trả data=null khi user chưa generate insight', async () => {
    const user = await createUser();
    const token = await loginAs(user);
    const res = await request(app).get('/api/dashboard/insights/saved').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
  });

  it('trả payload đã lưu kèm savedAt', async () => {
    const user = await createUser();
    await db.query(
      `INSERT INTO dashboard_insights (id_user, payload, filters_snapshot)
       VALUES ($1, $2::jsonb, $3::jsonb)`,
      [
        user.id,
        JSON.stringify({ overviewInsight: 'ok' }),
        JSON.stringify({ startDate: '2025-01-01', endDate: '2025-01-31' }),
      ]
    );
    const token = await loginAs(user);
    const res = await request(app).get('/api/dashboard/insights/saved').set('Authorization', `Bearer ${token}`);
    expect(res.body.data).not.toBeNull();
    expect(res.body.data.insights).toMatchObject({ overviewInsight: 'ok' });
    expect(res.body.data.savedAt).toBeTruthy();
  });

  it('isolation — không trả insight của user khác', async () => {
    const userA = await createUser();
    const userB = await createUser();
    await db.query(
      `INSERT INTO dashboard_insights (id_user, payload) VALUES ($1, '{"a":1}'::jsonb)`,
      [userA.id]
    );
    const tokenB = await loginAs(userB);
    const res = await request(app).get('/api/dashboard/insights/saved').set('Authorization', `Bearer ${tokenB}`);
    expect(res.body.data).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('POST /api/dashboard/insights', () => {
  it('thiếu overview/analytics/topListsData → 400', async () => {
    const user = await createUser();
    const token = await loginAs(user);
    const res = await request(app).post('/api/dashboard/insights').set('Authorization', `Bearer ${token}`).send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Thiếu dữ liệu/);
  });
});
