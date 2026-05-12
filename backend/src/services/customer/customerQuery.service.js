import db from '../../config/database.js';

class CustomerQueryService {
  /**
   * Build key for run/group mapping.
   *
   * @param {number|string|null} runId
   * @param {string|null} groupId
   * @returns {string}
   */
  buildRunGroupKey(runId, groupId) {
    return `${String(runId ?? '').trim()}::${String(groupId ?? '').trim()}`;
  }

  /**
   * Extract candidate group id from execution payload.
   *
   * @param {object} payload
   * @returns {string|null}
   */
  extractExecutionGroupId(payload = {}) {
    const candidate = payload.groupId ?? payload.group_id ?? payload.group ?? null;
    const normalized = String(candidate || '').trim();
    return normalized || null;
  }

  /**
   * Extract candidate group name from execution payload.
   *
   * @param {object} payload
   * @returns {string|null}
   */
  extractExecutionGroupName(payload = {}) {
    const candidate = payload.groupName ?? payload.group_name ?? payload.groupTitle ?? payload.group_title ?? null;
    const normalized = String(candidate || '').trim();
    return normalized || null;
  }

  /**
   * Load fallback map groupId -> groupName by run from campaign_executions.
   *
   * @param {number[]} runIds
   * @returns {Promise<Map<string, string>>}
   */
  async loadZaloGroupNameMapByRuns(runIds = []) {
    const normalizedRunIds = (Array.isArray(runIds) ? runIds : [])
      .map((id) => Number.parseInt(id, 10))
      .filter((id) => Number.isFinite(id));
    if (normalizedRunIds.length === 0) return new Map();

    const executionResult = await db.query(
      `SELECT id_run, execution_data
       FROM campaign_executions
       WHERE id_run = ANY($1::int[])
         AND action_type = 'get_all_groups'
       ORDER BY created_at ASC, id ASC`,
      [normalizedRunIds]
    );

    const map = new Map();
    for (const row of executionResult.rows) {
      const runId = Number.parseInt(row.id_run, 10);
      if (!Number.isFinite(runId)) continue;
      const data = row.execution_data && typeof row.execution_data === 'object'
        ? row.execution_data
        : {};

      const payloadEntries = [];
      payloadEntries.push(data);
      if (Array.isArray(data.items)) {
        data.items.forEach((item) => {
          if (item && typeof item === 'object') payloadEntries.push(item);
        });
      }

      payloadEntries.forEach((payload) => {
        const groupId = this.extractExecutionGroupId(payload);
        const groupName = this.extractExecutionGroupName(payload);
        if (!groupId || !groupName) return;
        const key = this.buildRunGroupKey(runId, groupId);
        if (!map.has(key)) map.set(key, groupName);
      });
    }
    return map;
  }

