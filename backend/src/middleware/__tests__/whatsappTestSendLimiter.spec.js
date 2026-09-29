/**
 * PR-W1 — whatsappTestSendLimiter: 10 lượt / giờ / người, lượt 11 -> 429. Limiter bỏ qua khi NODE_ENV=test
 * (`skipInTest` chốt lúc nạp module) nên nạp một bản riêng (query string khác) với NODE_ENV=development.
 */
import { describe, expect, it, beforeAll, afterAll } from '@jest/globals';
import express from 'express';
import request from 'supertest';

let limiter;
let config;
const prevEnv = process.env.NODE_ENV;

beforeAll(async () => {
  process.env.NODE_ENV = 'development';
  const mod = await import('../rateLimiter.middleware.js?whatsapp-limiter-live');
  limiter = mod.whatsappTestSendLimiter;
  config = mod.WHATSAPP_TEST_SEND_CONFIG;
});
afterAll(() => {
  process.env.NODE_ENV = prevEnv;
});

const makeApp = () => {
  const app = express();
  app.use((req, res, next) => {
    req.user = { id: Number(req.headers['x-uid']) };
    next();
  });
  app.post('/send', limiter, (req, res) => res.json({ ok: true }));
  return app;
};

describe('whatsappTestSendLimiter', () => {
  it('cấu hình: 10 lượt / 1 giờ', () => {
    expect(config.max).toBe(10);
    expect(config.windowMs).toBe(60 * 60 * 1000);
  });

  it('10 lượt đầu qua, lượt 11 -> 429 đúng mã; người khác không bị ảnh hưởng', async () => {
    const app = makeApp();
    for (let i = 1; i <= 10; i += 1) {
      const res = await request(app).post('/send').set('x-uid', '501');
      expect(res.status).toBe(200);
    }
    const blocked = await request(app).post('/send').set('x-uid', '501');
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('WHATSAPP_TEST_SEND_RATE_LIMIT_EXCEEDED');
    const other = await request(app).post('/send').set('x-uid', '502');
    expect(other.status).toBe(200);
  });
});
