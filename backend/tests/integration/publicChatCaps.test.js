/**
 * PLAN_SUA_AI_DOT4_PR5 (A P0-4) — trần chat CÔNG KHAI không phụ thuộc client, qua HTTP thật (parser, route, controller, DB):
 *   - một IP đổi sessionId mỗi request vẫn chạm trần IP + chatbot (trước: trần theo sessionId nên không bao giờ chạm);
 *   - hai IP khác nhau không chung trần;
 *   - trang theo id KHÔNG gửi sessionId: khoá người gửi theo IP + chatbot (trước: ngẫu nhiên mỗi request);
 *   - tổng tin khách/ngày/chatbot (mọi IP) có trần;
 *   - chạm trần → 429 câu tiếng Việt + KHÔNG gọi AI, KHÔNG trừ credit, KHÔNG lưu tin.
 * IP khác nhau được dựng bằng X-Forwarded-For (TRUST_PROXY=true: loopback là chặng tin cậy, như nginx/Cloudflare ở production).
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

process.env.TRUST_PROXY = 'true';
// Bộ đếm theo người gửi / chatbot-giờ không phải đối tượng của file này: nới để chỉ trần công khai quyết định.
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
const chatbotRateLimitService = (await import('../../src/services/chatbot/chatbotRateLimit.service.js')).default;
const { truncateAll, createUser } = await import('./helpers/db.js');

const CAP_ENV = ['PUBLIC_CHAT_PER_IP_PER_10MIN', 'PUBLIC_CHAT_PER_IP_PER_DAY', 'PUBLIC_CHAT_DAILY_CAP_PER_CHATBOT'];

let app;
let owner;
let bot;
let otherBot;
let sessionCounter = 0;
const nextSession = () => `sess_caps_${Date.now()}_${++sessionCounter}_xxxxxxxx`;

beforeAll(() => {
  app = createApp();
});

beforeEach(async () => {
  await truncateAll();
  chatbotRateLimitService._resetMemoryForTests();
  for (const key of CAP_ENV) delete process.env[key];
  mockChat.mockReset();
  mockChat.mockResolvedValue({ content: 'Chào bạn!' });
  owner = await createUser({ username: `caps${Date.now()}` });
  const insert = async (name, widgetKey) => (await db.query(
    `INSERT INTO custom_chatbots (id_user, name, widget_key, is_active, allow_public_numeric_id)
     VALUES ($1, $2, $3, true, true) RETURNING *`,
    [owner.id, name, widgetKey]
  )).rows[0];
  bot = await insert('Bot caps', 'wk_caps');
  otherBot = await insert('Bot caps khác', 'wk_caps_other');
});

afterEach(() => {
  for (const key of CAP_ENV) delete process.env[key];
});

const widgetChat = (key, ip) => request(app)
  .post(`/api/chatbot-public/custom-chatbot/${key}/chat`)
  .set('X-Forwarded-For', ip);
const pageChat = (idOrKey, ip) => request(app)
  .post(`/api/chatbot-public/custom-chatbot/id/${idOrKey}/chat`)
  .set('X-Forwarded-For', ip);
const messageCount = async () => (await db.query('SELECT count(*)::int AS n FROM webchat_messages')).rows[0].n;

describe('A P0-4 — một IP đổi sessionId mỗi request vẫn chạm trần IP + chatbot', () => {
  it.each([
    ['widget theo key', (ip) => widgetChat('wk_caps', ip)],
    ['trang công khai theo id', (ip) => pageChat('wk_caps', ip)],
  ])('%s: 5 tin qua, tin 6 (sessionId mới tinh) → 429 + câu tiếng Việt; AI chỉ được gọi 5 lần; IP khác vẫn chat được', async (_label, post) => {
    process.env.PUBLIC_CHAT_PER_IP_PER_10MIN = '5';

    for (let i = 0; i < 5; i++) {
      const ok = await post('203.0.113.50').send({ message: `tin ${i}`, sessionId: nextSession(), history: [] });
      expect(ok.status).toBe(200);
    }
    const before = await messageCount();

    const blocked = await post('203.0.113.50').send({ message: 'tin 6', sessionId: nextSession(), history: [] });
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({
      success: false,
      code: 'PUBLIC_CHAT_LIMITED',
      message: expect.stringContaining('chờ vài phút'),
    });
    expect(mockChat).toHaveBeenCalledTimes(5);
    expect(await messageCount()).toBe(before); // không lưu tin khách bị chặn

    const otherIp = await post('203.0.113.51').send({ message: 'tin của người khác', sessionId: nextSession(), history: [] });
    expect(otherIp.status).toBe(200);
    expect(mockChat).toHaveBeenCalledTimes(6);
  });

  it('trần theo IP + CHATBOT: cùng IP chat với chatbot khác vẫn được', async () => {
    process.env.PUBLIC_CHAT_PER_IP_PER_10MIN = '2';
    await widgetChat('wk_caps', '203.0.113.60').send({ message: 'a', sessionId: nextSession(), history: [] });
    await widgetChat('wk_caps', '203.0.113.60').send({ message: 'b', sessionId: nextSession(), history: [] });
    const blocked = await widgetChat('wk_caps', '203.0.113.60').send({ message: 'c', sessionId: nextSession(), history: [] });
    expect(blocked.status).toBe(429);

    const other = await widgetChat('wk_caps_other', '203.0.113.60').send({ message: 'd', sessionId: nextSession(), history: [] });
    expect(other.status).toBe(200);
  });

  it('trần ngày theo IP + chatbot (PUBLIC_CHAT_PER_IP_PER_DAY): chặn dù cửa sổ 10 phút còn trống', async () => {
    process.env.PUBLIC_CHAT_PER_IP_PER_10MIN = '1000';
    process.env.PUBLIC_CHAT_PER_IP_PER_DAY = '3';
    for (let i = 0; i < 3; i++) {
      expect((await widgetChat('wk_caps', '203.0.113.70').send({ message: `t${i}`, sessionId: nextSession(), history: [] })).status).toBe(200);
    }
    const blocked = await widgetChat('wk_caps', '203.0.113.70').send({ message: 't4', sessionId: nextSession(), history: [] });
    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toContain('ngày mai');
  });
});

describe('A P0-4 — trang theo id không gửi sessionId: khoá người gửi theo IP + chatbot', () => {
  it('request thứ 4 không sessionId từ cùng IP chạm trần người gửi (3/phút); IP khác không bị gộp', async () => {
    process.env.CHATBOT_RATE_LIMIT_PER_SENDER_PER_MIN = '3';
    try {
      for (let i = 0; i < 3; i++) {
        const ok = await pageChat('wk_caps', '203.0.113.80').send({ message: `không session ${i}`, history: [] });
        expect(ok.status).toBe(200);
        expect(ok.body.data.rateLimited).toBeUndefined();
      }
      const limited = await pageChat('wk_caps', '203.0.113.80').send({ message: 'không session 4', history: [] });
      expect(limited.status).toBe(200);
      expect(limited.body.data).toEqual(expect.objectContaining({ rateLimited: true, reason: 'sender_minute' }));
      expect(mockChat).toHaveBeenCalledTimes(3);

      const otherIp = await pageChat('wk_caps', '203.0.113.81').send({ message: 'IP khác', history: [] });
      expect(otherIp.status).toBe(200);
      expect(otherIp.body.data.rateLimited).toBeUndefined();
      expect(mockChat).toHaveBeenCalledTimes(4);
    } finally {
      process.env.CHATBOT_RATE_LIMIT_PER_SENDER_PER_MIN = '1000';
    }
  });
});

describe('A P0-4 — trần tổng theo chatbot / ngày (mọi IP ẩn danh)', () => {
  it('IP thứ N+1 (chưa từng gửi) vẫn bị chặn khi tổng chatbot đã chạm trần; chatbot khác không bị ảnh hưởng', async () => {
    process.env.PUBLIC_CHAT_DAILY_CAP_PER_CHATBOT = '3';
    for (let i = 0; i < 3; i++) {
      const ok = await widgetChat('wk_caps', `198.51.100.${10 + i}`).send({ message: `khách ${i}`, sessionId: nextSession(), history: [] });
      expect(ok.status).toBe(200);
    }
    const blocked = await widgetChat('wk_caps', '198.51.100.99').send({ message: 'khách cuối', sessionId: nextSession(), history: [] });
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('PUBLIC_CHAT_LIMITED');
    expect(blocked.body.message).toContain('liên hệ trực tiếp');
    expect(mockChat).toHaveBeenCalledTimes(3);

    const other = await widgetChat('wk_caps_other', '198.51.100.99').send({ message: 'bot khác', sessionId: nextSession(), history: [] });
    expect(other.status).toBe(200);
  });

  it('mặc định production-like: 300 tin/ngày/chatbot (đo thật cao nhất 16 tin/ngày) — hằng số đọc từ env, mặc định 300', () => {
    expect(chatbotRateLimitService.publicDailyCapPerChatbot).toBe(300);
    expect(chatbotRateLimitService.publicPerIpPer10Min).toBe(20);
    expect(chatbotRateLimitService.publicPerIpPerDay).toBe(100);
  });
});
