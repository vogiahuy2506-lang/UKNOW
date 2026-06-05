import db from '../../config/database.js';

class CustomerReadRepository {
  async hasPurchaseOrderStatusColumn() {
    const columnCheckResult = await db.query(
      `SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'customer_purchases'
         AND column_name = 'order_status'
       LIMIT 1`
    );
    return columnCheckResult.rows.length > 0;
  }

  async findOwnedCustomer(customerId, userId) {
    const result = await db.query(
      'SELECT id FROM customers WHERE id = $1 AND id_user = $2',
      [customerId, userId]
    );
    return result.rows[0] || null;
  }

  async getCustomerProfile(customerId, userId) {
    const result = await db.query(
      `SELECT
          c.id, c.id_user, c.email, c.phone, c.zalo_id, c.zalo_phone, c.facebook_id,
          c.full_name, c.gender, c.customer_source, c.source_landing_page, c.source_form_id,
          c.utm_source, c.utm_medium, c.utm_campaign,
          c.zalo_in_group, c.id_zalo_group,
          c.zalo_group_joined_at::timestamptz AS zalo_group_joined_at,
          c.zalo_is_friend,
          c.zalo_friend_added_at::timestamptz AS zalo_friend_added_at,
          c.has_purchased, c.total_orders, c.total_spent,
          c.last_order_at::timestamptz AS last_order_at,
          c.email_subscribed,
          c.email_unsubscribed_at::timestamptz AS email_unsubscribed_at,
          c.last_email_sent_at::timestamptz AS last_email_sent_at,
          c.last_email_opened_at::timestamptz AS last_email_opened_at,
          c.last_zalo_sent_at::timestamptz AS last_zalo_sent_at,
          c.last_zalo_read_at::timestamptz AS last_zalo_read_at,
          c.notes, c.custom_fields,
          c.created_at::timestamptz AS created_at, c.updated_at::timestamptz AS updated_at,
          c.email_hard_bounced
       FROM customers c WHERE c.id = $1 AND c.id_user = $2`,
      [customerId, userId]
    );
    return result.rows[0] || null;
  }

  async getCustomerPurchases(customerId, purchaseOrderStatusExpr) {
    const result = await db.query(
      `SELECT cp.id, cp.id_customer, cp.id_course, cp.id_campaign, cp.product_name, cp.product_type,
              cp.amount, cp.currency,
              cp.purchase_date::timestamptz AS purchase_date,
              cp.order_id, cp.payment_method,
              cp.created_at::timestamptz AS created_at,
              cp.id_email_message, cp.id_run, cp.id_zalo_message,
              c.course_name,
              c.course_code,
              camp.campaign_name,
              cc.email_received_count,
              cc.email_clicked_count,
              pe.event_data AS purchase_event_data
       FROM customer_purchases cp
       LEFT JOIN courses c ON c.id = cp.id_course
       LEFT JOIN campaigns camp ON camp.id = cp.id_campaign
       LEFT JOIN campaign_customers cc
              ON cc.id_campaign = cp.id_campaign
             AND cc.id_customer = cp.id_customer
       LEFT JOIN LATERAL (
          SELECT cj.event_data
          FROM customer_journey cj
          WHERE cj.id_customer = cp.id_customer
            AND cj.event_type = CASE
                WHEN ${purchaseOrderStatusExpr} = 'on-hold' THEN 'course_interest'
                ELSE 'course_purchase'
            END
            AND COALESCE(cj.event_data->>'orderId', '') = COALESCE(cp.order_id, '')
            AND COALESCE(cj.event_data->>'productName', '') = COALESCE(cp.product_name, '')
          ORDER BY cj.id DESC
          LIMIT 1
       ) pe ON TRUE
       WHERE cp.id_customer = $1
       ORDER BY cp.purchase_date DESC
       LIMIT 20`,
      [customerId]
    );
    return result.rows;
  }

  async getCustomerCampaignParticipations(customerId, userId) {
    const result = await db.query(
      `SELECT cc.id_campaign,
              c.campaign_name,
              c.status AS campaign_status,
              cc.joined_at::timestamptz AS joined_at,
              cc.email_received_count,
              cc.email_opened_count,
              cc.email_clicked_count,
              cc.has_opened,
              cc.has_clicked,
              cc.first_email_sent_at::timestamptz AS first_email_sent_at,
              cc.last_email_sent_at::timestamptz AS last_email_sent_at,
              cc.first_email_opened_at::timestamptz AS first_email_opened_at,
              cc.last_email_opened_at::timestamptz AS last_email_opened_at,
              cc.first_email_clicked_at::timestamptz AS first_email_clicked_at,
              cc.last_email_clicked_at::timestamptz AS last_email_clicked_at,
              cc.last_activity_at::timestamptz AS last_activity_at
       FROM campaign_customers cc
       JOIN campaigns c ON c.id = cc.id_campaign
       WHERE cc.id_customer = $1
         AND c.id_user = $2
       ORDER BY cc.last_activity_at DESC NULLS LAST, cc.joined_at DESC`,
      [customerId, userId]
    );
    return result.rows;
  }

