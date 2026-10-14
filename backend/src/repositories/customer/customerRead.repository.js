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
      'SELECT id FROM customers WHERE id = $1 AND COALESCE(workspace_owner_id, id_user) = $2',
      [customerId, userId]
    );
    return result.rows[0] || null;
  }

  async getCustomerProfile(customerId, userId) {
    const result = await db.query(
      `SELECT
          c.id, c.id_user, c.email, c.phone, c.zalo_id, c.zalo_phone, c.facebook_id,
          c.full_name, c.gender, c.customer_source, c.consent_source, c.source_landing_page, c.source_form_id,
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
       FROM customers c
       WHERE c.id = $1 AND COALESCE(c.workspace_owner_id, c.id_user) = $2`,
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
         AND COALESCE(c.workspace_owner_id, c.id_user) = $2
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
              em.created_at::timestamptz AS created_at
       FROM email_messages em
       LEFT JOIN campaigns c ON c.id = em.id_campaign
       LEFT JOIN email_templates et ON et.id = em.id_email_template
       WHERE em.id_customer = $1 AND NOT em.is_preview
       ORDER BY COALESCE(em.sent_at, em.created_at) DESC
       LIMIT 100`,
      [customerId]
    );
    return result.rows;
  }

  /**
   * Nội dung một email của khách. Lọc cả `id_customer` để không đọc được email của khách khác
   * (quyền workspace đã kiểm ở service qua `findOwnedCustomer`).
   */
  async getCustomerEmailBody(customerId, emailId) {
    const result = await db.query(
      `SELECT em.id, em.subject, em.body_html, em.body_text
       FROM email_messages em
       WHERE em.id = $1 AND em.id_customer = $2 AND NOT em.is_preview
       LIMIT 1`,
      [emailId, customerId]
    );
    return result.rows[0] || null;
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
      // PR-T3 (PLAN_EMAIL_SENT_AT_GIO_UTC_2026-09-27) Việc 3 — liệt kê đúng cột customerHelper.service.js
      // mapJourneyEvent() dùng thay vì `cj.*`: event_at là TIMESTAMP không múi giờ, đọc thô bị node-pg
      // hiểu nhầm UTC nên lệch +7h. KHÔNG thêm alias đè lên `cj.*` (node-pg lấy cột trùng tên sau cùng
      // một cách không rõ ràng — bài học T1), liệt kê tường minh an toàn hơn.
      `SELECT cj.id, cj.event_type, cj.event_channel, cj.event_data,
              cj.id_campaign, cj.id_run, cj.id_email_message, cj.id_zalo_message,
              (cj.event_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AS event_at,
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
              (em.sent_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AS sent_at,
              (em.first_opened_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AS first_opened_at,
              (em.last_opened_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AS last_opened_at,
              em.open_count,
              (em.first_clicked_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AS first_clicked_at,
              em.click_count,
              (em.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AS created_at
       FROM email_messages em
       LEFT JOIN campaigns c ON c.id = em.id_campaign
       WHERE em.id_customer = $1
         AND em.id_run IS NOT NULL
         AND NOT em.is_preview
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
              (cc.joined_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AS joined_at,
              cc.email_received_count,
              cc.email_opened_count,
              cc.email_clicked_count,
              cc.has_opened,
              cc.has_clicked,
              (cc.last_activity_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AS last_activity_at
       FROM campaign_customers cc
       JOIN campaigns c ON c.id = cc.id_campaign
       WHERE cc.id_customer = $1
         AND COALESCE(c.workspace_owner_id, c.id_user) = $2
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

  /**
   * Dựng mệnh đề WHERE + tham số cho danh sách khách. MỘT nơi định nghĩa bộ lọc cho cả truy vấn
   * trang lẫn truy vấn đếm dự phòng (trước đây hai bản copy dễ lệch nhau).
   *
   * @returns {{ whereSql: string, params: any[], campaignParamIdx: number|null }}
   */
  buildCustomerListFilter({ userId, status, search, source, consentSource, emailStatus, campaignId, purchaseOrderStatusExpr }) {
    const parsedCampaignId = Number.parseInt(campaignId, 10);
    const params = [userId];

    let campaignParamIdx = null;
    if (Number.isFinite(parsedCampaignId)) {
      params.push(parsedCampaignId);
      campaignParamIdx = params.length;
    }

    let whereSql = 'COALESCE(c.workspace_owner_id, c.id_user) = $1';
    const normalizedStatus = typeof status === 'string' ? status.trim().toLowerCase() : '';
    const normalizedSource = typeof source === 'string' ? source.trim().toLowerCase() : '';

    if (normalizedStatus) {
      const isOrderStatus = ['completed', 'on-hold', 'onhold'].includes(normalizedStatus);
      if (isOrderStatus) {
        const mappedOrderStatus = normalizedStatus === 'onhold' ? 'on-hold' : normalizedStatus;
        params.push(mappedOrderStatus);
        whereSql += ` AND EXISTS (
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
      whereSql += ` AND (c.email ILIKE $${params.length} OR c.phone ILIKE $${params.length} OR c.full_name ILIKE $${params.length})`;
    }

    if (normalizedSource) {
      if (normalizedSource === 'uknow_campaign') {
        // 'campaign' là giá trị node "lưu khách" từng ghi mặc định trước 10/2026 — dữ liệu cũ còn nguyên trong DB.
        whereSql += ` AND LOWER(c.customer_source) IN ('uknow_campaign', 'campaign_uknow', 'campaign')`;
      } else if (normalizedSource === 'founderai' || normalizedSource === 'founder ai' || normalizedSource === 'uknow') {
        whereSql += ` AND LOWER(c.customer_source) IN ('founderai', 'founder ai', 'uknow', 'woocommerce', 'learnpress')`;
      }
    }

    const normalizedConsentSource = typeof consentSource === 'string' ? consentSource.trim().toLowerCase() : '';
    if (normalizedConsentSource) {
      params.push(normalizedConsentSource);
      whereSql += ` AND LOWER(c.consent_source) = $${params.length}`;
    }

    // Trạng thái nhận email: đã huỷ đăng ký / hard bounce / còn nhận được (cả hai cờ đều NOT NULL).
    const normalizedEmailStatus = typeof emailStatus === 'string' ? emailStatus.trim().toLowerCase() : '';
    if (normalizedEmailStatus === 'unsubscribed') {
      whereSql += ' AND c.email_subscribed = FALSE';
    } else if (normalizedEmailStatus === 'bounced') {
      whereSql += ' AND c.email_hard_bounced = TRUE';
    } else if (normalizedEmailStatus === 'subscribed') {
      whereSql += ' AND c.email_subscribed = TRUE AND c.email_hard_bounced = FALSE';
    }

    if (campaignParamIdx) {
      whereSql += ` AND EXISTS (
        SELECT 1
        FROM campaigns cp
        WHERE cp.id = $${campaignParamIdx}
          AND COALESCE(cp.workspace_owner_id, cp.id_user) = COALESCE(c.workspace_owner_id, c.id_user)
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

    return { whereSql, params, campaignParamIdx };
  }

  /**
   * Danh sách khách (phân trang). Một truy vấn duy nhất:
   *  1. CTE `page` lọc + sắp + cắt trang trên bảng `customers`, kèm tổng số dòng khớp bằng
   *     `COUNT(*) OVER()` (thay cho truy vấn COUNT riêng lặp lại toàn bộ bộ lọc);
   *  2. các số liệu theo từng khách (số chiến dịch, hoạt động gần nhất, trạng thái đơn, chỉ số trong
   *     một chiến dịch) chỉ tính cho tối đa `limit` dòng của trang, không phải cho cả workspace.
   * `campaign_customers` có UNIQUE (id_campaign, id_customer) nên LEFT JOIN theo chiến dịch cho tối đa
   * một dòng — thay cho bốn subquery `cc2` lặp lại.
   *
   * @returns {Promise<{ rows: object[], total: number }>}
   */
  async getAllCustomerRows({
    userId,
    page,
    limit,
    status,
    search,
    source,
    consentSource,
    emailStatus,
    campaignId,
    purchaseOrderStatusExpr,
  }) {
    const offset = (page - 1) * limit;
    const { whereSql, params, campaignParamIdx } = this.buildCustomerListFilter({
      userId, status, search, source, consentSource, emailStatus, campaignId, purchaseOrderStatusExpr,
    });

    const orderStatusFilter = campaignParamIdx ? `AND cp.id_campaign = $${campaignParamIdx}` : '';
    const campaignJoin = campaignParamIdx
      ? `LEFT JOIN campaign_customers cc2
              ON cc2.id_customer = c.id AND cc2.id_campaign = $${campaignParamIdx}`
      : '';
    const campaignColumns = campaignParamIdx
      ? `cc2.uknow_status AS uknow_status,
             cc2.has_clicked AS campaign_has_clicked,
             cc2.has_opened AS campaign_has_opened,
             cc2.email_received_count AS campaign_email_received_count,
             cc2.joined_at::timestamptz AS campaign_joined_at`
      : `NULL AS uknow_status,
             NULL AS campaign_has_clicked,
             NULL AS campaign_has_opened,
             NULL AS campaign_email_received_count,
             NULL AS campaign_joined_at`;

    const limitIdx = params.length + 1;
    const offsetIdx = params.length + 2;
    const queryParams = [...params, limit, offset];

    const result = await db.query(
      `WITH page AS (
         SELECT c.id, c.created_at, COUNT(*) OVER() AS total_count
         FROM customers c
         WHERE ${whereSql}
         ORDER BY c.created_at DESC, c.id DESC
         LIMIT $${limitIdx} OFFSET $${offsetIdx}
       )
       SELECT c.id, c.email, c.phone, c.full_name, c.customer_source, c.consent_source,
              c.has_purchased, c.total_orders, c.total_spent, c.email_subscribed,
              c.email_unsubscribed_at::timestamptz AS email_unsubscribed_at, c.email_hard_bounced,
              COALESCE(act.campaign_count, 0)::INTEGER AS campaign_count,
              act.last_campaign_activity_at,
              ord.order_status AS order_status,
              ${campaignColumns},
              c.created_at::timestamptz AS created_at, c.updated_at::timestamptz AS updated_at,
              page.total_count
       FROM page
       JOIN customers c ON c.id = page.id
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS campaign_count,
                MAX(cc.last_activity_at)::timestamptz AS last_campaign_activity_at
         FROM campaign_customers cc
         JOIN campaigns cp ON cp.id = cc.id_campaign
         WHERE cc.id_customer = c.id
           AND COALESCE(cp.workspace_owner_id, cp.id_user) = COALESCE(c.workspace_owner_id, c.id_user)
       ) act ON TRUE
       LEFT JOIN LATERAL (
         SELECT ${purchaseOrderStatusExpr} AS order_status
         FROM customer_purchases cp
         WHERE cp.id_customer = c.id
           AND cp.id_run IS NOT NULL
           ${orderStatusFilter}
         ORDER BY cp.purchase_date DESC NULLS LAST, cp.id DESC
         LIMIT 1
       ) ord ON TRUE
       ${campaignJoin}
       ORDER BY page.created_at DESC, page.id DESC`,
      queryParams
    );

    if (result.rows.length > 0) {
      return { rows: result.rows, total: Number(result.rows[0].total_count) };
    }

    // Trang rỗng: hoặc không có khách nào khớp, hoặc `page` vượt quá số trang (cửa sổ COUNT(*) OVER()
    // không có dòng nào để mang tổng). Chỉ trường hợp offset > 0 mới cần đếm lại để báo đúng tổng.
    if (offset === 0) return { rows: [], total: 0 };
    const countResult = await db.query(
      `SELECT COUNT(*) AS count FROM customers c WHERE ${whereSql}`,
      params
    );
    return { rows: [], total: Number.parseInt(countResult.rows[0].count, 10) };
  }

  /**
   * Hàng cho file CSV xuất khách: cùng bộ lọc với danh sách (`buildCustomerListFilter`), chỉ cột cơ bản,
   * KHÔNG kèm số liệu theo chiến dịch/đơn hàng nên rẻ hơn truy vấn danh sách. Lấy `limit` dòng (người gọi
   * truyền trần + 1 để biết có bị cắt hay không).
   *
   * @returns {Promise<object[]>}
   */
  async getCustomerExportRows({
    userId, status, search, source, consentSource, emailStatus, campaignId, purchaseOrderStatusExpr, limit,
  }) {
    const { whereSql, params } = this.buildCustomerListFilter({
      userId, status, search, source, consentSource, emailStatus, campaignId, purchaseOrderStatusExpr,
    });
    const result = await db.query(
      `SELECT c.id, c.full_name, c.email, c.phone, c.consent_source,
              c.email_subscribed, c.email_hard_bounced,
              c.created_at::timestamptz AS created_at
       FROM customers c
       WHERE ${whereSql}
       ORDER BY c.created_at DESC, c.id DESC
       LIMIT $${params.length + 1}`,
      [...params, limit]
    );
    return result.rows;
  }

  /**
   * Địa chỉ liên lạc của MỌI khách trong workspace, cho nguồn "Khách hàng đã lưu" của trình tạo chiến dịch từng bước
   * (PLAN_TAO_CHIEN_DICH_TUNG_BUOC_2026-10-14 PR-1). KHÔNG đi qua node `interested_customers` vì node đó đọc từ
   * `customer_purchases` — khách không có dòng mua/quan tâm bị loại (prod: 96.940 khách, chỉ 3 có dòng).
   *
   * Cùng phạm vi workspace với danh sách khách (`buildCustomerListFilter`: `COALESCE(workspace_owner_id, id_user)`).
   * Email: chỉ khách còn nhận được thư (`emailStatus: 'subscribed'` — chưa huỷ đăng ký, chưa hard bounce) để số ước tính khớp
   * số thật sẽ gửi; chốt đồng ý ở bước gửi vẫn là hàng rào cuối. Điện thoại: mọi khách có số.
   *
   * @param {{ userId: number, kind: 'email'|'phone', limit: number }} input `limit` do người gọi truyền (trần + 1 để biết có vượt trần)
   * @returns {Promise<string[]>} giá trị thô (chưa chuẩn hoá/khử trùng), thứ tự id tăng dần
   */
  async getCustomerContactValues({ userId, kind, limit }) {
    const column = kind === 'email' ? 'email' : 'phone';
    const { whereSql, params } = this.buildCustomerListFilter({
      userId,
      emailStatus: kind === 'email' ? 'subscribed' : undefined,
    });
    const result = await db.query(
      `SELECT c.${column} AS value
       FROM customers c
       WHERE ${whereSql}
         AND c.${column} IS NOT NULL
         AND BTRIM(c.${column}) <> ''
       ORDER BY c.id ASC
       LIMIT $${params.length + 1}`,
      [...params, limit]
    );
    return result.rows.map((row) => row.value);
  }

  async getOwnedCampaign(campaignId, userId) {
    const result = await db.query(
      `SELECT id, campaign_type
       FROM campaigns
       WHERE id = $1 AND COALESCE(workspace_owner_id, id_user) = $2
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
        AND NOT zm.is_preview
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
        SELECT pur.id_customer FROM customer_purchases pur
        JOIN customers cu ON cu.id = pur.id_customer
         AND COALESCE(cu.workspace_owner_id, cu.id_user) = $1
        WHERE pur.id_course IN (${placeholders})
          AND LOWER(COALESCE(pur.product_type, '')) != 'interested'
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
       AND COALESCE(c.workspace_owner_id, c.id_user) = $1
      LEFT JOIN courses crs ON crs.id = cp.id_course
      LEFT JOIN campaigns camp
        ON camp.id = cp.id_campaign
       AND COALESCE(camp.workspace_owner_id, camp.id_user) = COALESCE(c.workspace_owner_id, c.id_user)
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
       AND COALESCE(c.workspace_owner_id, c.id_user) = $1
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
       AND COALESCE(c.workspace_owner_id, c.id_user) = $1
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
