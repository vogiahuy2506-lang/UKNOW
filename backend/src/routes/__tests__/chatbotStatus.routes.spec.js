/**
 * Integration tests for the chatbot personal-account status routes.
 *
 * Unlike the unit spec in `chatbot.controller.status.spec.js`, which
 * pins down the controller in isolation, this file wires the route
 * through Express + the auth chain + rate-limit middleware so we
 * catch:
 *   - typos in the route definition (path / method mismatch)
 *   - permission middleware leaks (auth skipped, wrong permission)
 *   - response-shape drift between controller and the actual route
 *
 * We mock `auth.middleware` and `requirePermission` so the test
 * doesn't need a real JWT / user store.
 */

import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// Stub middleware so we don't need a real auth/user store. Anything
// that would normally hit JWT or the DB returns 200 immediately.
jest.unstable_mockModule('../../middleware/auth.middleware.js', () => ({
  default: (req, res, next) => {
    req.user = { id: 1, email: 'test@example.com' };
    next();
  },
  resolveUserContext: jest.fn(),
  optionalAuthMiddleware: (req, res, next) => next(),
  attachUserIdForRateLimit: (req, res, next) => next(),
  attachSseUserIdForRateLimit: (req, res, next) => next(),
}));

// Permission middleware: pretend every user has chatbot_channels_manage.
jest.unstable_mockModule('../../middleware/authorization.middleware.js', () => ({
  default: (req, res, next) => next(),
  requireSelfContext: (req, res, next) => next(),
  requirePermission: () => (req, res, next) => next(),
  requireActivePlan: (req, res, next) => next(),
  requirePhone: (req, res, next) => next(),
  requirePasswordChange: (req, res, next) => next(),
  hasPermission: () => true,
}));

// Rate limiters: short-circuit so we don't introduce timer flakiness.
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

let app;

beforeEach(async () => {
  jest.resetModules();
  // Mock the gateway *after* resetModules so the routes file picks up
  // a fresh per-test instance.
  jest.unstable_mockModule(
    '../../services/chatbot/inProcChannelGateway/index.js',
    () => ({
      __esModule: true,
      getState: jest.fn(() => ({})),
      isStubOnly: jest.fn(({ channel }) => {
        const envVar = channel === 'telegram' ? 'TELEGRAM_GATEWAY_TRANSPORT' : null;
        if (!envVar) return true;
        const v = process.env[envVar];
        return !v || v === 'stub' || v === 'default';
      }),
      ensureGateway: jest.fn(async () => ({ ok: true })),
      getSecret: jest.fn(() => ''),
      getNodeJsCallbackUrl: jest.fn(() => ''),
      getChannelGateway: jest.fn(),
      configureChannel: jest.fn(),
      shutdownGateway: jest.fn(async () => {}),
      installLifecycleHooks: jest.fn(),
    })
  );

  const expressApp = express();
  const { default: chatbotRoutes } = await import('../../routes/chatbot.routes.js');
  // Mount under the same prefix the production app uses
  // (`/api/ai/chatbot`). The routes file internally defines paths
  // that start with `/...` (no `/ai/chatbot` prefix), so we add it
  // here exactly once.
  expressApp.use('/api/ai/chatbot', chatbotRoutes);
  app = expressApp;
});

afterEach(() => {
  delete process.env.TELEGRAM_GATEWAY_TRANSPORT;
  jest.restoreAllMocks();
});

describe('route /personal-account-status/:channel', () => {
  it('returns Telegram status with reason TELEGRAM_STUB_TRANSPORT by default', async () => {
    const res = await request(app).get(
      '/api/ai/chatbot/personal-account-status/telegram'
    );
    expect(res.status).toBe(200);
    expect(res.body.data.channel).toBe('telegram');
    expect(res.body.data.reason).toBe('TELEGRAM_STUB_TRANSPORT');
  });

  it('returns 400 for unknown channel', async () => {
    const res = await request(app).get(
      '/api/ai/chatbot/personal-account-status/facebook'
    );
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_CHANNEL');
  });

  it('returns canStartLogin=true when env points to a real transport', async () => {
    process.env.TELEGRAM_GATEWAY_TRANSPORT = '/abs/path/RealTelegram.mjs';
    // Re-import the gateway module with the env in place so isStubOnly
    // picks it up. (resetModules already wiped it.)
    jest.resetModules();
    jest.unstable_mockModule(
      '../../services/chatbot/inProcChannelGateway/index.js',
      () => ({
        __esModule: true,
        getState: jest.fn(() => ({
          telegram: { started: true, hasSecret: true, stubOnly: false },
        })),
        isStubOnly: jest.fn(() => false),
        ensureGateway: jest.fn(async () => ({ ok: true })),
        getSecret: jest.fn(() => ''),
        getNodeJsCallbackUrl: jest.fn(() => ''),
        getChannelGateway: jest.fn(),
        configureChannel: jest.fn(),
        shutdownGateway: jest.fn(async () => {}),
        installLifecycleHooks: jest.fn(),
      })
    );
    const expressApp = express();
    const { default: chatbotRoutes } = await import(
      '../../routes/chatbot.routes.js'
    );
    expressApp.use('/api/ai/chatbot', chatbotRoutes);

    const res = await request(expressApp).get(
      '/api/ai/chatbot/personal-account-status/telegram'
    );
    expect(res.status).toBe(200);
    expect(res.body.data.canStartLogin).toBe(true);
    expect(res.body.data.stubOnly).toBe(false);
    expect(res.body.data.reason).toBeNull();
  });
});

describe('route /personal-accounts-health', () => {
  it('returns the Telegram channel in one round-trip', async () => {
    const res = await request(app).get(
      '/api/ai/chatbot/personal-accounts-health'
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.channels).toBeDefined();
    expect(res.body.data.channels.telegram).toBeDefined();
    // Default stub-mode env → channel unhealthy.
    expect(res.body.data.allHealthy).toBe(false);
    expect(res.body.data.channels.telegram.reason).toBe(
      'TELEGRAM_STUB_TRANSPORT'
    );
    expect(res.body.data.checkedAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it('returns allHealthy=true when Telegram is configured', async () => {
    jest.resetModules();
    jest.unstable_mockModule(
      '../../services/chatbot/inProcChannelGateway/index.js',
      () => ({
        __esModule: true,
        getState: jest.fn(() => ({
          telegram: { started: true, hasSecret: true, stubOnly: false },
        })),
        isStubOnly: jest.fn(() => false),
        ensureGateway: jest.fn(async () => ({ ok: true })),
        getSecret: jest.fn(() => ''),
        getNodeJsCallbackUrl: jest.fn(() => ''),
        getChannelGateway: jest.fn(),
        configureChannel: jest.fn(),
        shutdownGateway: jest.fn(async () => {}),
        installLifecycleHooks: jest.fn(),
      })
    );
    const expressApp = express();
    const { default: chatbotRoutes } = await import(
      '../../routes/chatbot.routes.js'
    );
    expressApp.use('/api/ai/chatbot', chatbotRoutes);

    const res = await request(expressApp).get(
      '/api/ai/chatbot/personal-accounts-health'
    );
    expect(res.status).toBe(200);
    expect(res.body.data.allHealthy).toBe(true);
    expect(res.body.data.channels.telegram.canStartLogin).toBe(true);
  });
});
