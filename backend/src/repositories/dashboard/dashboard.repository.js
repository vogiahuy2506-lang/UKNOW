import db from '../../config/database.js';
import { isAdminRole } from '../../utils/roleScope.util.js';

class DashboardRepository {
  /**
   * Build SQL filter clause for campaign scope.
   *
   * @param {object} input
   * @param {string} input.userAlias
   * @param {number} input.userId
   * @param {number[]} input.campaignIds
   * @param {'all'|'email'|'zalo'|'zalo_group'} input.campaignType
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

    if (campaignType && campaignType !== 'all') {
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
   * @param {string} alias table alias (default: cp)
   * @returns {string}
   */
  getPurchaseDateExpr(alias = 'cp') {
    return `COALESCE(${alias}.created_at, ${alias}.purchase_date)`;
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
   * Check whether zalo_messages table exists.
   *
   * @returns {Promise<boolean>}
   */
  async hasZaloMessagesTable() {
    const result = await db.query(`SELECT to_regclass('public.zalo_messages') AS table_name`);
    return Boolean(result.rows?.[0]?.table_name);
  }

  /**
   * Count campaigns in current filter scope.
   *
   * @param {object} filters
   * @returns {Promise<number>}
   */
  async countCampaigns(filters) {
    const scope = this.buildCampaignScopeClause(filters);
    const result = await db.query(
      `SELECT COUNT(*)::INTEGER AS total
       FROM campaigns c
       WHERE ${scope.clause}`,
      scope.params
    );
    return Number(result.rows?.[0]?.total || 0);
  }

  /**
   * Get run headline metrics.
   *
   * @param {object} filters
   * @param {string|null} filters.startAt
   * @param {string|null} filters.endExclusive
   * @returns {Promise<object>}
   */
  async getRunHeadline(filters) {
    const scope = this.buildCampaignScopeClause(filters);
    const scoped = this.withDateRange({
      baseClause: scope.clause,
      params: scope.params,
      dateColumn: 'cr.started_at',
      startAt: filters.startAt,
      endExclusive: filters.endExclusive,
    });

    const result = await db.query(
      `SELECT
         COUNT(*)::INTEGER AS total_runs,
         COUNT(*) FILTER (WHERE cr.status = 'running')::INTEGER AS running_runs,
         COUNT(*) FILTER (WHERE cr.status = 'completed')::INTEGER AS completed_runs,
         COALESCE(SUM(COALESCE(cr.total_recipients, 0)), 0)::INTEGER AS total_recipients,
         COALESCE(SUM(COALESCE(cr.successful_sends, 0)), 0)::INTEGER AS successful_sends,
         COALESCE(SUM(COALESCE(cr.failed_sends, 0)), 0)::INTEGER AS failed_sends
       FROM campaign_runs cr
       JOIN campaigns c ON c.id = cr.id_campaign
       WHERE ${scoped.clause}`,
      scoped.params
    );
    return result.rows?.[0] || {};
  }

  /**
   * Get email KPI metrics in scope.
   *
   * @param {object} filters
   * @returns {Promise<object>}
   */
  async getEmailMetrics(filters) {
    const scope = this.buildCampaignScopeClause(filters);
    const scoped = this.withDateRange({
      baseClause: `${scope.clause} AND c.campaign_type = 'email'`,
      params: scope.params,
      dateColumn: 'COALESCE(em.created_at, em.sent_at)',
      startAt: filters.startAt,
      endExclusive: filters.endExclusive,
    });

    const result = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE em.sent_at IS NOT NULL)::INTEGER AS sent_count,
         COUNT(*) FILTER (
           WHERE COALESCE(em.open_count, 0) > 0 OR em.first_opened_at IS NOT NULL
         )::INTEGER AS opened_unique_count,
         COUNT(*) FILTER (
           WHERE COALESCE(em.click_count, 0) > 0 OR em.first_clicked_at IS NOT NULL
         )::INTEGER AS clicked_unique_count,
         COALESCE(SUM(COALESCE(em.open_count, 0)), 0)::INTEGER AS opened_total_count,
         COALESCE(SUM(COALESCE(em.click_count, 0)), 0)::INTEGER AS clicked_total_count
       FROM email_messages em
       JOIN campaigns c ON c.id = em.id_campaign
       WHERE ${scoped.clause}`,
      scoped.params
    );
    return result.rows?.[0] || {};
  }

  /**
   * Get attachment download metric from customer_journey.
   *
   * @param {object} filters
   * @returns {Promise<number>}
   */
  async getAttachmentDownloadCount(filters) {
    const scope = this.buildCampaignScopeClause(filters);
    const scoped = this.withDateRange({
      baseClause: `${scope.clause} AND cj.event_type = 'attachment_downloaded'`,
      params: scope.params,
      dateColumn: 'cj.event_at',
      startAt: filters.startAt,
      endExclusive: filters.endExclusive,
    });
    const result = await db.query(
      `SELECT COUNT(*)::INTEGER AS total
       FROM customer_journey cj
       JOIN campaigns c ON c.id = cj.id_campaign
       WHERE ${scoped.clause}`,
      scoped.params
    );
    return Number(result.rows?.[0]?.total || 0);
  }

  /**
   * Get channel click metrics for zalo + zalo group.
   *
   * @param {object} filters
   * @param {boolean} hasZaloMessages
   * @returns {Promise<Array<{campaign_type: string, click_count: number}>>}
   */
  async getZaloClickMetrics(filters, hasZaloMessages) {
    if (hasZaloMessages) {
      const scope = this.buildCampaignScopeClause(filters);
      const scoped = this.withDateRange({
        baseClause: `${scope.clause} AND c.campaign_type IN ('zalo', 'zalo_group')`,
        params: scope.params,
        dateColumn: 'COALESCE(zm.created_at, zm.sent_at)',
        startAt: filters.startAt,
        endExclusive: filters.endExclusive,
      });

      const result = await db.query(
        `SELECT
           c.campaign_type,
           COALESCE(SUM(COALESCE(zm.click_count, 0)), 0)::INTEGER AS click_count
         FROM zalo_messages zm
         JOIN campaigns c ON c.id = zm.id_campaign
         WHERE ${scoped.clause}
         GROUP BY c.campaign_type`,
        scoped.params
      );
      return result.rows || [];
    }

    const scope = this.buildCampaignScopeClause(filters);
    const scoped = this.withDateRange({
      baseClause: `${scope.clause}
        AND c.campaign_type IN ('zalo', 'zalo_group')
        AND cj.event_type = 'zalo_clicked'`,
      params: scope.params,
      dateColumn: 'cj.event_at',
      startAt: filters.startAt,
      endExclusive: filters.endExclusive,
    });

    const result = await db.query(
      `SELECT
         CASE
           WHEN cj.event_channel = 'zalo' THEN 'zalo'
           WHEN cj.event_channel = 'zalo_group' THEN 'zalo_group'
           ELSE cj.event_channel
         END AS campaign_type,
         COUNT(*)::INTEGER AS click_count
       FROM customer_journey cj
       JOIN campaigns c ON c.id = cj.id_campaign
       WHERE ${scoped.clause}
       GROUP BY cj.event_channel`,
      scoped.params
    );
    return result.rows || [];
  }

  /**
   * Get order summary grouped by campaign_type.
   *
   * @param {object} filters
   * @param {string} purchaseOrderStatusExpr
   * @returns {Promise<Array<object>>}
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
         COUNT(*) FILTER (
          WHERE ${normalizedOrderStatusExpr} IN ('on-hold', 'on-holder', 'onhold', 'pending', 'interested')
         )::INTEGER AS pending_orders,
         COUNT(*) FILTER (
          WHERE ${normalizedOrderStatusExpr} IN ('completed', 'processing')
         )::INTEGER AS completed_orders
       FROM customer_purchases cp
       JOIN campaigns c ON c.id = cp.id_campaign
       WHERE ${scoped.clause}
       GROUP BY c.campaign_type`,
      scoped.params
    );
    return result.rows || [];
  }

  /**
   * Get analytics timeline grouped by day.
   *
   * @param {object} filters
   * @param {string} purchaseOrderStatusExpr
   * @param {boolean} hasZaloMessages - whether zalo_messages table exists
   * @returns {Promise<object>}
   */
  async getTimeline(filters, purchaseOrderStatusExpr, hasZaloMessages = false) {
    const scope = this.buildCampaignScopeClause(filters);
    const purchaseDateExpr = this.getPurchaseDateExpr('cp');
    const normalizedOrderStatusExpr = this.buildNormalizedPurchaseStatusExpr(purchaseOrderStatusExpr);

    const journeyEngagementScoped = this.withDateRange({
      baseClause: `${scope.clause}
        AND cj.event_type IN ('email_opened', 'email_clicked', 'attachment_downloaded', 'zalo_clicked')`,
      params: scope.params,
      dateColumn: 'cj.event_at',
      startAt: filters.startAt,
      endExclusive: filters.endExclusive,
    });
    const journeyEngagementResult = await db.query(
      `SELECT
         TO_CHAR(DATE(cj.event_at), 'YYYY-MM-DD') AS date,
         COUNT(*) FILTER (
           WHERE cj.event_type = 'email_opened'
             AND c.campaign_type = 'email'
         )::INTEGER AS email_opened,
         COUNT(*) FILTER (
           WHERE cj.event_type = 'email_clicked'
             AND c.campaign_type = 'email'
         )::INTEGER AS email_clicked,
         COUNT(*) FILTER (
           WHERE cj.event_type = 'attachment_downloaded'
             AND c.campaign_type = 'email'
         )::INTEGER AS email_downloaded,
         COUNT(*) FILTER (
           WHERE cj.event_type = 'zalo_clicked'
             AND cj.event_channel = 'zalo'
         )::INTEGER AS zalo_clicks,
         COUNT(*) FILTER (
           WHERE cj.event_type = 'zalo_clicked'
             AND cj.event_channel = 'zalo_group'
         )::INTEGER AS zalo_group_clicks
       FROM customer_journey cj
       JOIN campaigns c ON c.id = cj.id_campaign
       WHERE ${journeyEngagementScoped.clause}
       GROUP BY DATE(cj.event_at)
       ORDER BY DATE(cj.event_at) ASC`,
      journeyEngagementScoped.params
    );

    const purchaseScoped = this.withDateRange({
      baseClause: scope.clause,
      params: scope.params,
      dateColumn: purchaseDateExpr,
      startAt: filters.startAt,
      endExclusive: filters.endExclusive,
    });


    const purchaseResult = await db.query(
      `SELECT
         TO_CHAR(DATE(${purchaseDateExpr}), 'YYYY-MM-DD') AS date,
         c.campaign_type,
         COUNT(*) FILTER (
          WHERE ${normalizedOrderStatusExpr} IN ('on-hold', 'on-holder', 'onhold', 'pending', 'interested')
         )::INTEGER AS pending_orders,
         COUNT(*) FILTER (
          WHERE ${normalizedOrderStatusExpr} IN ('completed', 'processing')
         )::INTEGER AS completed_orders
       FROM customer_purchases cp
       JOIN campaigns c ON c.id = cp.id_campaign
       WHERE ${purchaseScoped.clause}
       GROUP BY DATE(${purchaseDateExpr}), c.campaign_type
       ORDER BY DATE(${purchaseDateExpr}) ASC`,
      purchaseScoped.params
    );

    // Email sent per day — count rows in email_messages where sent_at is set
    const emailSentScoped = this.withDateRange({
      baseClause: `${scope.clause} AND c.campaign_type = 'email' AND em.sent_at IS NOT NULL`,
      params: scope.params,
      dateColumn: 'em.sent_at',
      startAt: filters.startAt,
      endExclusive: filters.endExclusive,
    });
    const emailSentResult = await db.query(
      `SELECT
         TO_CHAR(DATE(em.sent_at), 'YYYY-MM-DD') AS date,
         COUNT(*)::INTEGER AS email_sent
       FROM email_messages em
       JOIN campaigns c ON c.id = em.id_campaign
       WHERE ${emailSentScoped.clause}
       GROUP BY DATE(em.sent_at)
       ORDER BY DATE(em.sent_at) ASC`,
      emailSentScoped.params
    );

    // Zalo/ZaloGroup sent per day
    let zaloSentRows = [];
    if (hasZaloMessages) {
      // Use zalo_messages table if available — count sent messages per day per channel type
      const zaloSentScoped = this.withDateRange({
        baseClause: `${scope.clause} AND c.campaign_type IN ('zalo', 'zalo_group')`,
        params: scope.params,
        dateColumn: 'COALESCE(zm.created_at, zm.sent_at)',
        startAt: filters.startAt,
        endExclusive: filters.endExclusive,
      });
      const res = await db.query(
        `SELECT
           TO_CHAR(DATE(COALESCE(zm.created_at, zm.sent_at)), 'YYYY-MM-DD') AS date,
           c.campaign_type,
           COUNT(*)::INTEGER AS sent_count
         FROM zalo_messages zm
         JOIN campaigns c ON c.id = zm.id_campaign
         WHERE ${zaloSentScoped.clause}
         GROUP BY DATE(COALESCE(zm.created_at, zm.sent_at)), c.campaign_type
         ORDER BY DATE(COALESCE(zm.created_at, zm.sent_at)) ASC`,
        zaloSentScoped.params
      );
      zaloSentRows = res.rows || [];
    } else {
      // Fallback: approximate from campaign_runs.successful_sends grouped by started_at date
      const zaloSentScoped = this.withDateRange({
        baseClause: `${scope.clause} AND c.campaign_type IN ('zalo', 'zalo_group')`,
        params: scope.params,
        dateColumn: 'cr.started_at',
        startAt: filters.startAt,
        endExclusive: filters.endExclusive,
      });
      const res = await db.query(
        `SELECT
           TO_CHAR(DATE(cr.started_at), 'YYYY-MM-DD') AS date,
           c.campaign_type,
           COALESCE(SUM(COALESCE(cr.successful_sends, 0)), 0)::INTEGER AS sent_count
         FROM campaign_runs cr
         JOIN campaigns c ON c.id = cr.id_campaign
         WHERE ${zaloSentScoped.clause}
         GROUP BY DATE(cr.started_at), c.campaign_type
         ORDER BY DATE(cr.started_at) ASC`,
        zaloSentScoped.params
      );
      zaloSentRows = res.rows || [];
    }

    return {
      journeyEngagementRows: journeyEngagementResult.rows || [],
      purchaseRows: purchaseResult.rows || [],
      emailSentRows: emailSentResult.rows || [],
      zaloSentRows,
    };
  }

  /**
   * Get run list with pagination.
   *
   * @param {object} filters
   * @param {string} purchaseOrderStatusExpr
   * @param {boolean} hasZaloMessages
   * @returns {Promise<{items: object[], total: number}>}
   */
  async getRuns(filters, purchaseOrderStatusExpr, hasZaloMessages) {
    const scope = this.buildCampaignScopeClause(filters);
    const normalizedOrderStatusExpr = this.buildNormalizedPurchaseStatusExpr(purchaseOrderStatusExpr);
    const scoped = this.withDateRange({
      baseClause: scope.clause,
      params: scope.params,
      dateColumn: 'cr.started_at',
      startAt: filters.startAt,
      endExclusive: filters.endExclusive,
    });

    const limit = Number(filters.limit || 20);
    const page = Number(filters.page || 1);
    const offset = (page - 1) * limit;
    const runScopeParams = [...scoped.params, limit, offset];

    const runRowsResult = await db.query(
      `WITH filtered_runs AS (
         SELECT
           cr.id,
           cr.id_campaign,
           cr.run_name,
           cr.status,
           cr.started_at,
           cr.completed_at,
           cr.total_recipients,
           cr.successful_sends,
           cr.failed_sends,
           c.campaign_name,
           c.campaign_type
         FROM campaign_runs cr
         JOIN campaigns c ON c.id = cr.id_campaign
         WHERE ${scoped.clause}
         ORDER BY cr.started_at DESC, cr.id DESC
         LIMIT $${scoped.params.length + 1}
         OFFSET $${scoped.params.length + 2}
       )
       SELECT * FROM filtered_runs`,
      runScopeParams
    );

    const totalResult = await db.query(
      `SELECT COUNT(*)::INTEGER AS total
       FROM campaign_runs cr
       JOIN campaigns c ON c.id = cr.id_campaign
       WHERE ${scoped.clause}`,
      scoped.params
    );

    const runRows = runRowsResult.rows || [];
    if (runRows.length === 0) {
      return { items: [], total: Number(totalResult.rows?.[0]?.total || 0) };
    }

    const runIds = runRows.map((item) => Number(item.id)).filter(Number.isFinite);

    const emailAggResult = await db.query(
      `SELECT
         em.id_run,
         COUNT(*) FILTER (
           WHERE COALESCE(em.open_count, 0) > 0 OR em.first_opened_at IS NOT NULL
         )::INTEGER AS opened_count,
         COUNT(*) FILTER (
           WHERE COALESCE(em.click_count, 0) > 0 OR em.first_clicked_at IS NOT NULL
         )::INTEGER AS clicked_count
       FROM email_messages em
       WHERE em.id_run = ANY($1::int[])
       GROUP BY em.id_run`,
      [runIds]
    );

    const attachmentAggResult = await db.query(
      `SELECT
         cj.id_run,
         COUNT(*)::INTEGER AS download_count
       FROM customer_journey cj
       WHERE cj.id_run = ANY($1::int[])
         AND cj.event_type = 'attachment_downloaded'
       GROUP BY cj.id_run`,
      [runIds]
    );

    const purchaseAggResult = await db.query(
      `SELECT
         cp.id_run,
         COUNT(*) FILTER (
          WHERE ${normalizedOrderStatusExpr} IN ('on-hold', 'on-holder', 'onhold', 'pending', 'interested')
         )::INTEGER AS pending_orders,
         COUNT(*) FILTER (
          WHERE ${normalizedOrderStatusExpr} IN ('completed', 'processing')
         )::INTEGER AS completed_orders
       FROM customer_purchases cp
       WHERE cp.id_run = ANY($1::int[])
       GROUP BY cp.id_run`,
      [runIds]
    );

    let zaloAggResult = { rows: [] };
    if (hasZaloMessages) {
      zaloAggResult = await db.query(
        `SELECT
           zm.id_run,
           COALESCE(SUM(COALESCE(zm.click_count, 0)), 0)::INTEGER AS click_count
         FROM zalo_messages zm
         WHERE zm.id_run = ANY($1::int[])
         GROUP BY zm.id_run`,
        [runIds]
      );
    } else {
      zaloAggResult = await db.query(
        `SELECT
           cj.id_run,
           COUNT(*)::INTEGER AS click_count
         FROM customer_journey cj
         WHERE cj.id_run = ANY($1::int[])
           AND cj.event_type = 'zalo_clicked'
         GROUP BY cj.id_run`,
        [runIds]
      );
    }

    const emailMap = new Map(
      (emailAggResult.rows || []).map((item) => [
        Number(item.id_run),
        {
          openedCount: Number(item.opened_count || 0),
          clickedCount: Number(item.clicked_count || 0),
        },
      ])
    );
    const attachmentMap = new Map(
      (attachmentAggResult.rows || []).map((item) => [Number(item.id_run), Number(item.download_count || 0)])
    );
    const purchaseMap = new Map(
      (purchaseAggResult.rows || []).map((item) => [
        Number(item.id_run),
        {
          pendingOrders: Number(item.pending_orders || 0),
          completedOrders: Number(item.completed_orders || 0),
        },
      ])
    );
    const zaloMap = new Map(
      (zaloAggResult.rows || []).map((item) => [Number(item.id_run), Number(item.click_count || 0)])
    );

    const items = runRows.map((item) => {
      const runId = Number(item.id);
      const emailData = emailMap.get(runId) || { openedCount: 0, clickedCount: 0 };
      const orderData = purchaseMap.get(runId) || { pendingOrders: 0, completedOrders: 0 };
      const totalRecipients = Number(item.total_recipients || 0);
      const successfulSends = Number(item.successful_sends || 0);
      const failedSends = Number(item.failed_sends || 0);
      const successRate = totalRecipients > 0 ? (successfulSends / totalRecipients) * 100 : 0;

      return {
        runId,
        campaignId: Number(item.id_campaign),
        campaignName: item.campaign_name,
        campaignType: item.campaign_type,
        runName: item.run_name || `Run #${runId}`,
        status: item.status,
        startedAt: item.started_at,
        completedAt: item.completed_at,
        totalRecipients,
        successfulSends,
        failedSends,
        successRate: Number(successRate.toFixed(2)),
        emailOpenedCount: emailData.openedCount,
        emailClickedCount: emailData.clickedCount,
        emailDownloadCount: Number(attachmentMap.get(runId) || 0),
        zaloClickCount: Number(zaloMap.get(runId) || 0),
        pendingOrderCount: orderData.pendingOrders,
        completedOrderCount: orderData.completedOrders,
      };
    });

    return {
      items,
      total: Number(totalResult.rows?.[0]?.total || 0),
    };
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
      statusClause = ` AND ${normalizedStatusExpr} IN ('on-hold', 'on-holder', 'onhold', 'pending', 'interested')`;
    } else if (filters.orderStatus === 'completed') {
      statusClause = ` AND ${normalizedStatusExpr} IN ('completed', 'processing')`;
    } else {
      // "all" — only show pending + completed, exclude unrecognized statuses
      statusClause = ` AND (
        ${normalizedStatusExpr} IN ('on-hold', 'on-holder', 'onhold', 'pending', 'interested')
        OR ${normalizedStatusExpr} IN ('completed', 'processing')
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
           WHEN ${normalizedStatusExpr} IN ('on-hold','on-holder','onhold','pending','interested') THEN 'pending'
           WHEN ${normalizedStatusExpr} IN ('completed','processing') THEN 'completed'
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
  /**
   * Count customer_journey events grouped by (event_type, event_channel) within filter scope.
   *
   * Used to drive KPI cards with journey-sourced metrics:
   * email_sent, email_opened, email_clicked, zalo_sent, zalo_clicked, order_pending.
   * Grouping by event_channel allows separating Zalo vs Zalo Group contributions.
   *
   * @param {object} filters
   * @returns {Promise<Array<{event_type: string, event_channel: string, count: number}>>}
   */
  async getJourneyEventStats(filters) {
    const scope = this.buildCampaignScopeClause(filters);
    const scoped = this.withDateRange({
      baseClause: scope.clause,
      params: scope.params,
      dateColumn: 'cj.event_at',
      startAt: filters.startAt,
      endExclusive: filters.endExclusive,
    });

    const result = await db.query(
      `SELECT
         cj.event_type,
         COALESCE(cj.event_channel, '') AS event_channel,
         COUNT(*)::INTEGER AS count
       FROM customer_journey cj
       JOIN campaigns c ON c.id = cj.id_campaign
       WHERE ${scoped.clause}
       GROUP BY cj.event_type, cj.event_channel`,
      scoped.params
    );
    return result.rows || [];
  }

  /**
   * Get top courses/products ranked by total order count (pending + completed).
   *
   * Returns separate pending and completed counts per product_name.
   *
   * @param {object} filters
   * @param {string} purchaseOrderStatusExpr
   * @param {number} [limit=10]
   * @returns {Promise<Array<{productName: string, pendingCount: number, completedCount: number, total: number}>>}
   */
  async getTopCoursesByOrders(filters, purchaseOrderStatusExpr, limit = 10) {
    const scope = this.buildCampaignScopeClause(filters);
    const purchaseDateExpr = this.getPurchaseDateExpr('cp');
    const normalizedStatusExpr = this.buildNormalizedPurchaseStatusExpr(purchaseOrderStatusExpr);
    const scoped = this.withDateRange({
      baseClause: `${scope.clause} AND cp.product_name IS NOT NULL AND cp.product_name <> ''`,
      params: scope.params,
      dateColumn: purchaseDateExpr,
      startAt: filters.startAt,
      endExclusive: filters.endExclusive,
    });

    const result = await db.query(
      `SELECT
         cp.product_name,
         COUNT(*) FILTER (
           WHERE ${normalizedStatusExpr} IN ('on-hold', 'on-holder', 'onhold', 'pending', 'interested')
         )::INTEGER AS pending_count,
         COUNT(*) FILTER (
           WHERE ${normalizedStatusExpr} IN ('completed', 'processing')
         )::INTEGER AS completed_count,
         COUNT(*)::INTEGER AS total_count
       FROM customer_purchases cp
       JOIN campaigns c ON c.id = cp.id_campaign
       WHERE ${scoped.clause}
       GROUP BY cp.product_name
       ORDER BY total_count DESC, completed_count DESC
       LIMIT $${scoped.params.length + 1}`,
      [...scoped.params, limit]
    );

    return (result.rows || []).map((row) => ({
      productName: row.product_name,
      pendingCount: Number(row.pending_count || 0),
      completedCount: Number(row.completed_count || 0),
      total: Number(row.total_count || 0),
    }));
  }

  /**
   * Get top campaigns ranked by total order count (pending + completed).
   *
   * @param {object} filters
   * @param {string} purchaseOrderStatusExpr
   * @param {number} [limit=10]
   * @returns {Promise<Array<{campaignId: number, campaignName: string, campaignType: string, pendingCount: number, completedCount: number, total: number}>>}
   */
  async getTopCampaignsByOrders(filters, purchaseOrderStatusExpr, limit = 10) {
    const scope = this.buildCampaignScopeClause(filters);
    const purchaseDateExpr = this.getPurchaseDateExpr('cp');
    const normalizedStatusExpr = this.buildNormalizedPurchaseStatusExpr(purchaseOrderStatusExpr);
    const scoped = this.withDateRange({
      baseClause: scope.clause,
      params: scope.params,
      dateColumn: purchaseDateExpr,
      startAt: filters.startAt,
      endExclusive: filters.endExclusive,
    });

    const result = await db.query(
      `SELECT
         c.id AS campaign_id,
         c.campaign_name,
         c.campaign_type,
         COUNT(*) FILTER (
           WHERE ${normalizedStatusExpr} IN ('on-hold', 'on-holder', 'onhold', 'pending', 'interested')
         )::INTEGER AS pending_count,
         COUNT(*) FILTER (
           WHERE ${normalizedStatusExpr} IN ('completed', 'processing')
         )::INTEGER AS completed_count,
         COUNT(*)::INTEGER AS total_count
       FROM customer_purchases cp
       JOIN campaigns c ON c.id = cp.id_campaign
       WHERE ${scoped.clause}
       GROUP BY c.id, c.campaign_name, c.campaign_type
       ORDER BY total_count DESC, completed_count DESC
       LIMIT $${scoped.params.length + 1}`,
      [...scoped.params, limit]
    );

    return (result.rows || []).map((row) => ({
      campaignId: Number(row.campaign_id),
      campaignName: row.campaign_name || `Campaign #${row.campaign_id}`,
      campaignType: row.campaign_type || '',
      pendingCount: Number(row.pending_count || 0),
      completedCount: Number(row.completed_count || 0),
      total: Number(row.total_count || 0),
    }));
  }

  /**
   * Get top campaigns ranked by click count (email_clicked + zalo_clicked from customer_journey).
   *
   * @param {object} filters
   * @param {number} [limit=10]
   * @returns {Promise<Array<{campaignId: number, campaignName: string, campaignType: string, clickCount: number}>>}
   */
  async getTopCampaignsByClicks(filters, limit = 10) {
    const scope = this.buildCampaignScopeClause(filters);
    const scoped = this.withDateRange({
      baseClause: `${scope.clause} AND cj.event_type IN ('email_clicked', 'zalo_clicked')`,
      params: scope.params,
      dateColumn: 'cj.event_at',
      startAt: filters.startAt,
      endExclusive: filters.endExclusive,
    });

    const result = await db.query(
      `SELECT
         c.id AS campaign_id,
         c.campaign_name,
         c.campaign_type,
         COUNT(*)::INTEGER AS click_count
       FROM customer_journey cj
       JOIN campaigns c ON c.id = cj.id_campaign
       WHERE ${scoped.clause}
       GROUP BY c.id, c.campaign_name, c.campaign_type
       ORDER BY click_count DESC
       LIMIT $${scoped.params.length + 1}`,
      [...scoped.params, limit]
    );

    return (result.rows || []).map((row) => ({
      campaignId: Number(row.campaign_id),
      campaignName: row.campaign_name || `Campaign #${row.campaign_id}`,
      campaignType: row.campaign_type || '',
      clickCount: Number(row.click_count || 0),
    }));
  }
}

export default new DashboardRepository();
