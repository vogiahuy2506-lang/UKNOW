import db from '../../config/database.js';
import { isAdminRole } from '../../utils/roleScope.util.js';

/** Múi giờ Việt Nam — gom ngày đơn hàng theo NGÀY VN, không theo múi giờ tiến trình. */
const VN_TZ = 'Asia/Ho_Chi_Minh';

// Nhóm trạng thái đơn — MỘT nơi định nghĩa cho số thẻ, biểu đồ đơn theo ngày, bảng chiến dịch và danh sách đơn,
// để tổng "đơn chờ" / "đã mua" ở mọi nơi cộng khớp nhau. Trạng thái nằm ngoài hai nhóm (huỷ, hoàn…) không tính.
const PENDING_ORDER_STATUS_SQL = "('on-hold', 'on-holder', 'onhold', 'pending', 'interested')";
const COMPLETED_ORDER_STATUS_SQL = "('completed', 'processing')";

class DashboardRepository {
  /**
   * Build SQL filter clause for campaign scope.
   *
   * @param {object} input
   * @param {string} input.userAlias
   * @param {number} input.userId
   * @param {number[]} input.campaignIds
   * @param {'all'|'email'|'zalo'|'zalo_group'|'telegram'|'whatsapp'} input.campaignType
   * @returns {{ clause: string, params: any[] }}
   */
  buildCampaignScopeClause({ userAlias = 'c', userId, roleCode, campaignIds = [], campaignType = 'all' }) {
    const params = [];
    let clause = '1=1';
    if (!isAdminRole(roleCode)) {
      const normalizedUserId = Number(userId);
      // Nhân viên chỉ được xem các chiến dịch do chính họ tạo.
      // Nếu userId không hợp lệ thì chặn toàn bộ dữ liệu để tránh rò rỉ ngoài phạm vi.
      if (!Number.isFinite(normalizedUserId)) {
        clause = '1=0';
      } else {
        params.push(normalizedUserId);
        clause = `${userAlias}.id_user = $${params.length}`;
      }
    }

    if (Array.isArray(campaignIds) && campaignIds.length > 0) {
      params.push(campaignIds);
      clause += ` AND ${userAlias}.id = ANY($${params.length}::bigint[])`;
    }

    if (campaignType === 'telegram') {
      // W7b — chiến dịch Telegram gồm cả `telegram` (cá nhân) và `telegram_group`.
      clause += ` AND ${userAlias}.campaign_type IN ('telegram', 'telegram_group')`;
    } else if (campaignType && campaignType !== 'all') {
      params.push(campaignType);
      clause += ` AND ${userAlias}.campaign_type = $${params.length}`;
    }

    return { clause, params };
  }

  /**
   * Append date range condition to SQL clause.
   *
   * @param {object} input
   * @param {string} input.baseClause
   * @param {Array<any>} input.params
   * @param {string} input.dateColumn
   * @param {string} input.startAt
   * @param {string} input.endExclusive
   * @returns {{ clause: string, params: any[] }}
   */
  withDateRange({ baseClause, params, dateColumn, startAt, endExclusive }) {
    const nextParams = [...params];
    let clause = baseClause;
    if (startAt) {
      nextParams.push(startAt);
      clause += ` AND ${dateColumn} >= $${nextParams.length}`;
    }
    if (endExclusive) {
      nextParams.push(endExclusive);
      clause += ` AND ${dateColumn} < $${nextParams.length}`;
    }
    return { clause, params: nextParams };
  }

  /**
   * Build purchase timestamp expression.
   *
   * Uses created_at as the primary timestamp for analytics grouping,
   * falls back to purchase_date for legacy records that predate the column.
   *
   * Ép `::timestamptz`: cột là TIMESTAMPTZ nên phép ép không đổi gì; nếu một môi trường nào đó lưu cột dạng
   * `timestamp` (giờ VN) thì ép theo múi giờ phiên (Asia/Ho_Chi_Minh, config/database.js) — vẫn đúng mốc ngày VN
   * khi so với mốc `startAt` / `endExclusive` (đã là thời điểm tuyệt đối) và khi gom ngày ở getOrdersDaily.
   *
   * @param {string} alias table alias (default: cp)
   * @returns {string}
   */
  getPurchaseDateExpr(alias = 'cp') {
    return `(COALESCE(${alias}.created_at, ${alias}.purchase_date))::timestamptz`;
  }

