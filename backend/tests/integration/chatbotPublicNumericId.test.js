/**
 * PLAN_SUA_AI_DOT4_PR5 (A P1-5) — id số chỉ chat công khai được với chatbot ĐÃ CÓ lúc migrate (CSDL thật + HTTP thật).
 *
 * Gồm: migration 284 (backfill + chạy lại không bật lại cho bot mới), đường theo id số (bot cũ cờ true chạy, bot mới cờ
 * false 404 — không phân biệt "có nhưng cấm" với "không có"), đường theo widget_key luôn chạy cho cả hai loại bot,
 * link ngắn /<widget_key> chuyển tới /chat/<widget_key> (không lộ id số).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

// Bộ giới hạn theo người gửi / chatbot không phải đối tượng của file này: nới để mỗi ca không đụng trần.
process.env.CHATBOT_RATE_LIMIT_PER_SENDER_PER_MIN = '1000';
process.env.CHATBOT_RATE_LIMIT_PER_SENDER_PER_HOUR = '10000';
process.env.CHATBOT_RATE_LIMIT_PER_SENDER_PER_DAY = '10000';
process.env.CHATBOT_RATE_LIMIT_PER_CHATBOT_PER_HOUR = '10000';

const mockChat = jest.fn();
jest.unstable_mockModule('../../src/services/ai/customChat.service.js', () => ({
  default: { chat: mockChat },
}));

const request = (await import('supertest')).default;
const { createApp } = await import('../../src/app.js');
const db = (await import('../../src/config/database.js')).default;
const { truncateAll, createUser } = await import('./helpers/db.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION_SQL = fs.readFileSync(
  path.resolve(__dirname, '../../migrations/284_custom_chatbots_allow_public_numeric_id.sql'),
  'utf8'
);

let app;
let owner;
let sessionCounter = 0;
const nextSession = () => `sess_numid_${Date.now()}_${++sessionCounter}_xxxxxxxx`;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
  mockChat.mockReset();
  mockChat.mockResolvedValue({ content: 'Chào bạn!' });
  owner = await createUser({ username: `numid${Date.now()}` });
});

afterEach(async () => {
  // Migration tự thêm lại cột khi thiếu — mọi ca sau luôn thấy cột.
  await db.query(MIGRATION_SQL);
});

async function insertBot({ widgetKey, allowNumericId }) {
  const { rows } = await db.query(
    `INSERT INTO custom_chatbots (id_user, name, system_instruction, widget_key, is_active, allow_public_numeric_id)
     VALUES ($1, $2, 'BÍ MẬT', $3, true, $4) RETURNING *`,
    [owner.id, `Bot ${widgetKey}`, widgetKey, allowNumericId]
  );
  return rows[0];
}

describe('migration 284 — backfill + chạy lại không bật lại cho bot mới', () => {
  it('bot ĐANG CÓ lúc migrate → true; bot tạo SAU → false (mặc định); chạy migration LẠI không bật id số cho bot mới', async () => {
    // Dựng lại đúng trạng thái "trước migration": cột chưa có.
    await db.query('ALTER TABLE custom_chatbots DROP COLUMN allow_public_numeric_id');
    const { rows: before } = await db.query(
      `INSERT INTO custom_chatbots (id_user, name, widget_key) VALUES ($1, 'Bot cũ 1', 'wk_old_1'), ($1, 'Bot cũ 2', 'wk_old_2') RETURNING id`,
      [owner.id]
    );

    await db.query(MIGRATION_SQL);

    const flagOf = async (id) =>
      (await db.query('SELECT allow_public_numeric_id FROM custom_chatbots WHERE id = $1', [id])).rows[0].allow_public_numeric_id;
    for (const { id } of before) expect(await flagOf(id)).toBe(true);

    const { rows: after } = await db.query(
      `INSERT INTO custom_chatbots (id_user, name, widget_key) VALUES ($1, 'Bot mới', 'wk_new_1') RETURNING id`,
      [owner.id]
    );
    expect(await flagOf(after[0].id)).toBe(false);

    await db.query(MIGRATION_SQL);
    expect(await flagOf(after[0].id)).toBe(false);
    for (const { id } of before) expect(await flagOf(id)).toBe(true);
  });
});

describe('đường theo id số — bot cũ (cờ true) chạy, bot mới (cờ false) 404', () => {
  let oldBot;
  let newBot;

  beforeEach(async () => {
    oldBot = await insertBot({ widgetKey: 'wk_old', allowNumericId: true });
    newBot = await insertBot({ widgetKey: 'wk_new', allowNumericId: false });
  });

  const chatById = (idOrKey) => request(app).post(`/api/chatbot-public/custom-chatbot/id/${idOrKey}/chat`);

  it('GET /chatbot-public/chatbot/:id — bot cũ 200; bot mới 404 CÙNG thân với id không tồn tại (không phân biệt "cấm" và "không có")', async () => {
    const okRes = await request(app).get(`/api/chatbot-public/chatbot/${oldBot.id}`);
    expect(okRes.status).toBe(200);
    expect(okRes.body.data.id).toBe(oldBot.id);

    const forbidden = await request(app).get(`/api/chatbot-public/chatbot/${newBot.id}`);
    const missing = await request(app).get('/api/chatbot-public/chatbot/987654321');
    expect(forbidden.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(forbidden.body).toEqual(missing.body);
  });

  it('POST .../custom-chatbot/id/:id/chat — bot cũ chat được; bot mới 404, KHÔNG gọi AI, KHÔNG tạo hội thoại/tin', async () => {
    const okRes = await chatById(oldBot.id).send({ message: 'xin chào', sessionId: nextSession(), history: [] });
    expect(okRes.status).toBe(200);
    expect(okRes.body.data.content).toBe('Chào bạn!');
    expect(mockChat).toHaveBeenCalledTimes(1);

    const { rows: before } = await db.query('SELECT count(*)::int AS n FROM webchat_messages');
    const denied = await chatById(newBot.id).send({ message: 'xin chào', sessionId: nextSession(), history: [] });
    expect(denied.status).toBe(404);
    expect(mockChat).toHaveBeenCalledTimes(1);
    const { rows: after } = await db.query('SELECT count(*)::int AS n FROM webchat_messages');
    expect(after[0].n).toBe(before[0].n);
  });

  it('GET .../custom-chatbot/id/:id/messages (poll tin nhân viên) — bot mới theo id số 404, bot cũ 200', async () => {
    const sessionId = nextSession();
    const okRes = await request(app).get(`/api/chatbot-public/custom-chatbot/id/${oldBot.id}/messages`).query({ sessionId });
    expect(okRes.status).toBe(200);
    const denied = await request(app).get(`/api/chatbot-public/custom-chatbot/id/${newBot.id}/messages`).query({ sessionId });
    expect(denied.status).toBe(404);
  });

  it('bot mới VẪN chat được theo widget_key: widget (/custom-chatbot/:key/chat), trang /chat/<key> (/id/<key>/chat), GET /chatbot/<key>', async () => {
    const widget = await request(app)
      .post('/api/chatbot-public/custom-chatbot/wk_new/chat')
      .send({ message: 'xin chào', sessionId: nextSession(), history: [] });
    expect(widget.status).toBe(200);

    const page = await chatById('wk_new').send({ message: 'xin chào', sessionId: nextSession(), history: [] });
    expect(page.status).toBe(200);

    const config = await request(app).get('/api/chatbot-public/chatbot/wk_new');
    expect(config.status).toBe(200);
    expect(config.body.data.id).toBe(newBot.id);
    expect(mockChat).toHaveBeenCalledTimes(2);
  });

  it('link ngắn /<widget_key> chuyển tới /chat/<widget_key>, KHÔNG phải /chat/<id số> (id số của bot mới sẽ 404)', async () => {
    const res = await request(app).get('/wk_new').redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/\/chat\/wk_new$/);
    expect(res.headers.location).not.toContain(`/chat/${newBot.id}`);
  });
});
