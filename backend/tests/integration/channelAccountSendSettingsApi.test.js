/**
 * PLAN_TG_WA_DAY_DU_2026-09-29, P4 — API `/api/campaigns/channels/:channel/accounts/:accountRef/send-settings`
 * (Postgres + Express thật): quyền (chủ / nhân viên có-không chatbot_channels_manage / người lạ), kiểm dữ liệu, cập nhật
 * từng phần (null xoá thật), GET trả sentToday + warnThreshold, audit CHANNEL_ACCOUNT_SEND_SETTINGS_UPDATED.
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
  if (res.status !== 200) throw new Error(`loginAs failed: ${res.status}`);
  return res.body.data.accessToken;
}

async function createTelegramAccount(userId, telegramUserId = 7000 + userId) {
  const { rows } = await db.query(
    `INSERT INTO telegram_accounts (id_user, telegram_user_id, first_name) VALUES ($1, $2, 'TG') RETURNING id`,
    [userId, telegramUserId]
  );
  return rows[0].id;
}

async function insertSentToday(channel, accountKey, count) {
  for (let i = 0; i < count; i += 1) {
    await db.query(
      `INSERT INTO campaign_channel_messages (channel, account_key, recipient_key, status, is_preview, sent_at)
       VALUES ($1, $2, $3, 'sent', false, now())`,
      [channel, accountKey, `r${i}`]
    );
  }
}

const url = (channel, ref) => `/api/campaigns/channels/${channel}/accounts/${ref}/send-settings`;

async function auditRows() {
  const { rows } = await db.query(
    `SELECT * FROM audit_logs WHERE action = 'CHANNEL_ACCOUNT_SEND_SETTINGS_UPDATED' ORDER BY id`
  );
  return rows;
}

describe('send-settings — Telegram', () => {
  it('GET: mặc định không giới hạn + safe + ngưỡng cảnh báo 150; sentToday đếm tin chiến dịch hôm nay', async () => {
    const owner = await createUser({ username: 'ssa_tg_get', email: 'ssa_tg_get@test.com' });
    const token = await loginAs(owner);
    const id = await createTelegramAccount(owner.id);
    await insertSentToday('telegram', String(id), 3);

    const res = await request(app).get(url('telegram', id)).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      channel: 'telegram',
      userDailySendLimit: null,
      sendSpeed: 'safe',
      sentToday: 3,
      warnThreshold: 150,
      hardFloorMs: 2000,
    });
  });

  it('PATCH đặt trần + tốc độ -> lưu đúng cột DB; GET trả lại; ghi audit cũ/mới', async () => {
    const owner = await createUser({ username: 'ssa_tg_patch', email: 'ssa_tg_patch@test.com' });
    const token = await loginAs(owner);
    const id = await createTelegramAccount(owner.id);

    const res = await request(app)
      .patch(url('telegram', id))
      .set('Authorization', `Bearer ${token}`)
      .send({ userDailySendLimit: 120, sendSpeed: 'very_fast' });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ userDailySendLimit: 120, sendSpeed: 'very_fast', delayMinMs: 2000, delayMaxMs: 4000 });
    const { rows } = await db.query(
      'SELECT user_daily_send_limit, outbound_delay_min_ms, outbound_delay_max_ms FROM telegram_accounts WHERE id = $1',
      [id]
    );
    expect(rows[0]).toEqual({ user_daily_send_limit: 120, outbound_delay_min_ms: 2000, outbound_delay_max_ms: 4000 });

    const audit = await auditRows();
    expect(audit).toHaveLength(1);
    expect(audit[0].entity_type).toBe('telegram_account');
    expect(Number(audit[0].entity_id)).toBe(id);
    expect(audit[0].details).toMatchObject({
      channel: 'telegram',
      previous: { userDailySendLimit: null, sendSpeed: 'safe' },
      next: { userDailySendLimit: 120, sendSpeed: 'very_fast' },
    });
  });

  it('PATCH chỉ một trường: trường kia giữ nguyên; userDailySendLimit:null xoá THẬT; sendSpeed:safe xoá ghi đè', async () => {
    const owner = await createUser({ username: 'ssa_tg_part', email: 'ssa_tg_part@test.com' });
    const token = await loginAs(owner);
    const id = await createTelegramAccount(owner.id);
    const auth = { Authorization: `Bearer ${token}` };

    await request(app).patch(url('telegram', id)).set(auth).send({ userDailySendLimit: 50, sendSpeed: 'fast' });
    await request(app).patch(url('telegram', id)).set(auth).send({ sendSpeed: 'very_fast' });
    let { rows } = await db.query('SELECT user_daily_send_limit, outbound_delay_min_ms FROM telegram_accounts WHERE id = $1', [id]);
    expect(rows[0]).toEqual({ user_daily_send_limit: 50, outbound_delay_min_ms: 2000 });

    await request(app).patch(url('telegram', id)).set(auth).send({ userDailySendLimit: null });
    ({ rows } = await db.query('SELECT user_daily_send_limit, outbound_delay_min_ms FROM telegram_accounts WHERE id = $1', [id]));
    expect(rows[0]).toEqual({ user_daily_send_limit: null, outbound_delay_min_ms: 2000 });

    await request(app).patch(url('telegram', id)).set(auth).send({ sendSpeed: 'safe' });
    ({ rows } = await db.query('SELECT outbound_delay_min_ms, outbound_delay_max_ms FROM telegram_accounts WHERE id = $1', [id]));
    expect(rows[0]).toEqual({ outbound_delay_min_ms: null, outbound_delay_max_ms: null });
  });

  it.each([
    ['body rỗng', {}],
    ['mức lạ', { sendSpeed: 'turbo' }],
    ['trần 0', { userDailySendLimit: 0 }],
    ['trần âm', { userDailySendLimit: -5 }],
    ['trần quá lớn', { userDailySendLimit: 100001 }],
    ['trần không nguyên', { userDailySendLimit: 1.5 }],
    ['trần là chữ', { userDailySendLimit: 'abc' }],
  ])('400 khi %s — giá trị đang có KHÔNG bị đổi', async (_label, body) => {
    const owner = await createUser({ username: `ssa_tg_bad_${_label.length}`, email: `ssa_tg_bad_${_label.length}@test.com` });
    const token = await loginAs(owner);
    const id = await createTelegramAccount(owner.id);
    await db.query('UPDATE telegram_accounts SET user_daily_send_limit = 77 WHERE id = $1', [id]);

    const res = await request(app).patch(url('telegram', id)).set('Authorization', `Bearer ${token}`).send(body);

    expect(res.status).toBe(400);
    const { rows } = await db.query('SELECT user_daily_send_limit FROM telegram_accounts WHERE id = $1', [id]);
    expect(rows[0].user_daily_send_limit).toBe(77);
    expect(await auditRows()).toHaveLength(0);
  });

  it('chủ khác -> 404 (GET và PATCH), không đổi gì', async () => {
    const ownerA = await createUser({ username: 'ssa_tg_a', email: 'ssa_tg_a@test.com' });
    const ownerB = await createUser({ username: 'ssa_tg_b', email: 'ssa_tg_b@test.com' });
    const tokenB = await loginAs(ownerB);
    const id = await createTelegramAccount(ownerA.id);

    const get = await request(app).get(url('telegram', id)).set('Authorization', `Bearer ${tokenB}`);
    const patch = await request(app).patch(url('telegram', id)).set('Authorization', `Bearer ${tokenB}`).send({ userDailySendLimit: 5 });

    expect(get.status).toBe(404);
    expect(patch.status).toBe(404);
    const { rows } = await db.query('SELECT user_daily_send_limit FROM telegram_accounts WHERE id = $1', [id]);
    expect(rows[0].user_daily_send_limit).toBeNull();
  });

  it('không token -> 401; kênh lạ -> 404', async () => {
    const owner = await createUser({ username: 'ssa_tg_misc', email: 'ssa_tg_misc@test.com' });
    const token = await loginAs(owner);
    expect((await request(app).get(url('telegram', 1))).status).toBe(401);
    expect((await request(app).get(url('sms', 1)).set('Authorization', `Bearer ${token}`)).status).toBe(404);
  });

  it('nhân viên: KHÔNG có chatbot_channels_manage -> 403 (chỉ campaigns_create không đủ); CÓ quyền -> sửa được tài khoản của CHỦ', async () => {
    const owner = await createUser({ username: 'ssa_tg_own', email: 'ssa_tg_own@test.com' });
    const employee = await createUser({ username: 'ssa_tg_emp', email: 'ssa_tg_emp@test.com' });
    const id = await createTelegramAccount(owner.id);
    await db.query(
      `INSERT INTO user_members (owner_id, employee_id, permissions, status) VALUES ($1, $2, $3::jsonb, 'active')`,
      [owner.id, employee.id, JSON.stringify({ campaigns_view: true, campaigns_create: true })]
    );
    const token = await loginAs(employee);
    const headers = { Authorization: `Bearer ${token}`, 'X-Owner-Context': String(owner.id) };

    const denied = await request(app).patch(url('telegram', id)).set(headers).send({ userDailySendLimit: 9 });
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('PERMISSION_DENIED');
    const deniedGet = await request(app).get(url('telegram', id)).set(headers);
    expect(deniedGet.status).toBe(403);

    await db.query(
      `UPDATE user_members SET permissions = $3::jsonb WHERE owner_id = $1 AND employee_id = $2`,
      [owner.id, employee.id, JSON.stringify({ campaigns_view: true, chatbot_channels_manage: true })]
    );
    const ok = await request(app).patch(url('telegram', id)).set(headers).send({ userDailySendLimit: 9 });
    expect(ok.status).toBe(200);
    const { rows } = await db.query('SELECT user_daily_send_limit FROM telegram_accounts WHERE id = $1', [id]);
    expect(rows[0].user_daily_send_limit).toBe(9);
    // Audit ghi người thao tác là nhân viên, chủ là owner.
    const audit = await auditRows();
    expect(String(audit[0].id_user)).toBe(String(employee.id));
    expect(String(audit[0].owner_id)).toBe(String(owner.id));
  });
});

describe('send-settings — WhatsApp', () => {
  it('GET mặc định + ngưỡng cảnh báo 100 + sàn 3s; PATCH upsert vào whatsapp_account_settings; audit entity_id NULL, accountKey trong details', async () => {
    const owner = await createUser({ username: 'ssa_wa_1', email: 'ssa_wa_1@test.com' });
    const token = await loginAs(owner);
    const key = `${owner.id}-main`;
    await insertSentToday('whatsapp', key, 2);

    const get = await request(app).get(url('whatsapp', key)).set('Authorization', `Bearer ${token}`);
    expect(get.status).toBe(200);
    expect(get.body.data).toMatchObject({ channel: 'whatsapp', userDailySendLimit: null, sendSpeed: 'safe', sentToday: 2, warnThreshold: 100, hardFloorMs: 3000 });

    const patch = await request(app)
      .patch(url('whatsapp', key))
      .set('Authorization', `Bearer ${token}`)
      .send({ userDailySendLimit: 60, sendSpeed: 'fast' });
    expect(patch.status).toBe(200);
    expect(patch.body.data).toMatchObject({ userDailySendLimit: 60, sendSpeed: 'fast', delayMinMs: 5000, delayMaxMs: 10000 });
    const { rows } = await db.query('SELECT * FROM whatsapp_account_settings WHERE session_key = $1', [key]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ user_daily_send_limit: 60, outbound_delay_min_ms: 5000, outbound_delay_max_ms: 10000 });
    expect(String(rows[0].id_user)).toBe(String(owner.id));

    const audit = await auditRows();
    expect(audit).toHaveLength(1);
    expect(audit[0].entity_type).toBe('whatsapp_account');
    expect(audit[0].entity_id).toBeNull();
    expect(audit[0].details).toMatchObject({ channel: 'whatsapp', accountKey: key, next: { userDailySendLimit: 60, sendSpeed: 'fast' } });
  });

  it('sessionKey của chủ khác (tiền tố khác) hoặc sai định dạng -> 404, KHÔNG tạo dòng', async () => {
    const owner = await createUser({ username: 'ssa_wa_2', email: 'ssa_wa_2@test.com' });
    const other = await createUser({ username: 'ssa_wa_3', email: 'ssa_wa_3@test.com' });
    const token = await loginAs(owner);

    const foreign = await request(app).patch(url('whatsapp', `${other.id}-main`)).set('Authorization', `Bearer ${token}`).send({ userDailySendLimit: 5 });
    const weird = await request(app).patch(url('whatsapp', `${owner.id}-a%20b`)).set('Authorization', `Bearer ${token}`).send({ userDailySendLimit: 5 });

    expect(foreign.status).toBe(404);
    expect(weird.status).toBe(404);
    const { rows } = await db.query('SELECT count(*)::int AS n FROM whatsapp_account_settings');
    expect(rows[0].n).toBe(0);
  });
});