  /**
   * Normalize purchase status expression for tolerant comparisons.
   *
   * @param {string} rawStatusExpr
   * @returns {string}
   */
  buildNormalizedPurchaseStatusExpr(rawStatusExpr) {
    return `LOWER(TRIM(COALESCE(${rawStatusExpr}, '')))`;
  }

  /**
   * Đơn hàng (customer_purchases) theo loại chiến dịch — NGUỒN DUY NHẤT của "khách để lại thông tin" (đơn chờ) và
   * "đã mua" ở trang Báo cáo, cho cả số tổng lẫn số theo kênh (service cộng các dòng này, không có nguồn thứ hai).
   *
   * @param {object} filters
   * @param {string} purchaseOrderStatusExpr
   * @returns {Promise<Array<{campaign_type: string, pending_orders: number, completed_orders: number}>>}
   */
  async getOrderMetricsByType(filters, purchaseOrderStatusExpr) {
    const scope = this.buildCampaignScopeClause(filters);
    const purchaseDateExpr = this.getPurchaseDateExpr('cp');
    const normalizedOrderStatusExpr = this.buildNormalizedPurchaseStatusExpr(purchaseOrderStatusExpr);
    const scoped = this.withDateRange({
      baseClause: scope.clause,
      params: scope.params,
      dateColumn: purchaseDateExpr,
      startAt: filters.startAt,
      endExclusive: filters.endExclusive,
    });
    const result = await db.query(
      `SELECT
         c.campaign_type,
         COUNT(*) FILTER (WHERE ${normalizedOrderStatusExpr} IN ${PENDING_ORDER_STATUS_SQL})::INTEGER AS pending_orders,
         COUNT(*) FILTER (WHERE ${normalizedOrderStatusExpr} IN ${COMPLETED_ORDER_STATUS_SQL})::INTEGER AS completed_orders
       FROM customer_purchases cp
       JOIN campaigns c ON c.id = cp.id_campaign
       WHERE ${scoped.clause}
       GROUP BY c.campaign_type`,
      scoped.params
    );
    return result.rows || [];
  }

  /**
   * Đơn hàng theo NGÀY VN và loại chiến dịch (biểu đồ "Đơn hàng theo thời gian"). Cùng bộ lọc / cùng cột thời gian
   * với getOrderMetricsByType nên tổng các ngày = số thẻ. Ngày trả ra là chuỗi 'YYYY-MM-DD' (to_char ở SQL — trả cột
   * DATE thì node-pg dựng Date theo giờ máy và ra JSON lùi một ngày).
   *
   * @param {object} filters
   * @param {string} purchaseOrderStatusExpr
   * @returns {Promise<Array<{date: string, campaign_type: string, pending_orders: number, completed_orders: number}>>}
   */
  async getOrdersDaily(filters, purchaseOrderStatusExpr) {
    const scope = this.buildCampaignScopeClause(filters);
    const purchaseDateExpr = this.getPurchaseDateExpr('cp');
    const normalizedOrderStatusExpr = this.buildNormalizedPurchaseStatusExpr(purchaseOrderStatusExpr);
    const scoped = this.withDateRange({
      baseClause: scope.clause,
      params: scope.params,
      dateColumn: purchaseDateExpr,
      startAt: filters.startAt,
      endExclusive: filters.endExclusive,
    });
    const result = await db.query(
      `SELECT
         TO_CHAR(${purchaseDateExpr} AT TIME ZONE '${VN_TZ}', 'YYYY-MM-DD') AS date,
         c.campaign_type,
         COUNT(*) FILTER (WHERE ${normalizedOrderStatusExpr} IN ${PENDING_ORDER_STATUS_SQL})::INTEGER AS pending_orders,
         COUNT(*) FILTER (WHERE ${normalizedOrderStatusExpr} IN ${COMPLETED_ORDER_STATUS_SQL})::INTEGER AS completed_orders
       FROM customer_purchases cp
       JOIN campaigns c ON c.id = cp.id_campaign
       WHERE ${scoped.clause}
       GROUP BY 1, 2
       ORDER BY 1 ASC`,
      scoped.params
    );
    return result.rows || [];
  }

