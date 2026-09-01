import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockDb = {
  query: jest.fn(),
};

jest.unstable_mockModule('../../config/database.js', () => ({
  default: mockDb,
}));

const { createDynamicCorsMiddleware, clearVerifiedDomainsCache } = await import('../dynamicCors.middleware.js');

describe('dynamicCors.middleware - PR-1 Origin: null and CORS validation', () => {
  let middleware;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.query.mockResolvedValue({ rows: [] });
    clearVerifiedDomainsCache();
    middleware = createDynamicCorsMiddleware();
  });

  function createMockReqRes({ origin, path = '/' }) {
    const headers = {};
    if (origin !== undefined) {
      headers.origin = origin;
    }

    const req = {
      headers,
      path,
    };

    const setHeaders = {};
    const res = {
      setHeader: jest.fn((name, value) => {
        setHeaders[name.toLowerCase()] = value;
      }),
      getHeader: (name) => setHeaders[name.toLowerCase()],
      _headers: setHeaders,
    };

    const next = jest.fn();

    return { req, res, next, setHeaders };
  }

  it('1. Cho phép Origin: null trên /api/public/leads (gắn ACAO null, Vary Origin, KHÔNG có Allow-Credentials)', async () => {
    const { req, res, next, setHeaders } = createMockReqRes({
      origin: 'null',
      path: '/api/public/leads',
    });

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(setHeaders['access-control-allow-origin']).toBe('null');
    expect(setHeaders['vary']).toBe('Origin');
    expect(setHeaders['access-control-allow-methods']).toBe('GET, POST, OPTIONS');
    expect(setHeaders['access-control-allow-headers']).toBeDefined();
    expect(setHeaders['access-control-allow-credentials']).toBeUndefined();
  });

  it('2. Chặn Origin: null trên route nhạy cảm /api/users/me (không gắn ACAO)', async () => {
    const { req, res, next, setHeaders } = createMockReqRes({
      origin: 'null',
      path: '/api/users/me',
    });

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(setHeaders['access-control-allow-origin']).toBeUndefined();
    expect(setHeaders['access-control-allow-credentials']).toBeUndefined();
  });

  it('3. Chặn Origin: null trên route /api/campaigns (không gắn ACAO)', async () => {
    const { req, res, next, setHeaders } = createMockReqRes({
      origin: 'null',
      path: '/api/campaigns',
    });

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(setHeaders['access-control-allow-origin']).toBeUndefined();
    expect(setHeaders['access-control-allow-credentials']).toBeUndefined();
  });

  it('4. Cho phép subdomain nền tảng (*.founderai.biz) kèm Allow-Credentials: true', async () => {
    const origin = 'https://cohoiai.founderai.biz';
    const { req, res, next, setHeaders } = createMockReqRes({
      origin,
      path: '/api/public/leads',
    });

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(setHeaders['access-control-allow-origin']).toBe(origin);
    expect(setHeaders['access-control-allow-credentials']).toBe('true');
    expect(setHeaders['access-control-allow-methods']).toContain('POST');
  });

  it('5. Cho phép localhost trong danh sách mặc định kèm Allow-Credentials: true', async () => {
    const origin = 'http://localhost:5174';
    const { req, res, next, setHeaders } = createMockReqRes({
      origin,
      path: '/api/users/me',
    });

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(setHeaders['access-control-allow-origin']).toBe(origin);
    expect(setHeaders['access-control-allow-credentials']).toBe('true');
  });

  it('6. Request không có origin (curl, server-to-server) → gọi next() và không gắn ACAO', async () => {
    const { req, res, next, setHeaders } = createMockReqRes({
      origin: undefined,
      path: '/api/public/leads',
    });

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(setHeaders['access-control-allow-origin']).toBeUndefined();
  });
});
