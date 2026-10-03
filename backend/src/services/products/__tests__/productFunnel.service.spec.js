import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const aggregateFormFunnelByProduct = jest.fn();
const aggregateLandingFunnelByProduct = jest.fn();
const listCampaignClicks = jest.fn();
jest.unstable_mockModule('../../../repositories/products/productFunnel.repository.js', () => ({
  default: { aggregateFormFunnelByProduct, aggregateLandingFunnelByProduct, listCampaignClicks },
}));

const { default: productFunnelService } = await import('../productFunnel.service.js');
const { default: dashboardAnalyticsService } = await import('../../dashboard/dashboardAnalytics.service.js');

const owner = { id: 5, role: 'user_admin', activeContext: { type: 'self' } };

beforeEach(() => {
  aggregateFormFunnelByProduct.mockReset().mockResolvedValue([]);
  aggregateLandingFunnelByProduct.mockReset().mockResolvedValue([]);
  listCampaignClicks.mockReset().mockResolvedValue([]);
});

describe('productFunnel.service getFunnel', () => {
  it('dùng đúng mốc ngày của parseDateRange (00:00 giờ VN, nửa mở) và truyền chủ workspace', async () => {
    const parsed = dashboardAnalyticsService.parseDateRange({ startDate: '2026-09-01', endDate: '2026-09-30' });
    const out = await productFunnelService.getFunnel(owner, { startDate: '2026-09-01', endDate: '2026-09-30' });

    expect(parsed.startAt).toBe('2026-08-31T17:00:00.000Z');
    expect(parsed.endExclusive).toBe('2026-09-30T17:00:00.000Z');
    expect(aggregateFormFunnelByProduct).toHaveBeenCalledWith({
      workspaceOwnerId: 5,
      startAt: parsed.startAt,
      endExclusive: parsed.endExclusive,
    });
    expect(out.filters).toEqual({ startDate: '2026-09-01', endDate: '2026-09-30' });
  });

  it('period=7d / 30d / 90d lấy khoảng qua parseDateRange', async () => {
    for (const period of ['7d', '30d', '90d']) {
      const parsed = dashboardAnalyticsService.parseDateRange({ period });
      await productFunnelService.getFunnel(owner, { period });
      expect(aggregateFormFunnelByProduct).toHaveBeenLastCalledWith({
        workspaceOwnerId: 5,
        startAt: parsed.startAt,
        endExclusive: parsed.endExclusive,
      });
    }
  });

  it('period=all không chặn ngày', async () => {
    const out = await productFunnelService.getFunnel(owner, { period: 'all' });
    expect(aggregateFormFunnelByProduct).toHaveBeenCalledWith({
      workspaceOwnerId: 5,
      startAt: null,
      endExclusive: null,
    });
    expect(out.filters).toEqual({ allTime: true });
  });

  it('nhân viên: phạm vi là chủ workspace, không phải id nhân viên', async () => {
    const employee = {
      id: 99,
      role: 'user_admin',
      activeContext: { type: 'employee', ownerId: 5, membershipId: 1, permissions: { reports_view: true } },
    };
    await productFunnelService.getFunnel(employee, { period: 'all' });
    expect(aggregateFormFunnelByProduct.mock.calls[0][0].workspaceOwnerId).toBe(5);
  });
});

describe('productFunnel.service — Quan tâm / Để lại thông tin (PR-2/PR-3)', () => {
  it('gộp landingViews, leads, campaignClicks (khử trùng người) và hai trường tiện cho giao diện', async () => {
    aggregateFormFunnelByProduct.mockResolvedValue([
      { productId: 1, submitted: 4, registered: 2, paid: 1, revenue: 2000, formIds: [7] },
      { productId: 2, submitted: 0, registered: 0, paid: 0, revenue: 0, formIds: [] },
    ]);
    aggregateLandingFunnelByProduct.mockResolvedValue([
      { productId: 1, productUrl: 'https://shop.vn/p1/', landings: [{ id: 1, slug: 'abc', hostnames: [] }], landingViews: 3, leads: 1 },
      { productId: 2, productUrl: null, landings: [], landingViews: 0, leads: 0 },
    ]);
    listCampaignClicks.mockResolvedValue([
      { id: 1, customerId: 10, targetUrl: 'https://www.shop.vn/p1?utm_source=email' },
      { id: 2, customerId: 10, targetUrl: 'https://founderai.biz/lp/abc' }, // cùng người, link landing -> vẫn 1
      { id: 3, customerId: 11, targetUrl: 'https://shop.vn/p1.' },
      { id: 4, customerId: 12, targetUrl: 'https://shop.vn/p2' }, // khác path
      { id: 5, customerId: null, targetUrl: 'https://shop.vn/p1' },
      { id: 6, customerId: null, targetUrl: 'https://shop.vn/p1' }, // NULL: mỗi dòng một người
    ]);
    const out = await productFunnelService.getFunnel(owner, { period: 'all' });
    expect(out.rows[0]).toMatchObject({
      productId: 1,
      submitted: 4,
      landingViews: 3,
      leads: 1,
      campaignClicks: 4,
      interested: 7,
      leftContact: 5,
    });
    expect(out.rows[1]).toMatchObject({ campaignClicks: 0, interested: 0, leftContact: 0 });
  });
});
