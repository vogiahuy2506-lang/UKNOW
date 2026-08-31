import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockLandingPagePublicService = {
  getPublishedPayload: jest.fn(),
  getPublishedFormConfig: jest.fn(),
  getPublishedPayloadById: jest.fn(),
};

jest.unstable_mockModule('../../services/landingPage/landingPagePublic.service.js', () => ({
  default: mockLandingPagePublicService,
}));

const { default: controller } = await import('../landingPagePublic.controller.js');

const makeReqRes = (options = {}) => {
  const headers = options.headers || {};
  const req = {
    params: options.params || {},
    query: options.query || {},
    headers,
    landingPage: options.landingPage,
    isCustomDomain: options.isCustomDomain,
    customDomainSlug: options.customDomainSlug,
  };
  const resHeaders = {};
  let statusCode = 200;
  let responseData = null;

  const res = {
    setHeader: jest.fn((k, v) => {
      resHeaders[k.toLowerCase()] = v;
    }),
    getHeader: jest.fn((k) => resHeaders[k.toLowerCase()]),
    type: jest.fn(() => res),
    status: jest.fn((code) => {
      statusCode = code;
      return res;
    }),
    json: jest.fn((data) => {
      responseData = data;
      return res;
    }),
    send: jest.fn((body) => {
      responseData = body;
      return res;
    }),
    end: jest.fn(() => res),
    get statusCode() { return statusCode; },
    get responseData() { return responseData; },
    get resHeaders() { return resHeaders; },
  };

  return { req, res };
};

describe('landingPagePublic.controller HTTP Caching & ETag', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sets Cache-Control and ETag header for getPublished', async () => {
    mockLandingPagePublicService.getPublishedPayload.mockResolvedValue({
      id: 10,
      slug: 'sale-page',
      title: 'Summer Sale',
      htmlContent: '<h1>50% Off</h1>',
    });

    const { req, res } = makeReqRes({ params: { slug: 'sale-page' } });
    await controller.getPublished(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.resHeaders['cache-control']).toBe('public, max-age=30, s-maxage=60, stale-while-revalidate=120');
    expect(res.resHeaders['etag']).toBeDefined();
    expect(res.resHeaders['etag']).toMatch(/^"[a-f0-9]{64}"$/);
    expect(res.responseData.success).toBe(true);
    expect(res.responseData.data.title).toBe('Summer Sale');
  });


  it('returns 304 Not Modified when If-None-Match matches ETag', async () => {
    mockLandingPagePublicService.getPublishedPayload.mockResolvedValue({
      id: 10,
      slug: 'sale-page',
      title: 'Summer Sale',
      htmlContent: '<h1>50% Off</h1>',
    });

    // First request to compute ETag
    const req1 = makeReqRes({ params: { slug: 'sale-page' } });
    await controller.getPublished(req1.req, req1.res);
    const computedEtag = req1.res.resHeaders['etag'];

    // Second request with If-None-Match matching computedEtag
    const { req, res } = makeReqRes({
      params: { slug: 'sale-page' },
      headers: { 'if-none-match': computedEtag },
    });
    await controller.getPublished(req, res);

    expect(res.statusCode).toBe(304);
    expect(res.resHeaders['etag']).toBe(computedEtag);
    expect(res.responseData).toBeNull();
  });

  it('getByDomain reuses req.landingPage from middleware without querying DB', async () => {
    const landingPage = {
      id: 99,
      slug: 'custom-promo',
      title: 'Custom Promo',
      htmlContent: '<div>Landing Content</div>',
    };

    const { req, res } = makeReqRes({
      isCustomDomain: true,
      landingPage,
    });

    await controller.getByDomain(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.responseData).toContain('Custom Promo');
    expect(res.resHeaders['cache-control']).toBe('public, max-age=30, s-maxage=60, stale-while-revalidate=120');
    expect(res.resHeaders['etag']).toBeDefined();
    // DB service MUST NOT be queried
    expect(mockLandingPagePublicService.getPublishedPayloadById).not.toHaveBeenCalled();
    expect(mockLandingPagePublicService.getPublishedPayload).not.toHaveBeenCalled();
  });
});
