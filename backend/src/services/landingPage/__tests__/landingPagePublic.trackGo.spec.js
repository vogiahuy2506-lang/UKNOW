/**
 * GET /api/public/landing-track/go → landingPagePublic.service.buildRedirectUrlForClick.
 * Chỉ chuyển hướng tới link thuộc chính landing; đích lạ → về trang landing, không ghi click.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockFindPublishedBySlug = jest.fn();
const mockInsertEvent = jest.fn();
const mockGetPublishedSlugForHost = jest.fn();
const mockResourceIsLocked = jest.fn();

jest.unstable_mockModule('../../../repositories/landingPage.repository.js', () => ({
  default: {
    findPublishedBySlug: mockFindPublishedBySlug,
    isValidSlug: (slug) => slug === '' || /^[a-z0-9][a-z0-9-]*$/.test(slug),
  },
}));
jest.unstable_mockModule('../../../repositories/landingPageEvent.repository.js', () => ({
  default: { insert: mockInsertEvent },
}));
jest.unstable_mockModule('../landingPageDomain.service.js', () => ({
  default: { getPublishedSlugForHost: mockGetPublishedSlugForHost },
}));
jest.unstable_mockModule('../../../utils/topupLockGate.util.js', () => ({
  resourceIsLocked: mockResourceIsLocked,
  pausedLandingHtml: jest.fn(() => ''),
}));

const { default: service } = await import('../landingPagePublic.service.js');

const req = { headers: { 'user-agent': 'jest' } };
const landing = {
  id: 5,
  slug: 'promo',
  idUser: 42,
  workspaceOwnerId: 42,
  htmlContent: `
    <a href="https://shop.example.com/sp?id=1&amp;ref=lp">Mua</a>
    <a href="https://api.founderai.biz/api/public/landing-track/go?slug=promo&amp;u=https%3A%2F%2Fold.example.com%2Fp">Cũ</a>
  `,
};

const savedEnv = {};
beforeEach(() => {
  jest.clearAllMocks();
  for (const key of ['FRONTEND_URL', 'FRONTEND_URLS', 'LP_SUBDOMAIN_BASE']) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  process.env.FRONTEND_URL = 'https://app.uknow.vn';
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  mockFindPublishedBySlug.mockResolvedValue(landing);
  mockResourceIsLocked.mockResolvedValue(false);
  mockGetPublishedSlugForHost.mockResolvedValue(null);
  mockInsertEvent.mockResolvedValue();
});
afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  jest.restoreAllMocks();
});

describe('buildRedirectUrlForClick', () => {
  it('đích có trong HTML landing → URL đích + UTM, ghi click', async () => {
    const url = await service.buildRedirectUrlForClick(
      { slug: 'promo', u: 'https://shop.example.com/sp?id=1&ref=lp' },
      req
    );
    const loc = new URL(url);
    expect(loc.origin + loc.pathname).toBe('https://shop.example.com/sp');
    expect(loc.searchParams.get('utm_source')).toBe('landing_page');
    expect(loc.searchParams.get('utm_medium')).toBe('promo');
    expect(mockInsertEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'click', landingPageSlug: 'promo', idUser: 42,
    }));
  });

  it('link tracking cũ trong HTML (u=...) vẫn chuyển hướng được', async () => {
    const url = await service.buildRedirectUrlForClick({ slug: 'promo', u: 'https://old.example.com/p' }, req);
    expect(url.startsWith('https://old.example.com/p?')).toBe(true);
  });

  it('đích lạ → trả URL trang landing, KHÔNG ghi click', async () => {
    const url = await service.buildRedirectUrlForClick({ slug: 'promo', u: 'https://evil.example.net/login' }, req);
    expect(url).toBe('https://promo.founderai.biz/');
    expect(mockInsertEvent).not.toHaveBeenCalled();
  });

  it('host của chính landing (subdomain theo LP_SUBDOMAIN_BASE) được phép', async () => {
    process.env.LP_SUBDOMAIN_BASE = 'lp.test';
    const url = await service.buildRedirectUrlForClick({ slug: 'promo', u: 'https://promo.lp.test/cam-on' }, req);
    expect(url.startsWith('https://promo.lp.test/cam-on')).toBe(true);
    const blocked = await service.buildRedirectUrlForClick({ slug: 'promo', u: 'https://promo.founderai.biz/x' }, req);
    expect(blocked).toBe('https://promo.lp.test/');
  });

  it('tên miền riêng trỏ về CHÍNH landing được phép; trỏ về landing khác thì không', async () => {
    mockGetPublishedSlugForHost.mockResolvedValueOnce('promo');
    const ok = await service.buildRedirectUrlForClick({ slug: 'promo', u: 'https://www.shop-rieng.vn/' }, req);
    expect(ok.startsWith('https://www.shop-rieng.vn/')).toBe(true);
    mockGetPublishedSlugForHost.mockResolvedValueOnce('landing-khac');
    const blocked = await service.buildRedirectUrlForClick({ slug: 'promo', u: 'https://www.cua-nguoi-khac.vn/' }, req);
    expect(blocked).toBe('https://promo.founderai.biz/');
  });

  it('slug=l (hoặc thiếu slug): chỉ host frontend; đích ngoài → về frontend', async () => {
    const ok = await service.buildRedirectUrlForClick({ slug: 'l', u: 'https://app.uknow.vn/register' }, req);
    expect(ok.startsWith('https://app.uknow.vn/register')).toBe(true);
    expect(new URL(ok).searchParams.get('utm_medium')).toBe('fixed');
    const blocked = await service.buildRedirectUrlForClick({ u: 'https://example.com/x?a=1' }, req);
    expect(blocked).toBe('https://app.uknow.vn/');
    expect(mockFindPublishedBySlug).not.toHaveBeenCalled();
  });

  it('giao thức lạ / thiếu URL → 400; landing chưa publish → 404; bị khoá → 503', async () => {
    await expect(service.buildRedirectUrlForClick({ slug: 'promo', u: 'javascript:alert(1)' }, req))
      .rejects.toMatchObject({ statusCode: 400 });
    await expect(service.buildRedirectUrlForClick({ slug: 'promo' }, req))
      .rejects.toMatchObject({ statusCode: 400 });
    mockFindPublishedBySlug.mockResolvedValueOnce(null);
    await expect(service.buildRedirectUrlForClick({ slug: 'nhap', u: 'https://shop.example.com/sp' }, req))
      .rejects.toMatchObject({ statusCode: 404 });
    mockResourceIsLocked.mockResolvedValueOnce(true);
    await expect(service.buildRedirectUrlForClick({ slug: 'promo', u: 'https://shop.example.com/sp?id=1&ref=lp' }, req))
      .rejects.toMatchObject({ statusCode: 503 });
  });

  it('URL đích lỡ mã hoá hai lần vẫn đọc được', async () => {
    const url = await service.buildRedirectUrlForClick(
      { slug: 'promo', u: encodeURIComponent('https://shop.example.com/sp?id=1&ref=lp') },
      req
    );
    expect(url.startsWith('https://shop.example.com/sp?id=1&ref=lp')).toBe(true);
  });
});
