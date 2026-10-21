/**
 * PLAN_VA_CO_LAP_DU_LIEU_TENANT PR-2 — hộp thư web chat và chatbot gắn kênh phải đúng chủ.
 *
 *  - Xoá hội thoại web chat: tài khoản B xoá hội thoại của A -> 404, tin của A còn nguyên; A xoá của chính mình -> mất cả tin.
 *  - Bật/tắt chatbot cho Telegram / WhatsApp Baileys với chatbot của người khác -> 404, không ghi dòng, không lộ system_instruction.
 *  - Chỗ ĐỌC lúc chạy: dòng settings trỏ chatbot của người khác (chèn tay) không dùng được.
 */
import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';

process.env.BULLMQ_ENABLED = 'false';

const gatewayMock = { isConfigured: jest.fn(() => true), ensureHandler: jest.fn(async () => ({ data: { ok: true } })) };
jest.unstable_mockModule('../../src/services/chatbot/telegramGateway.client.js', () => ({ default: gatewayMock }));

const db = (await import('../../src/config/database.js')).default;
const { createApp } = await import('../../src/app.js');
const { truncateAll, createUser } = await import('./helpers/db.js');
const chatbotTelegramRepository = (await import('../../src/repositories/chatbot/chatbotTelegram.repository.js')).default;
const { pickEnabledChatbotForTelegram, isChatbotStillEnabledForAccount } = await import('../../src/routes/internal.routes.js');
const { findEnabledChatbots, resolveChatbotSettingsForBatch } = await import(
  '../../src/services/chatbot/whatsappBaileysInbox.service.js'
);

const SECRET_OF_B = 'BI_MAT_SYSTEM_INSTRUCTION_CUA_B';

let app;
beforeAll(() => {
  app = createApp();
});
beforeEach(async () => {
  await truncateAll();
  gatewayMock.ensureHandler.mockClear();
});

