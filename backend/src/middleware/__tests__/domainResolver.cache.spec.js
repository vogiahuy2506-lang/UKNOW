import { jest } from '@jest/globals';

const mockLandingPageDomainService = {
  getPublishedLandingIdForHost: jest.fn(),
};

const mockLandingPagePublicService = {
  getPublishedPayload: jest.fn(),
  getPublishedPayloadById: jest.fn(),
};

jest.unstable_mockModule('../../services/landingPage/landingPageDomain.service.js', () => ({
  default: mockLandingPageDomainService,
}));

jest.unstable_mockModule('../../services/landingPage/landingPagePublic.service.js', () => ({
  default: mockLandingPagePublicService,
}));

const {
  domainResolver,
  hostMappingCache,
  payloadCache,
  invalidateDomainResolverHost,
  invalidateDomainResolverPayload,
  clearDomainResolverCache,
  getDomainResolverCacheStats,
} = await import('../domainResolver.js');

describe('domainResolver L1 caching', () => {
  beforeEach(() => {
    clearDomainResolverCache();
    jest.clearAllMocks();
    delete process.env.DOMAIN_RESOLVER_CACHE_ENABLED;
  });

  it('resolves host and caches mapping + payload on cache miss, reuses cache on second request', async () => {
    mockLandingPageDomainService.getPublishedLandingIdForHost.mockResolvedValue({ id: 10, slug: 'test-slug' });
    mockLandingPagePublicService.getPublishedPayload.mockResolvedValue({
      id: 10,
      slug: 'test-slug',
      title: 'Test Landing',
      htmlContent: '<h1>Hello World</h1>',
    });

    const req1 = { headers: { host: 'promo.example.com' } };
    const res1 = {};
    let nextCalled1 = false;
    await domainResolver(req1, res1, () => { nextCalled1 = true; });

    expect(nextCalled1).toBe(true);
    expect(req1.isCustomDomain).toBe(true);
    expect(req1.customDomainSlug).toBe('test-slug');
    expect(req1.landingPage).toEqual({
      id: 10,
      slug: 'test-slug',
      title: 'Test Landing',
      htmlContent: '<h1>Hello World</h1>',
    });
    expect(mockLandingPageDomainService.getPublishedLandingIdForHost).toHaveBeenCalledTimes(1);
    expect(mockLandingPagePublicService.getPublishedPayload).toHaveBeenCalledTimes(1);

    // Second request with same host
    const req2 = { headers: { host: 'promo.example.com' } };
    const res2 = {};
    let nextCalled2 = false;
    await domainResolver(req2, res2, () => { nextCalled2 = true; });

    expect(nextCalled2).toBe(true);
    expect(req2.isCustomDomain).toBe(true);
    expect(req2.landingPage).toEqual(req1.landingPage);

    // Verify DB services were NOT called a second time
    expect(mockLandingPageDomainService.getPublishedLandingIdForHost).toHaveBeenCalledTimes(1);
    expect(mockLandingPagePublicService.getPublishedPayload).toHaveBeenCalledTimes(1);
  });

  it('negative caches unmapped host so repeated bad requests do not hit DB', async () => {
    mockLandingPageDomainService.getPublishedLandingIdForHost.mockResolvedValue(null);

    const req1 = { headers: { host: 'unknown.example.com' } };
    await domainResolver(req1, {}, () => {});

    expect(mockLandingPageDomainService.getPublishedLandingIdForHost).toHaveBeenCalledTimes(1);
    expect(req1.isCustomDomain).toBeUndefined();

    // Second request
    const req2 = { headers: { host: 'unknown.example.com' } };
    await domainResolver(req2, {}, () => {});

    // Still only called once due to negative cache
    expect(mockLandingPageDomainService.getPublishedLandingIdForHost).toHaveBeenCalledTimes(1);
  });

  it('deduplicates concurrent requests to the same host using singleflight', async () => {
    mockLandingPageDomainService.getPublishedLandingIdForHost.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 20));
      return { id: 25, slug: 'concurrent-slug' };
    });
    mockLandingPagePublicService.getPublishedPayload.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 20));
      return { id: 25, slug: 'concurrent-slug', title: 'Concurrent Test', htmlContent: '<div>Test</div>' };
    });

    const requests = Array.from({ length: 15 }).map(() => {
      const req = { headers: { host: 'burst.example.com' } };
      return new Promise((resolve) => {
        domainResolver(req, {}, () => resolve(req));
      });
    });

    const results = await Promise.all(requests);

    expect(results).toHaveLength(15);
    results.forEach((r) => {
      expect(r.isCustomDomain).toBe(true);
      expect(r.landingPage.title).toBe('Concurrent Test');
    });

    // Both services should only be invoked once
    expect(mockLandingPageDomainService.getPublishedLandingIdForHost).toHaveBeenCalledTimes(1);
    expect(mockLandingPagePublicService.getPublishedPayload).toHaveBeenCalledTimes(1);
  });

  it('invalidateDomainResolverHost clears cache for specified host', async () => {
    mockLandingPageDomainService.getPublishedLandingIdForHost.mockResolvedValue({ id: 1, slug: 's1' });
    mockLandingPagePublicService.getPublishedPayload.mockResolvedValue({ id: 1, title: 'T1' });

    const req1 = { headers: { host: 'custom.com' } };
    await domainResolver(req1, {}, () => {});
    expect(mockLandingPageDomainService.getPublishedLandingIdForHost).toHaveBeenCalledTimes(1);

    // Invalidate host
    invalidateDomainResolverHost('custom.com');

    const req2 = { headers: { host: 'custom.com' } };
    await domainResolver(req2, {}, () => {});
    expect(mockLandingPageDomainService.getPublishedLandingIdForHost).toHaveBeenCalledTimes(2);
  });

  it('invalidateDomainResolverPayload clears payload cache', async () => {
    mockLandingPageDomainService.getPublishedLandingIdForHost.mockResolvedValue({ id: 99, slug: 'my-lp' });
    mockLandingPagePublicService.getPublishedPayload.mockResolvedValue({ id: 99, title: 'Old Title' });

    const req1 = { headers: { host: 'lp.com' } };
    await domainResolver(req1, {}, () => {});
    expect(mockLandingPagePublicService.getPublishedPayload).toHaveBeenCalledTimes(1);

    // Invalidate payload
    invalidateDomainResolverPayload(99, 'my-lp');

    mockLandingPagePublicService.getPublishedPayload.mockResolvedValue({ id: 99, title: 'New Title' });

    const req2 = { headers: { host: 'lp.com' } };
    await domainResolver(req2, {}, () => {});
    expect(mockLandingPagePublicService.getPublishedPayload).toHaveBeenCalledTimes(2);
    expect(req2.landingPage.title).toBe('New Title');
  });

  it('bypasses cache when DOMAIN_RESOLVER_CACHE_ENABLED=false', async () => {
    process.env.DOMAIN_RESOLVER_CACHE_ENABLED = 'false';
    mockLandingPageDomainService.getPublishedLandingIdForHost.mockResolvedValue({ id: 5, slug: 'bypass' });
    mockLandingPagePublicService.getPublishedPayload.mockResolvedValue({ id: 5, title: 'Bypass' });

    await domainResolver({ headers: { host: 'bypass.com' } }, {}, () => {});
    await domainResolver({ headers: { host: 'bypass.com' } }, {}, () => {});

    expect(mockLandingPageDomainService.getPublishedLandingIdForHost).toHaveBeenCalledTimes(2);
    expect(mockLandingPagePublicService.getPublishedPayload).toHaveBeenCalledTimes(2);
  });
});
