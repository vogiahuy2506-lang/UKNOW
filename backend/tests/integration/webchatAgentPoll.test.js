/**
 * H-02 (PLAN_WEBCHAT_NHAN_TIN_TRA_LOI_TAY_2026-10-04) — khách Web chat nhận tin NHÂN VIÊN TRẢ LỜI TAY.
 *
 * Trước đây Hộp thư chỉ INSERT dòng role='agent' vào webchat_messages còn toast báo "đã gửi" — khách không có đường nào nhận.
 * Giờ widget / trang /chat/:id hỏi GET /api/chatbot-public/custom-chatbot/[id/]:key/messages?sessionId&afterId.
 *
 * Chạy SQL thật + route thật (không mock DB): lọc theo (widget, phiên), afterId, role, trần 20 tin, trả rỗng đồng nhất khi
 * phiên/chatbot không khớp. Limiter bị tắt ở NODE_ENV=test → ghim ở middleware/__tests__/publicChatPollLimiter.spec.js.
 */
import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import { createUser, truncateAll } from './helpers/db.js';

let app;
let owner;
let ownerToken;

const SESSION = 'sess_0123456789abcdef0123456789abcdef';
const OTHER_SESSION = 'sess_fedcba9876543210fedcba9876543210';

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
  owner = await createUser({ username: `poll-owner-${Date.now()}` });
  const login = await request(app)
    .post('/api/auth/login')
    .send({ username: owner.username, password: owner.plainPassword });
  ownerToken = login.body.data.accessToken;
});

