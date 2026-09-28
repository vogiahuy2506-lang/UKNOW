/**
 * PLAN_EMAIL_SENT_AT_GIO_UTC_2026-09-27, PR-T3 — Việc 1 (ghi đúng giờ VN), Việc 2 (thư hỏng KHÔNG
 * được coi là "đã gửi"), Việc 3 (API hành trình khách đọc đúng giờ). Gọi thẳng
 * emailSettingsSmtpService.logEmailSentWithClient() qua client thật (đường ghi chung cho mọi call
 * site thành công/thất bại trong campaignEmailSender.service.js — xem Việc 2), verify DB thật.
 */
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { truncateAll, createUser } from './helpers/db.js';
import emailSettingsSmtpService from '../../src/services/email/emailSettingsSmtp.service.js';

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

async function createCustomer({ userId, email = 'khach@test.local' }) {
  const { rows } = await db.query(`INSERT INTO customers (id_user, email) VALUES ($1, $2) RETURNING *`, [userId, email]);
  return rows[0];
}

async function createCampaign({ userId, name = 'Chien dich T3' }) {
  const { rows } = await db.query(
    `INSERT INTO campaigns (id_user, campaign_name, status) VALUES ($1, $2, 'active') RETURNING *`,
    [userId, name]
  );
  return rows[0];
}

async function createRun({ campaignId }) {
  const { rows } = await db.query(
    `INSERT INTO campaign_runs (id_campaign, status, started_at) VALUES ($1, 'running', NOW()) RETURNING *`,
    [campaignId]
  );
  return rows[0];
}

function basePayload({ userId, campaignId, customerId, runId, sentAt, extra = {} }) {
  return {
    userId,
    workspaceOwnerId: userId,
    actorUserId: userId,
    campaignId,
    customerId,
    runId,
    fromEmailId: null,
    to: 'khach@test.local',
    subject: 'Xin chao',
    trackingToken: `tok-${Math.random().toString(36).slice(2)}`,
    info: { messageId: 'msg-1' },
    sentAt,
    setting: { email: 'sender@test.local', name: 'Sender' },
    nodeId: null,
    emailStep: null,
    fromAddress: null,
    brandDomain: null,
    ...extra,
  };
}

