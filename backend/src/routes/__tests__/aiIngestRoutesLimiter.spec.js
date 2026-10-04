import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

/**
 * D-11 (và D-18): các đường NẠP tài liệu vào chatbot Studio phải có bộ giới hạn lượt.
 *
 * Dựng ĐÚNG chuỗi middleware của `ai.routes.js` thật; chỉ giả ranh giới (xác thực, quyền, bộ giới hạn, controller). Bộ giới hạn
 * giả có công tắc chặn: khi chặn thì trả 429 và controller KHÔNG được gọi — nếu ai gỡ limiter khỏi route, ca "bị chặn" đỏ.
 *
 * Bản cũ: `/custom-chat/upload` (OCR Gemini + tệp tới 100 MB nằm trong RAM) và `/custom-chat/scrape/:chatbotId` (mở Chrome)
 * không có limiter nào.
 */
let limiterBlocks = false;
const uploadLimiter = jest.fn((req, res, next) => {
  if (limiterBlocks) return res.status(429).json({ success: false, code: 'UPLOAD_RATE_LIMIT_EXCEEDED' });
  return next();
});
const controllerCalls = [];

jest.unstable_mockModule('../../middleware/auth.middleware.js', () => ({
  default: (req, res, next) => { req.user = { id: 1, role: 'user', activeContext: { type: 'self' } }; next(); },
  resolveUserContext: jest.fn(),
  optionalAuthMiddleware: (req, res, next) => next(),
  attachSseUserIdForRateLimit: (req, res, next) => next(),
  attachUserIdForRateLimit: (req, res, next) => next(),
}));
jest.unstable_mockModule('../../middleware/authorization.middleware.js', () => ({
  requireActivePlan: (req, res, next) => next(),
  requirePasswordChange: (req, res, next) => next(),
  requirePhone: (req, res, next) => next(),
  requirePermission: () => (req, res, next) => next(),
  requireAllPermissions: () => (req, res, next) => next(),
  requireSelfContext: (req, res, next) => next(),
}));
jest.unstable_mockModule('../../middleware/rateLimiter.middleware.js', () => ({
  aiLimiter: (req, res, next) => next(),
  uploadLimiter: (...args) => uploadLimiter(...args),
  sseLimiter: (req, res, next) => next(),
}));
jest.unstable_mockModule('../../middleware/aiCredit.middleware.js', () => ({
  assertAiCreditAvailable: () => (req, res, next) => next(),
}));
jest.unstable_mockModule('../../middleware/channelEntitlement.middleware.js', () => ({
  channelEntitlementContext: (req, res, next) => next(),
  default: (req, res, next) => next(),
}));
jest.unstable_mockModule('../../middleware/storageCapacity.middleware.js', () => ({
  storageCapacityGuard: () => (req, res, next) => next(),
}));
jest.unstable_mockModule('../../controllers/ai.controller.js', () => ({
  default: new Proxy({}, {
    get: (_target, prop) => (req, res) => {
      controllerCalls.push(String(prop));
      res.json({ success: true, method: String(prop) });
    },
  }),
}));

const { default: aiRoutes } = await import('../ai.routes.js');

const app = express();
app.use(express.json());
app.use('/api/ai', aiRoutes);

describe('ai.routes — nạp tài liệu qua tệp có uploadLimiter (D-11)', () => {
  beforeEach(() => {
    limiterBlocks = false;
    controllerCalls.length = 0;
    uploadLimiter.mockClear();
  });

  it('POST /custom-chat/upload đi qua uploadLimiter rồi tới controller', async () => {
    const res = await request(app).post('/api/ai/custom-chat/upload').field('chatbot_id', '17').attach('file', Buffer.from('xin chào'), 'a.txt');

    expect(res.status).toBe(200);
    expect(uploadLimiter).toHaveBeenCalledTimes(1);
    expect(controllerCalls).toEqual(['customChatUpload']);
  });

  it('vượt trần lượt → 429 và controller (OCR, embedding) KHÔNG được chạy', async () => {
    limiterBlocks = true;

    const res = await request(app).post('/api/ai/custom-chat/upload').field('chatbot_id', '17').attach('file', Buffer.from('xin chào'), 'a.txt');

    expect(res.status).toBe(429);
    expect(res.body.code).toBe('UPLOAD_RATE_LIMIT_EXCEEDED');
    expect(controllerCalls).toEqual([]);
  });
});
