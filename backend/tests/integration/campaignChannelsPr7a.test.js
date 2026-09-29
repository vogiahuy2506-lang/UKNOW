/**
 * PLAN_PR7_NODE_TELEGRAM_TRINH_DUNG_2026-09-28 Việc 1+2 — API cho trình dựng biết kênh nào đang
 * bật + danh sách tài khoản Telegram để chọn khi soạn node.
 */
import { beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { createUser, truncateAll } from './helpers/db.js';

let app;

beforeEach(async () => {
  await truncateAll();
  delete process.env.CAMPAIGN_CHANNEL_TELEGRAM_ENABLED;
  app = createApp();
});

async function loginAs(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: user.username, password: user.plainPassword });
  return res.body.data.accessToken;
}

async function insertTelegramAccount({ userId, telegramUserId, isActive = true, firstName = 'Bot', username = null }) {
  const { rows } = await db.query(
    `INSERT INTO telegram_accounts (id_user, telegram_user_id, phone, first_name, username, is_active)
     VALUES ($1, $2, '+84900000000', $3, $4, $5) RETURNING *`,
    [userId, telegramUserId, firstName, username, isActive]
  );
  return rows[0];
}

describe('GET /api/campaigns/channels', () => {
  it('cờ tắt (mặc định) -> channels rỗng', async () => {
    const owner = await createUser({ username: `pr7a_owner_${Date.now()}` });
    const token = await loginAs(owner);

    const res = await request(app)
      .get('/api/campaigns/channels')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.channels).toEqual([]);
  });

  it('cờ bật -> có telegram, key/sendNodeSubtype/label đúng, KHÔNG lộ policy', async () => {
    process.env.CAMPAIGN_CHANNEL_TELEGRAM_ENABLED = 'true';
    const owner = await createUser({ username: `pr7a_owner2_${Date.now()}` });
    const token = await loginAs(owner);

    const res = await request(app)
      .get('/api/campaigns/channels')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.channels).toEqual([
      { key: 'telegram', sendNodeSubtype: 'send_telegram', label: 'Telegram' },
    ]);
    delete process.env.CAMPAIGN_CHANNEL_TELEGRAM_ENABLED;
  });

  it('chưa đăng nhập -> 401', async () => {
    const res = await request(app).get('/api/campaigns/channels');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/campaigns/channels/telegram/accounts', () => {
  it('chủ tự xem tài khoản Telegram của mình -> chỉ is_active, không lộ phone/telegram_user_id', async () => {
    const owner = await createUser({ username: `pr7a_owner3_${Date.now()}` });
    const token = await loginAs(owner);

    const active = await insertTelegramAccount({ userId: owner.id, telegramUserId: '111', firstName: 'Alice' });
    await insertTelegramAccount({ userId: owner.id, telegramUserId: '222', isActive: false, firstName: 'Inactive' });

    const res = await request(app)
      .get('/api/campaigns/channels/telegram/accounts')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      { id: active.id, name: 'Alice', username: null, openConversationCount: 0 },
    ]);
    expect(JSON.stringify(res.body)).not.toContain('900000000');
    expect(JSON.stringify(res.body)).not.toContain('"telegram_user_id"');
  });

  it('openConversationCount đúng từng tài khoản: chỉ đếm hội thoại status=open của CHÍNH tài khoản đó', async () => {
    const owner = await createUser({ username: `pr7a_owner_cnt_${Date.now()}` });
    const token = await loginAs(owner);
    const busy = await insertTelegramAccount({ userId: owner.id, telegramUserId: '801', firstName: 'Busy' });
    const empty = await insertTelegramAccount({ userId: owner.id, telegramUserId: '802', firstName: 'Empty' });
    const onlyClosed = await insertTelegramAccount({ userId: owner.id, telegramUserId: '803', firstName: 'Closed' });
    const insertConv = (accountId, externalId, status) => db.query(
      `INSERT INTO telegram_personal_conversations (id_user, id_telegram_account, external_id, status)
       VALUES ($1, $2, $3, $4)`,
      [owner.id, accountId, externalId, status]
    );
    await insertConv(busy.id, '1001', 'open');
    await insertConv(busy.id, '1002', 'open');
    await insertConv(busy.id, '1003', 'closed');
    await insertConv(onlyClosed.id, '1004', 'closed');

    const res = await request(app)
      .get('/api/campaigns/channels/telegram/accounts')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const byId = Object.fromEntries(res.body.data.map((a) => [a.id, a.openConversationCount]));
    expect(byId[busy.id]).toBe(2);
    expect(byId[empty.id]).toBe(0);
    expect(byId[onlyClosed.id]).toBe(0);
  });

  it('name rỗng (không first/last name) -> rơi về username, rồi Telegram #id', async () => {
    const owner = await createUser({ username: `pr7a_owner4_${Date.now()}` });
    const token = await loginAs(owner);
    await db.query(
      `INSERT INTO telegram_accounts (id_user, telegram_user_id, phone, username, is_active)
       VALUES ($1, '333', '+84900000001', 'bot_user', true)`,
      [owner.id]
    );
    const noNameNoUsername = await insertTelegramAccount({ userId: owner.id, telegramUserId: '444', firstName: null });

    const res = await request(app)
      .get('/api/campaigns/channels/telegram/accounts')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const byId = Object.fromEntries(res.body.data.map((a) => [a.id, a]));
    expect(byId[noNameNoUsername.id].name).toBe(`Telegram #${noNameNoUsername.id}`);
    const withUsername = res.body.data.find((a) => a.username === 'bot_user');
    expect(withUsername.name).toBe('bot_user');
  });

  it('nhân viên có campaigns_create (không có chatbot_channels_manage) -> vẫn thấy tài khoản CỦA CHỦ', async () => {
    const owner = await createUser({ username: `pr7a_owner5_${Date.now()}` });
    const employee = await createUser({ username: `pr7a_emp5_${Date.now()}` });
    await db.query(
      `INSERT INTO user_members (owner_id, employee_id, permissions, status, created_at, updated_at)
       VALUES ($1, $2, $3::jsonb, 'active', NOW(), NOW())`,
      [owner.id, employee.id, JSON.stringify({ campaigns_create: true })]
    );
    const account = await insertTelegramAccount({ userId: owner.id, telegramUserId: '555', firstName: 'Owner Bot' });
    const empToken = await loginAs(employee);

    const res = await request(app)
      .get('/api/campaigns/channels/telegram/accounts')
      .set('Authorization', `Bearer ${empToken}`)
      .set('X-Owner-Context', String(owner.id));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([{ id: account.id, name: 'Owner Bot', username: null, openConversationCount: 0 }]);
  });

  it('nhân viên KHÔNG có quyền chiến dịch nào -> 403', async () => {
    const owner = await createUser({ username: `pr7a_owner6_${Date.now()}` });
    const employee = await createUser({ username: `pr7a_emp6_${Date.now()}` });
    await db.query(
      `INSERT INTO user_members (owner_id, employee_id, permissions, status, created_at, updated_at)
       VALUES ($1, $2, $3::jsonb, 'active', NOW(), NOW())`,
      [owner.id, employee.id, JSON.stringify({})]
    );
    const empToken = await loginAs(employee);

    const res = await request(app)
      .get('/api/campaigns/channels/telegram/accounts')
      .set('Authorization', `Bearer ${empToken}`)
      .set('X-Owner-Context', String(owner.id));

    expect(res.status).toBe(403);
  });
});