  /**
   * Query paginated customer list with campaign/status/source filters.
   *
   * @param {object} input
   * @returns {Promise<object>}
   */
  async getAllCustomers({
    userId,
    page = 1,
    limit = 10,
    status,
    search,
    source,
    campaignId,
    purchaseOrderStatusExpr,
  }) {
    const offset = (page - 1) * limit;
    const parsedCampaignId = Number.parseInt(campaignId, 10);
    const params = [userId];

    let campaignParamIdx = null;
    if (Number.isFinite(parsedCampaignId)) {
      params.push(parsedCampaignId);
      campaignParamIdx = params.length;
    }

    const uknowStatusExpr = campaignParamIdx
      ? `(SELECT cc2.uknow_status FROM campaign_customers cc2 WHERE cc2.id_customer = c.id AND cc2.id_campaign = $${campaignParamIdx} LIMIT 1)`
      : 'NULL';

    const orderStatusExpr = campaignParamIdx
      ? `(SELECT ${purchaseOrderStatusExpr} FROM customer_purchases cp WHERE cp.id_customer = c.id AND cp.id_campaign = $${campaignParamIdx} AND cp.id_run IS NOT NULL ORDER BY cp.purchase_date DESC NULLS LAST, cp.id DESC LIMIT 1)`
      : `(SELECT ${purchaseOrderStatusExpr} FROM customer_purchases cp WHERE cp.id_customer = c.id AND cp.id_run IS NOT NULL ORDER BY cp.purchase_date DESC NULLS LAST, cp.id DESC LIMIT 1)`;

    const campaignInteractionExpr = campaignParamIdx
      ? `(SELECT cc2.has_clicked FROM campaign_customers cc2 WHERE cc2.id_customer = c.id AND cc2.id_campaign = $${campaignParamIdx} LIMIT 1)`
      : 'NULL';
    const campaignOpenedExpr = campaignParamIdx
      ? `(SELECT cc2.has_opened FROM campaign_customers cc2 WHERE cc2.id_customer = c.id AND cc2.id_campaign = $${campaignParamIdx} LIMIT 1)`
      : 'NULL';
    const campaignReceivedExpr = campaignParamIdx
      ? `(SELECT cc2.email_received_count FROM campaign_customers cc2 WHERE cc2.id_customer = c.id AND cc2.id_campaign = $${campaignParamIdx} LIMIT 1)`
      : 'NULL';

    // Ép timestamptz để API trả instant đúng; tránh node-pg parse `timestamp` theo TZ tiến trình.
    let query = `
      SELECT c.id, c.email, c.phone, c.full_name, c.customer_source,
             c.has_purchased, c.total_orders, c.total_spent, c.email_subscribed,
             COALESCE((
               SELECT COUNT(*)
               FROM campaign_customers cc
               JOIN campaigns cp ON cp.id = cc.id_campaign
               WHERE cc.id_customer = c.id
                 AND cp.id_user = c.id_user
             ), 0)::INTEGER AS campaign_count,
             (
               SELECT MAX(cc.last_activity_at)::timestamptz
               FROM campaign_customers cc
               JOIN campaigns cp ON cp.id = cc.id_campaign
               WHERE cc.id_customer = c.id
                 AND cp.id_user = c.id_user
             ) AS last_campaign_activity_at,
             ${orderStatusExpr} AS order_status,
             ${uknowStatusExpr} AS uknow_status,
             ${campaignInteractionExpr} AS campaign_has_clicked,
             ${campaignOpenedExpr} AS campaign_has_opened,
             ${campaignReceivedExpr} AS campaign_email_received_count,
             c.created_at::timestamptz AS created_at, c.updated_at::timestamptz AS updated_at
      FROM customers c
      WHERE c.id_user = $1
    `;
    const normalizedStatus = typeof status === 'string' ? status.trim().toLowerCase() : '';
    const normalizedSource = typeof source === 'string' ? source.trim().toLowerCase() : '';

    if (normalizedStatus) {
      const isOrderStatus = ['completed', 'on-hold', 'onhold'].includes(normalizedStatus);
      if (isOrderStatus) {
        const mappedOrderStatus = normalizedStatus === 'onhold' ? 'on-hold' : normalizedStatus;
        params.push(mappedOrderStatus);
        query += ` AND EXISTS (
          SELECT 1
          FROM customer_purchases cp
          WHERE cp.id_customer = c.id
            AND cp.id_run IS NOT NULL
            AND ${purchaseOrderStatusExpr} = $${params.length}
        )`;
      }
    }

    if (search) {
      params.push(`%${search}%`);
      query += ` AND (c.email ILIKE $${params.length} OR c.phone ILIKE $${params.length} OR c.full_name ILIKE $${params.length})`;
    }

    if (normalizedSource) {
      if (normalizedSource === 'uknow_campaign') {
        query += ` AND LOWER(c.customer_source) IN ('uknow_campaign', 'campaign_uknow')`;
      } else if (normalizedSource === 'Founder AI') {
        query += ` AND LOWER(c.customer_source) IN ('Founder AI', 'woocommerce', 'learnpress')`;
      }
    }

    if (Number.isFinite(parsedCampaignId)) {
      // Khi lọc theo chiến dịch, xem khách "đã tham gia" theo 4 nguồn:
      // 1) campaign_customers, 2) campaign_participations, 3) customer_purchases, 4) customer_journey.
      query += ` AND EXISTS (
        SELECT 1
        FROM campaigns cp
        WHERE cp.id = $${campaignParamIdx}
          AND cp.id_user = c.id_user
          AND (
            EXISTS (
              SELECT 1
              FROM campaign_customers cc
              WHERE cc.id_customer = c.id
                AND cc.id_campaign = cp.id
            )
            OR EXISTS (
              SELECT 1
              FROM campaign_participations cpa
              WHERE cpa.id_customer = c.id
                AND cpa.id_campaign = cp.id
            )
            OR EXISTS (
              SELECT 1
              FROM customer_purchases cpr
              WHERE cpr.id_customer = c.id
                AND cpr.id_campaign = cp.id
            )
            OR EXISTS (
              SELECT 1
              FROM customer_journey cj
              WHERE cj.id_customer = c.id
                AND cj.id_campaign = cp.id
            )
          )
      )`;
    }

    query += ` ORDER BY c.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await db.query(query, params);

    let countQuery = 'SELECT COUNT(*) FROM customers c WHERE c.id_user = $1';
    const countParams = [userId];
    if (normalizedStatus) {
      const isOrderStatus = ['completed', 'on-hold', 'onhold'].includes(normalizedStatus);
      if (isOrderStatus) {
        const mappedOrderStatus = normalizedStatus === 'onhold' ? 'on-hold' : normalizedStatus;
        countParams.push(mappedOrderStatus);
        countQuery += ` AND EXISTS (
          SELECT 1
          FROM customer_purchases cp
          WHERE cp.id_customer = c.id
            AND cp.id_run IS NOT NULL
            AND ${purchaseOrderStatusExpr} = $${countParams.length}
        )`;
      }
    }
    if (search) {
      countParams.push(`%${search}%`);
      countQuery += ` AND (c.email ILIKE $${countParams.length} OR c.phone ILIKE $${countParams.length} OR c.full_name ILIKE $${countParams.length})`;
    }
    if (normalizedSource) {
      if (normalizedSource === 'uknow_campaign') {
        countQuery += ` AND LOWER(c.customer_source) IN ('uknow_campaign', 'campaign_uknow')`;
      } else if (normalizedSource === 'Founder AI') {
        countQuery += ` AND LOWER(c.customer_source) IN ('Founder AI', 'woocommerce', 'learnpress')`;
      }
    }
    if (Number.isFinite(parsedCampaignId)) {
      countParams.push(parsedCampaignId);
      // Đồng bộ điều kiện đếm với query dữ liệu để không lệch phân trang.
      countQuery += ` AND EXISTS (
        SELECT 1
        FROM campaigns cp
        WHERE cp.id = $${countParams.length}
          AND cp.id_user = c.id_user
          AND (
            EXISTS (
              SELECT 1
              FROM campaign_customers cc
              WHERE cc.id_customer = c.id
                AND cc.id_campaign = cp.id
            )
            OR EXISTS (
              SELECT 1
              FROM campaign_participations cpa
              WHERE cpa.id_customer = c.id
                AND cpa.id_campaign = cp.id
            )
            OR EXISTS (
              SELECT 1
              FROM customer_purchases cpr
              WHERE cpr.id_customer = c.id
                AND cpr.id_campaign = cp.id
            )
            OR EXISTS (
              SELECT 1
              FROM customer_journey cj
              WHERE cj.id_customer = c.id
                AND cj.id_campaign = cp.id
            )
          )
      )`;
    }
    const countResult = await db.query(countQuery, countParams);

    return {
      items: result.rows.map((item) => ({
        id: item.id,
        email: item.email,
        phone: item.phone,
        fullName: item.full_name,
        orderStatus: item.order_status,
        uknowStatus: item.uknow_status || null,
        campaignHasClicked: item.campaign_has_clicked ?? null,
        campaignHasOpened: item.campaign_has_opened ?? null,
        campaignEmailReceivedCount: item.campaign_email_received_count ?? null,
        customerSource: item.customer_source,
        hasPurchased: item.has_purchased,
        totalOrders: item.total_orders,
        totalSpent: item.total_spent,
        emailSubscribed: item.email_subscribed,
        campaignCount: item.campaign_count,
        lastCampaignActivityAt: item.last_campaign_activity_at,
        tags: [],
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      })),
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total: parseInt(countResult.rows[0].count, 10),
        totalPages: Math.ceil(countResult.rows[0].count / limit),
      },
    };
  }

  /**
   * Get paginated Zalo group message tracking list of one campaign.
   *
   * @param {object} input
   * @param {number} input.userId
   * @param {number} input.campaignId
   * @param {number} [input.page]
   * @param {number} [input.limit]
   * @param {string} [input.search]
   * @param {string} input.purchaseOrderStatusExpr
   * @returns {Promise<object>}
   */
  async getCampaignZaloGroupMessages({
    userId,
    campaignId,
    page = 1,
    limit = 20,
    search = '',
    purchaseOrderStatusExpr,
  }) {
    const parsedCampaignId = Number.parseInt(campaignId, 10);
    const parsedPage = Number.parseInt(page, 10);
    const parsedLimit = Number.parseInt(limit, 10);
    const safePage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const safeLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 20;
    const offset = (safePage - 1) * safeLimit;
    const trimmedSearch = String(search || '').trim();

    if (!Number.isFinite(parsedCampaignId)) {
      const error = new Error('ID chiến dịch không hợp lệ');
      error.statusCode = 400;
      throw error;
    }

    const campaignResult = await db.query(
      `SELECT id, campaign_type
       FROM campaigns
       WHERE id = $1 AND id_user = $2
       LIMIT 1`,
      [parsedCampaignId, userId],
    );
    if (campaignResult.rows.length === 0) {
      const error = new Error('Không tìm thấy chiến dịch');
      error.statusCode = 404;
      throw error;
    }

    const queryParams = [parsedCampaignId];
    let whereClause = `
      WHERE zm.id_campaign = $1
        AND LOWER(COALESCE(zm.channel, '')) = 'zalo_group'
    `;
    if (trimmedSearch) {
      queryParams.push(`%${trimmedSearch}%`);
      whereClause += `
        AND (
          COALESCE(zm.group_id, '') ILIKE $${queryParams.length}
          OR COALESCE(zm.account_name, '') ILIKE $${queryParams.length}
          OR COALESCE(zm.message_text, '') ILIKE $${queryParams.length}
          OR COALESCE(zm.recipient_value, '') ILIKE $${queryParams.length}
        )
      `;
    }

    const dataResult = await db.query(
      `SELECT
         zm.id,
         zm.id_campaign,
         zm.id_run,
         cr.run_name,
         zm.group_id,
         zm.recipient_value,
         zm.account_id,
         zm.account_name,
         zm.message_text,
         zm.tracking_metadata,
         zm.click_count,
         zm.first_clicked_at,
         zm.last_clicked_at,
         zm.sent_at,
         zm.created_at,
         COALESCE(COUNT(cp.id) FILTER (
           WHERE ${purchaseOrderStatusExpr} IN ('on-hold', 'pending')
         ), 0)::INTEGER AS pending_order_count,
         COALESCE(COUNT(cp.id) FILTER (
           WHERE ${purchaseOrderStatusExpr} IN ('completed', 'processing')
         ), 0)::INTEGER AS completed_order_count,
         COALESCE(COUNT(DISTINCT cp.id_customer), 0)::INTEGER AS ordered_customer_count
       FROM zalo_messages zm
       LEFT JOIN campaign_runs cr ON cr.id = zm.id_run
       LEFT JOIN customer_purchases cp ON cp.id_zalo_message = zm.id
       ${whereClause}
       GROUP BY
         zm.id, zm.id_campaign, zm.id_run, cr.run_name, zm.group_id, zm.recipient_value,
         zm.account_id, zm.account_name, zm.message_text, zm.tracking_metadata, zm.click_count,
         zm.first_clicked_at, zm.last_clicked_at, zm.sent_at, zm.created_at
       ORDER BY COALESCE(zm.sent_at, zm.created_at) DESC, zm.id DESC
       LIMIT $${queryParams.length + 1}
       OFFSET $${queryParams.length + 2}`,
      [...queryParams, safeLimit, offset],
    );

    const countResult = await db.query(
      `SELECT COUNT(*)::INTEGER AS total
       FROM zalo_messages zm
       ${whereClause}`,
      queryParams,
    );
    const total = countResult.rows[0]?.total || 0;
    const runIds = Array.from(
      new Set(
        dataResult.rows
          .map((row) => Number.parseInt(row.id_run, 10))
          .filter((id) => Number.isFinite(id))
      )
    );
    let runGroupNameMap = new Map();
    try {
      runGroupNameMap = await this.loadZaloGroupNameMapByRuns(runIds);
    } catch {
      runGroupNameMap = new Map();
    }

    return {
      items: dataResult.rows.map((row) => {
        const parsedRunId = Number.parseInt(row.id_run, 10);
        const groupId = row.group_id || row.recipient_value || null;
        return {
        id: row.id,
        campaignId: row.id_campaign,
        runId: row.id_run || null,
        runName: row.run_name || null,
        runDisplayName: row.id_run
          ? `Run #${row.id_run}${row.run_name ? ` · ${row.run_name}` : ''}`
          : null,
        groupId,
        groupName:
          (() => {
            const metaGroupName = String(row.tracking_metadata?.groupName || '').trim();
            const normalizedGroupId = String(groupId || '').trim();
            const fallbackName = runGroupNameMap.get(this.buildRunGroupKey(parsedRunId, groupId)) || null;
            if (metaGroupName && metaGroupName !== normalizedGroupId) return metaGroupName;
            if (fallbackName) return fallbackName;
            if (metaGroupName) return metaGroupName;
            return groupId || null;
          })(),
        recipientValue: row.recipient_value || null,
        accountId: row.account_id || null,
        accountName: row.account_name || null,
        messageText: row.message_text || '',
        attachments: Array.isArray(row.tracking_metadata?.attachments)
          ? row.tracking_metadata.attachments
          : [],
        clickCount: Number(row.click_count || 0),
        firstClickedAt: row.first_clicked_at || null,
        lastClickedAt: row.last_clicked_at || null,
        sentAt: row.sent_at || null,
        createdAt: row.created_at || null,
        pendingOrderCount: Number(row.pending_order_count || 0),
        completedOrderCount: Number(row.completed_order_count || 0),
        orderedCustomerCount: Number(row.ordered_customer_count || 0),
      };
      }),
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.max(1, Math.ceil(total / safeLimit)),
      },
    };
  }
}

export default new CustomerQueryService();