/** Chatbot + widget cùng khoá + (tuỳ chọn) hội thoại web của một phiên, đúng cách chat công khai dựng ra. */
async function seedChatbot({ name, sessionId = null }) {
  const widgetKey = `wk_${name}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const { rows: bots } = await db.query(
    `INSERT INTO custom_chatbots (id_user, name, widget_key) VALUES ($1, $2, $3) RETURNING id`,
    [owner.id, name, widgetKey]
  );
  const { rows: widgets } = await db.query(
    `INSERT INTO web_widget_configs (id_user, widget_key) VALUES ($1, $2) RETURNING id`,
    [owner.id, widgetKey]
  );
  let conversationId = null;
  if (sessionId) {
    const { rows: convs } = await db.query(
      `INSERT INTO webchat_conversations (id_user, id_widget_config, session_id, visitor_name)
       VALUES ($1, $2, $3, 'Khách thử') RETURNING id`,
      [owner.id, widgets[0].id, sessionId]
    );
    conversationId = convs[0].id;
  }
  return { chatbotId: Number(bots[0].id), widgetKey, widgetId: widgets[0].id, conversationId };
}

async function insertMessage(conversationId, role, content, attachments = []) {
  const { rows } = await db.query(
    `INSERT INTO webchat_messages (id_conversation, id_user, role, content, attachments)
     VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING id`,
    [conversationId, owner.id, role, content, JSON.stringify(attachments)]
  );
  return String(rows[0].id);
}

const pollByKey = (widgetKey, query) => request(app)
  .get(`/api/chatbot-public/custom-chatbot/${widgetKey}/messages`)
  .query(query);

const pollById = (chatbotId, query) => request(app)
  .get(`/api/chatbot-public/custom-chatbot/id/${chatbotId}/messages`)
  .query(query);

const idsOf = (res) => res.body.data.messages.map((m) => m.id);

describe('GET /chatbot-public/custom-chatbot/:widgetKey/messages — tin nhân viên cho khách web', () => {
  it('đúng phiên: nhận tin agent theo thứ tự id, chỉ trường hiển thị; KHÔNG nhận tin khách / câu AI', async () => {
    const bot = await seedChatbot({ name: 'a', sessionId: SESSION });
    await insertMessage(bot.conversationId, 'visitor', 'Cho mình hỏi giá');
    await insertMessage(bot.conversationId, 'assistant', 'Dạ giá 100k ạ');
    const a1 = await insertMessage(bot.conversationId, 'agent', 'Em là nhân viên, em báo giá ưu đãi ạ');
    const a2 = await insertMessage(bot.conversationId, 'agent', 'Anh để lại số em gọi nhé');

    const res = await pollByKey(bot.widgetKey, { sessionId: SESSION });

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(idsOf(res)).toEqual([a1, a2]);
    expect(res.body.data.hasMore).toBe(false);
    expect(res.body.data.messages[0]).toEqual({
      id: a1,
      role: 'agent',
      content: 'Em là nhân viên, em báo giá ưu đãi ạ',
      attachments: [],
      createdAt: expect.any(String),
    });
    expect(JSON.stringify(res.body)).not.toMatch(/Cho mình hỏi giá|Dạ giá 100k/);
  });

  it('afterId lọc đúng: chỉ trả tin có id lớn hơn; hết tin mới → rỗng', async () => {
    const bot = await seedChatbot({ name: 'a', sessionId: SESSION });
    const a1 = await insertMessage(bot.conversationId, 'agent', 'tin 1');
    const a2 = await insertMessage(bot.conversationId, 'agent', 'tin 2');
    const a3 = await insertMessage(bot.conversationId, 'agent', 'tin 3');

    expect(idsOf(await pollByKey(bot.widgetKey, { sessionId: SESSION, afterId: a1 }))).toEqual([a2, a3]);
    expect(idsOf(await pollByKey(bot.widgetKey, { sessionId: SESSION, afterId: a3 }))).toEqual([]);

    const a4 = await insertMessage(bot.conversationId, 'agent', 'tin 4');
    expect(idsOf(await pollByKey(bot.widgetKey, { sessionId: SESSION, afterId: a3 }))).toEqual([a4]);
  });

  it('phiên khác (cùng chatbot) → [] đồng nhất, không lộ tin của phiên kia', async () => {
    const bot = await seedChatbot({ name: 'a', sessionId: SESSION });
    await insertMessage(bot.conversationId, 'agent', 'Tin riêng của khách A');

    const res = await pollByKey(bot.widgetKey, { sessionId: OTHER_SESSION });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { messages: [], hasMore: false } });
  });

  it('cùng sessionId nhưng CHATBOT khác → [] (hội thoại khoá theo widget, không chỉ theo phiên)', async () => {
    const botA = await seedChatbot({ name: 'a', sessionId: SESSION });
    const botB = await seedChatbot({ name: 'b' });
    await insertMessage(botA.conversationId, 'agent', 'Tin của chatbot A');

    const res = await pollByKey(botB.widgetKey, { sessionId: SESSION });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { messages: [], hasMore: false } });
    // Đối chứng: đúng chatbot thì thấy.
    expect(idsOf(await pollByKey(botA.widgetKey, { sessionId: SESSION }))).toHaveLength(1);
  });

  it('hai chatbot cùng phiên, mỗi bên có tin riêng → mỗi bên chỉ thấy tin của mình', async () => {
    const botA = await seedChatbot({ name: 'a', sessionId: SESSION });
    const botB = await seedChatbot({ name: 'b', sessionId: SESSION });
    const a = await insertMessage(botA.conversationId, 'agent', 'của A');
    const b = await insertMessage(botB.conversationId, 'agent', 'của B');

    expect(idsOf(await pollByKey(botA.widgetKey, { sessionId: SESSION }))).toEqual([a]);
    expect(idsOf(await pollByKey(botB.widgetKey, { sessionId: SESSION }))).toEqual([b]);
  });

  it('hội thoại đã đóng (status != active) → không trả tin', async () => {
    const bot = await seedChatbot({ name: 'a', sessionId: SESSION });
    await insertMessage(bot.conversationId, 'agent', 'tin cũ');
    await db.query(`UPDATE webchat_conversations SET status = 'closed' WHERE id = $1`, [bot.conversationId]);

    expect(idsOf(await pollByKey(bot.widgetKey, { sessionId: SESSION }))).toEqual([]);
  });

  it('thân trả về của "phiên không tồn tại" và "phiên có nhưng hết tin" GIỐNG HỆT (không dò được phiên)', async () => {
    const bot = await seedChatbot({ name: 'a', sessionId: SESSION });
    const noConversation = await pollByKey(bot.widgetKey, { sessionId: OTHER_SESSION });
    const noNewMessages = await pollByKey(bot.widgetKey, { sessionId: SESSION });

    expect(noConversation.status).toBe(noNewMessages.status);
    expect(noConversation.body).toEqual(noNewMessages.body);
  });

  it('sessionId ngắn (id đoán được) → [] dù có hội thoại khớp', async () => {
    const bot = await seedChatbot({ name: 'a', sessionId: 's1' });
    await insertMessage(bot.conversationId, 'agent', 'tin');

    const res = await pollByKey(bot.widgetKey, { sessionId: 's1' });

    expect(res.status).toBe(200);
    expect(res.body.data.messages).toEqual([]);
  });

  it('trần 20 tin/lượt + hasMore; lượt sau theo afterId lấy phần còn lại', async () => {
    const bot = await seedChatbot({ name: 'a', sessionId: SESSION });
    const ids = [];
    for (let i = 1; i <= 25; i += 1) {
      ids.push(await insertMessage(bot.conversationId, 'agent', `tin ${i}`));
    }

    const page1 = await pollByKey(bot.widgetKey, { sessionId: SESSION });
    expect(idsOf(page1)).toEqual(ids.slice(0, 20));
    expect(page1.body.data.hasMore).toBe(true);

    const page2 = await pollByKey(bot.widgetKey, { sessionId: SESSION, afterId: ids[19] });
    expect(idsOf(page2)).toEqual(ids.slice(20));
    expect(page2.body.data.hasMore).toBe(false);
  });

  it('tệp đính kèm của nhân viên được trình bày lại (không lộ trường nội bộ)', async () => {
    const bot = await seedChatbot({ name: 'a', sessionId: SESSION });
    await insertMessage(bot.conversationId, 'agent', 'Gửi anh báo giá', [
      { type: 'file', url: 'https://example.com/bao-gia.pdf', name: 'bao-gia.pdf', size: 1234, mime: 'application/pdf', secretInternal: 'x' },
    ]);

    const res = await pollByKey(bot.widgetKey, { sessionId: SESSION });

    expect(res.body.data.messages[0].attachments).toEqual([
      expect.objectContaining({ url: 'https://example.com/bao-gia.pdf', displayName: 'bao-gia.pdf' }),
    ]);
    expect(JSON.stringify(res.body)).not.toContain('secretInternal');
  });

  it('lỗi đầu vào: thiếu sessionId → 400; afterId không phải số → 400; chatbot không có → 404', async () => {
    const bot = await seedChatbot({ name: 'a', sessionId: SESSION });

    expect((await pollByKey(bot.widgetKey, {})).status).toBe(400);
    expect((await pollByKey(bot.widgetKey, { sessionId: SESSION, afterId: 'abc' })).status).toBe(400);
    expect((await pollByKey(bot.widgetKey, { sessionId: SESSION, afterId: '1 OR 1=1' })).status).toBe(400);
    expect((await pollByKey('khong_ton_tai', { sessionId: SESSION })).status).toBe(404);
  });
});

describe('GET /chatbot-public/custom-chatbot/id/:chatbotId/messages — trang /chat/:id', () => {
  it('theo id số và theo widget_key đều nhận đúng tin; phiên khác → []', async () => {
    const bot = await seedChatbot({ name: 'a', sessionId: SESSION });
    const a1 = await insertMessage(bot.conversationId, 'agent', 'xin chào từ nhân viên');

    expect(idsOf(await pollById(bot.chatbotId, { sessionId: SESSION }))).toEqual([a1]);
    expect(idsOf(await pollById(bot.widgetKey, { sessionId: SESSION }))).toEqual([a1]);
    expect(idsOf(await pollById(bot.chatbotId, { sessionId: OTHER_SESSION }))).toEqual([]);
  });
});

describe('vòng trọn: nhân viên trả lời tay từ Hộp thư → khách nhận được', () => {
  it('POST inbox (type webchat) → sendStatus sent, tin vào webchat_messages; khách poll thấy, afterId không nhận lại', async () => {
    const bot = await seedChatbot({ name: 'a', sessionId: SESSION });
    await insertMessage(bot.conversationId, 'visitor', 'Shop ơi còn hàng không?');

    const send = await request(app)
      .post(`/api/ai/chatbot/inbox/conversations/${bot.conversationId}/messages`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ type: 'webchat', content: 'Còn hàng anh nhé, em giữ cho anh ạ' });

    expect(send.status).toBe(200);
    expect(send.body.success).toBe(true);
    expect(send.body.sendStatus || 'sent').toBe('sent');

    const polled = await pollByKey(bot.widgetKey, { sessionId: SESSION });
    expect(polled.body.data.messages).toHaveLength(1);
    expect(polled.body.data.messages[0]).toEqual(expect.objectContaining({
      role: 'agent',
      content: 'Còn hàng anh nhé, em giữ cho anh ạ',
    }));

    const lastId = polled.body.data.messages[0].id;
    expect(idsOf(await pollByKey(bot.widgetKey, { sessionId: SESSION, afterId: lastId }))).toEqual([]);
  });
});
