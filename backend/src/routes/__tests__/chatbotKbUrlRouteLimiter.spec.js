import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

/**
 * D-18: `POST /api/chatbot/kb/:kbId/documents/url` (nạp URL vào KB: máy chủ ta tải trang từ host ngoài + chia đoạn + embed) phải có
 * bộ giới hạn lượt. Bản cũ không có limiter nào.
 *
 * Dựng ĐÚNG chuỗi middleware của `chatbot.routes.js` thật; chỉ giả ranh giới (xác thực, quyền, bộ giới hạn, controller). Bộ giới hạn
 * giả có công tắc chặn — gỡ limiter khỏi route thì ca "bị chặn" đỏ (controller vẫn chạy).
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
  requireSelfContext: (req, res, next) => next(),
}));
jest.unstable_mockModule('../../middleware/rateLimiter.middleware.js', () => ({
  sseLimiter: (req, res, next) => next(),
  aiLimiter: (req, res, next) => next(),
  uploadLimiter: (...args) => uploadLimiter(...args),
}));
jest.unstable_mockModule('../../middleware/aiCredit.middleware.js', () => ({
  assertAiCreditAvailable: () => (req, res, next) => next(),
}));
jest.unstable_mockModule('../../middleware/storageCapacity.middleware.js', () => ({
  storageCapacityGuard: () => (req, res, next) => next(),
}));

const makeMockController = () => new Proxy({}, {
  get: (_target, prop) => (req, res) => {
    controllerCalls.push(String(prop));
    res.json({ success: true, method: String(prop) });
  },
});
jest.unstable_mockModule('../../controllers/chatbot.controller.js', () => ({ default: makeMockController() }));
jest.unstable_mockModule('../../controllers/unifiedInbox.controller.js', () => ({ default: makeMockController() }));
jest.unstable_mockModule('../../controllers/zaloPersonalSync.controller.js', () => ({ default: makeMockController() }));
jest.unstable_mockModule('../../controllers/chatbot/aiActivity.controller.js', () => ({ default: makeMockController() }));
jest.unstable_mockModule('../../controllers/chatbot/chatbotContactAlert.controller.js', () => ({ default: makeMockController() }));

const { default: chatbotRoutes } = await import('../chatbot.routes.js');

const app = express();
app.use(express.json());
app.use('/api/chatbot', chatbotRoutes);

const post = () => request(app).post('/api/chatbot/kb/7/documents/url').send({ url: 'https://example.com/bai-viet' });

describe('chatbot.routes — nạp URL vào KB có uploadLimiter (D-18)', () => {
  beforeEach(() => {
    limiterBlocks = false;
    controllerCalls.length = 0;
    uploadLimiter.mockClear();
  });

  it('đi qua uploadLimiter rồi tới controller', async () => {
    const res = await post();

    expect(res.status).toBe(200);
    expect(uploadLimiter).toHaveBeenCalledTimes(1);
    expect(controllerCalls).toEqual(['addUrlDocument']);
  });

  it('vượt trần lượt → 429 và controller (tải trang ngoài + embed) KHÔNG được chạy', async () => {
    limiterBlocks = true;

    const res = await post();

    expect(res.status).toBe(429);
    expect(res.body.code).toBe('UPLOAD_RATE_LIMIT_EXCEEDED');
    expect(controllerCalls).toEqual([]);
  });
});
