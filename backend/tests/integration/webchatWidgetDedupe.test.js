/**
 * Web chat: một chatbot = một widget = một hội thoại mỗi phiên.
 *
 * Trước bản vá, `chatWithCustomChatbotById` so `w.id_sub_assistant === chatbot.id_sub_assistant`
 * — mà `custom_chatbots` không có cột đó nên `null === undefined` sai vĩnh viễn → mỗi
 * tin nhắn đẻ 1 widget + 1 hội thoại mới. Đo trên production: 23 hội thoại / 7 phiên.
 *
 * Unit test không bắt được vì chúng mock repository. Bộ này chạy trên Postgres thật.
 */
import { describe, it, expect, beforeAll, beforeEach, jest } from '@jest/globals';

// Bộ giới hạn chống spam đếm theo senderKey = sessionId. Dùng chung một session cho
// mọi bài sẽ khiến bài sau bị chặn và trả rateLimited (200 nhưng KHÔNG ghi gì) — nhìn
// hệt như lỗi. Mỗi bài một session riêng + nới hạn mức cho suite này.
process.env.CHATBOT_RATE_LIMIT_PER_SENDER_PER_MIN = '1000';
process.env.CHATBOT_RATE_LIMIT_PER_SENDER_PER_DAY = '10000';
process.env.CHATBOT_RATE_LIMIT_PER_CHATBOT_PER_HOUR = '10000';

// customChat.service gọi thẳng Gemini bằng fetch + GEMINI_API_KEY, không qua
// geminiClient.util — nên phải mock chính service này.
const mockChat = jest.fn();
jest.unstable_mockModule('../../src/services/ai/customChat.service.js', () => ({
  default: { chat: mockChat },
}));

const request = (await import('supertest')).default;
const { createApp } = await import('../../src/app.js');
const db = (await import('../../src/config/database.js')).default;
const { truncateAll, createUser } = await import('./helpers/db.js');
const { default: chatbotRepository } = await import('../../src/repositories/ai/chatbot.repository.js');

let app;
let SESSION;
let sessionCounter = 0;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
  mockChat.mockReset();
  mockChat.mockResolvedValue({ content: 'Chào bạn!' });
  sessionCounter += 1;
  SESSION = `sess_test_${Date.now()}_${sessionCounter}`;
});

async function createChatbot(userId, overrides = {}) {
  const { rows } = await db.query(
    `INSERT INTO custom_chatbots (id_user, name, system_instruction, widget_key, is_active)
     VALUES ($1, $2, $3, $4, true) RETURNING *`,
    [userId, overrides.name || 'Bot test', 'Bạn là trợ lý.', overrides.widgetKey ?? null]
  );
  return rows[0];
}

const counts = async () => {
  const { rows } = await db.query(`
    SELECT (SELECT COUNT(*) FROM web_widget_configs)::int    AS widgets,
           (SELECT COUNT(*) FROM webchat_conversations)::int AS convs,
           (SELECT COUNT(*) FROM webchat_messages)::int      AS msgs
  `);
  return rows[0];
};

