/**
 * Integration tests cho GET /track/attachment/:token —
 * Endpoint công khai theo dõi việc khách hàng tải tệp đính kèm từ email.
 *
 * Phạm vi:
 *   - Token format / chữ ký HMAC.
 *   - Resolve emailMessage từ tracking token (et).
 *   - Resolve customerId fallback qua email.
 *   - Auto-infer email_opened event nếu chưa có (suy ra từ tải tệp).
 *   - Dedup attachment_downloaded theo (id_email_message, id_customer, storageKey).
 *   - Update campaign_customers counters khi có campaignId.
 *   - File không tồn tại trên disk → vẫn ghi tracking, response 404.
 */
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { truncateAll, createUser } from './helpers/db.js';
import { generateFileToken } from '../../src/utils/fileDownloadToken.js';

let app;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
});

async function createCustomer({ userId, email = null, phone = null, fullName = 'Khách' }) {
  const { rows } = await db.query(
    `INSERT INTO customers (id_user, email, phone, full_name)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [userId, email, phone, fullName]
  );
  return rows[0];
}

async function createCampaign({ userId, name = 'Camp', status = 'running' }) {
  const { rows } = await db.query(
    `INSERT INTO campaigns (id_user, campaign_name, status)
     VALUES ($1, $2, $3) RETURNING *`,
    [userId, name, status]
  );
  return rows[0];
}

async function createEmailMessage({ trackingToken, campaignId = null, runId = null, status = 'sent', openCount = 0 }) {
  const { rows } = await db.query(
    `INSERT INTO email_messages (tracking_token, id_campaign, id_run, status, open_count)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [trackingToken, campaignId, runId, status, openCount]
  );
  return rows[0];
}

