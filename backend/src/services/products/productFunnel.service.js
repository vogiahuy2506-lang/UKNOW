import productFunnelRepository from '../../repositories/products/productFunnel.repository.js';
import dashboardAnalyticsService from '../dashboard/dashboardAnalytics.service.js';
import { getWorkspaceScope } from '../../utils/workspaceContext.util.js';

class ProductFunnelService {
  /**
   * Phễu bán hàng theo sản phẩm của workspace đang làm việc.
   * Khoảng ngày dùng ĐÚNG `parseDateRange` của dashboard (ngày VN, mốc +07:00) — không có luật ngày thứ hai.
   * `period=all` / `allTime=1` = không chặn ngày.
   *
   * @param {object} authUser
   * @param {{ period?: string, startDate?: string, endDate?: string, allTime?: string }} query
   * @returns {Promise<{ filters: object, rows: Array<{ productId: number, submitted: number, registered: number, paid: number, revenue: number }> }>}
   */
  async getFunnel(authUser, query = {}) {
    const scope = getWorkspaceScope(authUser);
    const period = String(query.period ?? '').trim().toLowerCase();
    const allTimeFlag = String(query.allTime ?? '').trim().toLowerCase();
    const allTime = period === 'all' || allTimeFlag === '1' || allTimeFlag === 'true';

    let filters;
    let startAt = null;
    let endExclusive = null;
    if (allTime) {
      filters = { allTime: true };
    } else {
      const parsed = dashboardAnalyticsService.parseDateRange({
        startDate: query.startDate,
        endDate: query.endDate,
        period: query.period,
      });
      startAt = parsed.startAt;
      endExclusive = parsed.endExclusive;
      filters = { startDate: parsed.startDate, endDate: parsed.endDate };
    }

    const rows = await productFunnelRepository.aggregateFormFunnelByProduct({
      workspaceOwnerId: scope.workspaceOwnerId,
      startAt,
      endExclusive,
    });
    return { filters, rows };
  }
}

export default new ProductFunnelService();