describe('web chat — widget + hội thoại không nhân bản', () => {
  it('nhiều tin cùng phiên chỉ tạo 1 widget và 1 hội thoại', async () => {
    const user = await createUser({ username: 'wc-dedupe' });
    const bot = await createChatbot(user.id);

    for (const text of ['xin chào', 'giá bao nhiêu', 'cảm ơn']) {
      const res = await request(app)
        .post(`/api/chatbot-public/custom-chatbot/id/${bot.id}/chat`)
        .send({ message: text, sessionId: SESSION });
      expect(res.status).toBe(200);
    }

    const after = await counts();
    expect(after.widgets).toBe(1);
    expect(after.convs).toBe(1);
    // 3 tin khách + 3 tin bot
    expect(after.msgs).toBe(6);
  });

  it('hai chatbot của cùng một user không dùng chung widget', async () => {
    const user = await createUser({ username: 'wc-two-bots' });
    const botA = await createChatbot(user.id, { name: 'Bot A' });
    const botB = await createChatbot(user.id, { name: 'Bot B' });

    for (const bot of [botA, botB]) {
      await request(app)
        .post(`/api/chatbot-public/custom-chatbot/id/${bot.id}/chat`)
        .send({ message: 'hi', sessionId: SESSION });
    }

    const after = await counts();
    expect(after.widgets).toBe(2);
    expect(after.convs).toBe(2);
  });

  it('tôn trọng widget_key có sẵn của chatbot thay vì tự đặt chatbot_<id>', async () => {
    const user = await createUser({ username: 'wc-custom-key' });
    const bot = await createChatbot(user.id, { widgetKey: 'kb_secret_x' });

    await request(app)
      .post(`/api/chatbot-public/custom-chatbot/id/${bot.id}/chat`)
      .send({ message: 'hi', sessionId: SESSION });

    const { rows } = await db.query(`SELECT widget_key FROM web_widget_configs`);
    expect(rows).toHaveLength(1);
    expect(rows[0].widget_key).toBe('kb_secret_x');
  });

  it('widget đã bị tắt không làm chatbot chết 500', async () => {
    const user = await createUser({ username: 'wc-inactive' });
    const bot = await createChatbot(user.id);

    // Lần 1 tạo widget, rồi chủ tắt nó đi
    await request(app)
      .post(`/api/chatbot-public/custom-chatbot/id/${bot.id}/chat`)
      .send({ message: 'hi', sessionId: SESSION });
    await db.query(`UPDATE web_widget_configs SET is_active = false`);

    // widget_key vẫn UNIQUE nên nhánh tạo mới sẽ vấp 23505 nếu đọc còn lọc is_active
    const res = await request(app)
      .post(`/api/chatbot-public/custom-chatbot/id/${bot.id}/chat`)
      .send({ message: 'lần hai', sessionId: SESSION });

    expect(res.status).toBe(200);
    const after = await counts();
    expect(after.widgets).toBe(1);
    expect(after.convs).toBe(1);
  });

  it('hai request đồng thời cùng phiên vẫn ra đúng 1 hội thoại', async () => {
    const user = await createUser({ username: 'wc-race' });
    const bot = await createChatbot(user.id);

    await Promise.all([
      request(app)
        .post(`/api/chatbot-public/custom-chatbot/id/${bot.id}/chat`)
        .send({ message: 'a', sessionId: SESSION }),
      request(app)
        .post(`/api/chatbot-public/custom-chatbot/id/${bot.id}/chat`)
        .send({ message: 'b', sessionId: SESSION }),
    ]);

    const after = await counts();
    expect(after.widgets).toBe(1);
    expect(after.convs).toBe(1);
  });
});

describe('web chat — khách nhận được tin chủ shop trả lời tay', () => {
  it('getChatMessages trả tin của agent sau khi bàn giao', async () => {
    const user = await createUser({ username: 'wc-handoff' });
    const bot = await createChatbot(user.id);

    await request(app)
      .post(`/api/chatbot-public/custom-chatbot/id/${bot.id}/chat`)
      .send({ message: 'cho hỏi', sessionId: SESSION });

    // Chủ shop tiếp quản và trả lời tay
    const { rows: convs } = await db.query(`SELECT id FROM webchat_conversations`);
    expect(convs).toHaveLength(1);
    await db.query(
      `UPDATE webchat_conversations SET ai_paused = true, ai_paused_at = NOW() WHERE id = $1`,
      [convs[0].id]
    );
    await db.query(
      `INSERT INTO webchat_messages (id_conversation, id_user, role, content)
       VALUES ($1, $2, 'agent', $3)`,
      [convs[0].id, user.id, 'Chào bạn, mình là chủ shop.']
    );

    // Trước bản vá endpoint này luôn trả mảng rỗng → chủ nói vào hư không
    const res = await request(app)
      .get(`/api/chatbot-public/custom-chatbot/id/${bot.id}/messages`)
      .query({ sessionId: SESSION });

    expect(res.status).toBe(200);
    const contents = (res.body?.data?.messages || []).map((m) => m.content);
    expect(contents).toContain('Chào bạn, mình là chủ shop.');
  });

  it('AI im lặng khi chủ đã tạm dừng', async () => {
    const user = await createUser({ username: 'wc-paused' });
    const bot = await createChatbot(user.id);

    await request(app)
      .post(`/api/chatbot-public/custom-chatbot/id/${bot.id}/chat`)
      .send({ message: 'tin 1', sessionId: SESSION });

    await db.query(`UPDATE webchat_conversations SET ai_paused = true, ai_paused_at = NOW()`);
    mockChat.mockClear();

    const res = await request(app)
      .post(`/api/chatbot-public/custom-chatbot/id/${bot.id}/chat`)
      .send({ message: 'tin 2', sessionId: SESSION });

    expect(res.status).toBe(200);
    expect(res.body?.data?.aiPaused).toBe(true);
    expect(mockChat).not.toHaveBeenCalled();
  });
});

describe('resolveWidgetForChatbot', () => {
  it('không tạo widget khi create: false', async () => {
    const user = await createUser({ username: 'wc-nocreate' });
    const bot = await createChatbot(user.id);

    const widget = await chatbotRepository.resolveWidgetForChatbot(bot, { create: false });
    expect(widget).toBeNull();
    expect((await counts()).widgets).toBe(0);
  });
});