async function createTemplateFile({ storageKey, originalName = 'doc.pdf', displayName = 'Tài liệu', mimeType = 'application/pdf' }) {
  const { rows } = await db.query(
    `INSERT INTO template_files (storage_key, original_name, display_name, mime_type, file_size)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [storageKey, originalName, displayName, mimeType, 12345]
  );
  return rows[0];
}

describe('GET /track/attachment/:token', () => {
  describe('Token validation', () => {
    it('token không có dấu chấm → 400 (link không hợp lệ)', async () => {
      const res = await request(app).get('/track/attachment/invalidtoken');
      expect(res.status).toBe(400);
      expect(res.text).toMatch(/không hợp lệ/);
    });

    it('token chữ ký sai → 400', async () => {
      // payload hợp lệ nhưng signature random
      const fakeToken = 'eyJzayI6InRlc3Qta2V5In0.invalidsignature';
      const res = await request(app).get(`/track/attachment/${fakeToken}`);
      expect(res.status).toBe(400);
    });

    it('token thiếu storageKey (sk) → 400', async () => {
      const token = generateFileToken(null, null, null, null);
      const res = await request(app).get(`/track/attachment/${token}`);
      expect(res.status).toBe(400);
    });
  });

  describe('Happy path — file không tồn tại trên disk', () => {
    it('token hợp lệ + customer + campaign + file → ghi attachment_downloaded vào journey, response 404 (file không có)', async () => {
      const user = await createUser();
      const customer = await createCustomer({ userId: user.id, email: 'kh@uknow.local' });
      const campaign = await createCampaign({ userId: user.id });
      const storageKey = 'uploads/test/sample.pdf';
      await createTemplateFile({ storageKey });

      const token = generateFileToken(storageKey, campaign.id, customer.id, 'kh@uknow.local', 'Tài liệu');
      const res = await request(app).get(`/track/attachment/${token}`);

      // File không tồn tại trên disk → sendFile fail → 404
      expect(res.status).toBe(404);

      // Nhưng tracking đã được ghi
      const journey = await db.query(
        `SELECT * FROM customer_journey WHERE id_customer = $1 AND event_type = 'attachment_downloaded'`,
        [customer.id]
      );
      expect(journey.rows).toHaveLength(1);
      expect(journey.rows[0]).toMatchObject({
        event_channel: 'email',
        id_campaign: String(campaign.id),
      });
      expect(journey.rows[0].event_data).toMatchObject({
        storageKey,
        displayName: 'Tài liệu',
      });
    });

    it('không có customer (token không có u, không có email) → KHÔNG ghi journey', async () => {
      const user = await createUser();
      await createCustomer({ userId: user.id, email: 'kh@uknow.local' });
      const storageKey = 'uploads/test/no-customer.pdf';
      await createTemplateFile({ storageKey });

      const token = generateFileToken(storageKey, null, null, null);
      const res = await request(app).get(`/track/attachment/${token}`);
      expect(res.status).toBe(404);

      const journey = await db.query(`SELECT COUNT(*)::int AS c FROM customer_journey`);
      expect(journey.rows[0].c).toBe(0);
    });

    it('token không có u nhưng có email → fallback resolve customerId qua email', async () => {
      const user = await createUser();
      const customer = await createCustomer({ userId: user.id, email: 'fallback@uknow.local' });
      const storageKey = 'uploads/test/fb.pdf';
      await createTemplateFile({ storageKey });

      const token = generateFileToken(storageKey, null, null, 'fallback@uknow.local');
      const res = await request(app).get(`/track/attachment/${token}`);
      expect(res.status).toBe(404);

      const journey = await db.query(
        `SELECT id_customer, event_type FROM customer_journey WHERE event_type = 'attachment_downloaded'`
      );
      expect(journey.rows).toHaveLength(1);
      expect(Number(journey.rows[0].id_customer)).toBe(Number(customer.id));
    });

    it('email không match customer nào → không ghi journey', async () => {
      const user = await createUser();
      await createCustomer({ userId: user.id, email: 'other@uknow.local' });
      const storageKey = 'uploads/test/no-match.pdf';
      await createTemplateFile({ storageKey });

      const token = generateFileToken(storageKey, null, null, 'unknown@uknow.local');
      await request(app).get(`/track/attachment/${token}`);

      const journey = await db.query(`SELECT COUNT(*)::int AS c FROM customer_journey`);
      expect(journey.rows[0].c).toBe(0);
    });
  });

  describe('Dedup attachment_downloaded', () => {
    it('cùng (email_message, customer, storageKey) gọi 2 lần → chỉ ghi 1 event', async () => {
      const user = await createUser();
      const customer = await createCustomer({ userId: user.id });
      const campaign = await createCampaign({ userId: user.id });
      const emailMsg = await createEmailMessage({
        trackingToken: 'em-token-1',
        campaignId: campaign.id,
      });
      const storageKey = 'uploads/test/dedup.pdf';
      await createTemplateFile({ storageKey });

      const token = generateFileToken(storageKey, campaign.id, customer.id, null, null, 'em-token-1');
      await request(app).get(`/track/attachment/${token}`);
      await request(app).get(`/track/attachment/${token}`);

      const journey = await db.query(
        `SELECT * FROM customer_journey WHERE event_type = 'attachment_downloaded' AND id_customer = $1`,
        [customer.id]
      );
      expect(journey.rows).toHaveLength(1);
      expect(Number(journey.rows[0].id_email_message)).toBe(Number(emailMsg.id));
    });

    it('cùng email_message nhưng storageKey khác → 2 events riêng', async () => {
      const user = await createUser();
      const customer = await createCustomer({ userId: user.id });
      const campaign = await createCampaign({ userId: user.id });
      const emailMsg = await createEmailMessage({
        trackingToken: 'em-token-2',
        campaignId: campaign.id,
      });

      const sk1 = 'uploads/test/a.pdf';
      const sk2 = 'uploads/test/b.pdf';
      await createTemplateFile({ storageKey: sk1, displayName: 'File A' });
      await createTemplateFile({ storageKey: sk2, displayName: 'File B' });

      const tokenA = generateFileToken(sk1, campaign.id, customer.id, null, null, 'em-token-2');
      const tokenB = generateFileToken(sk2, campaign.id, customer.id, null, null, 'em-token-2');
      await request(app).get(`/track/attachment/${tokenA}`);
      await request(app).get(`/track/attachment/${tokenB}`);

      const journey = await db.query(
        `SELECT event_data->>'storageKey' AS sk FROM customer_journey
         WHERE event_type = 'attachment_downloaded' AND id_customer = $1
         ORDER BY id`,
        [customer.id]
      );
      expect(journey.rows.map((r) => r.sk).sort()).toEqual([sk1, sk2].sort());
      // Đảm bảo dùng emailMsg đúng
      expect(emailMsg.id).toBeTruthy();
    });

    it('không có emailMessage → dedup theo (campaignId, customer, storageKey)', async () => {
      const user = await createUser();
      const customer = await createCustomer({ userId: user.id });
      const campaign = await createCampaign({ userId: user.id });
      const storageKey = 'uploads/test/no-em.pdf';
      await createTemplateFile({ storageKey });

      const token = generateFileToken(storageKey, campaign.id, customer.id, null, null, null);
      await request(app).get(`/track/attachment/${token}`);
      await request(app).get(`/track/attachment/${token}`);

      const journey = await db.query(
        `SELECT * FROM customer_journey WHERE event_type = 'attachment_downloaded' AND id_customer = $1`,
        [customer.id]
      );
      expect(journey.rows).toHaveLength(1);
    });
  });

  describe('Auto-infer email_opened', () => {
    it('có emailMessage và chưa có email_opened → tự động ghi email_opened, tăng open_count', async () => {
      const user = await createUser();
      const customer = await createCustomer({ userId: user.id });
      const campaign = await createCampaign({ userId: user.id });
      const emailMsg = await createEmailMessage({
        trackingToken: 'auto-open-token',
        campaignId: campaign.id,
        openCount: 0,
        status: 'sent',
      });
      const storageKey = 'uploads/test/auto-open.pdf';
      await createTemplateFile({ storageKey });

      const token = generateFileToken(storageKey, campaign.id, customer.id, null, null, 'auto-open-token');
      await request(app).get(`/track/attachment/${token}`);

      // email_opened event inferred
      const openEvents = await db.query(
        `SELECT event_data FROM customer_journey
         WHERE id_customer = $1 AND id_email_message = $2 AND event_type = 'email_opened'`,
        [customer.id, emailMsg.id]
      );
      expect(openEvents.rows).toHaveLength(1);
      expect(openEvents.rows[0].event_data).toMatchObject({
        inferred: true,
        source: 'attachment_download',
      });

      // email_messages.open_count tăng + status='opened'
      const { rows: emRows } = await db.query(
        `SELECT open_count, status, first_opened_at FROM email_messages WHERE id = $1`,
        [emailMsg.id]
      );
      expect(emRows[0].open_count).toBe(1);
      expect(emRows[0].status).toBe('opened');
      expect(emRows[0].first_opened_at).not.toBeNull();
    });

    it('đã có email_opened trước → KHÔNG ghi inferred event lần nữa', async () => {
      const user = await createUser();
      const customer = await createCustomer({ userId: user.id });
      const campaign = await createCampaign({ userId: user.id });
      const emailMsg = await createEmailMessage({
        trackingToken: 'already-opened-token',
        campaignId: campaign.id,
      });

      // Insert email_opened trước
      await db.query(
        `INSERT INTO customer_journey (id_customer, id_campaign, id_email_message, event_type, event_channel)
         VALUES ($1, $2, $3, 'email_opened', 'email')`,
        [customer.id, campaign.id, emailMsg.id]
      );

      const storageKey = 'uploads/test/already-opened.pdf';
      await createTemplateFile({ storageKey });
      const token = generateFileToken(storageKey, campaign.id, customer.id, null, null, 'already-opened-token');
      await request(app).get(`/track/attachment/${token}`);

      const openEvents = await db.query(
        `SELECT COUNT(*)::int AS c FROM customer_journey
         WHERE id_customer = $1 AND event_type = 'email_opened'`,
        [customer.id]
      );
      expect(openEvents.rows[0].c).toBe(1); // không tăng lên 2
    });
  });

  describe('Update campaign_customers counters', () => {
    it('có campaignId + auto-infer email_opened → tăng email_opened_count, set has_opened=TRUE', async () => {
      const user = await createUser();
      const customer = await createCustomer({ userId: user.id });
      const campaign = await createCampaign({ userId: user.id });

      // Pre-existing campaign_customer row
      await db.query(
        `INSERT INTO campaign_customers (id_campaign, id_customer, email_opened_count, has_opened)
         VALUES ($1, $2, 0, FALSE)`,
        [campaign.id, customer.id]
      );

      const emailMsg = await createEmailMessage({
        trackingToken: 'cc-counter-token',
        campaignId: campaign.id,
      });
      const storageKey = 'uploads/test/cc-counter.pdf';
      await createTemplateFile({ storageKey });

      const token = generateFileToken(storageKey, campaign.id, customer.id, null, null, 'cc-counter-token');
      await request(app).get(`/track/attachment/${token}`);

      const { rows } = await db.query(
        `SELECT email_opened_count, has_opened, last_activity_at FROM campaign_customers
         WHERE id_campaign = $1 AND id_customer = $2`,
        [campaign.id, customer.id]
      );
      expect(rows[0]).toMatchObject({
        email_opened_count: 1,
        has_opened: true,
      });
      expect(rows[0].last_activity_at).not.toBeNull();
      expect(emailMsg.id).toBeTruthy();
    });

    it('không có campaignId trong token → không update campaign_customers', async () => {
      const user = await createUser();
      const customer = await createCustomer({ userId: user.id });
      const campaign = await createCampaign({ userId: user.id });
      await db.query(
        `INSERT INTO campaign_customers (id_campaign, id_customer, email_opened_count, has_opened)
         VALUES ($1, $2, 0, FALSE)`,
        [campaign.id, customer.id]
      );

      const storageKey = 'uploads/test/no-camp.pdf';
      await createTemplateFile({ storageKey });
      const token = generateFileToken(storageKey, null, customer.id, null);
      await request(app).get(`/track/attachment/${token}`);

      const { rows } = await db.query(
        `SELECT email_opened_count, has_opened FROM campaign_customers
         WHERE id_campaign = $1 AND id_customer = $2`,
        [campaign.id, customer.id]
      );
      expect(rows[0]).toMatchObject({
        email_opened_count: 0,
        has_opened: false,
      });
    });
  });
});
