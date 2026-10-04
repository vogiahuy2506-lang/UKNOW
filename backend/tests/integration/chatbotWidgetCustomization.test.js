/**
 * Tuỳ chỉnh Giao diện Widget chạy thật (PLAN_TUY_CHINH_WIDGET_THAT_2026-09-29):
 * custom_chatbots.widget_auto_open / embed_show_header / embed_size (migration 264).
 *
 * Postgres thật: (1) PUT ghi cột, các SELECT trả cột; (2) gửi lại không kèm trường thì giữ (COALESCE, cả hai
 * nhánh UPDATE); (3) embed_size sai → 400; (4) hai endpoint công khai trả autoOpen / embed_show_header.
 */
import { beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import db from '../../src/config/database.js';
import chatbotRepository from '../../src/repositories/ai/chatbot.repository.js';
import { createUser, truncateAll } from './helpers/db.js';

let app;
let user;
let token;
let chatbot;

async function loginAs(targetUser) {
  const login = await request(app)
    .post('/api/auth/login')
    .send({ username: targetUser.username, password: targetUser.plainPassword });
  return login.body.data.accessToken;
}

const put = (body) =>
  request(app)
    .put(`/api/ai/chatbot/custom-chatbots/${chatbot.id}`)
    .set('Authorization', `Bearer ${token}`)
    .send(body);

async function readAll() {
  const byId = await chatbotRepository.findChatbotById(chatbot.id);
  const byKey = await chatbotRepository.findChatbotByWidgetKey(chatbot.widget_key);
  const [fromList] = await chatbotRepository.listChatbotsByUser(user.id);
  return { byId, byKey, fromList };
}

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
  user = await createUser({ username: `widgetcfg-${Date.now()}` });
  token = await loginAs(user);
  const { rows } = await db.query(
    `INSERT INTO custom_chatbots (id_user, name, widget_key, allow_public_numeric_id)
     VALUES ($1, 'Bot tuy chinh widget', $2, true) -- bot CŨ: GET /chatbot-public/chatbot/:id còn khớp id số (migration 284)
     RETURNING *`,
    [user.id, `wc_${Date.now()}`]
  );
  chatbot = rows[0];
});

describe('custom_chatbots widget_auto_open / embed_show_header / embed_size — đọc/ghi', () => {
  it('mặc định false / true / medium; cả 3 SELECT đều trả cột', async () => {
    expect(chatbot.widget_auto_open).toBe(false);
    expect(chatbot.embed_show_header).toBe(true);
    expect(chatbot.embed_size).toBe('medium');
    const { byId, byKey, fromList } = await readAll();
    for (const row of [byId, byKey, fromList]) {
      expect(row.widget_auto_open).toBe(false);
      expect(row.embed_show_header).toBe(true);
      expect(row.embed_size).toBe('medium');
    }
  });

  it('PUT 3 trường → findChatbotById / findChatbotByWidgetKey / listChatbotsByUser trả đúng', async () => {
    const res = await put({ widget_auto_open: true, embed_show_header: false, embed_size: 'large' });
    expect(res.status).toBe(200);
    expect(res.body.data.widget_auto_open).toBe(true);
    expect(res.body.data.embed_show_header).toBe(false);
    expect(res.body.data.embed_size).toBe('large');

    const { byId, byKey, fromList } = await readAll();
    for (const row of [byId, byKey, fromList]) {
      expect(row.widget_auto_open).toBe(true);
      expect(row.embed_show_header).toBe(false);
      expect(row.embed_size).toBe('large');
    }
  });

  it('gửi lại không kèm trường (nhánh không suggested_questions và nhánh có) → giữ nguyên', async () => {
    await put({ widget_auto_open: true, embed_show_header: false, embed_size: 'small' });

    const noField = await put({ name: 'Doi ten' });
    expect(noField.status).toBe(200);
    expect(noField.body.data.widget_auto_open).toBe(true);
    expect(noField.body.data.embed_show_header).toBe(false);
    expect(noField.body.data.embed_size).toBe('small');

    const withQuestions = await put({ name: 'Doi ten 2', suggested_questions: ['a'] });
    expect(withQuestions.status).toBe(200);
    expect(withQuestions.body.data.widget_auto_open).toBe(true);
    expect(withQuestions.body.data.embed_show_header).toBe(false);
    expect(withQuestions.body.data.embed_size).toBe('small');

    // Bật/tắt lại ở nhánh có suggested_questions.
    const back = await put({
      widget_auto_open: false, embed_show_header: true, embed_size: 'medium', suggested_questions: ['a'],
    });
    expect(back.body.data.widget_auto_open).toBe(false);
    expect(back.body.data.embed_show_header).toBe(true);
    expect(back.body.data.embed_size).toBe('medium');
  });

  it("embed_size:'huge' → 400 và không đổi dữ liệu", async () => {
    const res = await put({ embed_size: 'huge' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CHATBOT_EMBED_SIZE_INVALID');
    expect((await chatbotRepository.findChatbotById(chatbot.id)).embed_size).toBe('medium');
    // CHECK DB là hàng rào thứ hai.
    await expect(
      db.query(`UPDATE custom_chatbots SET embed_size = 'huge' WHERE id = $1`, [chatbot.id])
    ).rejects.toThrow();
  });
});

describe('cấu hình công khai', () => {
  it('/custom-chatbot/:key/config trả autoOpen theo cột', async () => {
    const before = await request(app).get(`/api/chatbot-public/custom-chatbot/${chatbot.widget_key}/config`);
    expect(before.status).toBe(200);
    expect(before.body.data.autoOpen).toBe(false);

    await put({ widget_auto_open: true });
    const after = await request(app).get(`/api/chatbot-public/custom-chatbot/${chatbot.widget_key}/config`);
    expect(after.body.data.autoOpen).toBe(true);
  });

  it('/chatbot/:id trả embed_show_header theo cột', async () => {
    const before = await request(app).get(`/api/chatbot-public/chatbot/${chatbot.id}`);
    expect(before.status).toBe(200);
    expect(before.body.data.embed_show_header).toBe(true);

    await put({ embed_show_header: false });
    const after = await request(app).get(`/api/chatbot-public/chatbot/${chatbot.id}`);
    expect(after.body.data.embed_show_header).toBe(false);
  });

  it('không endpoint công khai nào trả system_instruction của chủ chatbot', async () => {
    const secret = 'Câu lệnh hệ thống nội bộ — không được lộ ra ngoài';
    await db.query(`UPDATE custom_chatbots SET system_instruction = $2 WHERE id = $1`, [chatbot.id, secret]);

    const byId = await request(app).get(`/api/chatbot-public/chatbot/${chatbot.id}`);
    const byKey = await request(app).get(`/api/chatbot-public/custom-chatbot/${chatbot.widget_key}/config`);
    for (const res of [byId, byKey]) {
      expect(res.status).toBe(200);
      expect(res.body.data).not.toHaveProperty('system_instruction');
      expect(res.body.data).not.toHaveProperty('systemInstruction');
      expect(JSON.stringify(res.body)).not.toContain(secret);
    }
  });
});
