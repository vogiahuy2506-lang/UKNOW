/**
 * Integration tests cho:
 *   - GET /api/customers/:id/journey                    — timeline + summary
 *   - GET /api/customers/:id/campaign-participations    — danh sách campaign đã tham gia
 *
 * Phạm vi:
 *   - assertCustomerOwnership: 400 nếu id không hợp lệ, 404 nếu user khác.
 *   - getJourney: chỉ trả event có id_run IS NOT NULL.
 *   - Filter theo campaignId trên journey events + email messages + participations.
 *   - Derived email events (email_sent / email_opened / email_clicked) khi
 *     email_messages có sent_at + open_count/click_count > 0 và journey chưa có.
 *   - Timeline sort theo createdAt DESC.
 *   - Summary chứa `campaigns` + `emailJourney` array đúng shape.
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

async function createCustomer({ userId, email = 'a@u.local' }) {
  const { rows } = await db.query(`INSERT INTO customers (id_user, email) VALUES ($1, $2) RETURNING *`, [userId, email]);
  return rows[0];
}

async function createCampaign({ userId, name = 'C', status = 'running' }) {
  const { rows } = await db.query(
    `INSERT INTO campaigns (id_user, campaign_name, status) VALUES ($1, $2, $3) RETURNING *`,
    [userId, name, status]
  );
  return rows[0];
}

async function createRun({ campaignId, status = 'completed' }) {
  const { rows } = await db.query(
    `INSERT INTO campaign_runs (id_campaign, status, started_at) VALUES ($1, $2, NOW()) RETURNING *`,
    [campaignId, status]
  );
  return rows[0];
}

async function createJourneyEvent({ customerId, campaignId, runId, eventType, eventChannel = 'email', emailMessageId = null, eventAt = null, data = {} }) {
  const { rows } = await db.query(
    `INSERT INTO customer_journey (id_customer, id_campaign, id_run, event_type, event_channel, id_email_message, event_data, event_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, COALESCE($8, NOW())) RETURNING *`,
    [customerId, campaignId, runId, eventType, eventChannel, emailMessageId, JSON.stringify(data), eventAt]
  );
  return rows[0];
}

async function createEmailMessage({ customerId, campaignId, runId, subject = 'Subj', status = 'sent', openCount = 0, clickCount = 0, sentAt = null }) {
  const { rows } = await db.query(
    `INSERT INTO email_messages (id_customer, id_campaign, id_run, subject, status, open_count, click_count, sent_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, NOW())) RETURNING *`,
    [customerId, campaignId, runId, subject, status, openCount, clickCount, sentAt]
  );
  return rows[0];
}

// ─────────────────────────────────────────────────────────────────────────
describe('GET /api/customers/:id/journey', () => {
  it('customer không tồn tại → 404', async () => {
    const user = await createUser();
    const token = await loginAs(user);
    const res = await request(app).get('/api/customers/999999/journey').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('customer của user khác → 404 (isolation)', async () => {
    const userA = await createUser();
    const userB = await createUser();
    const cu = await createCustomer({ userId: userA.id });
    const tokenB = await loginAs(userB);
    const res = await request(app).get(`/api/customers/${cu.id}/journey`).set('Authorization', `Bearer ${tokenB}`);
    expect(res.status).toBe(404);
  });

  it('id không hợp lệ (NaN) → 400', async () => {
    const user = await createUser();
    const token = await loginAs(user);
    const res = await request(app).get('/api/customers/abc/journey').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('chỉ trả journey event có id_run IS NOT NULL', async () => {
    const user = await createUser();
    const cu = await createCustomer({ userId: user.id });
    const camp = await createCampaign({ userId: user.id });
    const run = await createRun({ campaignId: camp.id });
    // event with run
    await createJourneyEvent({ customerId: cu.id, campaignId: camp.id, runId: run.id, eventType: 'email_opened' });
    // event WITHOUT run — phải bị bỏ qua
    await createJourneyEvent({ customerId: cu.id, campaignId: camp.id, runId: null, eventType: 'email_opened' });

    const token = await loginAs(user);
    const res = await request(app).get(`/api/customers/${cu.id}/journey`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  it('filter ?campaignId — chỉ lấy events + emails + participations của campaign đó', async () => {
    const user = await createUser();
    const cu = await createCustomer({ userId: user.id });
    const c1 = await createCampaign({ userId: user.id, name: 'C1' });
    const c2 = await createCampaign({ userId: user.id, name: 'C2' });
    const run1 = await createRun({ campaignId: c1.id });
    const run2 = await createRun({ campaignId: c2.id });
    await createJourneyEvent({ customerId: cu.id, campaignId: c1.id, runId: run1.id, eventType: 'email_opened' });
    await createJourneyEvent({ customerId: cu.id, campaignId: c2.id, runId: run2.id, eventType: 'email_opened' });

    const token = await loginAs(user);
    const res = await request(app).get(`/api/customers/${cu.id}/journey?campaignId=${c1.id}`).set('Authorization', `Bearer ${token}`);
    expect(res.body.data).toHaveLength(1);
    expect(Number(res.body.data[0].campaignId)).toBe(Number(c1.id));
  });

  it('derived email_sent event khi email có sent_at và journey chưa có', async () => {
    const user = await createUser();
    const cu = await createCustomer({ userId: user.id });
    const camp = await createCampaign({ userId: user.id });
    const run = await createRun({ campaignId: camp.id });
    await createEmailMessage({ customerId: cu.id, campaignId: camp.id, runId: run.id, subject: 'Hello', openCount: 0 });

    const token = await loginAs(user);
    const res = await request(app).get(`/api/customers/${cu.id}/journey`).set('Authorization', `Bearer ${token}`);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].eventType).toBe('email_sent');
    expect(res.body.data[0].description).toMatch(/Đã gửi email "Hello"/);
  });

  it('derived email_opened + email_clicked khi counters > 0', async () => {
    const user = await createUser();
    const cu = await createCustomer({ userId: user.id });
    const camp = await createCampaign({ userId: user.id });
    const run = await createRun({ campaignId: camp.id });
    await createEmailMessage({
      customerId: cu.id,
      campaignId: camp.id,
      runId: run.id,
      subject: 'Promo',
      openCount: 3,
      clickCount: 2,
      sentAt: new Date(Date.now() - 60000),
    });

    const token = await loginAs(user);
    const res = await request(app).get(`/api/customers/${cu.id}/journey`).set('Authorization', `Bearer ${token}`);
    // Should have 3 events: email_sent, email_opened, email_clicked
    const types = res.body.data.map((e) => e.eventType).sort();
    expect(types).toEqual(['email_clicked', 'email_opened', 'email_sent']);
  });

  it('không tạo derived email_sent nếu journey đã có sự kiện email_sent cho cùng message', async () => {
    const user = await createUser();
    const cu = await createCustomer({ userId: user.id });
    const camp = await createCampaign({ userId: user.id });
    const run = await createRun({ campaignId: camp.id });
    const em = await createEmailMessage({ customerId: cu.id, campaignId: camp.id, runId: run.id, openCount: 0 });
    await createJourneyEvent({
      customerId: cu.id,
      campaignId: camp.id,
      runId: run.id,
      eventType: 'email_sent',
      emailMessageId: em.id,
    });

    const token = await loginAs(user);
    const res = await request(app).get(`/api/customers/${cu.id}/journey`).set('Authorization', `Bearer ${token}`);
    // Chỉ event có sẵn — không thêm derived
    expect(res.body.data).toHaveLength(1);
  });

  it('timeline được sort DESC theo createdAt', async () => {
    const user = await createUser();
    const cu = await createCustomer({ userId: user.id });
    const camp = await createCampaign({ userId: user.id });
    const run = await createRun({ campaignId: camp.id });
    const e1 = await createJourneyEvent({
      customerId: cu.id, campaignId: camp.id, runId: run.id, eventType: 'email_opened',
      eventAt: new Date('2025-01-01T00:00:00Z'),
    });
    const e2 = await createJourneyEvent({
      customerId: cu.id, campaignId: camp.id, runId: run.id, eventType: 'email_clicked',
      eventAt: new Date('2025-02-01T00:00:00Z'),
    });

    const token = await loginAs(user);
    const res = await request(app).get(`/api/customers/${cu.id}/journey`).set('Authorization', `Bearer ${token}`);
    expect(Number(res.body.data[0].id)).toBe(Number(e2.id));
    expect(Number(res.body.data[1].id)).toBe(Number(e1.id));
  });

  it('summary có campaigns + emailJourney đúng shape', async () => {
    const user = await createUser();
    const cu = await createCustomer({ userId: user.id });
    const camp = await createCampaign({ userId: user.id, name: 'Promo X' });
    const run = await createRun({ campaignId: camp.id });
    await db.query(
      `INSERT INTO campaign_customers (id_campaign, id_customer, email_received_count, has_opened, joined_at, last_activity_at)
       VALUES ($1, $2, 5, TRUE, NOW(), NOW())`,
      [camp.id, cu.id]
    );
    await createEmailMessage({ customerId: cu.id, campaignId: camp.id, runId: run.id, subject: 'Welcome', openCount: 1 });

    const token = await loginAs(user);
    const res = await request(app).get(`/api/customers/${cu.id}/journey`).set('Authorization', `Bearer ${token}`);
    expect(res.body.summary.campaigns).toHaveLength(1);
    expect(res.body.summary.campaigns[0]).toMatchObject({
      campaignName: 'Promo X',
      emailReceivedCount: 5,
      hasOpened: true,
    });
    expect(res.body.summary.emailJourney).toHaveLength(1);
    expect(res.body.summary.emailJourney[0]).toMatchObject({
      subject: 'Welcome',
      openCount: 1,
      hasOpened: true,
      hasClicked: false,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('GET /api/customers/:id/campaign-participations', () => {
  it('404 khi customer của user khác', async () => {
    const userA = await createUser();
    const userB = await createUser();
    const cu = await createCustomer({ userId: userA.id });
    const tokenB = await loginAs(userB);
    const res = await request(app)
      .get(`/api/customers/${cu.id}/campaign-participations`)
      .set('Authorization', `Bearer ${tokenB}`);
    expect(res.status).toBe(404);
  });

  it('trả mảng rỗng khi customer chưa join campaign nào', async () => {
    const user = await createUser();
    const cu = await createCustomer({ userId: user.id });
    const token = await loginAs(user);
    const res = await request(app)
      .get(`/api/customers/${cu.id}/campaign-participations`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('chỉ trả campaign thuộc về user (id_user filter)', async () => {
    const userA = await createUser();
    const userB = await createUser();
    const cu = await createCustomer({ userId: userA.id });
    const c1 = await createCampaign({ userId: userA.id, name: 'A1' });
    const c2 = await createCampaign({ userId: userB.id, name: 'B1' });

    // Khách hàng của userA "tham gia" cả 2 campaign (bất hợp lý về domain nhưng test isolation)
    await db.query(`INSERT INTO campaign_customers (id_campaign, id_customer) VALUES ($1, $2), ($3, $2)`, [c1.id, cu.id, c2.id]);

    const tokenA = await loginAs(userA);
    const res = await request(app)
      .get(`/api/customers/${cu.id}/campaign-participations`)
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].campaignName).toBe('A1');
  });

  it('shape: {campaignId, campaignName, joinedAt, emailReceivedCount, hasOpened, hasClicked, lastActivityAt}', async () => {
    const user = await createUser();
    const cu = await createCustomer({ userId: user.id });
    const camp = await createCampaign({ userId: user.id, name: 'CampZ' });
    await db.query(
      `INSERT INTO campaign_customers (id_campaign, id_customer, email_received_count, has_opened, has_clicked, joined_at, last_activity_at)
       VALUES ($1, $2, 7, TRUE, FALSE, NOW(), NOW())`,
      [camp.id, cu.id]
    );

    const token = await loginAs(user);
    const res = await request(app)
      .get(`/api/customers/${cu.id}/campaign-participations`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.data[0]).toMatchObject({
      campaignName: 'CampZ',
      emailReceivedCount: 7,
      hasOpened: true,
      hasClicked: false,
    });
    expect(res.body.data[0].joinedAt).toBeTruthy();
    expect(res.body.data[0].lastActivityAt).toBeTruthy();
  });

  it('sort DESC theo last_activity_at NULLS LAST', async () => {
    const user = await createUser();
    const cu = await createCustomer({ userId: user.id });
    const cOld = await createCampaign({ userId: user.id, name: 'Old' });
    const cNew = await createCampaign({ userId: user.id, name: 'New' });
    const cNoActivity = await createCampaign({ userId: user.id, name: 'Empty' });
    await db.query(
      `INSERT INTO campaign_customers (id_campaign, id_customer, last_activity_at, joined_at) VALUES
        ($1, $2, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'),
        ($3, $2, '2025-06-01T00:00:00Z', '2025-06-01T00:00:00Z'),
        ($4, $2, NULL, '2025-03-01T00:00:00Z')`,
      [cOld.id, cu.id, cNew.id, cNoActivity.id]
    );

    const token = await loginAs(user);
    const res = await request(app)
      .get(`/api/customers/${cu.id}/campaign-participations`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.data.map((c) => c.campaignName)).toEqual(['New', 'Old', 'Empty']);
  });
});
