import dashboardAnalyticsService from '../services/dashboard/dashboardAnalytics.service.js';
import dashboardInsightsService from '../services/dashboard/dashboardInsights.service.js';
import { chargeAiCredit } from '../middleware/aiCredit.middleware.js';
import { resolveWorkspaceOwnerId } from '../utils/workspaceContext.util.js';
import { buildAiErrorPayload } from '../utils/aiErrorPayload.util.js';

const INSIGHTS_INVALID_FILTERS_MESSAGE = 'Bộ lọc phân tích không hợp lệ (filters phải là đối tượng)';

/**
 * Validate POST /dashboard/insights body before credit pre-flight.
 *
 * Số liệu để viết nhận xét do SERVER tự tính (cùng hàm với các thẻ trên trang Báo cáo), nên body chỉ mang bộ lọc.
 * Trình duyệt bản cũ còn gửi kèm overview / analytics / topListsData — bỏ qua, không dùng để viết lời.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function validateDashboardInsightsPayload(req, res, next) {
  const filters = req.body?.filters;
  if (filters != null && (typeof filters !== 'object' || Array.isArray(filters))) {
    return res.status(400).json({
      success: false,
      message: INSIGHTS_INVALID_FILTERS_MESSAGE,
    });
  }
  return next();
}

class DashboardController {
  /**
   * Disable HTTP cache for dashboard APIs to avoid stale 304 bodies on SPA data fetch.
   *
   * @param {import('express').Response} res
   */
  setNoCacheHeaders(res) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Surrogate-Control', 'no-store');
  }

  /**
   * Lấy thống kê tổng quan trang Báo cáo theo bộ lọc: `sent`, `failed`, `email`, `clicks`, `orders`.
   *
   * Query:
   * - startDate: YYYY-MM-DD (ngày VN)
   * - endDate: YYYY-MM-DD (ngày VN, tính trọn ngày)
   * - campaignIds: danh sách id phân tách dấu phẩy
   * - campaignType: all|email|zalo|zalo_group|telegram|whatsapp (lọc theo KÊNH của từng tin)
   * - period: 7d|30d|90d (fallback khi chưa truyền startDate/endDate)
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async getOverview(req, res) {
    try {
      const userId = resolveWorkspaceOwnerId(req.user);
      const roleCode = req.user.role;
      const data = await dashboardAnalyticsService.getOverview(userId, roleCode, req.query);
      this.setNoCacheHeaders(res);

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      console.error('Get dashboard overview error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server'
      });
    }
  }

  /**
   * GET /api/dashboard/landing-pages-stats
   *
   * Query: startDate, endDate, period (7d|30d|90d) — hoặc toàn thời gian: allTime=1 hoặc period=all.
   * Response: { filters, rows: [{ slug, title, viewCount, clickCount, submitCount, clickThroughRatePct, submitRateVsViewsPct }] } — rows gồm mọi slug `landing_pages` đã publish (kể cả 0 event) và slug chỉ có trong events/leads.
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async getLandingPageStats(req, res) {
    try {
      const data = await dashboardAnalyticsService.getLandingPageStats(req.user, req.query);
      this.setNoCacheHeaders(res);
      res.json({ success: true, data });
    } catch (error) {
      console.error('Get landing page stats error:', error);
      res.status(500).json({ success: false, message: 'Lỗi server' });
    }
  }

  /**
   * Lấy chuỗi theo ngày cho trang Báo cáo: `dailySent` (đã gửi mỗi ngày theo kênh) và `ordersTimeline` (đơn hàng).
   *
   * Query: như GET /overview.
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async getAnalytics(req, res) {
    try {
      const userId = resolveWorkspaceOwnerId(req.user);
      const roleCode = req.user.role;
      const data = await dashboardAnalyticsService.getAnalytics(userId, roleCode, req.query);
      this.setNoCacheHeaders(res);

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      console.error('Get analytics error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server'
      });
    }
  }

  /**
   * Lấy danh sách đơn hàng (customer_purchases) kèm thông tin lượt chạy, chiến dịch, kênh.
   *
   * Query:
   * - startDate: YYYY-MM-DD
   * - endDate: YYYY-MM-DD
   * - campaignIds: danh sách id phân tách dấu phẩy
   * - campaignType: all|email|zalo|zalo_group
   * - orderStatus: all|pending|completed (mặc định: all)
   * - page, limit
   *
   * Response items: { orderId, productName, amount, currency, statusGroup, orderDate,
   *                   campaignId, campaignName, campaignType, runId, runName }
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async getOrdersList(req, res) {
    try {
      const userId = resolveWorkspaceOwnerId(req.user);
      const roleCode = req.user.role;
      const data = await dashboardAnalyticsService.getOrdersList(userId, roleCode, req.query);
      this.setNoCacheHeaders(res);

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      console.error('Get dashboard orders list error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server'
      });
    }
  }

  /**
   * Bảng "Chiến dịch trong kỳ": các chiến dịch có tin trong khoảng ngày, sắp theo số đã gửi.
   *
   * Query: như GET /overview, thêm
   * - limit: số dòng (mặc định 10, tối đa 20)
   *
   * Response.items: [{ campaignId, campaignName, campaignType, sent, failed, opened, clicked, purchased }]
   * (`campaignId: null` = tin của chiến dịch đã xoá).
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async getCampaigns(req, res) {
    try {
      const userId = resolveWorkspaceOwnerId(req.user);
      const roleCode = req.user.role;
      const data = await dashboardAnalyticsService.getCampaignsTable(userId, roleCode, req.query);
      this.setNoCacheHeaders(res);

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      console.error('Get dashboard campaigns error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server',
      });
    }
  }

  /**
   * Lấy insight dashboard đã lưu trên DB (jsonb) cho user hiện tại.
   *
   * Response:
   * - `data`: `{ savedAt, filtersSnapshot, insights }`; `null` nếu chưa có bản lưu hoặc bản lưu trước mốc đổi cách tính.
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async getSavedInsights(req, res) {
    try {
      const userId = resolveWorkspaceOwnerId(req.user);
      const data = await dashboardInsightsService.getSavedInsightForUser(userId);
      this.setNoCacheHeaders(res);
      return res.json({
        success: true,
        data,
      });
    } catch (error) {
      console.error('Get saved dashboard insights error:', error);
      return res.status(500).json({
        success: false,
        message: 'Lỗi server',
      });
    }
  }

  /**
   * Sinh insight dashboard bằng Gemini để hiển thị dưới các biểu đồ + tổng quan.
   *
   * Luồng hoạt động:
   * 1. Frontend chỉ gửi BỘ LỌC đang áp dụng (và locale) — KHÔNG gửi số liệu.
   * 2. Server tự tính số liệu bằng đúng các hàm của trang Báo cáo (sendStats + customer_purchases) theo quyền của người
   *    gọi, nên lời phân tích luôn khớp các thẻ; không đọc bộ đếm campaign_runs hay số do trình duyệt gửi lên.
   * 3. Backend gọi Gemini bằng API key trong env và ép response dạng JSON theo schema.
   * 4. Trả về insight; nếu payload đủ dùng thì ghi DB (xóa insight cũ của user, chèn bản mới).
   *
   * Body:
   * - filters: (tùy chọn) { startDate, endDate, campaignType, campaignIds } — thiếu thì dùng khoảng mặc định của server
   * - locale: (tùy chọn) 'vi' | 'en'
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async generateInsights(req, res) {
    try {
      const { filters } = req.body || {};
      const locale =
        req.body?.locale ||
        req.query?.locale ||
        (req.headers['accept-language']?.startsWith('en') ? 'en' : 'vi');

      const ownerUserId = resolveWorkspaceOwnerId(req.user);
      const snapshot = await dashboardAnalyticsService.getInsightSnapshot(ownerUserId, req.user.role, filters);
      const result = await dashboardInsightsService.generateInsights({
        userId: ownerUserId,
        snapshot,
        locale,
      });

      try {
        await dashboardInsightsService.persistInsightIfUsable(ownerUserId, result.data, snapshot.filters);
      } catch (persistErr) {
        console.error('Persist dashboard insight error:', persistErr);
      }

      await chargeAiCredit(req);

      this.setNoCacheHeaders(res);
      return res.json(result);
    } catch (error) {
      console.error('Generate dashboard insights error:', error, error?.providerMessage ? `| Google: ${error.providerMessage}` : '');
      // Lỗi từ Google (400/403/404 khi model bị khai tử, 503 quá tải) mang nguyên câu JSON tiếng Anh — không đưa ra khách (D-19).
      return res.status(error?.status || 500).json(buildAiErrorPayload(error || {}, 'Không thể tạo nhận xét báo cáo bằng AI. Vui lòng thử lại sau.'));
    }
  }
}

export default new DashboardController();
