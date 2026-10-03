/**
 * Integration tests cho `/api/dashboard/*`.
 *
 * Phạm vi:
 *   - Authorization (token bắt buộc cho mọi endpoint).
 *   - GET /overview — shape mới của trang Báo cáo (sent / failed / email / clicks / orders); tenant isolation
 *     cho user role; admin thấy toàn bộ. Số đếm từng con số nằm ở dashboardReport.test.js.
 *   - GET /analytics — dailySent + ordersTimeline có đủ số ngày theo bộ lọc.
 *   - GET /campaigns — bảng chiến dịch trong kỳ (rỗng khi chưa có tin).
 *   - Endpoint cũ /runs, /top-lists, /compare đã gỡ (PR-5) → 404.
 *   - GET /orders — pagination + filter orderStatus.
 *   - GET /landing-pages-stats — gộp events + leads + published slugs.
 *   - GET /insights/saved — trả null khi chưa có; trả payload đã lưu.
 *   - POST /insights — chỉ kiểm phần validate bộ lọc.
 *
 * KHÔNG cover:
 *   - POST /insights gọi Gemini (dashboardReport.test.js chặn `fetch` để đọc prompt).
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
    'campaigns',
    'orders',
    'insights/saved',
    'landing-pages-stats',
  ])('GET /api/dashboard/%s yêu cầu auth → 401', async (path) => {
    const res = await request(app).get(`/api/dashboard/${path}`);
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('GET /api/dashboard/overview', () => {
  it('trả về 200 với sent/failed/email/clicks/orders khi user chưa có data', async () => {
    const user = await createUser();
    const token = await loginAs(user);
    const res = await request(app).get('/api/dashboard/overview').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('sent.total', 0);
    expect(res.body.data).toHaveProperty('sent.friendRequests', 0);
    expect(res.body.data).toHaveProperty('failed.total', 0);
    expect(res.body.data).toHaveProperty('email.sent', 0);
    expect(res.body.data).toHaveProperty('clicks.total', 0);
    expect(res.body.data).toHaveProperty('orders.completed', 0);
    expect(res.body.data).toHaveProperty('orders.pending', 0);
    expect(res.body.data).not.toHaveProperty('headline');
    expect(res.body.data).not.toHaveProperty('journeyEvents');
  });

  it('echo bộ lọc đã chuẩn hoá (kênh không hợp lệ về "all", ngày hợp lệ được giữ)', async () => {
    const user = await createUser();
    const token = await loginAs(user);
    const res = await request(app)
      .get('/api/dashboard/overview?campaignType=khong-co&startDate=2025-06-01&endDate=2025-06-30')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.data.filters).toMatchObject({ campaignType: 'all', startDate: '2025-06-01', endDate: '2025-06-30' });
  });

  it('thư của user A không hiện ở Báo cáo của user B (isolation cho role=user)', async () => {
    const userA = await createUser();
    const userB = await createUser();
    const campaign = await createCampaign({ userId: userA.id, name: 'A1' });
    await db.query(
      `INSERT INTO email_messages (workspace_owner_id, id_campaign, recipient_email, status, tracking_token, sent_at, created_at)
       VALUES ($1, $2, 'r@x.test', 'sent', 'iso-token-1', NOW(), NOW())`,
      [userA.id, campaign.id]
    );

    const resA = await request(app).get('/api/dashboard/overview').set('Authorization', `Bearer ${await loginAs(userA)}`);
    const resB = await request(app).get('/api/dashboard/overview').set('Authorization', `Bearer ${await loginAs(userB)}`);
    expect(resA.body.data.sent.total).toBe(1);
    expect(resB.body.data.sent.total).toBe(0);
  });

  it('admin role thấy tin của mọi tài khoản', async () => {
    const admin = await createUser({ role: 'admin' });
    const userA = await createUser();
    const campaign = await createCampaign({ userId: userA.id });
    await db.query(
      `INSERT INTO email_messages (workspace_owner_id, id_campaign, recipient_email, status, tracking_token, sent_at, created_at)
       VALUES ($1, $2, 'r@x.test', 'sent', 'iso-token-2', NOW(), NOW())`,
      [userA.id, campaign.id]
    );

    const res = await request(app).get('/api/dashboard/overview').set('Authorization', `Bearer ${await loginAs(admin)}`);
    expect(res.body.data.sent.total).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('GET /api/dashboard/analytics', () => {
  it('trả dailySent + ordersTimeline có đủ rows theo date range mặc định (30d)', async () => {
    const user = await createUser();
    const token = await loginAs(user);
    const res = await request(app).get('/api/dashboard/analytics').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.dailySent)).toBe(true);
    expect(res.body.data.dailySent.length).toBe(30); // 30 ngày inclusive
    expect(res.body.data.ordersTimeline.length).toBe(30);
    // Mỗi ngày có các trường counters mặc định 0
    expect(res.body.data.dailySent[0]).toMatchObject({ total: 0, email: 0, zalo_personal: 0, zalo_group: 0 });
    expect(res.body.data.ordersTimeline[0]).toMatchObject({ pendingOrders: 0, completedOrders: 0 });
  });

  it('?period=7d trả 7 rows', async () => {
    const user = await createUser();
    const token = await loginAs(user);
    const res = await request(app).get('/api/dashboard/analytics?period=7d').set('Authorization', `Bearer ${token}`);
    expect(res.body.data.dailySent.length).toBe(7);
  });

  it('explicit startDate/endDate được tôn trọng', async () => {
    const user = await createUser();
    const token = await loginAs(user);
    const res = await request(app)
      .get('/api/dashboard/analytics?startDate=2025-06-01&endDate=2025-06-05')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.data.dailySent.length).toBe(5);
    expect(res.body.data.dailySent[0].date).toBe('2025-06-01');
    expect(res.body.data.dailySent[4].date).toBe('2025-06-05');
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('GET /api/dashboard/campaigns', () => {
  it('trả items=[] khi chưa có tin nào trong kỳ', async () => {
    const user = await createUser();
    const token = await loginAs(user);
    const res = await request(app).get('/api/dashboard/campaigns').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual([]);
  });

  it('limit ≤ 20 (input 50 → bị giới hạn về 20)', async () => {
    const user = await createUser();
    const token = await loginAs(user);
    const res = await request(app).get('/api/dashboard/campaigns?limit=50').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBeLessThanOrEqual(20);
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('endpoint cũ đã gỡ ở PR-5', () => {
  it.each(['runs', 'top-lists', 'compare'])('GET /api/dashboard/%s → 404 (bảng lượt chạy về Giám sát gửi tin, top-list gộp vào /campaigns)', async (path) => {
    const user = await createUser();
    const token = await loginAs(user);
    const res = await request(app).get(`/api/dashboard/${path}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
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
      `INSERT INTO landing_pages (id_user, slug, title, is_published)
       VALUES ($1, 'promo-1', 'Promo 1', TRUE)`,
      [user.id]
    );
    // events
    await db.query(
      `INSERT INTO landing_page_events (event_type, landing_page_slug) VALUES
        ('view', 'promo-1'), ('view', 'promo-1'), ('click', 'promo-1')`
    );
    // leads (submits)
    await db.query(
      `INSERT INTO leads (landing_page_slug, email, id_user) VALUES ('promo-1', 'l@u.local', $1)`,
      [user.id]
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

  it('không trả analytics landing của workspace khác', async () => {
    const me = await createUser({ username: 'landing-stats-me' });
    const other = await createUser({ username: 'landing-stats-other' });
    await db.query(
      `INSERT INTO landing_pages
         (id_user, workspace_owner_id, created_by, slug, title, is_published)
       VALUES
         ($1, $1, $1, 'mine-stats', 'Mine', TRUE),
         ($2, $2, $2, 'foreign-stats', 'Foreign', TRUE)`,
      [me.id, other.id]
    );
    await db.query(
      `INSERT INTO landing_page_events (event_type, landing_page_slug, id_user) VALUES
         ('view', 'mine-stats', $1),
         ('view', 'foreign-stats', $2)`,
      [me.id, other.id]
    );

    const token = await loginAs(me);
    const res = await request(app)
      .get('/api/dashboard/landing-pages-stats?allTime=1')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.rows.map((row) => row.slug)).toEqual(['mine-stats']);
  });

  /**
   * PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md, PR-7a "Bổ sung 15/09 khi soạn lệnh PR-7" mục 2 —
   * bài nộp Biểu mẫu là nguồn THỨ HAI của submitCount, phải CỘNG vào lượt gửi cùng slug với leads
   * (không GÁN đè), và loại bài `cancelled` khỏi phép đếm.
   */
  it('bài nộp Biểu mẫu được CỘNG vào submitCount cùng slug với leads — 2 lead + 3 bài nộp form (1 cancelled) => submitCount = 4', async () => {
    const user = await createUser();
    await db.query(
      `INSERT INTO landing_pages (id_user, slug, title, is_published) VALUES ($1, 'promo-form', 'Promo Form', TRUE)`,
      [user.id]
    );
    await db.query(
      `INSERT INTO leads (landing_page_slug, email, id_user) VALUES ('promo-form', 'l1@u.local', $1), ('promo-form', 'l2@u.local', $1)`,
      [user.id]
    );
    const formRes = await db.query(
      `INSERT INTO forms (workspace_owner_id, public_key, title) VALUES ($1, 'pk_dash_1', 'Form dashboard') RETURNING id`,
      [user.id]
    );
    const formId = formRes.rows[0].id;
    await db.query(
      `INSERT INTO form_submissions (form_id, workspace_owner_id, access_token, status, landing_page_slug) VALUES
         ($1, $2, 'tok_dash_1', 'submitted', 'promo-form'),
         ($1, $2, 'tok_dash_2', 'confirmed', 'promo-form'),
         ($1, $2, 'tok_dash_3', 'cancelled', 'promo-form')`,
      [formId, user.id]
    );

    const token = await loginAs(user);
    const res = await request(app)
      .get('/api/dashboard/landing-pages-stats?allTime=1')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const row = res.body.data.rows.find((r) => r.slug === 'promo-form');
    expect(row).toBeTruthy();
    expect(row.submitCount).toBe(4);
  });

  it('bài nộp Biểu mẫu của CHỦ KHÁC cùng slug KHÔNG cộng vào dashboard của mình', async () => {
    const me = await createUser({ username: 'dash-form-me' });
    const other = await createUser({ username: 'dash-form-other' });
    await db.query(
      `INSERT INTO landing_pages (id_user, slug, title, is_published) VALUES ($1, 'shared-slug', 'Mine', TRUE)`,
      [me.id]
    );
    const formRes = await db.query(
      `INSERT INTO forms (workspace_owner_id, public_key, title) VALUES ($1, 'pk_dash_2', 'Form khác chủ') RETURNING id`,
      [other.id]
    );
    const formId = formRes.rows[0].id;
    await db.query(
      `INSERT INTO form_submissions (form_id, workspace_owner_id, access_token, status, landing_page_slug) VALUES
         ($1, $2, 'tok_dash_4', 'submitted', 'shared-slug')`,
      [formId, other.id]
    );

    const token = await loginAs(me);
    const res = await request(app)
      .get('/api/dashboard/landing-pages-stats?allTime=1')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const row = res.body.data.rows.find((r) => r.slug === 'shared-slug');
    // Slug vẫn hiện (landing "mine" đã publish) nhưng submitCount không tính bài của other.
    expect(row).toBeTruthy();
    expect(row.submitCount).toBe(0);
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
    expect(res.body.data.filtersSnapshot).toEqual({ startDate: '2025-01-01', endDate: '2025-01-31' });
  });

  it('bản lưu trước mốc đổi cách tính (05/04/2026) → data=null', async () => {
    const user = await createUser();
    await db.query(
      `INSERT INTO dashboard_insights (id_user, payload, filters_snapshot, created_at)
       VALUES ($1, $2::jsonb, $3::jsonb, '2026-04-05T03:00:00Z')`,
      [user.id, JSON.stringify({ overview: 'cũ' }), JSON.stringify({ startDate: '2026-03-01', endDate: '2026-04-05' })]
    );
    const token = await loginAs(user);
    const res = await request(app).get('/api/dashboard/insights/saved').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
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
  it('filters sai kiểu → 400 (trước khi kiểm credit / gọi Gemini)', async () => {
    const user = await createUser();
    const token = await loginAs(user);
    const res = await request(app)
      .post('/api/dashboard/insights')
      .set('Authorization', `Bearer ${token}`)
      .send({ filters: ['khong', 'phai', 'doi-tuong'] });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/Bộ lọc/);
  });
});