describe('GET /api/campaigns/channels/telegram/accounts/:id/groups — PR-E2', () => {
  it('tài khoản của workspace KHÁC -> 404', async () => {
    const owner = await createUser({ username: `pre2_owner_${Date.now()}` });
    const other = await createUser({ username: `pre2_other_${Date.now()}` });
    const token = await loginAs(owner);
    const foreign = await insertTelegramAccount({ userId: other.id, telegramUserId: '9001' });

    const res = await request(app)
      .get(`/api/campaigns/channels/telegram/accounts/${foreign.id}/groups`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('tài khoản của mình nhưng không còn phiên đăng nhập -> 409 kèm câu đăng nhập lại', async () => {
    const owner = await createUser({ username: `pre2_owner2_${Date.now()}` });
    const token = await loginAs(owner);
    const mine = await insertTelegramAccount({ userId: owner.id, telegramUserId: '9002' });

    const res = await request(app)
      .get(`/api/campaigns/channels/telegram/accounts/${mine.id}/groups`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(409);
    expect(res.body.message).toContain('đăng nhập lại');
  });

  it('chưa đăng nhập -> 401', async () => {
    const res = await request(app).get('/api/campaigns/channels/telegram/accounts/1/groups');
    expect(res.status).toBe(401);
  });
});