  /**
   * Số đơn "đã mua" theo từng chiến dịch (cột "Đã mua" của bảng "Chiến dịch trong kỳ"), cùng bộ lọc ngày / phạm vi
   * với getOrderMetricsByType. Chỉ đếm các chiến dịch trong `campaignIds`.
   *
   * @param {object} filters
   * @param {string} purchaseOrderStatusExpr
   * @param {number[]} campaignIds
   * @returns {Promise<Array<{campaign_id: string, completed_orders: number}>>}
   */
  async getCompletedOrdersByCampaign(filters, purchaseOrderStatusExpr, campaignIds) {
    if (!Array.isArray(campaignIds) || campaignIds.length === 0) return [];
    const scope = this.buildCampaignScopeClause(filters);
    const purchaseDateExpr = this.getPurchaseDateExpr('cp');
    const normalizedOrderStatusExpr = this.buildNormalizedPurchaseStatusExpr(purchaseOrderStatusExpr);
    const scoped = this.withDateRange({
      baseClause: scope.clause,
      params: scope.params,
      dateColumn: purchaseDateExpr,
      startAt: filters.startAt,
      endExclusive: filters.endExclusive,
    });
    const ids = [...scoped.params, campaignIds];
    const result = await db.query(
      `SELECT
         c.id AS campaign_id,
         COUNT(*) FILTER (WHERE ${normalizedOrderStatusExpr} IN ${COMPLETED_ORDER_STATUS_SQL})::INTEGER AS completed_orders
       FROM customer_purchases cp
       JOIN campaigns c ON c.id = cp.id_campaign
       WHERE ${scoped.clause} AND c.id = ANY($${ids.length}::bigint[])
       GROUP BY c.id`,
      ids
    );
    return result.rows || [];
  }

  /**
   * Tên + loại của các chiến dịch (bảng "Chiến dịch trong kỳ"). Vẫn qua phạm vi quyền: chủ chỉ đọc được chiến dịch
   * của mình, admin đọc mọi chiến dịch. KHÔNG lọc theo `campaignType` — bộ lọc kênh của trang áp lên TIN, không áp
   * lên loại chiến dịch (chiến dịch `mixed` vẫn có tin email / Zalo).
   *
   * @param {{userId: number, roleCode: string}} filters
   * @param {number[]} campaignIds
   * @returns {Promise<Array<{id: number, campaign_name: string, campaign_type: string}>>}
   */
  async getCampaignNames({ userId, roleCode }, campaignIds) {
    if (!Array.isArray(campaignIds) || campaignIds.length === 0) return [];
    const scope = this.buildCampaignScopeClause({ userId, roleCode, campaignIds, campaignType: 'all' });
    const result = await db.query(
      `SELECT c.id, c.campaign_name, c.campaign_type
       FROM campaigns c
       WHERE ${scope.clause}`,
      scope.params
    );
    return result.rows || [];
  }

