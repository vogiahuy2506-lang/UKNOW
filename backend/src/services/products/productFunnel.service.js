import productFunnelRepository from '../../repositories/products/productFunnel.repository.js';
import dashboardAnalyticsService from '../dashboard/dashboardAnalytics.service.js';
import { getWorkspaceScope } from '../../utils/workspaceContext.util.js';
import { buildProductUrlKeys, normalizeUrlKey } from '../../utils/productLinkMatch.util.js';

class ProductFunnelService {
  /**
   * Phễu bán hàng theo sản phẩm của workspace đang làm việc.
   * Khoảng ngày dùng ĐÚNG `parseDateRange` của dashboard (ngày VN, mốc +07:00) — không có luật ngày thứ hai.
   * `period=all` / `allTime=1` = không chặn ngày.
   *
   * @param {object} authUser
   * @param {{ period?: string, startDate?: string, endDate?: string, allTime?: string }} query
   * @returns {Promise<{ filters: object, rows: Array<{ productId: number, submitted: number, registered: number, paid: number, revenue: number, awaitingConfirm: number, awaitingAmount: number, kind: string, hasPaidForm: boolean, landingViews: number, leads: number, campaignClicks: number, interested: number, leftContact: number }> }>}
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

    const range = { workspaceOwnerId: scope.workspaceOwnerId, startAt, endExclusive };
    const [formRows, landingRows, clicks] = await Promise.all([
      productFunnelRepository.aggregateFormFunnelByProduct(range),
      productFunnelRepository.aggregateLandingFunnelByProduct(range),
      productFunnelRepository.listCampaignClicks(range),
    ]);

    // Lượt bấm → khoá URL chuẩn hoá một lần; mỗi sản phẩm đếm NGƯỜI khác nhau (id_customer NULL: mỗi dòng một người).
    const normalizedClicks = clicks
      .map((c) => ({ ...c, key: normalizeUrlKey(c.targetUrl) }))
      .filter((c) => c.key);
    const landingByProduct = new Map(landingRows.map((r) => [r.productId, r]));
    const rows = formRows.map((row) => {
      const landing = landingByProduct.get(row.productId);
      const keys = buildProductUrlKeys({ productUrl: landing?.productUrl, landings: landing?.landings || [] });
      const people = new Set();
      if (keys.size > 0) {
        for (const c of normalizedClicks) {
          if (keys.has(c.key)) people.add(c.customerId === null ? `row:${c.id}` : `c:${c.customerId}`);
        }
      }
      const landingViews = landing?.landingViews || 0;
      const leads = landing?.leads || 0;
      const campaignClicks = people.size;
      const isEvent = row.kind === 'event';
      // Sự kiện miễn phí: không có biểu mẫu thu tiền (và chưa từng có số tiền) → các cột tiền là null, giao diện hiện "—".
      const noMoney =
        isEvent && !row.hasPaidForm && !row.paid && !row.revenue && !row.awaitingConfirm && !row.awaitingAmount;
      const moneyCols = noMoney ? { paid: null, revenue: null, awaitingConfirm: null, awaitingAmount: null } : {};
      return {
        ...row,
        ...moneyCols,
        landingViews,
        leads,
        campaignClicks,
        interested: landingViews + campaignClicks,
        // event: bài nộp đã là Đăng ký → không đếm lần hai ở Để lại thông tin (chỉ lead landing).
        leftContact: isEvent ? leads : leads + row.submitted,
      };
    });
    return { filters, rows };
  }
}

export default new ProductFunnelService();
