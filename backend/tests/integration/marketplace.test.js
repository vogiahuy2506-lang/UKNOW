/**
 * Integration tests cho `/api/marketplace`.
 *
 * Phạm vi:
 *   - Browse listings (public)
 *   - Create listing from campaign
 *   - Listing CRUD
 *   - Purchase flow with credits
 *   - Review system
 *   - Favorites
 */
import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import aiCreditMeter from '../../src/services/ai/aiCreditMeter.service.js';
import { truncateAll } from './helpers/db.js';

let app;
let deductCreditsSpy;

beforeAll(() => {
  app = createApp();
  // marketplacePurchase.service.js dùng aiCreditMeter.deductCredits (hợp nhất plan+wallet),
  // không phải usageTrackingService.deductCredits — xem marketplacePurchase.service.js:108.
  deductCreditsSpy = jest
    .spyOn(aiCreditMeter, 'deductCredits')
    .mockResolvedValue({ success: true, deducted: 50, remaining: { plan: Infinity, wallet: 0 } });
});

// Dọn bằng helper chung (TRUNCATE mọi bảng, có thử lại khi tranh khoá). Bản tự viết trước đây chỉ xoá vài bảng
// rồi DELETE users → vướng khoá ngoại user_consents khi file khác chạy trước trong cùng shard CI (26/09/2026 shard 8/8).
beforeEach(async () => {
  await truncateAll();
  deductCreditsSpy.mockClear();
});

async function createUser(username = 'testuser', password = 'Test123!') {
  const passwordHash = await bcrypt.hash(password, 10);
  const { rows } = await db.query(
    `INSERT INTO users (username, email, password_hash, role, status, subscription_expires_at)
    VALUES ($1, $2, $3, 'user', 'active', NOW() + INTERVAL '30 days')
     RETURNING *`,
    [username, `${username}@test.com`, passwordHash]
  );
  const user = rows[0];
  user.plainPassword = password;
  return user;
}

async function createPlan(code = 'pro', aiCreditsPerPeriod = 1000) {
  const { rows } = await db.query(
    `INSERT INTO plans (code, name, price, ai_credits_per_period, is_active)
     VALUES ($1, $2, 199000, $3, true)
     RETURNING *`,
    [code, code.toUpperCase(), aiCreditsPerPeriod]
  );
  return rows[0];
}

async function assignPlanToUser(user, plan) {
  await db.query(
    `UPDATE users SET active_plan_id = $1 WHERE id = $2`,
    [plan.id, user.id]
  );
}

async function insertCampaign({
  userId,
  campaignName = 'Test Campaign',
  campaignType = 'email',
  status = 'draft',
  flowJson = { nodes: [], connections: [] },
}) {
  const { rows } = await db.query(
    `INSERT INTO campaigns (id_user, campaign_name, description, campaign_type, status, flow_json)
     VALUES ($1, $2, 'Test description', $3, $4, $5)
     RETURNING *`,
    [userId, campaignName, campaignType, status, JSON.stringify(flowJson)]
  );
  return rows[0];
}

async function insertListing({
  userId,
  resourceType = 'campaign',
  resourceId = 1,
  title = 'Test Listing',
  description = 'Test description',
  category = null,
  priceCredits = 0,
  status = 'published',
  ratingAvg = null,
  snapshotData = {
    campaignName: 'Cloned Campaign',
    campaignType: 'email',
    flowJson: { nodes: [], connections: [] },
    nodes: [],
    connections: [],
  },
}) {
  const { rows } = await db.query(
    `INSERT INTO marketplace_listings
     (id_user, resource_type, resource_id, title, description, category, price_credits, status, snapshot_data, rating_avg)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, 0))
     RETURNING *`,
    [
      userId,
      resourceType,
      resourceId,
      title,
      description,
      category,
      priceCredits,
      status,
      JSON.stringify(snapshotData),
      ratingAvg,
    ]
  );
  return rows[0];
}

async function insertUsageLog(userId, delta = 100) {
  await db.query(
    `INSERT INTO usage_logs (id_user, resource_type, delta, period_start, period_end)
     VALUES ($1, 'ai_credit', $2, DATE_TRUNC('month', NOW()), DATE_TRUNC('month', NOW()) + INTERVAL '1 month' - INTERVAL '1 second')`,
    [userId, delta]
  );
}