  /**
   * Get paginated list of individual orders from customer_purchases,
   * enriched with campaign name, run name, and campaign type (channel).
   *
   * Status grouping:
   *   - "pending"  → normalized status IN ('on-hold','on-holder','onhold','pending','interested')
   *   - "completed" → normalized status IN ('completed','processing')
   *
   * @param {object} filters
   * @param {string} filters.userId
   * @param {number[]} filters.campaignIds
   * @param {'all'|'email'|'zalo'|'zalo_group'} filters.campaignType
   * @param {string} filters.startAt
   * @param {string} filters.endExclusive
   * @param {'all'|'pending'|'completed'} filters.orderStatus - filter by order status group
   * @param {number} filters.page
   * @param {number} filters.limit
   * @param {string} purchaseOrderStatusExpr
   * @returns {Promise<{items: object[], total: number}>}
   */
  async getOrdersList(filters, purchaseOrderStatusExpr) {
    const scope = this.buildCampaignScopeClause({ ...filters, userAlias: 'c' });
    const purchaseDateExpr = this.getPurchaseDateExpr('cp');
    const normalizedStatusExpr = this.buildNormalizedPurchaseStatusExpr(purchaseOrderStatusExpr);

    const scoped = this.withDateRange({
      baseClause: scope.clause,
      params: scope.params,
      dateColumn: purchaseDateExpr,
      startAt: filters.startAt,
      endExclusive: filters.endExclusive,
    });

    // Additional status group filter
    let statusClause = '';
    if (filters.orderStatus === 'pending') {
      statusClause = ` AND ${normalizedStatusExpr} IN ${PENDING_ORDER_STATUS_SQL}`;
    } else if (filters.orderStatus === 'completed') {
      statusClause = ` AND ${normalizedStatusExpr} IN ${COMPLETED_ORDER_STATUS_SQL}`;
    } else {
      // "all" — only show pending + completed, exclude unrecognized statuses
      statusClause = ` AND (
        ${normalizedStatusExpr} IN ${PENDING_ORDER_STATUS_SQL}
        OR ${normalizedStatusExpr} IN ${COMPLETED_ORDER_STATUS_SQL}
      )`;
    }

    const baseClause = scoped.clause + statusClause;
    const { params } = scoped;

    const limit = Number(filters.limit || 20);
    const page = Number(filters.page || 1);
    const offset = (page - 1) * limit;

    const dataParams = [...params, limit, offset];
    const dataResult = await db.query(
      `SELECT
         cp.id                AS order_id,
         cp.order_id          AS order_ref,
         cp.product_name,
         cp.product_type,
         cp.amount,
         cp.currency,
         cp.payment_method,
         ${purchaseOrderStatusExpr}  AS raw_status,
         CASE
           WHEN ${normalizedStatusExpr} IN ${PENDING_ORDER_STATUS_SQL} THEN 'pending'
           WHEN ${normalizedStatusExpr} IN ${COMPLETED_ORDER_STATUS_SQL} THEN 'completed'
           ELSE 'other'
         END                  AS status_group,
         COALESCE(${purchaseDateExpr}, cp.created_at) AS order_date,
         c.id                 AS campaign_id,
         c.campaign_name,
         c.campaign_type,
         cr.id                AS run_id,
         cr.run_name,
         cu.id                AS customer_id,
         cu.full_name         AS customer_name,
         cu.email             AS customer_email,
         cu.phone             AS customer_phone,
         cu.zalo_id           AS customer_zalo_id
       FROM customer_purchases cp
       JOIN campaigns c ON c.id = cp.id_campaign
       LEFT JOIN campaign_runs cr ON cr.id = cp.id_run
       LEFT JOIN customers cu ON cu.id = cp.id_customer
       WHERE ${baseClause}
       ORDER BY COALESCE(${purchaseDateExpr}, cp.created_at) DESC, cp.id DESC
       LIMIT $${params.length + 1}
       OFFSET $${params.length + 2}`,
      dataParams
    );

    const totalResult = await db.query(
      `SELECT COUNT(*)::INTEGER AS total
       FROM customer_purchases cp
       JOIN campaigns c ON c.id = cp.id_campaign
       WHERE ${baseClause}`,
      params
    );

    const items = (dataResult.rows || []).map((row) => ({
      orderId: Number(row.order_id),
      orderRef: row.order_ref || null,
      productName: row.product_name || null,
      productType: row.product_type || null,
      amount: Number(row.amount || 0),
      currency: row.currency || 'VND',
      paymentMethod: row.payment_method || null,
      rawStatus: row.raw_status || null,
      statusGroup: row.status_group,
      orderDate: row.order_date || null,
      campaignId: Number(row.campaign_id),
      campaignName: row.campaign_name || null,
      campaignType: row.campaign_type || null,
      runId: row.run_id ? Number(row.run_id) : null,
      runName: row.run_name || null,
      customerId: row.customer_id ? Number(row.customer_id) : null,
      customerName: row.customer_name || null,
      customerEmail: row.customer_email || null,
      customerPhone: row.customer_phone || null,
      customerZaloId: row.customer_zalo_id || null,
    }));

    return {
      items,
      total: Number(totalResult.rows?.[0]?.total || 0),
    };
  }
}

export default new DashboardRepository();