  async getCustomerEmailMessages(customerId) {
    const result = await db.query(
      `SELECT em.id,
              em.id_campaign,
              c.campaign_name,
              em.id_email_template,
              et.template_name AS email_template_name,
              em.sequence_message_order,
              em.subject,
              em.status,
              em.sent_at::timestamptz AS sent_at,
              em.delivered_at::timestamptz AS delivered_at,
              em.first_opened_at::timestamptz AS first_opened_at,
              em.last_opened_at::timestamptz AS last_opened_at,
              em.open_count,
              em.first_clicked_at::timestamptz AS first_clicked_at,
              em.click_count,
              em.body_html,
              em.body_text,
              em.created_at::timestamptz AS created_at
       FROM email_messages em
       LEFT JOIN campaigns c ON c.id = em.id_campaign
       LEFT JOIN email_templates et ON et.id = em.id_email_template
       WHERE em.id_customer = $1
       ORDER BY COALESCE(em.sent_at, em.created_at) DESC
       LIMIT 100`,
      [customerId]
    );
    return result.rows;
  }

  async getCustomerRecentJourneyEvents(customerId) {
    const result = await db.query(
      `SELECT cj.id, cj.id_customer, cj.id_campaign, cj.event_type, cj.event_channel,
              cj.id_node, cj.id_email_message, cj.id_zalo_message, cj.event_data,
              cj.ip_address, cj.user_agent, cj.device_type, cj.country, cj.city,
              cj.event_at::timestamptz AS event_at, cj.id_run
       FROM customer_journey cj WHERE cj.id_customer = $1 ORDER BY cj.event_at DESC LIMIT 20`,
      [customerId]
    );
    return result.rows;
  }

  async getJourneyEvents({ customerId, campaignIdNum }) {
    const eventParams = [customerId];
    let eventFilter = '';
    if (Number.isFinite(campaignIdNum)) {
      eventParams.push(campaignIdNum);
      eventFilter = ` AND cj.id_campaign = $${eventParams.length}`;
    }

    const result = await db.query(
      `SELECT cj.*,
              c.campaign_name
       FROM customer_journey cj
       LEFT JOIN campaigns c ON c.id = cj.id_campaign
       WHERE cj.id_customer = $1
         AND cj.id_run IS NOT NULL
         ${eventFilter}
       ORDER BY cj.event_at DESC
       LIMIT 200`,
      eventParams
    );
    return result.rows;
  }

  async getJourneyEmailMessages({ customerId, campaignIdNum }) {
    const emailParams = [customerId];
    let emailFilter = '';
    if (Number.isFinite(campaignIdNum)) {
      emailParams.push(campaignIdNum);
      emailFilter = ` AND em.id_campaign = $${emailParams.length}`;
    }

    const result = await db.query(
      `SELECT em.id,
              em.id_campaign,
              c.campaign_name,
              em.subject,
              em.status,
              em.sent_at,
              em.first_opened_at,
              em.last_opened_at,
              em.open_count,
              em.first_clicked_at,
              em.click_count,
              em.body_html,
              em.body_text,
              em.created_at
       FROM email_messages em
       LEFT JOIN campaigns c ON c.id = em.id_campaign
       WHERE em.id_customer = $1
         AND em.id_run IS NOT NULL
         ${emailFilter}
       ORDER BY COALESCE(em.sent_at, em.created_at) DESC
       LIMIT 200`,
      emailParams
    );
    return result.rows;
  }

  async getJourneyCampaignParticipations({ customerId, userId, campaignIdNum }) {
    const participationParams = [customerId, userId];
    let participationFilter = '';
    if (Number.isFinite(campaignIdNum)) {
      participationParams.push(campaignIdNum);
      participationFilter = ` AND cc.id_campaign = $${participationParams.length}`;
    }

    const result = await db.query(
      `SELECT cc.id_campaign,
              c.campaign_name,
              c.status AS campaign_status,
              cc.joined_at,
              cc.email_received_count,
              cc.email_opened_count,
              cc.email_clicked_count,
              cc.has_opened,
              cc.has_clicked,
              cc.last_activity_at
       FROM campaign_customers cc
       JOIN campaigns c ON c.id = cc.id_campaign
       WHERE cc.id_customer = $1
         AND c.id_user = $2
         ${participationFilter}
       ORDER BY cc.last_activity_at DESC NULLS LAST, cc.joined_at DESC`,
      participationParams
    );
    return result.rows;
  }