async function loginAs(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  if (res.status !== 200) {
    throw new Error(`loginAs failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.data.accessToken;
}

describe('Marketplace API', () => {
  describe('GET /api/marketplace/browse', () => {
    let token;
    let viewer;
    beforeEach(async () => {
      viewer = await createUser();
      token = await loginAs(viewer);
    });

    it('should return empty list when no listings', async () => {
      const res = await request(app)
        .get('/api/marketplace/browse')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
    });

    it('should return only published listings', async () => {
      await insertListing({ userId: viewer.id, status: 'published' });
      await insertListing({ userId: viewer.id, status: 'draft' });

      const res = await request(app)
        .get('/api/marketplace/browse')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
    });

    it('should filter by resource type', async () => {
      await insertListing({ userId: viewer.id, resourceType: 'campaign', status: 'published' });
      await insertListing({ userId: viewer.id, resourceType: 'chatbot', status: 'published' });

      const res = await request(app)
        .get('/api/marketplace/browse?type=campaign')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].resource_type).toBe('campaign');
    });

    it('should filter by category', async () => {
      await insertListing({ userId: viewer.id, status: 'published', category: 'marketing' });
      await insertListing({ userId: viewer.id, status: 'published', category: 'support' });

      const res = await request(app)
        .get('/api/marketplace/browse?category=marketing')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
    });

    it('should sort by rating', async () => {
      await insertListing({ userId: viewer.id, status: 'published', ratingAvg: 3 });
      await insertListing({ userId: viewer.id, status: 'published', ratingAvg: 5 });

      const res = await request(app)
        .get('/api/marketplace/browse?sort=rating')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(Number(res.body.data[0].rating_avg)).toBe(5);
    });

    it('should paginate results', async () => {
      for (let i = 0; i < 15; i++) {
        await insertListing({ userId: viewer.id, status: 'published', title: `Listing ${i}` });
      }

      const res = await request(app)
        .get('/api/marketplace/browse?page=1&limit=10')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(10);
      expect(res.body.pagination.total).toBe(15);
      expect(res.body.pagination.totalPages).toBe(2);
    });

    it('should search by title', async () => {
      await insertListing({ userId: viewer.id, status: 'published', title: 'Email Campaign Template' });
      await insertListing({ userId: viewer.id, status: 'published', title: 'Zalo Auto Reply' });

      const res = await request(app)
        .get('/api/marketplace/browse?search=email')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].title).toContain('Email');
    });
  });

  describe('POST /api/marketplace/listings', () => {
    it('should create listing from campaign', async () => {
      const user = await createUser();
      const plan = await createPlan();
      await assignPlanToUser(user, plan);
      const campaign = await insertCampaign({ userId: user.id });
      const token = await loginAs(user);

      const res = await request(app)
        .post('/api/marketplace/listings')
        .set('Authorization', `Bearer ${token}`)
        .send({
          campaignId: campaign.id,
          title: 'My Template',
          description: 'Test description',
          priceCredits: 50,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.resource_type).toBe('campaign');
      expect(res.body.data.resource_id).toBe(campaign.id);
      expect(res.body.data.title).toBe('My Template');
      expect(res.body.data.price_credits).toBe(50);
    });

    it('should require campaignId', async () => {
      const user = await createUser();
      const token = await loginAs(user);

      const res = await request(app)
        .post('/api/marketplace/listings')
        .set('Authorization', `Bearer ${token}`)
        .send({ title: 'No Campaign' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject non-existent campaign', async () => {
      const user = await createUser();
      const token = await loginAs(user);

      const res = await request(app)
        .post('/api/marketplace/listings')
        .set('Authorization', `Bearer ${token}`)
        .send({ campaignId: 99999, title: 'Fake' });

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/marketplace/purchase/:id', () => {
    it('should purchase free listing', async () => {
      const seller = await createUser('seller');
      const buyer = await createUser('buyer');
      const plan = await createPlan();
      await assignPlanToUser(buyer, plan);
      await insertUsageLog(buyer.id, 100);
      const listing = await insertListing({ userId: seller.id, priceCredits: 0, status: 'published' });
      const token = await loginAs(buyer);

      const res = await request(app)
        .post(`/api/marketplace/purchase/${listing.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.clonedResource).toBeDefined();
    });

    it('should purchase paid listing with credits', async () => {
      const seller = await createUser('seller');
      const buyer = await createUser('buyer');
      const plan = await createPlan();
      await assignPlanToUser(buyer, plan);
      await insertUsageLog(buyer.id, 100);
      const listing = await insertListing({ userId: seller.id, priceCredits: 50, status: 'published' });
      const token = await loginAs(buyer);

      const res = await request(app)
        .post(`/api/marketplace/purchase/${listing.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(deductCreditsSpy).toHaveBeenCalledWith(buyer.id, 50, expect.objectContaining({
        feature: `marketplace_purchase:${listing.id}`,
      }));
    });

    it('should prevent duplicate purchase', async () => {
      const seller = await createUser('seller');
      const buyer = await createUser('buyer');
      const listing = await insertListing({ userId: seller.id, status: 'published' });
      await db.query(
        `INSERT INTO marketplace_purchases (id_user, listing_id, seller_id, credits_spent, transaction_type)
         VALUES ($1, $2, $3, 0, 'purchase')`,
        [buyer.id, listing.id, seller.id]
      );
      const token = await loginAs(buyer);

      const res = await request(app)
        .post(`/api/marketplace/purchase/${listing.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('đã mua');
    });

    it('should prevent self-purchase', async () => {
      const user = await createUser();
      const listing = await insertListing({ userId: user.id, status: 'published' });
      const token = await loginAs(user);

      const res = await request(app)
        .post(`/api/marketplace/purchase/${listing.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('chính mình');
    });

    it('should reject unpublished listing', async () => {
      const seller = await createUser('seller');
      const buyer = await createUser('buyer');
      const listing = await insertListing({ userId: seller.id, status: 'draft' });
      const token = await loginAs(buyer);

      const res = await request(app)
        .post(`/api/marketplace/purchase/${listing.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/marketplace/listings/:id/reviews', () => {
    it('should create review after purchase', async () => {
      const seller = await createUser('seller');
      const buyer = await createUser('buyer');
      const listing = await insertListing({ userId: seller.id, status: 'published' });
      await db.query(
        `INSERT INTO marketplace_purchases (id_user, listing_id, seller_id, credits_spent, transaction_type)
         VALUES ($1, $2, $3, 0, 'purchase')`,
        [buyer.id, listing.id, seller.id]
      );
      const token = await loginAs(buyer);

      const res = await request(app)
        .post(`/api/marketplace/listings/${listing.id}/reviews`)
        .set('Authorization', `Bearer ${token}`)
        .send({ rating: 5, reviewText: 'Great template!' });

      expect(res.status).toBe(201);
      expect(res.body.data.rating).toBe(5);
      expect(res.body.data.review_text).toBe('Great template!');
    });

    it('should prevent review without purchase', async () => {
      const seller = await createUser('seller');
      const buyer = await createUser('buyer');
      const listing = await insertListing({ userId: seller.id, status: 'published' });
      const token = await loginAs(buyer);

      const res = await request(app)
        .post(`/api/marketplace/listings/${listing.id}/reviews`)
        .set('Authorization', `Bearer ${token}`)
        .send({ rating: 5 });

      expect(res.status).toBe(403);
    });

    it('should validate rating range', async () => {
      const seller = await createUser('seller');
      const buyer = await createUser('buyer');
      const listing = await insertListing({ userId: seller.id, status: 'published' });
      await db.query(
        `INSERT INTO marketplace_purchases (id_user, listing_id, seller_id, credits_spent, transaction_type)
         VALUES ($1, $2, $3, 0, 'purchase')`,
        [buyer.id, listing.id, seller.id]
      );
      const token = await loginAs(buyer);

      const res = await request(app)
        .post(`/api/marketplace/listings/${listing.id}/reviews`)
        .set('Authorization', `Bearer ${token}`)
        .send({ rating: 6 });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/marketplace/favorites/:id', () => {
    it('should add to favorites', async () => {
      const user = await createUser();
      const seller = await createUser('seller');
      const listing = await insertListing({ userId: seller.id, status: 'published' });
      const token = await loginAs(user);

      const res = await request(app)
        .post(`/api/marketplace/favorites/${listing.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should toggle favorite', async () => {
      const user = await createUser();
      const seller = await createUser('seller');
      const listing = await insertListing({ userId: seller.id, status: 'published' });
      const token = await loginAs(user);

      // Add
      await request(app)
        .post(`/api/marketplace/favorites/${listing.id}`)
        .set('Authorization', `Bearer ${token}`);

      // Remove
      const res = await request(app)
        .delete(`/api/marketplace/favorites/${listing.id}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // PR-1 (plan vá luồng tiền 26/09): snapshot_data là nội dung trả phí — chỉ chủ món và người đã mua được nhận.
  // Review bắt thêm đường danh sách yêu thích (SELECT ml.*) mà bản đầu của PR-1 bỏ sót.
  describe('không trả nội dung trả phí cho người chưa mua', () => {
    const PAID = { campaignName: 'Noi dung tra phi', campaignType: 'email', nodes: [{ id: 'n1', nodeType: 'email', config: { body: 'BI MAT' } }], connections: [] };
    const hasPaidContent = (obj) => JSON.stringify(obj).includes('BI MAT') || JSON.stringify(obj).includes('snapshot_data');

    it('chi tiết món: người chưa mua chỉ nhận bản xem trước, chủ món nhận đủ', async () => {
      const seller = await createUser('seller');
      const viewer = await createUser('viewer');
      const listing = await insertListing({ userId: seller.id, status: 'published', snapshotData: PAID });

      const asViewer = await request(app).get(`/api/marketplace/listings/${listing.id}`)
        .set('Authorization', `Bearer ${await loginAs(viewer)}`);
      expect(asViewer.status).toBe(200);
      expect(hasPaidContent(asViewer.body)).toBe(false);

      const asOwner = await request(app).get(`/api/marketplace/listings/${listing.id}`)
        .set('Authorization', `Bearer ${await loginAs(seller)}`);
      expect(asOwner.status).toBe(200);
      expect(JSON.stringify(asOwner.body)).toContain('BI MAT');
    });

    it('bản nháp: người lạ không mở được', async () => {
      const seller = await createUser('seller');
      const viewer = await createUser('viewer');
      const draft = await insertListing({ userId: seller.id, status: 'draft', snapshotData: PAID });

      const res = await request(app).get(`/api/marketplace/listings/${draft.id}`)
        .set('Authorization', `Bearer ${await loginAs(viewer)}`);
      expect(hasPaidContent(res.body)).toBe(false);
      expect(res.status).toBe(404);
    });

    it('trang duyệt và danh sách yêu thích không kèm nội dung trả phí', async () => {
      const seller = await createUser('seller');
      const viewer = await createUser('viewer');
      const listing = await insertListing({ userId: seller.id, status: 'published', snapshotData: PAID });
      const token = await loginAs(viewer);

      const browse = await request(app).get('/api/marketplace/browse').set('Authorization', `Bearer ${token}`);
      expect(browse.status).toBe(200);
      expect(hasPaidContent(browse.body)).toBe(false);

      await request(app).post(`/api/marketplace/favorites/${listing.id}`).set('Authorization', `Bearer ${token}`);
      const favorites = await request(app).get('/api/marketplace/favorites').set('Authorization', `Bearer ${token}`);
      expect(favorites.status).toBe(200);
      expect(JSON.stringify(favorites.body)).toContain(String(listing.id));
      expect(hasPaidContent(favorites.body)).toBe(false);
    });
  });

  // PLAN_VA_CO_LAP_DU_LIEU_TENANT PR-3 (việc 3b): snapshot landing không mang cấu hình riêng của người bán
  // (webhook + secret Google Sheet, id biểu mẫu) — lọc ở CẢ ba chỗ: tạo snapshot, trả snapshot/preview, clone.
  describe('landing: snapshot không mang cấu hình riêng của người bán', () => {
    const SELLER_SECRET = 'SECRET_SHEET_CUA_NGUOI_BAN';
    const SELLER_CONFIG = {
      googleSheetsSync: { enabled: true, webhookUrl: 'https://script.google.com/macros/s/AKfy/exec', secret: SELLER_SECRET },
      googleSheetsLastSyncAt: '2026-10-01T00:00:00Z',
      googleSheetsLastError: 'loi cu',
      sheetsSync: { enabled: true, webhookUrl: 'https://script.google.com/macros/s/OLD/exec' },
      chosenFormId: 77,
      category: 'khoa-hoc',
    };
    const PRIVATE_KEYS = ['googleSheetsSync', 'googleSheetsLastSyncAt', 'googleSheetsLastError', 'sheetsSync', 'chosenFormId'];
    const expectNoPrivateKeys = (customConfig) => {
      expect(customConfig).toBeDefined();
      for (const key of PRIVATE_KEYS) expect(customConfig).not.toHaveProperty(key);
      expect(customConfig.category).toBe('khoa-hoc'); // phần còn lại giữ nguyên
    };
    const OLD_SNAPSHOT = {
      title: 'Landing cu',
      slug: 'landing-cu',
      htmlContent: '<h1>NOI DUNG LANDING</h1>',
      customConfig: SELLER_CONFIG,
    };

    async function insertLandingListing(sellerId, { snapshotData = OLD_SNAPSHOT, priceCredits = 0 } = {}) {
      return insertListing({ userId: sellerId, resourceType: 'landing_page', resourceId: 1, priceCredits, status: 'published', snapshotData });
    }
    async function recordPurchase(buyerId, listing) {
      await db.query(
        `INSERT INTO marketplace_purchases (id_user, listing_id, seller_id, credits_spent, transaction_type)
         VALUES ($1, $2, $3, 0, 'purchase')`,
        [buyerId, listing.id, listing.id_user]
      );
    }

    it('đăng bán landing có customConfig.googleSheetsSync -> snapshot_data.customConfig không còn khoá googleSheets*, sheetsSync, chosenFormId', async () => {
      const seller = await createUser('seller');
      const plan = await createPlan();
      await assignPlanToUser(seller, plan);
      const { rows } = await db.query(
        `INSERT INTO landing_pages (id_user, workspace_owner_id, slug, title, html_content, custom_config)
         VALUES ($1, $1, 'landing-ban', 'Landing ban', '<h1>X</h1>', $2::jsonb) RETURNING id`,
        [seller.id, JSON.stringify(SELLER_CONFIG)]
      );

      const res = await request(app)
        .post('/api/marketplace/landing-pages')
        .set('Authorization', `Bearer ${await loginAs(seller)}`)
        .send({ landingPageId: rows[0].id, title: 'Landing ban', priceCredits: 0 });

      expect(res.status).toBe(201);
      const { rows: stored } = await db.query('SELECT snapshot_data FROM marketplace_listings WHERE id = $1', [res.body.data.id]);
      expectNoPrivateKeys(stored[0].snapshot_data.customConfig);
      expect(JSON.stringify(stored[0].snapshot_data)).not.toContain(SELLER_SECRET);
      expect(stored[0].snapshot_data.htmlContent).toBe('<h1>X</h1>');
      // Landing gốc của người bán KHÔNG bị đổi.
      const { rows: original } = await db.query('SELECT custom_config FROM landing_pages WHERE id = $1', [rows[0].id]);
      expect(original[0].custom_config.googleSheetsSync.secret).toBe(SELLER_SECRET);
    });

    it('listing cũ đã lưu kèm khoá riêng: người CHƯA mua xem -> preview không có khoá đó và không lộ secret', async () => {
      const seller = await createUser('seller');
      const viewer = await createUser('viewer');
      const listing = await insertLandingListing(seller.id);

      const res = await request(app).get(`/api/marketplace/listings/${listing.id}`)
        .set('Authorization', `Bearer ${await loginAs(viewer)}`);

      expect(res.status).toBe(200);
      expectNoPrivateKeys(res.body.data.preview_data.customConfig);
      expect(JSON.stringify(res.body)).not.toContain(SELLER_SECRET);
    });

    it('listing cũ đã lưu kèm khoá riêng: người ĐÃ mua xem -> snapshot_data đủ nội dung nhưng không có khoá đó', async () => {
      const seller = await createUser('seller');
      const buyer = await createUser('buyer');
      const listing = await insertLandingListing(seller.id);
      await recordPurchase(buyer.id, listing);

      const res = await request(app).get(`/api/marketplace/listings/${listing.id}`)
        .set('Authorization', `Bearer ${await loginAs(buyer)}`);

      expect(res.status).toBe(200);
      expect(res.body.data.snapshot_data.htmlContent).toBe('<h1>NOI DUNG LANDING</h1>');
      expectNoPrivateKeys(res.body.data.snapshot_data.customConfig);
      expect(JSON.stringify(res.body)).not.toContain(SELLER_SECRET);
    });

    it('danh sách "đã mua" của người mua cũng không có khoá riêng của người bán', async () => {
      const seller = await createUser('seller');
      const buyer = await createUser('buyer');
      const listing = await insertLandingListing(seller.id);
      await recordPurchase(buyer.id, listing);

      const res = await request(app).get('/api/marketplace/purchases')
        .set('Authorization', `Bearer ${await loginAs(buyer)}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expectNoPrivateKeys(res.body.data[0].snapshot_data.customConfig);
      expect(JSON.stringify(res.body)).not.toContain(SELLER_SECRET);
    });

    it('mua listing landing cũ có khoá đó -> landing_pages.custom_config của người mua không có khoá đó', async () => {
      const seller = await createUser('seller');
      const buyer = await createUser('buyer');
      const plan = await createPlan();
      await assignPlanToUser(buyer, plan);
      await insertUsageLog(buyer.id, 100);
      const listing = await insertLandingListing(seller.id);

      const res = await request(app)
        .post(`/api/marketplace/purchase/${listing.id}`)
        .set('Authorization', `Bearer ${await loginAs(buyer)}`);

      expect(res.status).toBe(200);
      const { rows } = await db.query('SELECT custom_config, html_content FROM landing_pages WHERE id = $1', [res.body.data.clonedResource.id]);
      expect(rows).toHaveLength(1);
      expectNoPrivateKeys(rows[0].custom_config);
      expect(JSON.stringify(rows[0].custom_config)).not.toContain(SELLER_SECRET);
      expect(rows[0].html_content).toBe('<h1>NOI DUNG LANDING</h1>');
    });
  });

  // PLAN_VA_CO_LAP_DU_LIEU_TENANT PR-1 (việc 1b): rút tiền chỉ chủ tài khoản; nhân viên có `marketplace_manage` không tạo được yêu cầu rút.
  describe('POST /api/marketplace/seller/withdraw', () => {
    async function seedSellerWithBalance(username) {
      const owner = await createUser(username);
      await db.query(
        `INSERT INTO marketplace_seller_stats (id_user, total_earnings, available_balance) VALUES ($1, 100000, 100000)`,
        [owner.id]
      );
      return owner;
    }

    async function countPayouts(userId) {
      const { rows } = await db.query('SELECT COUNT(*)::int AS n FROM marketplace_payout_requests WHERE id_user = $1', [userId]);
      return rows[0].n;
    }

    it('nhân viên có marketplace_manage → 403 OWNER_ONLY, không có dòng payout, số dư chủ không đổi', async () => {
      const owner = await seedSellerWithBalance('wd-owner');
      const employee = await createUser('wd-employee');
      await db.query(
        `INSERT INTO user_members (owner_id, employee_id, permissions, status) VALUES ($1, $2, $3::jsonb, 'active')`,
        [owner.id, employee.id, JSON.stringify({ marketplace_manage: true })]
      );

      const res = await request(app)
        .post('/api/marketplace/seller/withdraw')
        .set('Authorization', `Bearer ${await loginAs(employee)}`)
        .set('X-Owner-Context', String(owner.id))
        .send({ amount: 50000, paymentMethod: 'bank_transfer', paymentDetails: { bank: 'ATTACKER', account: '000' } });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('OWNER_ONLY');
      expect(await countPayouts(owner.id)).toBe(0);
      const { rows } = await db.query('SELECT available_balance, pending_payout FROM marketplace_seller_stats WHERE id_user = $1', [owner.id]);
      expect(Number(rows[0].available_balance)).toBe(100000);
      expect(Number(rows[0].pending_payout)).toBe(0);
    });

    it('nhân viên có marketplace_manage vẫn xem được lịch sử rút tiền (200)', async () => {
      const owner = await seedSellerWithBalance('wd-owner-hist');
      const employee = await createUser('wd-employee-hist');
      await db.query(
        `INSERT INTO user_members (owner_id, employee_id, permissions, status) VALUES ($1, $2, $3::jsonb, 'active')`,
        [owner.id, employee.id, JSON.stringify({ marketplace_manage: true })]
      );

      const res = await request(app)
        .get('/api/marketplace/seller/withdrawals')
        .set('Authorization', `Bearer ${await loginAs(employee)}`)
        .set('X-Owner-Context', String(owner.id));

      expect(res.status).toBe(200);
    });

    it('chủ tài khoản rút tiền bình thường → 201, có dòng payout, số dư chuyển sang pending', async () => {
      const owner = await seedSellerWithBalance('wd-owner-ok');

      const res = await request(app)
        .post('/api/marketplace/seller/withdraw')
        .set('Authorization', `Bearer ${await loginAs(owner)}`)
        .send({ amount: 50000, paymentMethod: 'bank_transfer', paymentDetails: { bank: 'MB', account: '123' } });

      expect(res.status).toBe(201);
      expect(await countPayouts(owner.id)).toBe(1);
      const { rows } = await db.query('SELECT available_balance, pending_payout FROM marketplace_seller_stats WHERE id_user = $1', [owner.id]);
      expect(Number(rows[0].available_balance)).toBe(50000);
      expect(Number(rows[0].pending_payout)).toBe(50000);
    });
  });

  // PLAN_VA_CO_LAP_DU_LIEU_TENANT_DOT2 PR-C (C1): đăng bán chỉ tài nguyên CỦA MÌNH — không phải bản được chia sẻ, không phải bản đã mua.
  describe('đăng bán: không bán lại tài nguyên được chia sẻ hoặc đã mua từ Marketplace', () => {
    async function createSeller(username) {
      const user = await createUser(username);
      await assignPlanToUser(user, await createPlan(`plan-${username}`));
      return { user, token: await loginAs(user) };
    }
    const countListings = async () => (await db.query('SELECT COUNT(*)::int AS n FROM marketplace_listings')).rows[0].n;
    const insertChatbot = async (userId, origin = 'self_created') => {
      const { rows } = await db.query(
        `INSERT INTO custom_chatbots (id_user, name, widget_key, system_instruction, origin) VALUES ($1, 'Bot', $2, 'huong dan', $3) RETURNING id`,
        [userId, `k_${Date.now()}_${Math.floor(Math.random() * 1e6)}`, origin]
      );
      return Number(rows[0].id);
    };
    const insertLanding = async (userId, html = '<h1>Trang</h1>') => {
      const { rows } = await db.query(
        `INSERT INTO landing_pages (id_user, workspace_owner_id, slug, title, html_content) VALUES ($1, $1, $2, 'Trang', $3) RETURNING id`,
        [userId, `lp-${Date.now()}-${Math.floor(Math.random() * 1e6)}`, html]
      );
      return Number(rows[0].id);
    };

    it('B được A chia sẻ chiến dịch (edit) -> B đăng bán -> 404, không có listing', async () => {
      const a = await createSeller('owner-a');
      const b = await createSeller('recipient-b');
      const campaign = await insertCampaign({ userId: a.user.id, campaignName: 'Chien dich cua A' });
      await db.query(
        `INSERT INTO campaign_shares (id_campaign, id_owner, id_recipient, recipient_email, share_type, can_run)
         VALUES ($1, $2, $3, $4, 'edit', false)`,
        [campaign.id, a.user.id, b.user.id, b.user.email]
      );

      const res = await request(app).post('/api/marketplace/listings')
        .set('Authorization', `Bearer ${b.token}`).send({ campaignId: campaign.id, title: 'Ban lai' });

      expect(res.status).toBe(404);
      expect(await countListings()).toBe(0);
    });

    it('B được A chia sẻ chiến dịch (view) -> cũng 404', async () => {
      const a = await createSeller('owner-a2');
      const b = await createSeller('recipient-b2');
      const campaign = await insertCampaign({ userId: a.user.id });
      await db.query(
        `INSERT INTO campaign_shares (id_campaign, id_owner, id_recipient, recipient_email, share_type, can_run)
         VALUES ($1, $2, $3, $4, 'view', false)`,
        [campaign.id, a.user.id, b.user.id, b.user.email]
      );

      const res = await request(app).post('/api/marketplace/listings')
        .set('Authorization', `Bearer ${b.token}`).send({ campaignId: campaign.id });

      expect(res.status).toBe(404);
      expect(await countListings()).toBe(0);
    });

    it('B tạo listing từ chatbot origin = shared -> 403, không có listing', async () => {
      const b = await createSeller('recipient-b3');
      const chatbotId = await insertChatbot(b.user.id, 'shared');

      const res = await request(app).post('/api/marketplace/chatbots')
        .set('Authorization', `Bearer ${b.token}`).send({ chatbotId, title: 'Ban lai bot' });

      expect(res.status).toBe(403);
      expect(await countListings()).toBe(0);
    });

    it('chiến dịch B đã MUA từ Marketplace (qua endpoint mua thật) -> đăng bán lại 403', async () => {
      const a = await createSeller('seller-a4');
      const b = await createSeller('buyer-b4');
      await insertUsageLog(b.user.id, 100);
      const source = await insertListing({ userId: a.user.id, resourceType: 'campaign', priceCredits: 0, status: 'published' });
      const bought = await request(app).post(`/api/marketplace/purchase/${source.id}`).set('Authorization', `Bearer ${b.token}`);
      expect(bought.status).toBe(200);
      const clonedCampaignId = bought.body.data.clonedResource.id;
      const before = await countListings();

      const res = await request(app).post('/api/marketplace/listings')
        .set('Authorization', `Bearer ${b.token}`).send({ campaignId: clonedCampaignId, title: 'Ban lai' });

      expect(res.status).toBe(403);
      expect(await countListings()).toBe(before);
    });

    it('landing B đã MUA từ Marketplace (qua endpoint mua thật) -> đăng bán lại 403', async () => {
      const a = await createSeller('seller-a5');
      const b = await createSeller('buyer-b5');
      await insertUsageLog(b.user.id, 100);
      const source = await insertListing({
        userId: a.user.id,
        resourceType: 'landing_page',
        priceCredits: 0,
        status: 'published',
        snapshotData: { title: 'Landing mua', slug: 'landing-mua', htmlContent: '<h1>X</h1>', customConfig: {} },
      });
      const bought = await request(app).post(`/api/marketplace/purchase/${source.id}`).set('Authorization', `Bearer ${b.token}`);
      expect(bought.status).toBe(200);
      const clonedLandingId = bought.body.data.clonedResource.id;
      const before = await countListings();

      const res = await request(app).post('/api/marketplace/landing-pages')
        .set('Authorization', `Bearer ${b.token}`).send({ landingPageId: clonedLandingId, title: 'Ban lai' });

      expect(res.status).toBe(403);
      expect(await countListings()).toBe(before);
    });

    it('tài nguyên CỦA CHÍNH MÌNH (chiến dịch, chatbot tự tạo, landing) -> đăng bán như cũ (201)', async () => {
      const u = await createSeller('own-seller');
      const campaign = await insertCampaign({ userId: u.user.id });
      const chatbotId = await insertChatbot(u.user.id, 'self_created');
      const landingId = await insertLanding(u.user.id);
      const post = (path, body) => request(app).post(path).set('Authorization', `Bearer ${u.token}`).send(body);

      expect((await post('/api/marketplace/listings', { campaignId: campaign.id, title: 'C' })).status).toBe(201);
      expect((await post('/api/marketplace/chatbots', { chatbotId, title: 'B' })).status).toBe(201);
      expect((await post('/api/marketplace/landing-pages', { landingPageId: landingId, title: 'L' })).status).toBe(201);
      expect(await countListings()).toBe(3);
    });
  });

  // PLAN_VA_CO_LAP_DU_LIEU_TENANT_DOT2 PR-C (C2): landing mua về không mang khối nhúng biểu mẫu của người bán.
  describe('landing mua về: khối nhúng biểu mẫu của người bán đổi thành chỗ trống', () => {
    const embed = (key) => `<section data-founderai-form-section>
  <div data-founderai-form="${key}"></div>
  <noscript><a href="https://founderai.biz/f/${key}">Mở biểu mẫu</a></noscript>
  <script src="https://founderai.biz/form-embed.js" defer></script>
</section>`;
    const SELLER_KEYS = ['SELLERKEY_AAA', 'SELLERKEY_BBB'];
    const SELLER_HTML = `<h1>Landing bán</h1>\n${embed(SELLER_KEYS[0])}\n<p>Giữa trang</p>\n${embed(SELLER_KEYS[1])}\n<p>Cuối</p>`;

    async function buyLandingWithHtml(html) {
      const seller = await createUser('seller-c2');
      const buyer = await createUser('buyer-c2');
      await assignPlanToUser(buyer, await createPlan('plan-c2'));
      await insertUsageLog(buyer.id, 100);
      const listing = await insertListing({
        userId: seller.id,
        resourceType: 'landing_page',
        priceCredits: 0,
        status: 'published',
        snapshotData: { title: 'Landing mua', slug: 'landing-mua', htmlContent: html, customConfig: {} },
      });
      const token = await loginAs(buyer);
      const res = await request(app).post(`/api/marketplace/purchase/${listing.id}`).set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      return { seller, buyer, token, landingId: res.body.data.clonedResource.id };
    }

    it('mua landing có 2 khối nhúng của người bán -> html_content của người mua: 0 data-founderai-form=", 2 chỗ trống', async () => {
      const { landingId } = await buyLandingWithHtml(SELLER_HTML);

      const { rows } = await db.query('SELECT html_content, is_published FROM landing_pages WHERE id = $1', [landingId]);
      const html = rows[0].html_content;
      expect(html).not.toContain('data-founderai-form="');
      expect(html).not.toContain('SELLERKEY');
      expect(html).not.toContain('form-embed.js');
      expect(html.match(/data-founderai-form-slot/g)).toHaveLength(2);
      expect(html).toContain('<h1>Landing bán</h1>');
      expect(html).toContain('<p>Giữa trang</p>');
      expect(rows[0].is_published).toBe(false);
    });

    it('mua landing có IFRAME biểu mẫu của người bán (/f/<key>?embed=1 và /embed/lead-form) -> thành chỗ trống; iframe YouTube và liên kết <a> giữ nguyên', async () => {
      const youtube = '<iframe width="560" height="315" src="https://www.youtube.com/embed/dQw4w9WgXcQ" title="Video"></iframe>';
      const link = '<a href="https://founderai.biz/f/SELLERKEY_LINK">Đăng ký</a>';
      const html = [
        '<h1>Landing bán</h1>',
        '<iframe src="https://founderai.biz/f/SELLERKEY_IFR?embed=1" style="width:100%;border:0;min-height:480px" title="Đăng ký"></iframe>',
        youtube,
        '<iframe src="/embed/lead-form?slug=landing-cu" style="width:100%"></iframe>',
        link,
      ].join('\n');
      const { landingId } = await buyLandingWithHtml(html);

      const { rows } = await db.query('SELECT html_content FROM landing_pages WHERE id = $1', [landingId]);
      const saved = rows[0].html_content;
      expect(saved).not.toContain('SELLERKEY_IFR');
      expect(saved).not.toContain('lead-form');
      expect(saved.match(/data-founderai-form-slot/g)).toHaveLength(2);
      expect(saved).toContain(youtube);
      expect(saved).toContain(link); // giới hạn còn lại đã biết: liên kết <a> của người bán không bị đụng
    });

    it('mua landing KHÔNG có khối nhúng -> html_content giữ nguyên từng byte', async () => {
      const plain = '<!DOCTYPE html>\r\n<html><body>\t<h1>Trang thường</h1> \r\n<div data-founderai-form-slot></div></body></html>';
      const { landingId } = await buyLandingWithHtml(plain);

      const { rows } = await db.query('SELECT html_content FROM landing_pages WHERE id = $1', [landingId]);
      expect(rows[0].html_content).toBe(plain);
    });

    it('người mua mở trang rồi LƯU -> 2 chỗ trống thành 2 biểu mẫu CỦA NGƯỜI MUA, HTML nhúng khoá của người mua (không phải của người bán)', async () => {
      const { buyer, seller, token, landingId } = await buyLandingWithHtml(SELLER_HTML);
      const { rows: stored } = await db.query('SELECT html_content, slug FROM landing_pages WHERE id = $1', [landingId]);

      const res = await request(app)
        .put(`/api/admin/landing-pages/${landingId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ slug: stored[0].slug, title: 'Landing cua nguoi mua', htmlContent: stored[0].html_content, isPublished: true });

      expect(res.status).toBe(200);
      const { rows: saved } = await db.query('SELECT html_content, is_published FROM landing_pages WHERE id = $1', [landingId]);
      const keys = [...saved[0].html_content.matchAll(/data-founderai-form="([A-Za-z0-9_-]+)"/g)].map((m) => m[1]);
      expect(keys).toHaveLength(2);
      for (const key of SELLER_KEYS) expect(keys).not.toContain(key);
      expect(saved[0].html_content).not.toContain('data-founderai-form-slot');
      const { rows: forms } = await db.query('SELECT public_key, workspace_owner_id FROM forms WHERE public_key = ANY($1)', [keys]);
      expect(forms).toHaveLength(2);
      for (const form of forms) expect(Number(form.workspace_owner_id)).toBe(Number(buyer.id));
      const { rows: sellerForms } = await db.query('SELECT 1 FROM forms WHERE workspace_owner_id = $1', [seller.id]);
      expect(sellerForms).toHaveLength(0);
    });
  });
});
