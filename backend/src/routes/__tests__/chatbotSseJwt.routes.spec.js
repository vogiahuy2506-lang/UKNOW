/**
 * GET /api/ai/chatbot/inbox/stream?token=… — jwt.verify của luồng SSE chỉ nhận HS256.
 * resolveUserContext được mock ném 403 để handler trả JSON ngay (không mở stream SSE).
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-sse-pin';

import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const mockResolveUserContext = jest.fn();

jest.unstable_mockModule('../../middleware/auth.middleware.js', () => ({
  default: (req, res, next) => {
    req.user = { id: 1 };
    next();
  },
  resolveUserContext: mockResolveUserContext,
  optionalAuthMiddleware: (req, res, next) => next(),
  attachUserIdForRateLimit: (req, res, next) => next(),
  attachSseUserIdForRateLimit: (req, res, next) => next(),
}));

jest.unstable_mockModule('../../middleware/authorization.middleware.js', () => ({
  default: (req, res, next) => next(),
  requireSelfContext: (req, res, next) => next(),
  requirePermission: () => (req, res, next) => next(),
  requireActivePlan: (req, res, next) => next(),
  requirePhone: (req, res, next) => next(),
  requirePasswordChange: (req, res, next) => next(),
  hasPermission: () => true,
}));

jest.unstable_mockModule('../../middleware/rateLimiter.middleware.js', () => ({
  aiLimiter: (req, res, next) => next(),
  uploadLimiter: (req, res, next) => next(),
  sseLimiter: (req, res, next) => next(),
  campaignRunLimiter: (req, res, next) => next(),
  quickSendTestLimiter: (req, res, next) => next(),
  marketplacePurchaseLimiter: (req, res, next) => next(),
  webhookLimiter: (req, res, next) => next(),
  publicLeadLimiter: (req, res, next) => next(),
}));

jest.unstable_mockModule('../../services/chatbot/inProcChannelGateway/index.js', () => ({
  __esModule: true,
  getState: jest.fn(() => ({})),
  isStubOnly: jest.fn(() => true),
  ensureGateway: jest.fn(async () => ({ ok: true })),
  getSecret: jest.fn(() => ''),
  getNodeJsCallbackUrl: jest.fn(() => ''),
  getChannelGateway: jest.fn(),
  configureChannel: jest.fn(),
  shutdownGateway: jest.fn(async () => {}),
  installLifecycleHooks: jest.fn(),
}));

let app;

beforeAll(async () => {
  const { default: chatbotRoutes } = await import('../../routes/chatbot.routes.js');
  app = express();
  app.use('/api/ai/chatbot', chatbotRoutes);
});

beforeEach(() => {
  mockResolveUserContext.mockReset();
  const err = new Error('stop');
  err.status = 403;
  err.body = { success: false, code: 'TEST_STOP' };
  mockResolveUserContext.mockRejectedValue(err);
});

const sign = (alg) => jwt.sign({ userId: 9 }, process.env.JWT_SECRET, { algorithm: alg });

describe('SSE /inbox/stream — jwt.verify chỉ nhận HS256', () => {
  it.each(['HS384', 'HS512'])('token %s (đúng khoá) → 401 Invalid token, không nạp user', async (alg) => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(app).get('/api/ai/chatbot/inbox/stream').query({ token: sign(alg) });
    errorSpy.mockRestore();

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid token');
    expect(mockResolveUserContext).not.toHaveBeenCalled();
  });

  it('token HS256 → qua verify, nạp user theo userId trong token', async () => {
    const res = await request(app).get('/api/ai/chatbot/inbox/stream').query({ token: sign('HS256') });

    expect(mockResolveUserContext).toHaveBeenCalledWith(9, expect.any(Object));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('TEST_STOP');
  });
});
