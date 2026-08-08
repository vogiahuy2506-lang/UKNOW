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
import usageTrackingService from '../../src/services/payment/usageTracking.service.js';

let app;
let deductCreditsSpy;

beforeAll(() => {
  app = createApp();
  // Mock deductCredits để test purchase flow mà không thực sự trừ credits
  deductCreditsSpy = jest
    .spyOn(usageTrackingService, 'deductCredits')
    .mockResolvedValue({ success: true, deducted: 50, newBalance: 50 });
});

beforeEach(async () => {
  await truncateAll();
  deductCreditsSpy.mockClear();
});

async function truncateAll() {
  await db.query('DELETE FROM marketplace_favorites');
  await db.query('DELETE FROM marketplace_reviews');
  await db.query('DELETE FROM marketplace_purchases');
  await db.query('DELETE FROM marketplace_listings');
  await db.query('DELETE FROM usage_logs');
  await db.query('DELETE FROM campaign_connections');
  await db.query('DELETE FROM campaign_nodes');
  await db.query('DELETE FROM campaigns');
  await db.query('DELETE FROM plans');
  await db.query('DELETE FROM users');
}

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
  priceCredits = 0,
  status = 'published',
  snapshotData = { test: true },
}) {
  const { rows } = await db.query(
    `INSERT INTO marketplace_listings
     (id_user, resource_type, resource_id, title, description, price_credits, status, snapshot_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [userId, resourceType, resourceId, title, description, priceCredits, status, JSON.stringify(snapshotData)]
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
    beforeEach(async () => {
      const user = await createUser();
      token = await loginAs(user);
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
      const user = await createUser();
      await insertListing({ userId: user.id, status: 'published' });
      await insertListing({ userId: user.id, status: 'draft' });

      const res = await request(app)
        .get('/api/marketplace/browse')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
    });

    it('should filter by resource type', async () => {
      const listingUser = await createUser('listingowner');
      await insertListing({ userId: listingUser.id, resourceType: 'campaign', status: 'published' });
      await insertListing({ userId: listingUser.id, resourceType: 'chatbot', status: 'published' });

      const res = await request(app)
        .get('/api/marketplace/browse?type=campaign')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].resource_type).toBe('campaign');
    });

    it('should filter by category', async () => {
      const user = await createUser();
      await insertListing({ userId: user.id, status: 'published', snapshotData: { category: 'marketing' } });
      await insertListing({ userId: user.id, status: 'published', snapshotData: { category: 'support' } });

      const res = await request(app)
        .get('/api/marketplace/browse?category=marketing')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
    });

    it('should sort by rating', async () => {
      const user = await createUser();
      await insertListing({ userId: user.id, status: 'published', snapshotData: { ratingAvg: 3 } });
      await insertListing({ userId: user.id, status: 'published', snapshotData: { ratingAvg: 5 } });

      const res = await request(app)
        .get('/api/marketplace/browse?sort=rating')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data[0].rating_avg).toBe(5);
    });

    it('should paginate results', async () => {
      const user = await createUser();
      for (let i = 0; i < 15; i++) {
        await insertListing({ userId: user.id, status: 'published', title: `Listing ${i}` });
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
      const user = await createUser();
      await insertListing({ userId: user.id, status: 'published', title: 'Email Campaign Template' });
      await insertListing({ userId: user.id, status: 'published', title: 'Zalo Auto Reply' });

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
        .set('Cookie', `accessToken=${token}`)
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
        .set('Cookie', `accessToken=${token}`)
        .send({ title: 'No Campaign' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should reject non-existent campaign', async () => {
      const user = await createUser();
      const token = await loginAs(user);

      const res = await request(app)
        .post('/api/marketplace/listings')
        .set('Cookie', `accessToken=${token}`)
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
        .set('Cookie', `accessToken=${token}`);

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
        .set('Cookie', `accessToken=${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(deductCreditsSpy).toHaveBeenCalledWith(buyer.id, 50, expect.any(Object), expect.any(Object));
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
        .set('Cookie', `accessToken=${token}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('đã mua');
    });

    it('should prevent self-purchase', async () => {
      const user = await createUser();
      const listing = await insertListing({ userId: user.id, status: 'published' });
      const token = await loginAs(user);

      const res = await request(app)
        .post(`/api/marketplace/purchase/${listing.id}`)
        .set('Cookie', `accessToken=${token}`);

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
        .set('Cookie', `accessToken=${token}`);

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
        .set('Cookie', `accessToken=${token}`)
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
        .set('Cookie', `accessToken=${token}`)
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
        .set('Cookie', `accessToken=${token}`)
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
        .set('Cookie', `accessToken=${token}`);

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
        .set('Cookie', `accessToken=${token}`);

      // Remove
      const res = await request(app)
        .delete(`/api/marketplace/favorites/${listing.id}`)
        .set('Cookie', `accessToken=${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
