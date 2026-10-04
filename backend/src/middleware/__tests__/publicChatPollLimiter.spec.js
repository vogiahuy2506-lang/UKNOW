/**
 * H-02 (PLAN_WEBCHAT_NHAN_TIN_TRA_LOI_TAY_2026-10-04) — bộ giới hạn riêng cho poll tin nhân viên trả lời tay
 * (GET /api/chatbot-public/custom-chatbot/[id/]:key/messages). Dựng app express nhỏ, gọi factory với { skip: () => false } để
 * bật limiter thật (mặc định skipInTest bỏ qua hoàn toàn trong NODE_ENV=test), giả IP bằng X-Forwarded-For + trust proxy —
 * cùng khuôn authLimiters.spec.js.
 */
import { describe, it, expect, afterEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import {
  PUBLIC_CHAT_POLL_CONFIG,
  createPublicChatPollIpLimiter,
  createPublicChatPollSessionLimiter,
  isPublicChatPollPath,
  shouldSkipGlobalLimiter,
} from '../rateLimiter.middleware.js';

const NO_SKIP = { skip: () => false };

// Một server mỗi ca, tắt ở afterEach (xem ghi chú ở authLimiters.spec.js về cổng loopback trên macOS).
const openServers = [];
afterEach(async () => {
  await Promise.all(openServers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

function buildPollApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.get('/poll', createPublicChatPollIpLimiter(NO_SKIP), createPublicChatPollSessionLimiter(NO_SKIP), (_req, res) => {
    res.json({ success: true });
  });
  const server = app.listen(0);
  openServers.push(server);
  return server;
}

const poll = (app, ip, sessionId) => request(app)
  .get('/poll')
  .query(sessionId === undefined ? {} : { sessionId })
  .set('X-Forwarded-For', ip)
  .set('Connection', 'close');

describe('publicChatPoll limiter — cấu hình', () => {
  it('ghim số: 30 lượt/phút/(IP+phiên), 240 lượt/phút/IP', () => {
    expect(PUBLIC_CHAT_POLL_CONFIG.windowMs).toBe(60 * 1000);
    expect(PUBLIC_CHAT_POLL_CONFIG.perSessionMax).toBe(30);
    expect(PUBLIC_CHAT_POLL_CONFIG.perIpMax).toBe(240);
    expect(PUBLIC_CHAT_POLL_CONFIG.code).toBe('CHAT_POLL_RATE_LIMIT_EXCEEDED');
  });

  it('poll 8 giây/lần (7,5 lượt/phút) nằm gọn dưới trần phiên, kể cả 3 tab cùng phiên', () => {
    expect((60 / 8) * 3).toBeLessThan(PUBLIC_CHAT_POLL_CONFIG.perSessionMax);
  });
});

describe('publicChatPollSessionLimiter (IP + sessionId)', () => {
  it('30 lượt đầu qua, lượt 31 = 429 CHAT_POLL_RATE_LIMIT_EXCEEDED', async () => {
    const app = buildPollApp();
    for (let i = 0; i < PUBLIC_CHAT_POLL_CONFIG.perSessionMax; i += 1) {
      const res = await poll(app, '10.1.0.1', 'sess_A');
      expect(res.status).toBe(200);
    }
    const blocked = await poll(app, '10.1.0.1', 'sess_A');
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('CHAT_POLL_RATE_LIMIT_EXCEEDED');
  });

  it('phiên A cạn lượt thì phiên B cùng IP VẪN qua (khách cùng IP văn phòng không chặn nhau)', async () => {
    const app = buildPollApp();
    for (let i = 0; i <= PUBLIC_CHAT_POLL_CONFIG.perSessionMax; i += 1) {
      await poll(app, '10.1.0.2', 'sess_A');
    }
    expect((await poll(app, '10.1.0.2', 'sess_A')).status).toBe(429);
    expect((await poll(app, '10.1.0.2', 'sess_B')).status).toBe(200);
  });

  it('cùng phiên nhưng IP khác → bộ đếm riêng', async () => {
    const app = buildPollApp();
    for (let i = 0; i <= PUBLIC_CHAT_POLL_CONFIG.perSessionMax; i += 1) {
      await poll(app, '10.1.0.3', 'sess_A');
    }
    expect((await poll(app, '10.1.0.4', 'sess_A')).status).toBe(200);
  });
});

describe('publicChatPollIpLimiter (IP)', () => {
  it('đổi sessionId mỗi lượt để né trần phiên → vẫn bị chặn ở lượt 241 theo IP', async () => {
    const app = buildPollApp();
    for (let i = 0; i < PUBLIC_CHAT_POLL_CONFIG.perIpMax; i += 1) {
      const res = await poll(app, '10.2.0.1', `sess_rot_${i}`);
      expect(res.status).toBe(200);
    }
    const blocked = await poll(app, '10.2.0.1', 'sess_rot_last');
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('CHAT_POLL_RATE_LIMIT_EXCEEDED');
    // IP khác không bị ảnh hưởng.
    expect((await poll(app, '10.2.0.2', 'sess_rot_0')).status).toBe(200);
  }, 30000);
});

describe('isPublicChatPollPath / shouldSkipGlobalLimiter — globalLimiter không đếm poll', () => {
  const req = (method, originalUrl) => ({ method, originalUrl });

  it.each([
    '/api/chatbot-public/custom-chatbot/wk_abc/messages?sessionId=sess_x&afterId=3',
    '/api/chatbot-public/custom-chatbot/wk_abc/messages',
    '/api/chatbot-public/custom-chatbot/id/12/messages?sessionId=sess_x',
    '/api/chatbot-public/custom-chatbot/id/5db50541/messages?sessionId=sess_x',
  ])('GET %s → bỏ qua globalLimiter', (url) => {
    expect(isPublicChatPollPath(req('GET', url))).toBe(true);
    expect(shouldSkipGlobalLimiter(req('GET', url))).toBe(true);
  });

  it.each([
    ['POST', '/api/chatbot-public/custom-chatbot/wk_abc/messages'],
    ['GET', '/api/chatbot-public/custom-chatbot/wk_abc/config'],
    ['GET', '/api/chatbot-public/custom-chatbot/wk_abc'],
    ['POST', '/api/chatbot-public/custom-chatbot/wk_abc/chat'],
    ['POST', '/api/chatbot-public/custom-chatbot/wk_abc/attachment'],
    ['GET', '/api/chatbot-public/chatbot/12'],
    // Đường /messages của Hộp thư (có đăng nhập) KHÔNG được miễn.
    ['GET', '/api/ai/chatbot/inbox/conversations/5/messages'],
    ['GET', '/api/chatbot-public/custom-chatbot/wk_abc/messages/extra'],
  ])('%s %s → vẫn bị globalLimiter đếm', (method, url) => {
    expect(isPublicChatPollPath(req(method, url))).toBe(false);
    expect(shouldSkipGlobalLimiter(req(method, url))).toBe(false);
  });

  it('luồng SSE hộp thư vẫn được miễn như cũ', () => {
    expect(shouldSkipGlobalLimiter(req('GET', '/api/ai/chatbot/inbox/stream?ticket=abc'))).toBe(true);
  });
});
