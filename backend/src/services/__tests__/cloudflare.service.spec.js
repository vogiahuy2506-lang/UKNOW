import { beforeEach, afterEach, describe, expect, it, jest } from '@jest/globals';


const mockAxiosGet = jest.fn();
const mockAxiosPost = jest.fn();

jest.unstable_mockModule('axios', () => ({
  default: {
    get: mockAxiosGet,
    post: mockAxiosPost,
  },
}));

const { default: cloudflareService } = await import('../cloudflare.service.js');

describe('CloudflareService purge methods', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      CLOUDFLARE_API_TOKEN: 'mock-cf-token',
      CF_ZONE_NAME: 'founderai.biz',
      FRONTEND_PUBLIC_URL: 'https://founderai.biz',
      BACKEND_PUBLIC_URL: 'https://founderai.biz',
    };
    cloudflareService.apiToken = 'mock-cf-token';
  });

  afterEach(() => {
    process.env = originalEnv;
    cloudflareService.apiToken = originalEnv.CLOUDFLARE_API_TOKEN;
  });

  it('purgeUrls returns early if no URLs provided', async () => {
    const res = await cloudflareService.purgeUrls([]);
    expect(res.success).toBe(true);
    expect(mockAxiosPost).not.toHaveBeenCalled();
  });

  it('purgeUrls groups URLs by Zone ID and executes multi-zone purge', async () => {
    // Mock getZone for founderai.biz and custom-client.vn
    mockAxiosGet.mockImplementation(async (_url, config) => {
      const zoneName = config?.params?.name;
      if (zoneName === 'founderai.biz') {
        return { data: { success: true, result: [{ id: 'zone-main', name: 'founderai.biz' }] } };
      }
      if (zoneName === 'custom-client.vn') {
        return { data: { success: true, result: [{ id: 'zone-client', name: 'custom-client.vn' }] } };
      }
      return { data: { success: false, result: [] } };
    });


    mockAxiosPost.mockResolvedValue({
      data: { success: true, result: { id: 'purge-ok' } },
    });

    const res = await cloudflareService.purgeUrls([
      'https://founderai.biz/api/public/landing-pages/promo',
      'https://founderai.biz/l/promo',
      'https://custom-client.vn/api/public/lp',
    ]);

    expect(res.success).toBe(true);
    expect(mockAxiosPost).toHaveBeenCalledTimes(2);

    expect(mockAxiosPost).toHaveBeenCalledWith(
      'https://api.cloudflare.com/client/v4/zones/zone-main/purge_cache',
      { files: ['https://founderai.biz/api/public/landing-pages/promo', 'https://founderai.biz/l/promo'] },
      expect.any(Object)
    );

    expect(mockAxiosPost).toHaveBeenCalledWith(
      'https://api.cloudflare.com/client/v4/zones/zone-client/purge_cache',
      { files: ['https://custom-client.vn/api/public/lp'] },
      expect.any(Object)
    );
  });

  it('purgeUrls skips unmanaged custom domains without polluting default zone', async () => {
    // Mock getZone: founderai.biz has zone, unmanaged-domain.com has NO zone
    mockAxiosGet.mockImplementation(async (_url, config) => {
      const zoneName = config?.params?.name;
      if (zoneName === 'founderai.biz') {
        return { data: { success: true, result: [{ id: 'zone-main', name: 'founderai.biz' }] } };
      }
      return { data: { success: false, result: [] } };
    });

    mockAxiosPost.mockResolvedValue({
      data: { success: true, result: { id: 'purge-ok' } },
    });

    const res = await cloudflareService.purgeUrls([
      'https://founderai.biz/api/public/landing-pages/promo',
      'https://unmanaged-external.com/api/public/lp',
    ]);

    expect(res.success).toBe(true);
    expect(mockAxiosPost).toHaveBeenCalledTimes(1);
    // MUST NOT purge unmanaged-external.com inside zone-main!
    expect(mockAxiosPost).toHaveBeenCalledWith(
      'https://api.cloudflare.com/client/v4/zones/zone-main/purge_cache',
      { files: ['https://founderai.biz/api/public/landing-pages/promo'] },
      expect.any(Object)
    );
  });

  it('extractBaseDomain handles 2-part and multi-part ccTLDs (.com.vn, .co.uk)', () => {
    expect(cloudflareService.extractBaseDomain('sub.founderai.biz')).toBe('founderai.biz');
    expect(cloudflareService.extractBaseDomain('sale.customer.com.vn')).toBe('customer.com.vn');
    expect(cloudflareService.extractBaseDomain('landing.app.org.vn')).toBe('app.org.vn');
    expect(cloudflareService.extractBaseDomain('deep.sub.site.co.uk')).toBe('site.co.uk');
    expect(cloudflareService.extractBaseDomain('example.com')).toBe('example.com');
  });

  it('purgeLandingCache generates complete set of URLs for slug and custom hostname using LP_SUBDOMAIN_BASE', async () => {
    process.env.LP_SUBDOMAIN_BASE = 'lp.uknow.vn';
    process.env.CF_ZONE_NAME = 'uknow.vn';

    const purgeSpy = jest.spyOn(cloudflareService, 'purgeUrls').mockResolvedValue({ success: true });

    await cloudflareService.purgeLandingCache({
      slug: 'summer-sale',
      hostname: 'sale.example.com',
    });

    expect(purgeSpy).toHaveBeenCalledWith([
      'https://founderai.biz/api/public/landing-pages/summer-sale',
      'https://founderai.biz/api/public/landing-pages/summer-sale/form-config',
      'https://founderai.biz/l/summer-sale',
      'https://summer-sale.lp.uknow.vn/',
      'https://summer-sale.lp.uknow.vn/api/public/lp',
      'https://summer-sale.uknow.vn/',
      'https://summer-sale.uknow.vn/api/public/lp',
      'https://sale.example.com/',
      'https://sale.example.com/api/public/lp',
      'https://founderai.biz/api/public/landing-pages-by-host?host=sale.example.com',
    ]);

    purgeSpy.mockRestore();
  });

  it('verifyCredentials verifies active token status and fails on disabled/logical failure', async () => {
    // 1. Active token -> success
    mockAxiosGet.mockResolvedValueOnce({
      data: { success: true, result: { id: 'tok-1', status: 'active' } },
    });
    const res1 = await cloudflareService.verifyCredentials();
    expect(res1.success).toBe(true);

    // 2. Disabled token -> failure
    mockAxiosGet.mockResolvedValueOnce({
      data: { success: true, result: { id: 'tok-1', status: 'disabled' } },
    });
    const res2 = await cloudflareService.verifyCredentials();
    expect(res2.success).toBe(false);
    expect(res2.message).toContain('not active');

    // 3. API logical failure (success: false)
    mockAxiosGet.mockResolvedValueOnce({
      data: { success: false, errors: [{ message: 'Invalid token' }] },
    });
    const res3 = await cloudflareService.verifyCredentials();
    expect(res3.success).toBe(false);
    expect(res3.message).toBe('Invalid token');
  });

  it('getZoneByName sets negative cache with 60s TTL and refetches after expiry', async () => {
    jest.useFakeTimers();
    mockAxiosGet.mockResolvedValueOnce({ data: { success: true, result: [] } });

    const res1 = await cloudflareService.getZoneByName('notfound.vn');
    expect(res1.success).toBe(false);
    expect(mockAxiosGet).toHaveBeenCalledTimes(1);

    // Call at t = 30s (before 60s expiry) should hit negative cache
    jest.advanceTimersByTime(30 * 1000);
    const res2 = await cloudflareService.getZoneByName('notfound.vn');
    expect(res2.success).toBe(false);
    expect(mockAxiosGet).toHaveBeenCalledTimes(1);

    // Advance past 60s (t = 61s) -> negative cache must expire
    jest.advanceTimersByTime(31 * 1000);
    mockAxiosGet.mockResolvedValueOnce({
      data: { success: true, result: [{ id: 'zone-new', name: 'notfound.vn' }] },
    });

    const res3 = await cloudflareService.getZoneByName('notfound.vn');
    expect(res3.success).toBe(true);
    expect(res3.zone.id).toBe('zone-new');
    expect(mockAxiosGet).toHaveBeenCalledTimes(2);

    jest.useRealTimers();
  });
});
