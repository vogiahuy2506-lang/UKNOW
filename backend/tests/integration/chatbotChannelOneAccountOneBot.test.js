/**
 * Mục M3-1 (đợt 2) — 1 tài khoản Telegram / WhatsApp = 1 chatbot (như Zalo S-12):
 *  - bật bot thứ hai khi bot khác đang bật trên cùng tài khoản -> 409 CHANNEL_ACCOUNT_BOUND_TO_OTHER_CHATBOT, không ghi dòng mới;
 *  - GET danh sách theo chatbot trả other_chatbot_name để modal hiện huy hiệu (trước đây truy vấn lọc theo đúng chatbotId
 *    nên huy hiệu không bao giờ hiện).
 */
import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';

process.env.BULLMQ_ENABLED = 'false';

const gatewayMock = { isConfigured: jest.fn(() => true), ensureHandler: jest.fn(async () => ({ data: { ok: true } })) };
jest.unstable_mockModule('../../src/services/chatbot/telegramGateway.client.js', () => ({ default: gatewayMock }));

const db = (await import('../../src/config/database.js')).default;
const { createApp } = await import('../../src/app.js');
const { truncateAll, createUser } = await import('./helpers/db.js');

let app;
beforeAll(() => {
  app = createApp();
});
beforeEach(async () => {
  await truncateAll();
});

const rnd = () => `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

async function setup() {
  const owner = await createUser({ username: `own1bot_${rnd()}` });
  const login = await request(app).post('/api/auth/login').send({ username: owner.username, password: owner.plainPassword });
  const token = login.body.data.accessToken;
  const bots = [];
  for (const name of ['Bot A', 'Bot B']) {
    const { rows } = await db.query(
      `INSERT INTO custom_chatbots (id_user, name, widget_key) VALUES ($1, $2, $3) RETURNING id`,
      [owner.id, name, `k_${rnd()}`]
    );
    bots.push(rows[0].id);
  }
  return { owner, token, botA: bots[0], botB: bots[1] };
}
const auth = (token) => ({ Authorization: `Bearer ${token}` });

describe('Telegram: 1 tài khoản = 1 chatbot', () => {
  it('bật bot B khi bot A đang bật -> 409, không ghi dòng; danh sách theo bot B có other_chatbot_name = Bot A; tắt vẫn được', async () => {
    const { owner, token, botA, botB } = await setup();
    const { rows } = await db.query(
      `INSERT INTO telegram_accounts (id_user, telegram_user_id, username, is_active) VALUES ($1, $2, 'tg1', true) RETURNING id`,
      [owner.id, 700000 + Number(owner.id)]
    );
    const accId = rows[0].id;
    await db.query(
      `INSERT INTO telegram_chatbot_settings (id_telegram_account, id_chatbot, is_enabled, is_enabled_dm, is_enabled_group)
       VALUES ($1, $2, true, true, true)`,
      [accId, botA]
    );

    const list = await request(app).get(`/api/ai/chatbot/telegram-accounts/chatbot?chatbot_id=${botB}`).set(auth(token));
    expect(list.status).toBe(200);
    expect(list.body.data[0].other_chatbot_name).toBe('Bot A');
    expect(Number(list.body.data[0].other_chatbot_id)).toBe(Number(botA));
    const listA = await request(app).get(`/api/ai/chatbot/telegram-accounts/chatbot?chatbot_id=${botA}`).set(auth(token));
    expect(listA.body.data[0].other_chatbot_name).toBeNull();

    const res = await request(app)
      .post('/api/ai/chatbot/telegram-account/chatbot/toggle')
      .set(auth(token))
      .send({ enabled: true, id_account: accId, id_chatbot: botB });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CHANNEL_ACCOUNT_BOUND_TO_OTHER_CHATBOT');
    expect(res.body.chatbotName).toBe('Bot A');
    const { rows: after } = await db.query(`SELECT * FROM telegram_chatbot_settings WHERE id_telegram_account = $1`, [accId]);
    expect(after).toHaveLength(1);

    const off = await request(app)
      .post('/api/ai/chatbot/telegram-account/chatbot/toggle')
      .set(auth(token))
      .send({ enabled: false, id_account: accId, id_chatbot: botA });
    expect(off.status).toBe(200);
    const on = await request(app)
      .post('/api/ai/chatbot/telegram-account/chatbot/toggle')
      .set(auth(token))
      .send({ enabled: true, id_account: accId, id_chatbot: botB });
    expect(on.status).toBe(200);
  });
});

describe('WhatsApp Baileys: 1 session = 1 chatbot', () => {
  it('bật bot B khi bot A đang bật -> 409, không ghi dòng', async () => {
    const { owner, token, botA, botB } = await setup();
    const sessionKey = `${owner.id}-shop`;
    await db.query(
      `INSERT INTO chatbot_whatsapp_baileys_settings (id_user, session_key, id_chatbot, is_enabled) VALUES ($1, $2, $3, true)`,
      [owner.id, sessionKey, botA]
    );
    const res = await request(app)
      .post('/api/ai/chatbot/whatsapp-account/chatbot/toggle')
      .set(auth(token))
      .send({ enabled: true, session_key: sessionKey, id_chatbot: botB });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CHANNEL_ACCOUNT_BOUND_TO_OTHER_CHATBOT');
    expect(res.body.chatbotName).toBe('Bot A');
    const { rows } = await db.query(`SELECT 1 FROM chatbot_whatsapp_baileys_settings WHERE session_key = $1`, [sessionKey]);
    expect(rows).toHaveLength(1);
  });
});

describe('WhatsApp Cloud API: 1 kết nối = 1 chatbot', () => {
  it('bật bot B khi bot A đang bật -> 409; danh sách theo bot B có other_chatbot_name', async () => {
    const { owner, token, botA, botB } = await setup();
    const { rows } = await db.query(
      `INSERT INTO chatbot_channel_connections (id_chatbot, channel_type, webhook_token, display_name)
       VALUES ($1, 'whatsapp', $2, 'WA cloud') RETURNING id`,
      [botA, `wh_${rnd()}`]
    );
    const connId = rows[0].id;
    await db.query(
      `INSERT INTO chatbot_whatsapp_account_settings (id_user, id_channel_connection, id_chatbot, is_enabled) VALUES ($1, $2, $3, true)`,
      [owner.id, connId, botA]
    );
    const list = await request(app).get(`/api/ai/chatbot/whatsapp-accounts/chatbot?chatbot_id=${botB}`).set(auth(token));
    expect(list.status).toBe(200);
    const row = list.body.data.find((a) => a.provider === 'cloud_api');
    expect(row.other_chatbot_name).toBe('Bot A');

    const res = await request(app)
      .post('/api/ai/chatbot/whatsapp-account/chatbot/toggle')
      .set(auth(token))
      .send({ enabled: true, id_channel_connection: connId, id_chatbot: botB });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CHANNEL_ACCOUNT_BOUND_TO_OTHER_CHATBOT');
  });
});
