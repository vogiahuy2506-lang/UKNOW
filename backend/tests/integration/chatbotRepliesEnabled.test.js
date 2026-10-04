/**
 * Công tắc "Trạng thái hoạt động" của từng chatbot = custom_chatbots.replies_enabled
 * (PLAN_CONG_TAC_TRANG_THAI_CHATBOT_2026-09-29 PR-2).
 *
 * Chứng minh trên Postgres thật: (1) PUT ghi cột, các SELECT trả cột thật (không chỉ mock);
 * (2) gửi lại không kèm trường thì giữ nguyên (COALESCE); (3) widget chat với chatbot tắt thì im lặng,
 * KHÔNG gọi AI/trừ credit, tin khách vẫn vào hội thoại.
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

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
  user = await createUser({ username: `replies-${Date.now()}` });
  token = await loginAs(user);
  const { rows } = await db.query(
    `INSERT INTO custom_chatbots (id_user, name, widget_key, allow_public_numeric_id)
     VALUES ($1, 'Bot cong tac tra loi', $2, true) -- bot CŨ: chat theo id số còn khớp (migration 284)
     RETURNING *`,
    [user.id, `re_${Date.now()}`]
  );
  chatbot = rows[0];
});

describe('custom_chatbots.replies_enabled — đọc/ghi', () => {
  it('mặc định true; các SELECT đều trả cột', async () => {
    expect(chatbot.replies_enabled).toBe(true);
    expect((await chatbotRepository.findChatbotById(chatbot.id)).replies_enabled).toBe(true);
    expect((await chatbotRepository.findChatbotByWidgetKey(chatbot.widget_key)).replies_enabled).toBe(true);
    expect((await chatbotRepository.findFirstActiveByUser(user.id)).replies_enabled).toBe(true);
    const list = await chatbotRepository.listChatbotsByUser(user.id);
    expect(list[0].replies_enabled).toBe(true);
  });

  it('PUT replies_enabled:false → cả findChatbotById / findChatbotByWidgetKey / listChatbotsByUser trả false; is_active không đổi', async () => {
    const res = await put({ replies_enabled: false });
    expect(res.status).toBe(200);
    expect(res.body.data.replies_enabled).toBe(false);

    expect((await chatbotRepository.findChatbotById(chatbot.id)).replies_enabled).toBe(false);
    expect((await chatbotRepository.findChatbotByWidgetKey(chatbot.widget_key)).replies_enabled).toBe(false);
    const list = await chatbotRepository.listChatbotsByUser(user.id);
    expect(list).toHaveLength(1); // tắt trả lời KHÔNG làm chatbot biến khỏi danh sách (khác is_active)
    expect(list[0].replies_enabled).toBe(false);
    expect((await chatbotRepository.findFirstActiveByUser(user.id)).replies_enabled).toBe(false);
    const { rows } = await db.query('SELECT is_active FROM custom_chatbots WHERE id = $1', [chatbot.id]);
    expect(rows[0].is_active).toBe(true);
  });

  it('gửi lại không kèm trường (nhánh không suggested_questions và nhánh có) → giữ false; PUT true → bật lại', async () => {
    await put({ replies_enabled: false });

    const noField = await put({ name: 'Doi ten' });
    expect(noField.status).toBe(200);
    expect(noField.body.data.replies_enabled).toBe(false);

    const withQuestions = await put({ name: 'Doi ten 2', suggested_questions: ['a', 'b'] });
    expect(withQuestions.status).toBe(200);
    expect(withQuestions.body.data.replies_enabled).toBe(false);
    expect((await chatbotRepository.findChatbotById(chatbot.id)).replies_enabled).toBe(false);

    const on = await put({ replies_enabled: true, suggested_questions: ['a'] });
    expect(on.body.data.replies_enabled).toBe(true);
    const off2 = await put({ replies_enabled: false, suggested_questions: ['a'] });
    expect(off2.body.data.replies_enabled).toBe(false);
    const on2 = await put({ replies_enabled: true });
    expect(on2.body.data.replies_enabled).toBe(true);
  });
});

describe('listChatbotsByUser trả đủ cột hộp Cấu hình đọc', () => {
  it('temperature / max_tokens / response_style / allow_attachments / ai_model là giá trị thật, không phải mặc định', async () => {
    await db.query(
      `UPDATE custom_chatbots
          SET temperature = 0.3, max_tokens = 512, response_style = 'professional',
              allow_attachments = true, ai_model = 'gemini-2.5-pro'
        WHERE id = $1`,
      [chatbot.id]
    );
    const [row] = await chatbotRepository.listChatbotsByUser(user.id);
    expect(Number(row.temperature)).toBeCloseTo(0.3);
    expect(row.max_tokens).toBe(512);
    expect(row.response_style).toBe('professional');
    expect(row.allow_attachments).toBe(true);
    expect(row.ai_model).toBe('gemini-2.5-pro');
  });
});

describe('widget chat với chatbot tắt trả lời', () => {
  async function creditRows() {
    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS n FROM usage_logs WHERE id_user = $1 AND resource_type = 'ai_credit'`,
      [user.id]
    );
    return rows[0].n;
  }

  async function messagesOf(sessionId) {
    const { rows } = await db.query(
      `SELECT m.role, m.content FROM webchat_messages m
         JOIN webchat_conversations c ON c.id = m.id_conversation
        WHERE c.session_id = $1 ORDER BY m.id`,
      [sessionId]
    );
    return rows;
  }

  beforeEach(async () => {
    await put({ replies_enabled: false });
  });

  it('widget theo key: content null, reason replies_disabled, tin khách được lưu, không có tin bot, không trừ credit', async () => {
    const sessionId = `sess_off_key_${Date.now()}`;
    const res = await request(app)
      .post(`/api/chatbot-public/custom-chatbot/${chatbot.widget_key}/chat`)
      .send({ message: 'Alo shop ơi', sessionId });

    expect(res.status).toBe(200);
    expect(res.body.data.content).toBeNull();
    expect(res.body.data.reason).toBe('replies_disabled');
    expect(await messagesOf(sessionId)).toEqual([{ role: 'visitor', content: 'Alo shop ơi' }]);
    expect(await creditRows()).toBe(0);
  });

  it('widget theo id: content null, reason replies_disabled, tin khách được lưu, không có tin bot, không trừ credit', async () => {
    const sessionId = `sess_off_id_${Date.now()}`;
    const res = await request(app)
      .post(`/api/chatbot-public/custom-chatbot/id/${chatbot.id}/chat`)
      .send({ message: 'Shop còn hàng không', sessionId });

    expect(res.status).toBe(200);
    expect(res.body.data.content).toBeNull();
    expect(res.body.data.reason).toBe('replies_disabled');
    expect(await messagesOf(sessionId)).toEqual([{ role: 'visitor', content: 'Shop còn hàng không' }]);
    expect(await creditRows()).toBe(0);
  });
});