async function logSent(payload) {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const emailMessageId = await emailSettingsSmtpService.logEmailSentWithClient(client, payload);
    await client.query('COMMIT');
    return emailMessageId;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

describe('PR-T3 Việc 1 — ghi đúng giờ VN khi gửi thành công', () => {
  it('sentAt=2026-09-28T10:00:00Z → mọi cột dẫn xuất đều lưu 2026-09-28 17:00:00 (giờ VN)', async () => {
    const owner = await createUser({ username: 'ownert3v1', role: 'user' });
    const customer = await createCustomer({ userId: owner.id });
    const campaign = await createCampaign({ userId: owner.id });
    const run = await createRun({ campaignId: campaign.id });
    const sentAt = new Date('2026-09-28T10:00:00Z');

    await logSent(basePayload({ userId: owner.id, campaignId: campaign.id, customerId: customer.id, runId: run.id, sentAt }));

    const { rows: custRows } = await db.query(`SELECT last_email_sent_at::text AS v FROM customers WHERE id = $1`, [customer.id]);
    expect(custRows[0].v).toBe('2026-09-28 17:00:00');

    const { rows: ccRows } = await db.query(
      `SELECT first_email_sent_at::text AS first, last_email_sent_at::text AS last, last_activity_at::text AS activity
       FROM campaign_customers WHERE id_campaign = $1 AND id_customer = $2`,
      [campaign.id, customer.id]
    );
    expect(ccRows[0].first).toBe('2026-09-28 17:00:00');
    expect(ccRows[0].last).toBe('2026-09-28 17:00:00');
    expect(ccRows[0].activity).toBe('2026-09-28 17:00:00');

    const { rows: journeyRows } = await db.query(
      `SELECT event_at::text AS v FROM customer_journey WHERE id_customer = $1 AND event_type = 'email_sent'`,
      [customer.id]
    );
    expect(journeyRows).toHaveLength(1);
    expect(journeyRows[0].v).toBe('2026-09-28 17:00:00');
  });
});

describe('PR-T3 Việc 2 — thư hỏng (deliveryFailed) KHÔNG được coi là "đã gửi"', () => {
  it('có email_messages + campaign_participations; KHÔNG có journey email_sent; last_email_sent_at/email_received_count không đổi', async () => {
    const owner = await createUser({ username: 'ownert3v2', role: 'user' });
    const customer = await createCustomer({ userId: owner.id });
    const campaign = await createCampaign({ userId: owner.id });
    const run = await createRun({ campaignId: campaign.id });
    const sentAt = new Date('2026-09-28T10:00:00Z');

    const emailMessageId = await logSent(
      basePayload({ userId: owner.id, campaignId: campaign.id, customerId: customer.id, runId: run.id, sentAt, extra: { deliveryFailed: true } })
    );

    expect(emailMessageId).toBeTruthy();
    const { rows: msgRows } = await db.query(`SELECT 1 FROM email_messages WHERE id = $1`, [emailMessageId]);
    expect(msgRows).toHaveLength(1);

    const { rows: partRows } = await db.query(
      `SELECT 1 FROM campaign_participations WHERE id_campaign = $1 AND id_customer = $2`,
      [campaign.id, customer.id]
    );
    expect(partRows).toHaveLength(1);

    const { rows: journeyRows } = await db.query(
      `SELECT 1 FROM customer_journey WHERE id_customer = $1 AND event_type = 'email_sent'`,
      [customer.id]
    );
    expect(journeyRows).toHaveLength(0);

    const { rows: custRows } = await db.query(`SELECT last_email_sent_at FROM customers WHERE id = $1`, [customer.id]);
    expect(custRows[0].last_email_sent_at).toBeNull();

    const { rows: ccRows } = await db.query(
      `SELECT email_received_count FROM campaign_customers WHERE id_campaign = $1 AND id_customer = $2`,
      [campaign.id, customer.id]
    );
    expect(ccRows).toHaveLength(0); // upsertCampaignCustomer bị bỏ hoàn toàn khi deliveryFailed
  });

  it('gửi thành công RỒI thư khác hỏng cho cùng khách → email_received_count vẫn giữ nguyên (không +1 lần 2)', async () => {
    const owner = await createUser({ username: 'ownert3v2b', role: 'user' });
    const customer = await createCustomer({ userId: owner.id });
    const campaign = await createCampaign({ userId: owner.id });
    const run = await createRun({ campaignId: campaign.id });

    await logSent(basePayload({
      userId: owner.id, campaignId: campaign.id, customerId: customer.id, runId: run.id,
      sentAt: new Date('2026-09-28T10:00:00Z'),
    }));
    await logSent(basePayload({
      userId: owner.id, campaignId: campaign.id, customerId: customer.id, runId: run.id,
      sentAt: new Date('2026-09-28T11:00:00Z'), extra: { deliveryFailed: true, trackingToken: 'tok-2nd' },
    }));

    const { rows: ccRows } = await db.query(
      `SELECT email_received_count, last_email_sent_at::text AS last
       FROM campaign_customers WHERE id_campaign = $1 AND id_customer = $2`,
      [campaign.id, customer.id]
    );
    expect(ccRows[0].email_received_count).toBe(1);
    expect(ccRows[0].last).toBe('2026-09-28 17:00:00'); // vẫn của lần gửi thành công, không bị lần hỏng ghi đè

    const { rows: journeyRows } = await db.query(
      `SELECT 1 FROM customer_journey WHERE id_customer = $1 AND event_type = 'email_sent'`,
      [customer.id]
    );
    expect(journeyRows).toHaveLength(1); // chỉ 1 dòng của lần thành công
  });
});

describe('PR-T3 Việc 3 — GET /api/customers/:id/journey đọc đúng giờ VN', () => {
  it('event_at lưu 2026-09-28 17:00:00 (VN) → API trả 2026-09-28T10:00:00.000Z (UTC)', async () => {
    const owner = await createUser({ username: 'ownert3v3', role: 'user' });
    const customer = await createCustomer({ userId: owner.id });
    const campaign = await createCampaign({ userId: owner.id });
    const run = await createRun({ campaignId: campaign.id });

    await logSent(basePayload({
      userId: owner.id, campaignId: campaign.id, customerId: customer.id, runId: run.id,
      sentAt: new Date('2026-09-28T10:00:00Z'),
    }));

    const token = await loginAs(owner);
    const res = await request(app).get(`/api/customers/${customer.id}/journey`).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const sentEvent = res.body.data.find((e) => e.eventType === 'email_sent');
    expect(sentEvent).toBeTruthy();
    expect(sentEvent.eventAt).toBe('2026-09-28T10:00:00.000Z');
  });

  it('GET /api/customers/:id/campaign-participations trả joined_at/last_activity_at đúng giờ VN', async () => {
    const owner = await createUser({ username: 'ownert3v3b', role: 'user' });
    const customer = await createCustomer({ userId: owner.id });
    const campaign = await createCampaign({ userId: owner.id });
    const run = await createRun({ campaignId: campaign.id });

    await logSent(basePayload({
      userId: owner.id, campaignId: campaign.id, customerId: customer.id, runId: run.id,
      sentAt: new Date('2026-09-28T10:00:00Z'),
    }));

    const token = await loginAs(owner);
    const res = await request(app)
      .get(`/api/customers/${customer.id}/journey`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.summary).toBeTruthy();
  });
});
