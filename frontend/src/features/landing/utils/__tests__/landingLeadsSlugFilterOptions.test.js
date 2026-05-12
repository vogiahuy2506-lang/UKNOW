import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../landing-pages/services/landingPagesAdminApi.service.js', () => ({
  fetchLandingPagesAdminList: vi.fn(),
}));

const { fetchLandingLeadsSlugFilterOptions } = await import('../landingLeadsSlugFilterOptions');
const { fetchLandingPagesAdminList } = await import('../../../landing-pages/services/landingPagesAdminApi.service.js');

beforeEach(() => {
  fetchLandingPagesAdminList.mockReset();
});

describe('fetchLandingLeadsSlugFilterOptions', () => {
  it('luôn có "l" làm option đầu tiên', async () => {
    fetchLandingPagesAdminList.mockResolvedValue([]);
    const opts = await fetchLandingLeadsSlugFilterOptions();
    expect(opts[0]).toEqual({ value: 'l', label: 'Landing React (/l)' });
  });

  it('merge slug từ CMS, bỏ trùng "l"', async () => {
    fetchLandingPagesAdminList.mockResolvedValue([
      { slug: 'khoahoc', isPublished: true },
      { slug: 'ai-coaching', isPublished: false },
      { slug: 'l', isPublished: true }, // trùng → bỏ
    ]);
    const opts = await fetchLandingLeadsSlugFilterOptions();
    expect(opts).toHaveLength(3);
    expect(opts.map((o) => o.value)).toEqual(['l', 'khoahoc', 'ai-coaching']);
    expect(opts[2].label).toBe('ai-coaching (chưa publish)');
  });

  it('slug có / đầu/cuối → strip về plain slug', async () => {
    fetchLandingPagesAdminList.mockResolvedValue([{ slug: '/promo/', isPublished: true }]);
    const opts = await fetchLandingLeadsSlugFilterOptions();
    expect(opts[1].value).toBe('promo');
  });

  it('slug bị duplicate trong CMS → chỉ giữ 1 lần', async () => {
    fetchLandingPagesAdminList.mockResolvedValue([
      { slug: 'promo', isPublished: true },
      { slug: 'promo', isPublished: true },
    ]);
    const opts = await fetchLandingLeadsSlugFilterOptions();
    const promoCount = opts.filter((o) => o.value === 'promo').length;
    expect(promoCount).toBe(1);
  });

  it('API throw → trả về fallback chỉ có "l"', async () => {
    fetchLandingPagesAdminList.mockRejectedValue(new Error('500'));
    const opts = await fetchLandingLeadsSlugFilterOptions();
    expect(opts).toEqual([{ value: 'l', label: 'Landing React (/l)' }]);
  });

  it('CMS trả null/undefined → fallback an toàn (vẫn có "l")', async () => {
    fetchLandingPagesAdminList.mockResolvedValue(null);
    const opts = await fetchLandingLeadsSlugFilterOptions();
    expect(opts).toEqual([{ value: 'l', label: 'Landing React (/l)' }]);
  });
});
