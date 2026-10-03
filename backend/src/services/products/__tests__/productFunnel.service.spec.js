import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const aggregateFormFunnelByProduct = jest.fn();
jest.unstable_mockModule('../../../repositories/products/productFunnel.repository.js', () => ({
  default: { aggregateFormFunnelByProduct },
}));

const { default: productFunnelService } = await import('../productFunnel.service.js');
const { default: dashboardAnalyticsService } = await import('../../dashboard/dashboardAnalytics.service.js');

const owner = { id: 5, role: 'user_admin', activeContext: { type: 'self' } };

beforeEach(() => {
  aggregateFormFunnelByProduct.mockReset().mockResolvedValue([]);
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
