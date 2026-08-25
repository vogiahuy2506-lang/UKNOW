/**
 * Integration: plan send-quota (messages_per_period + inbox manual reply).
 */
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { truncateAll, createUser, createPlan, assignPlanToUser } from './helpers/db.js';
import { checkSendQuota } from '../../src/utils/userSendLimit.util.js';

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
  if (!res.body?.data?.accessToken) {
    throw new Error(`Login fail: ${JSON.stringify(res.body)}`);
  }
  return res.body.data.accessToken;
}

async function addInboxMembership(ownerId, employeeId) {
  const { rows } = await db.query(
    `INSERT INTO user_members (owner_id, employee_id, permissions, status, created_at, updated_at)
     VALUES ($1, $2, $3::jsonb, 'active', NOW(), NOW())
     RETURNING id`,
    [ownerId, employeeId, JSON.stringify({ inbox_view: true, inbox_reply: true })]
  );
  return rows[0];
}

async function seedQuotaUser({ messagesPerPeriod = 1, monthlyEmailLimit = 100, monthlyZaloLimit = 100 } = {}) {
  const user = await createUser({ username: `quota_${Date.now()}_${Math.floor(Math.random() * 1000)}` });
  const plan = await createPlan({
    messagesPerPeriod,
    monthlyEmailLimit,
    monthlyZaloLimit,
    dailyEmailLimit: null,
    dailyZaloLimit: null,
  });
  await assignPlanToUser(user.id, plan.id);
  await db.query(
    `UPDATE users SET subscription_expires_at = NOW() + interval '15 days' WHERE id = $1`,
    [user.id]
  );
  return { user, plan };
}

describe('send quota — messages_per_period', () => {
  it('checkSendQuota deny period khi đã gửi đủ tổng tin trong kỳ', async () => {
    const { user } = await seedQuotaUser({ messagesPerPeriod: 1 });

    const { rows: campaigns } = await db.query(
      `INSERT INTO campaigns (id_user, campaign_name, campaign_type, status)
       VALUES ($1, 'Quota campaign', 'email', 'draft')
       RETURNING id`,
      [user.id]
    );
    const campaignId = campaigns[0].id;

    await db.query(
      `INSERT INTO email_messages (id_campaign, recipient_email, status, sent_at)
       VALUES ($1, 'a@test.local', 'sent', NOW())`,
      [campaignId]
    );

    const quota = await checkSendQuota({ userId: user.id, channel: 'zalo' });
    expect(quota.allowed).toBe(false);
    expect(quota.limitType).toBe('period');
    expect(quota.resetAt).toBeInstanceOf(Date);
  });

  it('POST inbox zalo_personal reply → 403 RESOURCE_LIMIT_EXCEEDED khi vượt period', async () => {
    const { user } = await seedQuotaUser({ messagesPerPeriod: 1 });
    const token = await loginAs(user);

    const { rows: campaigns } = await db.query(
      `INSERT INTO campaigns (id_user, campaign_name, campaign_type, status)
       VALUES ($1, 'Quota campaign', 'email', 'draft')
       RETURNING id`,
      [user.id]
    );
    await db.query(
      `INSERT INTO email_messages (id_campaign, recipient_email, status, sent_at)
       VALUES ($1, 'a@test.local', 'sent', NOW())`,
      [campaigns[0].id]
    );

    const res = await request(app)
      .post('/api/ai/chatbot/inbox/conversations/1/messages')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'zalo_personal', content: 'Xin chào' });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('RESOURCE_LIMIT_EXCEEDED');
    expect(res.body.upgradeRequired).toBe(true);
    expect(res.body.resource).toBe('zalo_send');
  });

  it('POST inbox zalo_personal reply → 200 + metadata source=manual_inbox khi còn hạn mức', async () => {
    const { user } = await seedQuotaUser({ messagesPerPeriod: 10 });
    const token = await loginAs(user);

    const { rows: accounts } = await db.query(
      `INSERT INTO zalo_settings (id_user, display_name, status, is_active)
       VALUES ($1, 'TK test', 'disconnected', TRUE)
       RETURNING id`,
      [user.id]
    );
    const accountId = accounts[0].id;

    const { rows: convs } = await db.query(
      `INSERT INTO zalo_personal_conversations (id_user, id_zalo_setting, external_id, visitor_name)
       VALUES ($1, $2, 'uid_test_1', 'Khách test')
       RETURNING id`,
      [user.id, accountId]
    );
    const conversationId = convs[0].id;

    const res = await request(app)
      .post(`/api/ai/chatbot/inbox/conversations/${conversationId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'zalo_personal', content: 'Trả lời tay từ inbox' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const { rows: messages } = await db.query(
      `SELECT role, content, metadata->>'source' AS source
       FROM zalo_personal_messages
       WHERE id_conversation = $1
       ORDER BY id DESC
       LIMIT 1`,
      [conversationId]
    );
    expect(messages[0].role).toBe('agent');
    expect(messages[0].content).toBe('Trả lời tay từ inbox');
    expect(messages[0].source).toBe('manual_inbox');
  });

  it('employee reply is stored in owner workspace with actor and membership attribution', async () => {
    const { user: owner } = await seedQuotaUser({ messagesPerPeriod: 10 });
    const employee = await createUser({ username: `inbox_employee_${Date.now()}` });
    const membership = await addInboxMembership(owner.id, employee.id);
    const token = await loginAs(employee);

    const { rows: accounts } = await db.query(
      `INSERT INTO zalo_settings (id_user, display_name, status, is_active)
       VALUES ($1, 'Owner inbox', 'disconnected', TRUE)
       RETURNING id`,
      [owner.id]
    );
    const { rows: conversations } = await db.query(
      `INSERT INTO zalo_personal_conversations (id_user, id_zalo_setting, external_id, visitor_name)
       VALUES ($1, $2, 'uid_employee_reply', 'Khách employee')
       RETURNING id`,
      [owner.id, accounts[0].id]
    );

    const response = await request(app)
      .post(`/api/ai/chatbot/inbox/conversations/${conversations[0].id}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Owner-Context', String(owner.id))
      .send({ type: 'zalo_personal', content: 'Nhân viên trả lời' });
    expect(response.status).toBe(200);

    const { rows: messages } = await db.query(
      `SELECT id_user,
              metadata->>'source' AS source,
              metadata->>'actor_user_id' AS actor_user_id,
              metadata->>'membership_id' AS membership_id
       FROM zalo_personal_messages
       WHERE id_conversation = $1
       ORDER BY id DESC LIMIT 1`,
      [conversations[0].id]
    );
    expect(Number(messages[0].id_user)).toBe(Number(owner.id));
    expect(messages[0].source).toBe('manual_inbox');
    expect(Number(messages[0].actor_user_id)).toBe(Number(employee.id));
    expect(Number(messages[0].membership_id)).toBe(Number(membership.id));

    const { rows: conversationRows } = await db.query(
      `SELECT ai_paused, ai_paused_at
       FROM zalo_personal_conversations
       WHERE id = $1`,
      [conversations[0].id]
    );
    expect(conversationRows[0].ai_paused).toBe(true);
    expect(conversationRows[0].ai_paused_at).toBeInstanceOf(Date);

    const { rows: auditRows } = await db.query(
      `SELECT id_user, owner_id, action
       FROM audit_logs
       WHERE action = 'INBOX_REPLY_SENT'
       ORDER BY id DESC LIMIT 1`
    );
    expect(Number(auditRows[0].id_user)).toBe(Number(employee.id));
    expect(Number(auditRows[0].owner_id)).toBe(Number(owner.id));
  });
});
