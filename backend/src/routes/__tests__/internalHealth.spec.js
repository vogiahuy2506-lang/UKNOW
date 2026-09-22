/**
 * Tests for the /api/internal/telegram-health endpoint.
 * Verifies the `stubOnly` flag reflects the actual transport env.
 */

import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let router;

beforeEach(async () => {
  jest.resetModules();
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  // Stub database: internal.routes imports it at the top — for the
  // health route the import isn't called, but the mock keeps tests
  // hermetic and avoids hitting Postgres from this unit. Named
  // exports (withRetry, isConnectionError, isNeon) are required by
  // static `import { ... } from '../config/database.js'` lines in
  // other modules the router pulls in transitively.
  const dbMock = {
    query: jest.fn(),
    getClient: jest.fn(),
    pool: { on: jest.fn() },
    withRetry: (fn) => fn(),
    isConnectionError: () => false,
    isNeon: false,
  };
  jest.unstable_mockModule(
    path.resolve(__dirname, '..', '..', 'config', 'database.js').replace(/\\/g, '/'),
    () => ({
      default: dbMock,
      withRetry: dbMock.withRetry,
      isConnectionError: dbMock.isConnectionError,
      isNeon: dbMock.isNeon,
    })
  );
  process.env.TELEGRAM_GATEWAY_SECRET = 'tg-test-secret';

  router = (await import('../internal.routes.js')).default;
});

afterEach(async () => {
  jest.restoreAllMocks();
  // Reset singleton state của inProcChannelGateway để tránh leak
  // secret vào các test khác cùng worker. `telegramGatewayLazyClient.spec.js`
  // assert `isConfigured()===false` — không thể pass nếu singleton
  // còn giữ secret từ test trước.
  try {
    const { configureChannel } = await import(
      path.resolve(__dirname, '..', '..', 'services', 'chatbot', 'inProcChannelGateway', 'index.js')
        .replace(/\\/g, '/')
    );
    configureChannel('telegram', { secret: '' });
  } catch {
    // Module chưa load — bỏ qua.
  }
  delete process.env.TELEGRAM_GATEWAY_SECRET;
  delete process.env.TELEGRAM_GATEWAY_TRANSPORT;
});

async function call(app, channel, secret) {
  const request = (await import('supertest')).default;
  return request(app)
    .get(`/api/internal/${channel}-health`)
    .set('x-gateway-secret', secret);
}

describe('internal channel-health endpoints', () => {
  it('reports stubOnly=true when transport env is unset', async () => {
    delete process.env.TELEGRAM_GATEWAY_TRANSPORT;
    const express = (await import('express')).default;
    const app = express();
    app.use('/api/internal', router);

    const res = await call(app, 'telegram', 'tg-test-secret');
    expect(res.status).toBe(200);
    expect(res.body.stubOnly).toBe(true);
    expect(res.body.status).toBe('stub');
    expect(res.body.transport).toBeNull();
  });

  it('reports stubOnly=false when transport env points to a real path', async () => {
    process.env.TELEGRAM_GATEWAY_TRANSPORT = '/abs/path/ToClient.mjs';
    const express = (await import('express')).default;
    const app = express();
    app.use('/api/internal', router);

    const res = await call(app, 'telegram', 'tg-test-secret');
    expect(res.status).toBe(200);
    expect(res.body.stubOnly).toBe(false);
    expect(res.body.status).toBe('ok');
    expect(res.body.transport).toBe('/abs/path/ToClient.mjs');
  });

  it('rejects requests without the gateway secret', async () => {
    const express = (await import('express')).default;
    const app = express();
    app.use('/api/internal', router);

    const request = (await import('supertest')).default;
    const res = await request(app).get('/api/internal/telegram-health');
    expect([401, 403]).toContain(res.status);
  });
});
