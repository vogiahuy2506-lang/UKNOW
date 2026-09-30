/**
 * /api/internal/* chỉ nhận kết nối có địa chỉ socket loopback (gateway Telegram chạy trong
 * cùng tiến trình, gọi 127.0.0.1). Secret đúng nhưng đến từ ngoài máy chủ vẫn bị từ chối;
 * header X-Forwarded-For không qua mặt được vì guard đọc req.socket.remoteAddress.
 */
import { describe, expect, it, beforeAll, afterAll, jest } from '@jest/globals';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const resolveUrl = (rel) => path.resolve(__dirname, '..', '..', rel).replace(/\\/g, '/');

const dbMock = {
  query: jest.fn(),
  getClient: jest.fn(),
  pool: { on: jest.fn() },
  withRetry: (fn) => fn(),
  isConnectionError: () => false,
  isNeon: false,
};
jest.unstable_mockModule(resolveUrl('config/database.js'), () => ({
  default: dbMock,
  withRetry: dbMock.withRetry,
  isConnectionError: dbMock.isConnectionError,
  isNeon: dbMock.isNeon,
}));

process.env.TELEGRAM_GATEWAY_SECRET = 'tg-test-secret';
delete process.env.NODEJS_INTERNAL_URL;
const routerModule = await import('../internal.routes.js');
const express = (await import('express')).default;
const request = (await import('supertest')).default;

afterAll(async () => {
  try {
    const { configureChannel } = await import(
      resolveUrl('services/chatbot/inProcChannelGateway/index.js')
    );
    configureChannel('telegram', { secret: '' });
  } catch {
    // Module chưa nạp — bỏ qua.
  }
  delete process.env.TELEGRAM_GATEWAY_SECRET;
  delete process.env.NODEJS_INTERNAL_URL;
});

/** App thử: giả địa chỉ socket (supertest luôn đi loopback nên phải ghi đè để thử ca "từ ngoài"). */
function buildApp(fakeRemoteAddress) {
  const app = express();
  app.use(express.json());
  if (fakeRemoteAddress) {
    app.use((req, _res, next) => {
      Object.defineProperty(req.socket, 'remoteAddress', {
        value: fakeRemoteAddress,
        configurable: true,
      });
      next();
    });
  }
  app.use('/api/internal', routerModule.default);
  return app;
}

describe('isLoopbackAddress', () => {
  it.each([
    ['127.0.0.1', true],
    ['127.1.2.3', true],
    ['::1', true],
    ['::ffff:127.0.0.1', true],
    ['::FFFF:127.0.0.1', true],
    ['10.0.0.5', false],
    ['172.18.0.1', false],
    ['203.0.113.7', false],
    ['::ffff:203.0.113.7', false],
    ['127.0.0.1.evil', false],
    ['', false],
    [undefined, false],
    [null, false],
  ])('%s → %s', (address, expected) => {
    expect(routerModule.isLoopbackAddress(address)).toBe(expected);
  });
});

describe('requireLoopbackSocket (middleware)', () => {
  const makeRes = () => {
    const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
    return res;
  };

  it('socket ngoài → 404, không gọi next dù X-Forwarded-For/req.ip là loopback', () => {
    const next = jest.fn();
    const res = makeRes();
    routerModule.requireLoopbackSocket(
      { socket: { remoteAddress: '198.51.100.4' }, headers: { 'x-forwarded-for': '127.0.0.1' }, ip: '127.0.0.1' },
      res,
      next
    );
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('socket loopback (IPv4-mapped) → next()', () => {
    const next = jest.fn();
    routerModule.requireLoopbackSocket({ socket: { remoteAddress: '::ffff:127.0.0.1' } }, makeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('không có socket → 404', () => {
    const next = jest.fn();
    const res = makeRes();
    routerModule.requireLoopbackSocket({}, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('router /api/internal áp guard cho mọi route', () => {
  it('telegram-webhook: secret đúng nhưng socket ngoài → 404', async () => {
    const res = await request(buildApp('203.0.113.7'))
      .post('/api/internal/telegram-webhook')
      .set('x-gateway-secret', 'tg-test-secret')
      .set('X-Forwarded-For', '127.0.0.1')
      .send({ telegram_user_id: 1, sender_id: '2', chat_id: '3', text: 'hi' });
    expect(res.status).toBe(404);
    expect(dbMock.query).not.toHaveBeenCalled();
  });

  it('telegram-health: secret đúng nhưng socket ngoài → 404', async () => {
    const res = await request(buildApp('172.18.0.1'))
      .get('/api/internal/telegram-health')
      .set('x-gateway-secret', 'tg-test-secret');
    expect(res.status).toBe(404);
  });

  it('telegram-health: loopback + secret đúng → 200', async () => {
    const res = await request(buildApp(null))
      .get('/api/internal/telegram-health')
      .set('x-gateway-secret', 'tg-test-secret');
    expect(res.status).toBe(200);
  });

  it('telegram-health: loopback + secret sai → 401', async () => {
    const res = await request(buildApp(null))
      .get('/api/internal/telegram-health')
      .set('x-gateway-secret', 'tg-test-secreT');
    expect(res.status).toBe(401);
  });
});

describe('cảnh báo NODEJS_INTERNAL_URL (lúc nạp module)', () => {
  async function loadWith(url) {
    jest.resetModules();
    process.env.NODEJS_INTERNAL_URL = url;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await import('../internal.routes.js');
      return warn.mock.calls.some(([line]) => String(line).includes('NODEJS_INTERNAL_URL'));
    } finally {
      warn.mockRestore();
      delete process.env.NODEJS_INTERNAL_URL;
    }
  }

  it('trỏ ra host không phải loopback → cảnh báo', async () => {
    await expect(loadWith('http://backend.internal:5001')).resolves.toBe(true);
  });

  it('trỏ về 127.0.0.1 / localhost → không cảnh báo', async () => {
    await expect(loadWith('http://127.0.0.1:5001')).resolves.toBe(false);
    await expect(loadWith('http://localhost:5001')).resolves.toBe(false);
  });
});
