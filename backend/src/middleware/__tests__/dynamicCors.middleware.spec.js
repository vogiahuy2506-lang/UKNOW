import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

const mockDb = {
  query: jest.fn(),
};

jest.unstable_mockModule('../../config/database.js', () => ({
  default: mockDb,
}));

const {
  createDynamicCorsMiddleware,
  clearVerifiedDomainsCache,
  isTrustedAppOrigin,
  requireTrustedAppOrigin,
  publicCorsMiddleware,
  allowAllCorsMiddleware,
} = await import('../dynamicCors.middleware.js');

const ORIGINAL_FRONTEND_URLS = process.env.FRONTEND_URLS;
const ORIGINAL_FRONTEND_URL = process.env.FRONTEND_URL;

function restoreFrontendEnv() {
  if (ORIGINAL_FRONTEND_URLS === undefined) delete process.env.FRONTEND_URLS;
  else process.env.FRONTEND_URLS = ORIGINAL_FRONTEND_URLS;
  if (ORIGINAL_FRONTEND_URL === undefined) delete process.env.FRONTEND_URL;
  else process.env.FRONTEND_URL = ORIGINAL_FRONTEND_URL;
}

function createMockReqRes({ origin, path = '/', method = 'GET', headers: extraHeaders = {} }) {
  const headers = { ...extraHeaders };
  if (origin !== undefined) {
    headers.origin = origin;
  }

  const req = {
    headers,
    path,
    originalUrl: path,
    method,
  };

  const setHeaders = {};
  const res = {
    setHeader: jest.fn((name, value) => {
      setHeaders[name.toLowerCase()] = value;
    }),
    getHeader: (name) => setHeaders[name.toLowerCase()],
    status: jest.fn(() => res),
    end: jest.fn(() => res),
    json: jest.fn(() => res),
    _headers: setHeaders,
  };

  const next = jest.fn();

  return { req, res, next, setHeaders };
}