  async getZaloGroupExecutionsByRuns(runIds = []) {
    const result = await db.query(
      `SELECT id_run, execution_data
       FROM campaign_executions
       WHERE id_run = ANY($1::int[])
         AND action_type = 'get_all_groups'
       ORDER BY created_at ASC, id ASC`,
      [runIds]
    );
    return result.rows;
  }

  async getAllCustomerRows({
    userId,
    page,
    limit,
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
      } else if (normalizedSource === 'founderai' || normalizedSource === 'founder ai' || normalizedSource === 'uknow') {
        query += ` AND LOWER(c.customer_source) IN ('founderai', 'founder ai', 'uknow', 'woocommerce', 'learnpress')`;
      }
    }

    if (Number.isFinite(parsedCampaignId)) {
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
      } else if (normalizedSource === 'founderai' || normalizedSource === 'founder ai' || normalizedSource === 'uknow') {
        countQuery += ` AND LOWER(c.customer_source) IN ('founderai', 'founder ai', 'uknow', 'woocommerce', 'learnpress')`;
      }
    }
    if (Number.isFinite(parsedCampaignId)) {
      countParams.push(parsedCampaignId);
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

    const [result, countResult] = await Promise.all([
      db.query(query, params),
      db.query(countQuery, countParams),
    ]);

    return {
      rows: result.rows,
      total: parseInt(countResult.rows[0].count, 10),
    };
  }

  async getOwnedCampaign(campaignId, userId) {
    const result = await db.query(
      `SELECT id, campaign_type
       FROM campaigns
       WHERE id = $1 AND id_user = $2
       LIMIT 1`,
      [campaignId, userId],
    );
    return result.rows[0] || null;
  }

  async getCampaignZaloGroupMessagesRows({ campaignId, search, limit, offset, purchaseOrderStatusExpr }) {
    const queryParams = [campaignId];
    let whereClause = `
      WHERE zm.id_campaign = $1
        AND LOWER(COALESCE(zm.channel, '')) = 'zalo_group'
    `;
    if (search) {
      queryParams.push(`%${search}%`);
      whereClause += `
        AND (
          COALESCE(zm.group_id, '') ILIKE $${queryParams.length}
          OR COALESCE(zm.account_name, '') ILIKE $${queryParams.length}
          OR COALESCE(zm.message_text, '') ILIKE $${queryParams.length}
          OR COALESCE(zm.recipient_value, '') ILIKE $${queryParams.length}
        )
      `;
    }

    const dataQuery = `SELECT
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
       OFFSET $${queryParams.length + 2}`;

    const countQuery = `SELECT COUNT(*)::INTEGER AS total
       FROM zalo_messages zm
       ${whereClause}`;

    const [dataResult, countResult] = await Promise.all([
      db.query(dataQuery, [...queryParams, limit, offset]),
      db.query(countQuery, queryParams),
    ]);

    return {
      rows: dataResult.rows,
      total: countResult.rows[0]?.total || 0,
    };
  }

  async getCoursesByUser(userId) {
    const result = await db.query(
      `SELECT id, course_name, course_code
       FROM courses
       WHERE id_user = $1
       ORDER BY course_name ASC`,
      [userId]
    );
    return result.rows;
  }

  async getInterestedCustomersWithCoursesRows({
    userId,
    scopedCampaignId,
    useCampaignScope,
    selectedCourseIds,
    normalizedCourseStatuses,
    normalizedCourseQuery,
    normalizedNotPurchasedCourseIds,
    interestedCondition,
    purchaseOrderStatusExpr,
    limit,
  }) {
    const params = [userId];
    let whereCampaign = '';
    if (useCampaignScope && Number.isFinite(scopedCampaignId)) {
      params.push(scopedCampaignId);
      whereCampaign = ` AND cp.id_campaign = $${params.length}`;
    }

    let whereCourse = '';
    if (selectedCourseIds.length > 0) {
      const coursePlaceholders = selectedCourseIds.map((_, idx) => `$${params.length + idx + 1}`).join(',');
      params.push(...selectedCourseIds);
      whereCourse = ` AND cp.id_course IN (${coursePlaceholders})`;
    }

    let whereCourseQuery = '';
    if (normalizedCourseQuery) {
      params.push(`%${normalizedCourseQuery}%`);
      whereCourseQuery = ` AND (
        COALESCE(crs.course_name, cp.product_name, '') ILIKE $${params.length}
        OR COALESCE(crs.course_code, '') ILIKE $${params.length}
        OR COALESCE(cp.product_name, '') ILIKE $${params.length}
      )`;
    }

    let whereCourseStatus = '';
    if (normalizedCourseStatuses.length > 0) {
      params.push(normalizedCourseStatuses);
      whereCourseStatus = ` AND LOWER(COALESCE(crs.status, 'publish')) = ANY($${params.length})`;
    }

    let whereNotPurchased = '';
    if (normalizedNotPurchasedCourseIds.length > 0) {
      const placeholders = normalizedNotPurchasedCourseIds.map((_, idx) => `$${params.length + idx + 1}`).join(',');
      params.push(...normalizedNotPurchasedCourseIds);
      whereNotPurchased = ` AND cp.id_customer NOT IN (
        SELECT id_customer FROM customer_purchases
        WHERE id_user = $1 AND id_course IN (${placeholders})
          AND LOWER(COALESCE(product_type, '')) != 'interested'
      )`;
    }

    const listParams = [...params, limit];
    const listQuery = `
      SELECT MIN(cp.id) AS id,
             cp.id_customer,
             MIN(cp.id_course) AS id_course,
             MIN(cp.id_campaign) AS id_campaign,
             MIN(cp.order_id) AS order_id,
             MIN(cp.product_name) AS product_name,
             MIN(cp.product_type) AS product_type,
             MIN(cp.amount) AS amount,
             MIN(cp.currency) AS currency,
             MIN(cp.payment_method) AS payment_method,
             MAX(cp.purchase_date) AS purchase_date,
             ${purchaseOrderStatusExpr} AS order_status,
             c.full_name,
             c.email,
             c.phone,
             MIN(c.zalo_id) AS zalo_id,
             MIN(c.zalo_phone) AS zalo_phone,
             MIN(c.customer_source) AS customer_source,
             COALESCE(crs.course_name, MIN(cp.product_name)) AS course_name,
             MIN(crs.course_code) AS course_code,
             MIN(camp.campaign_name) AS campaign_name
      FROM customer_purchases cp
      JOIN customers c
        ON c.id = cp.id_customer
       AND c.id_user = $1
      LEFT JOIN courses crs ON crs.id = cp.id_course
      LEFT JOIN campaigns camp
        ON camp.id = cp.id_campaign
       AND camp.id_user = c.id_user
      WHERE ${interestedCondition}
        ${whereCampaign}
        ${whereCourse}
        ${whereCourseStatus}
        ${whereCourseQuery}
        ${whereNotPurchased}
      GROUP BY cp.id_customer,
               c.full_name,
               c.email,
               c.phone,
               crs.course_name,
               ${purchaseOrderStatusExpr}
      ORDER BY MAX(cp.purchase_date) DESC NULLS LAST, MIN(cp.id) DESC
      LIMIT $${listParams.length}
    `;

    const countQuery = `
      SELECT COUNT(*)::INTEGER AS total
      FROM customer_purchases cp
      JOIN customers c
        ON c.id = cp.id_customer
       AND c.id_user = $1
      LEFT JOIN courses crs ON crs.id = cp.id_course
      WHERE ${interestedCondition}
        ${whereCampaign}
        ${whereCourse}
        ${whereCourseStatus}
        ${whereCourseQuery}
    `;

    const coursesQuery = `
      SELECT cp.id_course AS course_id,
             COALESCE(crs.course_name, cp.product_name, 'Khoa hoc khong xac dinh') AS course_name,
             crs.course_code,
             COALESCE(crs.status, 'publish') AS status,
             COUNT(*)::INTEGER AS total_items
      FROM customer_purchases cp
      JOIN customers c
        ON c.id = cp.id_customer
       AND c.id_user = $1
      LEFT JOIN courses crs ON crs.id = cp.id_course
      WHERE ${interestedCondition}
        ${whereCampaign}
        ${whereCourse}
        ${whereCourseStatus}
        ${whereCourseQuery}
      GROUP BY cp.id_course, COALESCE(crs.course_name, cp.product_name, 'Khoa hoc khong xac dinh'), crs.course_code, crs.status
      ORDER BY total_items DESC
    `;

    const [listResult, countResult, coursesResult] = await Promise.all([
      db.query(listQuery, listParams),
      db.query(countQuery, params),
      db.query(coursesQuery, params),
    ]);

    return {
      rows: listResult.rows,
      total: countResult.rows[0]?.total || 0,
      courses: coursesResult.rows,
    };
  }
}

export default new CustomerReadRepository();