const rnd = () => `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
const auth = (token) => ({ Authorization: `Bearer ${token}` });

async function createTenant(label) {
  const user = await createUser({ username: `cl_${label}_${rnd()}` });
  const login = await request(app).post('/api/auth/login').send({ username: user.username, password: user.plainPassword });
  const token = login.body.data.accessToken;
  const { rows } = await db.query(
    `INSERT INTO custom_chatbots (id_user, name, widget_key, system_instruction) VALUES ($1, $2, $3, $4) RETURNING id`,
    [user.id, `Bot ${label}`, `k_${rnd()}`, label === 'B' ? SECRET_OF_B : `HUONG_DAN_${label}`]
  );
  return { user, token, botId: Number(rows[0].id) };
}

async function createTelegramAccount(userId) {
  const { rows } = await db.query(
    `INSERT INTO telegram_accounts (id_user, telegram_user_id, username, is_active) VALUES ($1, $2, 'tg', true) RETURNING id`,
    [userId, 800000 + Math.floor(Math.random() * 100000)]
  );
  return Number(rows[0].id);
}

async function createWebchatConversationWithMessages(userId, messageCount = 2) {
  const { rows: widget } = await db.query(
    `INSERT INTO web_widget_configs (id_user, widget_key) VALUES ($1, $2) RETURNING id`,
    [userId, `w_${rnd()}`]
  );
  const { rows: conv } = await db.query(
    `INSERT INTO webchat_conversations (id_user, id_widget_config, session_id, visitor_name) VALUES ($1, $2, $3, 'Khách') RETURNING id`,
    [userId, widget[0].id, `s_${rnd()}`]
  );
  const convId = Number(conv[0].id);
  for (let i = 0; i < messageCount; i += 1) {
    await db.query(
      `INSERT INTO webchat_messages (id_conversation, id_user, role, content) VALUES ($1, $2, 'visitor', $3)`,
      [convId, userId, `tin ${i}`]
    );
  }
  return convId;
}

const countMessages = async (convId) =>
  (await db.query('SELECT COUNT(*)::int AS n FROM webchat_messages WHERE id_conversation = $1', [convId])).rows[0].n;
const countConversations = async (convId) =>
  (await db.query('SELECT COUNT(*)::int AS n FROM webchat_conversations WHERE id = $1', [convId])).rows[0].n;

describe('xoá hội thoại web chat phải đúng chủ', () => {
  it('B xoá hội thoại web của A -> 404, hội thoại và số tin của A không đổi', async () => {
    const a = await createTenant('A');
    const b = await createTenant('B');
    const convA = await createWebchatConversationWithMessages(a.user.id, 3);

    const res = await request(app)
      .delete(`/api/ai/chatbot/inbox/conversations/${convA}?type=webchat`)
      .set(auth(b.token));

    expect(res.status).toBe(404);
    expect(await countConversations(convA)).toBe(1);
    expect(await countMessages(convA)).toBe(3);
  });

  it('A xoá hội thoại web của chính mình -> 200, hội thoại và tin đều mất (CASCADE)', async () => {
    const a = await createTenant('A');
    const convA = await createWebchatConversationWithMessages(a.user.id, 2);

    const res = await request(app)
      .delete(`/api/ai/chatbot/inbox/conversations/${convA}?type=webchat`)
      .set(auth(a.token));

    expect(res.status).toBe(200);
    expect(await countConversations(convA)).toBe(0);
    expect(await countMessages(convA)).toBe(0);
  });

  it('hội thoại không tồn tại -> 404', async () => {
    const a = await createTenant('A');
    const res = await request(app)
      .delete('/api/ai/chatbot/inbox/conversations/987654321?type=webchat')
      .set(auth(a.token));
    expect(res.status).toBe(404);
  });
});

describe('Telegram: bật/tắt chatbot phải là chatbot của mình', () => {
  const toggle = (token, body) =>
    request(app).post('/api/ai/chatbot/telegram-account/chatbot/toggle').set(auth(token)).send(body);

  it.each([true, false])('A toggle (enabled=%s) với chatbot của B -> 404, không có dòng settings mới, body không lộ system_instruction của B', async (enabled) => {
    const a = await createTenant('A');
    const b = await createTenant('B');
    const accId = await createTelegramAccount(a.user.id);

    const res = await toggle(a.token, { enabled, id_account: accId, id_chatbot: b.botId });

    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain(SECRET_OF_B);
    const { rows } = await db.query('SELECT * FROM telegram_chatbot_settings WHERE id_telegram_account = $1', [accId]);
    expect(rows).toHaveLength(0);
  });

  it('A đang bật bot của mình mà toggle bot của B -> vẫn 404 (không phải 409 nêu tên bot của A)', async () => {
    const a = await createTenant('A');
    const b = await createTenant('B');
    const accId = await createTelegramAccount(a.user.id);
    await db.query(
      `INSERT INTO telegram_chatbot_settings (id_telegram_account, id_chatbot, is_enabled, is_enabled_dm, is_enabled_group)
       VALUES ($1, $2, true, true, true)`,
      [accId, a.botId]
    );

    const res = await toggle(a.token, { enabled: true, id_account: accId, id_chatbot: b.botId });

    expect(res.status).toBe(404);
    const { rows } = await db.query('SELECT id_chatbot FROM telegram_chatbot_settings WHERE id_telegram_account = $1', [accId]);
    expect(rows.map((r) => Number(r.id_chatbot))).toEqual([a.botId]);
  });

  it('luồng đúng: A bật rồi tắt chatbot của chính mình -> 200', async () => {
    const a = await createTenant('A');
    const accId = await createTelegramAccount(a.user.id);

    const on = await toggle(a.token, { enabled: true, id_account: accId, id_chatbot: a.botId });
    expect(on.status).toBe(200);
    expect(on.body.data.is_enabled).toBe(true);
    // Chatbot của chính A: bản chụp system_instruction vẫn được điền.
    expect(on.body.data.chatbot_system_instruction).toBe('HUONG_DAN_A');

    const off = await toggle(a.token, { enabled: false, id_account: accId, id_chatbot: a.botId });
    expect(off.status).toBe(200);
    expect(off.body.data.is_enabled).toBe(false);
  });

  it('tài khoản Telegram của người khác vẫn 404 như cũ', async () => {
    const a = await createTenant('A');
    const b = await createTenant('B');
    const accOfB = await createTelegramAccount(b.user.id);
    const res = await toggle(a.token, { enabled: true, id_account: accOfB, id_chatbot: a.botId });
    expect(res.status).toBe(404);
  });
});

describe('WhatsApp Baileys: bật/tắt chatbot phải là chatbot của mình', () => {
  const toggle = (token, body) =>
    request(app).post('/api/ai/chatbot/whatsapp-account/chatbot/toggle').set(auth(token)).send(body);

  it.each([true, false])('A toggle (enabled=%s) session "<A>-x" với chatbot của B -> 404, không có dòng mới', async (enabled) => {
    const a = await createTenant('A');
    const b = await createTenant('B');
    const sessionKey = `${a.user.id}-x`;

    const res = await toggle(a.token, { enabled, session_key: sessionKey, id_chatbot: b.botId });

    expect(res.status).toBe(404);
    const { rows } = await db.query('SELECT 1 FROM chatbot_whatsapp_baileys_settings WHERE session_key = $1', [sessionKey]);
    expect(rows).toHaveLength(0);
  });

  it('A đang bật bot của mình mà toggle bot của B -> vẫn 404 (không phải 409)', async () => {
    const a = await createTenant('A');
    const b = await createTenant('B');
    const sessionKey = `${a.user.id}-x`;
    await db.query(
      `INSERT INTO chatbot_whatsapp_baileys_settings (id_user, session_key, id_chatbot, is_enabled) VALUES ($1, $2, $3, true)`,
      [a.user.id, sessionKey, a.botId]
    );

    const res = await toggle(a.token, { enabled: true, session_key: sessionKey, id_chatbot: b.botId });

    expect(res.status).toBe(404);
    const { rows } = await db.query('SELECT id_chatbot FROM chatbot_whatsapp_baileys_settings WHERE session_key = $1', [sessionKey]);
    expect(rows.map((r) => Number(r.id_chatbot))).toEqual([a.botId]);
  });

  it('luồng đúng: A bật chatbot của chính mình -> 200 và có dòng', async () => {
    const a = await createTenant('A');
    const sessionKey = `${a.user.id}-x`;
    const res = await toggle(a.token, { enabled: true, session_key: sessionKey, id_chatbot: a.botId });
    expect(res.status).toBe(200);
    const { rows } = await db.query('SELECT is_enabled FROM chatbot_whatsapp_baileys_settings WHERE session_key = $1', [sessionKey]);
    expect(rows).toHaveLength(1);
    expect(rows[0].is_enabled).toBe(true);
  });
});

describe('chỗ ĐỌC lúc chạy: dòng settings trỏ chatbot của người khác (chèn tay) không dùng được', () => {
  // Mỗi hàm đọc một ca riêng (mỗi hàm một câu SQL riêng, mỗi câu một lớp chặn riêng — gỡ lớp nào thì đúng ca đó đỏ).
  async function seedTelegramRows() {
    const a = await createTenant('A');
    const b = await createTenant('B');
    const accId = await createTelegramAccount(a.user.id);
    // Dòng lệch: tài khoản của A trỏ chatbot của B.
    await db.query(
      `INSERT INTO telegram_chatbot_settings (id_telegram_account, id_chatbot, is_enabled, is_enabled_dm, is_enabled_group)
       VALUES ($1, $2, true, true, true)`,
      [accId, b.botId]
    );
    // Dòng đúng chủ trên tài khoản KHÁC của A — đối chứng để phép đo không mù.
    const ownAccId = await createTelegramAccount(a.user.id);
    await db.query(
      `INSERT INTO telegram_chatbot_settings (id_telegram_account, id_chatbot, is_enabled, is_enabled_dm, is_enabled_group)
       VALUES ($1, $2, true, true, true)`,
      [ownAccId, a.botId]
    );
    return { a, b, accId, ownAccId };
  }

  it('Telegram getEnabledChatbots: không trả chatbot của người khác; dòng đúng chủ thì trả', async () => {
    const { a, accId, ownAccId } = await seedTelegramRows();
    expect(await chatbotTelegramRepository.getEnabledChatbots(accId, { isDm: true })).toEqual([]);
    const own = await chatbotTelegramRepository.getEnabledChatbots(ownAccId, { isDm: true });
    expect(own.map((r) => Number(r.id_chatbot))).toEqual([a.botId]);
  });

  it('Telegram getSettingsForAccount: không trả dòng + system_instruction của chatbot người khác; dòng đúng chủ thì trả', async () => {
    const { a, b, accId, ownAccId } = await seedTelegramRows();
    expect(await chatbotTelegramRepository.getSettingsForAccount(accId, b.botId)).toBeNull();
    const own = await chatbotTelegramRepository.getSettingsForAccount(ownAccId, a.botId);
    expect(own.chatbot_system_instruction).toBe('HUONG_DAN_A');
  });

  it('Telegram pickEnabledChatbotForTelegram: không chọn chatbot của người khác; dòng đúng chủ thì chọn', async () => {
    const { a, accId, ownAccId } = await seedTelegramRows();
    expect(await pickEnabledChatbotForTelegram(a.user.id, accId)).toBeNull();
    expect(await pickEnabledChatbotForTelegram(a.user.id, ownAccId)).toBe(a.botId);
  });

  it('Telegram isChatbotStillEnabledForAccount: chatbot của người khác không được coi là còn bật; dòng đúng chủ thì còn', async () => {
    const { a, b, accId, ownAccId } = await seedTelegramRows();
    expect(await isChatbotStillEnabledForAccount(accId, b.botId)).toBe(false);
    expect(await isChatbotStillEnabledForAccount(ownAccId, a.botId)).toBe(true);
  });

  async function seedBaileysRows() {
    const a = await createTenant('A');
    const b = await createTenant('B');
    const badSession = `${a.user.id}-bad`;
    const goodSession = `${a.user.id}-good`;
    // Dòng lệch: session của A trỏ chatbot của B.
    await db.query(
      `INSERT INTO chatbot_whatsapp_baileys_settings (id_user, session_key, id_chatbot, is_enabled) VALUES ($1, $2, $3, true)`,
      [a.user.id, badSession, b.botId]
    );
    // Dòng đúng chủ — đối chứng để phép đo không mù.
    await db.query(
      `INSERT INTO chatbot_whatsapp_baileys_settings (id_user, session_key, id_chatbot, is_enabled) VALUES ($1, $2, $3, true)`,
      [a.user.id, goodSession, a.botId]
    );
    return { a, b, badSession, goodSession };
  }

  it('WhatsApp Baileys findEnabledChatbots: không trả chatbot của người khác; dòng đúng chủ thì trả', async () => {
    const { a, badSession, goodSession } = await seedBaileysRows();
    expect(await findEnabledChatbots(badSession)).toEqual([]);
    expect((await findEnabledChatbots(goodSession)).map((r) => Number(r.id_chatbot))).toEqual([a.botId]);
  });

  it('WhatsApp Baileys resolveChatbotSettingsForBatch: không trả chatbot của người khác; dòng đúng chủ thì trả', async () => {
    const { a, b, badSession, goodSession } = await seedBaileysRows();
    expect(await resolveChatbotSettingsForBatch({ ownerUserId: a.user.id, sessionKey: badSession, chatbotId: b.botId })).toBeNull();
    const resolved = await resolveChatbotSettingsForBatch({ ownerUserId: a.user.id, sessionKey: goodSession, chatbotId: a.botId });
    expect(resolved?.system_instruction).toBe('HUONG_DAN_A');
  });

  it('WhatsApp Baileys: trợ lý phụ của người khác gắn vào dòng của A không được JOIN (sub_assistant_name = null)', async () => {
    const a = await createTenant('A');
    const b = await createTenant('B');
    const sessionKey = `${a.user.id}-x`;
    const { rows: subB } = await db.query(
      `INSERT INTO sub_assistants (id_user, name) VALUES ($1, 'TRO_LY_CUA_B') RETURNING id`,
      [b.user.id]
    );
    const { rows: subA } = await db.query(
      `INSERT INTO sub_assistants (id_user, name) VALUES ($1, 'TRO_LY_CUA_A') RETURNING id`,
      [a.user.id]
    );
    await db.query(
      `INSERT INTO chatbot_whatsapp_baileys_settings (id_user, session_key, id_chatbot, is_enabled, id_sub_assistant)
       VALUES ($1, $2, $3, true, $4)`,
      [a.user.id, sessionKey, a.botId, subB[0].id]
    );
    const withForeign = await findEnabledChatbots(sessionKey);
    expect(withForeign).toHaveLength(1);
    expect(withForeign[0].sub_assistant_name).toBeNull();
    const resolvedForeign = await resolveChatbotSettingsForBatch({ ownerUserId: a.user.id, sessionKey, chatbotId: a.botId });
    expect(resolvedForeign.sub_assistant_name).toBeNull();

    // Đối chứng: trợ lý phụ của chính A thì được JOIN.
    await db.query('UPDATE chatbot_whatsapp_baileys_settings SET id_sub_assistant = $2 WHERE session_key = $1', [sessionKey, subA[0].id]);
    const own = await findEnabledChatbots(sessionKey);
    expect(own[0].sub_assistant_name).toBe('TRO_LY_CUA_A');
  });
});