describe('dynamicCors.middleware - PR-1 Origin: null and CORS validation', () => {
  let middleware;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.FRONTEND_URLS;
    delete process.env.FRONTEND_URL;
    mockDb.query.mockResolvedValue({ rows: [] });
    clearVerifiedDomainsCache();
    middleware = createDynamicCorsMiddleware();
  });

  afterEach(() => {
    restoreFrontendEnv();
  });

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

  it('4. Subdomain nền tảng (*.founderai.biz) → phản chiếu ACAO nhưng KHÔNG kèm Allow-Credentials', async () => {
    const origin = 'https://cohoiai.founderai.biz';
    const { req, res, next, setHeaders } = createMockReqRes({
      origin,
      path: '/api/public/leads',
    });

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(setHeaders['access-control-allow-origin']).toBe(origin);
    expect(setHeaders['vary']).toBe('Origin');
    expect(setHeaders['access-control-allow-credentials']).toBeUndefined();
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

describe('dynamicCors.middleware — credentials chỉ cho origin app tin cậy', () => {
  let middleware;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.FRONTEND_URLS;
    delete process.env.FRONTEND_URL;
    mockDb.query.mockResolvedValue({ rows: [] });
    clearVerifiedDomainsCache();
    middleware = createDynamicCorsMiddleware();
  });

  afterEach(() => {
    restoreFrontendEnv();
  });

  it.each(['https://founderai.biz', 'https://www.founderai.biz'])(
    'app production %s → ACAO + Allow-Credentials, không tra DB',
    async (origin) => {
      const { req, res, next, setHeaders } = createMockReqRes({ origin, path: '/api/auth/refresh-token', method: 'POST' });

      await middleware(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(setHeaders['access-control-allow-origin']).toBe(origin);
      expect(setHeaders['access-control-allow-credentials']).toBe('true');
      expect(mockDb.query).not.toHaveBeenCalled();
    }
  );

  it('origin khai trong FRONTEND_URLS (có dấu / cuối) → được coi là app, kèm credentials', async () => {
    process.env.FRONTEND_URLS = 'https://app.example.vn/, https://other.example.vn';
    const { req, res, next, setHeaders } = createMockReqRes({ origin: 'https://app.example.vn' });

    await middleware(req, res, next);

    expect(setHeaders['access-control-allow-origin']).toBe('https://app.example.vn');
    expect(setHeaders['access-control-allow-credentials']).toBe('true');
  });

  it('origin khai trong FRONTEND_URL (kể cả khi đã có FRONTEND_URLS) → kèm credentials', async () => {
    process.env.FRONTEND_URLS = 'https://app.example.vn';
    process.env.FRONTEND_URL = 'https://dev.example.vn';
    const { req, res, next, setHeaders } = createMockReqRes({ origin: 'https://dev.example.vn' });

    await middleware(req, res, next);

    expect(setHeaders['access-control-allow-credentials']).toBe('true');
  });

  it('preflight OPTIONS từ app → 204 kèm credentials', async () => {
    const { req, res, next, setHeaders } = createMockReqRes({ origin: 'https://founderai.biz', method: 'OPTIONS' });

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(204);
    expect(next).not.toHaveBeenCalled();
    expect(setHeaders['access-control-allow-credentials']).toBe('true');
  });

  it('preflight OPTIONS từ subdomain landing → 204, KHÔNG kèm credentials', async () => {
    const { req, res, next, setHeaders } = createMockReqRes({ origin: 'https://senna.founderai.biz', method: 'OPTIONS' });

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(204);
    expect(next).not.toHaveBeenCalled();
    expect(setHeaders['access-control-allow-origin']).toBe('https://senna.founderai.biz');
    expect(setHeaders['access-control-allow-credentials']).toBeUndefined();
  });

  it('localhost cổng ngoài danh sách → phản chiếu ACAO, KHÔNG kèm credentials', async () => {
    const { req, res, next, setHeaders } = createMockReqRes({ origin: 'http://localhost:3000' });

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(setHeaders['access-control-allow-origin']).toBe('http://localhost:3000');
    expect(setHeaders['access-control-allow-credentials']).toBeUndefined();
  });

  it.each([
    'https://founderai.biz.attacker.example',
    'https://evilfounderai.biz',
    'http://founderai.biz',
    'https://attacker.example',
  ])('origin lạ %s → không ACAO, không credentials', async (origin) => {
    const { req, res, next, setHeaders } = createMockReqRes({ origin });

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(setHeaders['access-control-allow-origin']).toBeUndefined();
    expect(setHeaders['access-control-allow-credentials']).toBeUndefined();
  });
});

describe('dynamicCors.middleware — custom domain đã xác minh', () => {
  let middleware;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.FRONTEND_URLS;
    delete process.env.FRONTEND_URL;
    clearVerifiedDomainsCache();
    middleware = createDynamicCorsMiddleware();
  });

  afterEach(() => {
    restoreFrontendEnv();
  });

  it('chỉ nạp domain status = active (không nhận pending_verification)', async () => {
    mockDb.query.mockResolvedValue({ rows: [] });
    const { req, res, next } = createMockReqRes({ origin: 'https://shop.example.com' });

    await middleware(req, res, next);

    expect(mockDb.query).toHaveBeenCalledTimes(1);
    const sql = mockDb.query.mock.calls[0][0];
    expect(sql).toMatch(/d\.status\s*=\s*'active'/);
    expect(sql).not.toContain('pending_verification');
  });

  it('khớp chính xác hostname đã xác minh → ACAO, KHÔNG credentials', async () => {
    mockDb.query.mockResolvedValue({ rows: [{ hostname: 'shop.example.com' }] });
    const { req, res, next, setHeaders } = createMockReqRes({ origin: 'https://shop.example.com' });

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(setHeaders['access-control-allow-origin']).toBe('https://shop.example.com');
    expect(setHeaders['access-control-allow-credentials']).toBeUndefined();
  });

  it('bản www. của domain gốc đã xác minh → được phép (không credentials)', async () => {
    mockDb.query.mockResolvedValue({ rows: [{ hostname: 'example.com' }] });
    const { req, res, next, setHeaders } = createMockReqRes({ origin: 'https://www.example.com' });

    await middleware(req, res, next);

    expect(setHeaders['access-control-allow-origin']).toBe('https://www.example.com');
    expect(setHeaders['access-control-allow-credentials']).toBeUndefined();
  });

  it('subdomain khác của domain đã xác minh → KHÔNG được phép (không mở rộng sang domain cha)', async () => {
    mockDb.query.mockResolvedValue({ rows: [{ hostname: 'example.com' }] });
    const { req, res, next, setHeaders } = createMockReqRes({ origin: 'https://evil.example.com' });

    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(setHeaders['access-control-allow-origin']).toBeUndefined();
  });

  it('domain cha của một subdomain đã xác minh → KHÔNG được phép', async () => {
    mockDb.query.mockResolvedValue({ rows: [{ hostname: 'lp.example.com' }] });
    const { req, res, next, setHeaders } = createMockReqRes({ origin: 'https://example.com' });

    await middleware(req, res, next);

    expect(setHeaders['access-control-allow-origin']).toBeUndefined();
  });

  it('subdomain sâu dưới một domain 3 cấp đã xác minh → KHÔNG được phép', async () => {
    mockDb.query.mockResolvedValue({ rows: [{ hostname: 'lp.example.com' }] });
    const { req, res, next, setHeaders } = createMockReqRes({ origin: 'https://x.lp.example.com' });

    await middleware(req, res, next);

    expect(setHeaders['access-control-allow-origin']).toBeUndefined();
  });
});

