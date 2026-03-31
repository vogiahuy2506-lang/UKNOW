import db from '../config/database.js';
import dashboardAnalyticsService from '../services/dashboard/dashboardAnalytics.service.js';
import dashboardInsightsService from '../services/dashboard/dashboardInsights.service.js';

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
   * Lấy thống kê tổng quan dashboard theo bộ lọc.
   *
   * Query:
   * - startDate: YYYY-MM-DD
   * - endDate: YYYY-MM-DD
   * - campaignIds: danh sách id phân tách dấu phẩy
   * - campaignType: all|email|zalo|zalo_group
   * - period: 7d|30d|90d (fallback khi chưa truyền startDate/endDate)
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async getOverview(req, res) {
    try {
      const userId = req.user.id;
      const roleCode = req.user.role_code;
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
   * Lấy dữ liệu timeline cho dashboard theo bộ lọc.
   *
   * Query:
   * - startDate: YYYY-MM-DD
   * - endDate: YYYY-MM-DD
   * - campaignIds: danh sách id phân tách dấu phẩy
   * - campaignType: all|email|zalo|zalo_group
   * - period: 7d|30d|90d (fallback khi chưa truyền startDate/endDate)
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async getAnalytics(req, res) {
    try {
      const userId = req.user.id;
      const roleCode = req.user.role_code;
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
   * Lấy danh sách run-level metrics cho dashboard.
   *
   * Query:
   * - startDate: YYYY-MM-DD
   * - endDate: YYYY-MM-DD
   * - campaignIds: danh sách id phân tách dấu phẩy
   * - campaignType: all|email|zalo|zalo_group
   * - page, limit
   * - period: 7d|30d|90d (fallback khi chưa truyền startDate/endDate)
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async getRuns(req, res) {
    try {
      const userId = req.user.id;
      const roleCode = req.user.role_code;
      const data = await dashboardAnalyticsService.getRuns(userId, roleCode, req.query);
      this.setNoCacheHeaders(res);

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      console.error('Get dashboard runs error:', error);
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
      const userId = req.user.id;
      const roleCode = req.user.role_code;
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
   * Lấy top danh sách: top khóa học theo đơn, top chiến dịch theo đơn, top chiến dịch theo click.
   *
   * Query:
   * - startDate: YYYY-MM-DD
   * - endDate: YYYY-MM-DD
   * - campaignIds: danh sách id phân tách dấu phẩy
   * - campaignType: all|email|zalo|zalo_group
   * - limit: số lượng item mỗi danh sách (mặc định 10, tối đa 20)
   *
   * Response:
   * - topCourses: [{ productName, pendingCount, completedCount, total }]
   * - topCampaignsByOrders: [{ campaignId, campaignName, campaignType, pendingCount, completedCount, total }]
   * - topCampaignsByClicks: [{ campaignId, campaignName, campaignType, clickCount, sentCount, openCount }]
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async getTopLists(req, res) {
    try {
      const userId = req.user.id;
      const roleCode = req.user.role_code;
      const data = await dashboardAnalyticsService.getTopLists(userId, roleCode, req.query);
      this.setNoCacheHeaders(res);

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      console.error('Get dashboard top lists error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server',
      });
    }
  }

  /**
   * So sánh chiến dịch theo bộ lọc campaignIds.
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async compareCampaigns(req, res) {
    try {
      const userId = req.user.id;
      const roleCode = req.user.role_code;
      const isAdmin = String(roleCode || '').trim().toLowerCase() === 'admin';
      const { campaignIds } = req.query;

      if (!campaignIds) {
        return res.status(400).json({
          success: false,
          message: 'Vui lòng chọn chiến dịch để so sánh'
        });
      }

      const ids = String(campaignIds)
        .split(',')
        .map((id) => Number.parseInt(String(id).trim(), 10))
        .filter(Number.isFinite);
      if (ids.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Danh sách chiến dịch không hợp lệ',
        });
      }

      const queryParams = [ids, isAdmin, userId];
      const result = await db.query(
        `SELECT id, campaign_name, campaign_type, status,
                total_customers, total_sent, total_delivered,
                total_opened, total_clicked, total_converted, total_revenue,
                created_at, published_at
         FROM campaigns
         WHERE id = ANY($1::bigint[])
           AND ($2::boolean = TRUE OR id_user = $3)`,
        queryParams
      );

      res.json({
        success: true,
        data: result.rows.map((c) => ({
          id: c.id,
          campaignName: c.campaign_name,
          campaignType: c.campaign_type,
          status: c.status,
          totalCustomers: c.total_customers,
          totalSent: c.total_sent,
          totalDelivered: c.total_delivered,
          totalOpened: c.total_opened,
          totalClicked: c.total_clicked,
          totalConverted: c.total_converted,
          totalRevenue: c.total_revenue,
          openRate: c.total_delivered > 0 ? ((c.total_opened / c.total_delivered) * 100).toFixed(2) : 0,
          clickRate: c.total_opened > 0 ? ((c.total_clicked / c.total_opened) * 100).toFixed(2) : 0,
          conversionRate: c.total_clicked > 0 ? ((c.total_converted / c.total_clicked) * 100).toFixed(2) : 0,
          createdAt: c.created_at,
          publishedAt: c.published_at
        })),
      });
    } catch (error) {
      console.error('Compare campaigns error:', error);
      res.status(500).json({
        success: false,
        message: 'Lỗi server'
      });
    }
  }

  /**
   * Lấy insight dashboard đã lưu trên DB (jsonb) cho user hiện tại.
   *
   * Response:
   * - `data`: `{ savedAt, insights }` hoặc `null` nếu chưa có bản lưu.
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async getSavedInsights(req, res) {
    try {
      const userId = req.user.id;
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
   * 1. Frontend gửi kèm dữ liệu thống kê đang hiển thị (đã theo bộ lọc).
   * 2. Backend gọi Gemini bằng API key trong env và ép response dạng JSON theo schema.
   * 3. Trả về insight; nếu payload đủ dùng thì ghi DB (xóa insight cũ của user, chèn bản mới).
   *
   * Body:
   * - overview: payload từ GET /api/dashboard/overview
   * - analytics: payload từ GET /api/dashboard/analytics
   * - topListsData: payload từ GET /api/dashboard/top-lists
   * - filters: (tùy chọn) { startDate, endDate, campaignType, campaignIds }
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   */
  async generateInsights(req, res) {
    try {
      const { overview, analytics, topListsData, filters } = req.body || {};

      if (!overview || !analytics || !topListsData) {
        return res.status(400).json({
          success: false,
          message: 'Thiếu dữ liệu dashboard để phân tích (overview/analytics/topListsData)',
        });
      }

      const result = await dashboardInsightsService.generateInsights({
        overview,
        analytics,
        topListsData,
        filters,
      });

      try {
        await dashboardInsightsService.persistInsightIfUsable(req.user.id, result.data, filters);
      } catch (persistErr) {
        console.error('Persist dashboard insight error:', persistErr);
      }

      this.setNoCacheHeaders(res);
      return res.json(result);
    } catch (error) {
      console.error('Generate dashboard insights error:', error);
      return res.status(error?.status || 500).json({
        success: false,
        message: error?.message || 'Lỗi server',
      });
    }
  }
}

export default new DashboardController();
