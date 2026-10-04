import productFunnelRepository from '../../repositories/products/productFunnel.repository.js';
import productChatMentionRepository from '../../repositories/products/productChatMention.repository.js';
import dashboardAnalyticsService from '../dashboard/dashboardAnalytics.service.js';
import { getWorkspaceScope } from '../../utils/workspaceContext.util.js';
import { buildProductUrlKeys, normalizeUrlKey } from '../../utils/productLinkMatch.util.js';
import { personKey } from '../../utils/funnelPersonKey.util.js';

class ProductFunnelService {
  /**
   * Phễu bán hàng theo sản phẩm của workspace đang làm việc.
   * Khoảng ngày dùng ĐÚNG `parseDateRange` của dashboard (ngày VN, mốc +07:00) — không có luật ngày thứ hai.
   * `period=all` / `allTime=1` = không chặn ngày.
   *
   * @param {object} authUser
   * @param {{ period?: string, startDate?: string, endDate?: string, allTime?: string }} query
   * Đợt 3 — đếm NGƯỜI: `leftContact` / `registered` / `paid` là số NGƯỜI khác nhau (khoá `personKey`: SĐT chuẩn hoá > email >
   * dòng). Số lượt thô giữ ở `leftContactRows` / `registeredSubmissions` / `paidOrders` (cùng `submitted`, `leads`).
   * `revenue`, `awaitingConfirm`, `awaitingAmount` KHÔNG gộp người (tiền và việc chủ phải làm tính theo từng bài).
   * `interested` = lượt xem landing + người bấm link chiến dịch + `chatConversations` (số hội thoại khách nhắc tên/mã sản
   * phẩm với chatbot — job `product_chat_mention_scan`, trễ tối đa ~10 phút).
   *
   * @returns {Promise<{ filters: object, rows: Array<{ productId: number, submitted: number, registered: number, registeredSubmissions: number, paid: number, paidOrders: number, revenue: number, awaitingConfirm: number, awaitingAmount: number, kind: string, hasPaidForm: boolean, landingViews: number, leads: number, campaignClicks: number, chatConversations: number, interested: number, leftContact: number, leftContactRows: number }> }>}
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
    const [formRows, landingRows, clicks, submissionRows, chatRows] = await Promise.all([
      productFunnelRepository.aggregateFormFunnelByProduct(range),
      productFunnelRepository.aggregateLandingFunnelByProduct(range),
      productFunnelRepository.listCampaignClicks(range),
      productFunnelRepository.listFormSubmissionsForPeople(range),
      productChatMentionRepository.aggregateChatMentionsByProduct(range),
    ]);
    const chatByProduct = new Map(chatRows.map((r) => [r.productId, r.chatConversations]));
    const allSlugs = [...new Set(landingRows.flatMap((r) => (r.landings || []).map((l) => l.slug)).filter(Boolean))];
    const leadRows = await productFunnelRepository.listLeadsForPeople({ ...range, slugs: allSlugs });
    const submissionsByProduct = new Map();
    for (const sub of submissionRows) {
      if (!submissionsByProduct.has(sub.productId)) submissionsByProduct.set(sub.productId, []);
      submissionsByProduct.get(sub.productId).push(sub);
    }
    const leadsBySlug = new Map();
    for (const lead of leadRows) {
      if (!leadsBySlug.has(lead.slug)) leadsBySlug.set(lead.slug, []);
      leadsBySlug.get(lead.slug).push(lead);
    }

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
      const chatConversations = chatByProduct.get(row.productId) || 0;
      const isEvent = row.kind === 'event';

      // Đếm NGƯỜI. Lead: mọi lead của landing gắn sản phẩm (landing có thể gắn nhiều biểu mẫu → khử trùng theo slug).
      const leadPeople = new Set();
      for (const slug of new Set((landing?.landings || []).map((l) => l.slug))) {
        for (const lead of leadsBySlug.get(slug) || []) {
          leadPeople.add(personKey({ phone: lead.phone, email: lead.email, source: 'lead', id: lead.id }));
        }
      }
      const submittedPeople = new Set();
      const registeredPeople = new Set();
      const paidPeople = new Set();
      for (const sub of submissionsByProduct.get(row.productId) || []) {
        const key = personKey({ phone: sub.phone, email: sub.email, source: 'sub', id: sub.id });
        if (sub.inCreated && sub.status !== 'cancelled') submittedPeople.add(key);
        // Cùng luật với SQL `registeredStatus` của repository: event = mọi bài chưa huỷ; sale = chờ thanh toán / đã xác nhận.
        const isRegistered = isEvent
          ? sub.status !== 'cancelled'
          : sub.status === 'pending_payment' || sub.status === 'confirmed';
        if (sub.inCreated && isRegistered) registeredPeople.add(key);
        if (sub.inPaid) paidPeople.add(key);
      }
      // event: bài nộp đã là Đăng ký → Để lại thông tin chỉ tính lead landing (giữ luật 6f0dc896).
      const leftContactPeople = new Set(leadPeople);
      if (!isEvent) for (const key of submittedPeople) leftContactPeople.add(key);
      // Sự kiện miễn phí: không có biểu mẫu thu tiền (và chưa từng có số tiền) → các cột tiền là null, giao diện hiện "—".
      const noMoney =
        isEvent && !row.hasPaidForm && !row.paid && !row.revenue && !row.awaitingConfirm && !row.awaitingAmount;
      const moneyCols = noMoney
        ? { paid: null, paidOrders: null, revenue: null, awaitingConfirm: null, awaitingAmount: null }
        : { paid: paidPeople.size, paidOrders: row.paid };
      return {
        ...row,
        registered: registeredPeople.size,
        registeredSubmissions: row.registered,
        ...moneyCols,
        landingViews,
        leads,
        campaignClicks,
        chatConversations,
        interested: landingViews + campaignClicks + chatConversations,
        leftContact: leftContactPeople.size,
        // Số lượt thô (cũ): event chỉ lead landing; sale lead + bài nộp.
        leftContactRows: isEvent ? leads : leads + row.submitted,
      };
    });
    return { filters, rows };
  }
}

export default new ProductFunnelService();