describe('isTrustedAppOrigin', () => {
  afterEach(() => {
    restoreFrontendEnv();
  });

  it('nhận app production + danh sách dev, so khớp chính xác', () => {
    delete process.env.FRONTEND_URLS;
    delete process.env.FRONTEND_URL;
    expect(isTrustedAppOrigin('https://founderai.biz')).toBe(true);
    expect(isTrustedAppOrigin('https://www.founderai.biz')).toBe(true);
    expect(isTrustedAppOrigin('http://localhost:5173')).toBe(true);
    expect(isTrustedAppOrigin('http://127.0.0.1:4173')).toBe(true);
  });

  it.each([
    undefined,
    '',
    'null',
    'https://founderai.biz/',
    'https://founderai.biz:8443',
    'https://slug.founderai.biz',
    'https://founderai.biz.attacker.example',
    'http://localhost:3000',
  ])('từ chối %p', (origin) => {
    delete process.env.FRONTEND_URLS;
    delete process.env.FRONTEND_URL;
    expect(isTrustedAppOrigin(origin)).toBe(false);
  });

  it('bỏ qua giá trị env không phải origin http(s) (vd "null", "*")', () => {
    process.env.FRONTEND_URLS = 'null,*,javascript:alert(1),https://app.example.vn';
    expect(isTrustedAppOrigin('null')).toBe(false);
    expect(isTrustedAppOrigin('*')).toBe(false);
    expect(isTrustedAppOrigin('https://app.example.vn')).toBe(true);
  });

  it('đọc lại env khi FRONTEND_URLS đổi', () => {
    process.env.FRONTEND_URLS = 'https://a.example.vn';
    expect(isTrustedAppOrigin('https://a.example.vn')).toBe(true);
    process.env.FRONTEND_URLS = 'https://b.example.vn';
    expect(isTrustedAppOrigin('https://a.example.vn')).toBe(false);
    expect(isTrustedAppOrigin('https://b.example.vn')).toBe(true);
  });
});

describe('requireTrustedAppOrigin — chốt cho endpoint dùng cookie refresh token', () => {
  let warnSpy;

  beforeEach(() => {
    delete process.env.FRONTEND_URLS;
    delete process.env.FRONTEND_URL;
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    restoreFrontendEnv();
  });

  function run(headers) {
    const { req, res, next } = createMockReqRes({ path: '/api/auth/refresh-token', method: 'POST', headers });
    requireTrustedAppOrigin(req, res, next);
    return { res, next };
  }

  it.each([
    ['không có Origin, không có Sec-Fetch-Site (curl/server)', {}],
    ['app production, same-origin', { origin: 'https://founderai.biz', 'sec-fetch-site': 'same-origin' }],
    ['www app, same-origin', { origin: 'https://www.founderai.biz', 'sec-fetch-site': 'same-origin' }],
    ['dev qua proxy Vite, same-origin', { origin: 'http://localhost:5174', 'sec-fetch-site': 'same-origin' }],
    ['Sec-Fetch-Site none, không Origin', { 'sec-fetch-site': 'none' }],
    ['chỉ Origin app, không Sec-Fetch-Site', { origin: 'https://founderai.biz' }],
  ])('cho qua: %s', (_label, headers) => {
    const { res, next } = run(headers);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it.each([
    ['Origin landing cùng site', { origin: 'https://slug.founderai.biz', 'sec-fetch-site': 'same-site' }],
    ['Origin landing, không Sec-Fetch-Site', { origin: 'https://slug.founderai.biz' }],
    ['Origin trang lạ', { origin: 'https://attacker.example', 'sec-fetch-site': 'cross-site' }],
    ['Origin null', { origin: 'null' }],
    ['Origin rỗng', { origin: '' }],
    ['Sec-Fetch-Site cross-site, không Origin', { 'sec-fetch-site': 'cross-site' }],
    ['Sec-Fetch-Site same-site, không Origin', { 'sec-fetch-site': 'same-site' }],
    ['Origin app nhưng Sec-Fetch-Site same-site', { origin: 'https://founderai.biz', 'sec-fetch-site': 'same-site' }],
    ['Sec-Fetch-Site viết hoa', { 'sec-fetch-site': 'Cross-Site' }],
  ])('chặn 403: %s', (_label, headers) => {
    const { res, next } = run(headers);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false, code: 'UNTRUSTED_ORIGIN' }));
  });
});

describe('publicCorsMiddleware / allowAllCorsMiddleware — không bao giờ gắn Allow-Credentials', () => {
  it.each([
    ['publicCorsMiddleware', publicCorsMiddleware],
    ['allowAllCorsMiddleware', allowAllCorsMiddleware],
  ])('%s: phản chiếu origin, không có Allow-Credentials (GET + OPTIONS)', (_name, mw) => {
    for (const method of ['GET', 'OPTIONS']) {
      const { req, res, next, setHeaders } = createMockReqRes({ origin: 'https://attacker.example', method });
      mw(req, res, next);
      expect(setHeaders['access-control-allow-origin']).toBe('https://attacker.example');
      expect(setHeaders['access-control-allow-credentials']).toBeUndefined();
      if (method === 'OPTIONS') {
        expect(res.status).toHaveBeenCalledWith(204);
      } else {
        expect(next).toHaveBeenCalledTimes(1);
      }
    }
  });
});
