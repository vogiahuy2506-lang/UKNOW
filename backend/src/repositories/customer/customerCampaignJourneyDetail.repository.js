import db from '../../config/database.js';

class CustomerCampaignJourneyDetailRepository {
  /**
   * Verify customer and campaign ownership.
   *
   * @param {number} customerId
   * @param {number} campaignId
   * @param {number} userId
   * @returns {Promise<{customer_id: number, campaign_id: number, campaign_name: string}|null>}
   */
  async findOwnership(customerId, campaignId, userId) {
    const result = await db.query(
      `SELECT c.id AS customer_id, cp.id AS campaign_id, cp.campaign_name
       FROM customers c
       JOIN campaigns cp ON cp.id = $2 AND cp.id_user = $3
       WHERE c.id = $1 AND c.id_user = $3`,
      [customerId, campaignId, userId]
    );
    return result.rows[0] || null;
  }

  /**
   * Get campaign participation stats for a customer.
   *
   * @param {number} customerId
   * @param {number} campaignId
   * @returns {Promise<object|null>}
   */
  async findParticipation(customerId, campaignId) {
    const result = await db.query(
      `SELECT joined_at::timestamptz AS joined_at,
              email_received_count,
              email_opened_count,
              email_clicked_count,
              has_opened,
              has_clicked,
              first_email_sent_at::timestamptz AS first_email_sent_at,
              last_email_sent_at::timestamptz AS last_email_sent_at,
              first_email_opened_at::timestamptz AS first_email_opened_at,
              last_email_opened_at::timestamptz AS last_email_opened_at,
              first_email_clicked_at::timestamptz AS first_email_clicked_at,
              last_email_clicked_at::timestamptz AS last_email_clicked_at,
              last_activity_at::timestamptz AS last_activity_at
       FROM campaign_customers
       WHERE id_customer = $1 AND id_campaign = $2
       LIMIT 1`,
      [customerId, campaignId]
    );
    return result.rows[0] || null;
  }

  /**
   * Get all email messages sent to a customer within a campaign.
   *
   * @param {number} customerId
   * @param {number} campaignId
   * @returns {Promise<object[]>}
   */
  async findEmailMessages(customerId, campaignId) {
    const result = await db.query(
      `SELECT em.id,
              em.id_email_template,
              et.template_name AS email_template_name,
              em.id_run,
              cr.run_name,
              em.sequence_message_order,
              em.subject,
              em.sender_email,
              em.sender_name,
              em.recipient_email,
              em.recipient_name,
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
              em.created_at::timestamptz AS created_at,
              et.attachments AS template_attachments
       FROM email_messages em
       LEFT JOIN email_templates et ON et.id = em.id_email_template
       LEFT JOIN campaign_runs cr ON cr.id = em.id_run
       WHERE em.id_customer = $1
         AND em.id_campaign = $2
         AND em.id_run IS NOT NULL
       ORDER BY COALESCE(em.sent_at, em.created_at) ASC, em.id ASC`,
      [customerId, campaignId]
    );
    return result.rows;
  }

  /**
   * Get all journey events for a customer within a campaign.
   *
   * @param {number} customerId
   * @param {number} campaignId
   * @returns {Promise<object[]>}
   */
  async findJourneyEvents(customerId, campaignId) {
    const result = await db.query(
      `SELECT cj.id, cj.id_customer, cj.id_campaign, cj.event_type, cj.event_channel,
              cj.id_node, cj.id_email_message, cj.id_zalo_message, cj.event_data,
              cj.ip_address, cj.user_agent, cj.device_type, cj.country, cj.city,
              cj.event_at::timestamptz AS event_at, cj.id_run,
              cp.campaign_name, cr.run_name
       FROM customer_journey cj
       LEFT JOIN campaigns cp ON cp.id = cj.id_campaign
       LEFT JOIN campaign_runs cr ON cr.id = cj.id_run
       WHERE cj.id_customer = $1 AND cj.id_campaign = $2 AND cj.id_run IS NOT NULL
       ORDER BY cj.event_at DESC`,
      [customerId, campaignId]
    );
    return result.rows;
  }

  /**
   * Get campaign purchases for a customer.
   *
   * @param {number} customerId
   * @param {number} campaignId
   * @param {string} purchaseOrderStatusExpr SQL expression for order status column
   * @returns {Promise<object[]>}
   */
  async findCampaignPurchases(customerId, campaignId, purchaseOrderStatusExpr) {
    const result = await db.query(
      `SELECT cp.id, cp.id_customer, cp.id_course, cp.id_campaign, cp.product_name, cp.product_type,
              cp.amount, cp.currency,
              cp.purchase_date::timestamptz AS purchase_date,
              cp.order_id, cp.payment_method,
              cp.created_at::timestamptz AS created_at,
              cp.id_email_message, cp.id_run, cp.id_zalo_message,
              c.course_name,
              c.course_code,
              cr.run_name,
              cc.email_received_count,
              cc.email_clicked_count,
              pe.event_data AS purchase_event_data
       FROM customer_purchases cp
       LEFT JOIN courses c ON c.id = cp.id_course
       LEFT JOIN campaign_runs cr ON cr.id = cp.id_run
       LEFT JOIN campaign_customers cc
              ON cc.id_campaign = cp.id_campaign
             AND cc.id_customer = cp.id_customer
       LEFT JOIN LATERAL (
          SELECT cj.event_data
          FROM customer_journey cj
          WHERE cj.id_customer = cp.id_customer
            AND cj.event_type = CASE
                WHEN ${purchaseOrderStatusExpr} = 'on-hold' THEN 'order_pending'
                ELSE 'order_completed'
            END
            AND COALESCE(cj.event_data->>'orderId', cj.event_data->>'order_id', '') = COALESCE(cp.order_id, '')
            AND COALESCE(cj.event_data->>'productName', '') = COALESCE(cp.product_name, '')
          ORDER BY cj.id DESC
          LIMIT 1
       ) pe ON TRUE
       WHERE cp.id_customer = $1
         AND cp.id_campaign = $2
         AND cp.id_run IS NOT NULL
       ORDER BY cp.purchase_date DESC
       LIMIT 50`,
      [customerId, campaignId]
    );
    return result.rows;
  }

  /**
   * Get Zalo messages for a customer within a campaign (with fallback for missing id_zalo_message column).
   *
   * @param {number} customerId
   * @param {number} campaignId
   * @returns {Promise<object[]>}
   */
  async findZaloMessages(customerId, campaignId) {
    try {
      const result = await db.query(
        `SELECT zm.id,
                zm.id_run,
                cr.run_name,
                zm.channel,
                zm.recipient_type,
                zm.recipient_value,
                zm.uid,
                zm.group_id,
                zm.account_id,
                zm.account_name,
                zm.message_text,
                zm.click_count,
                zm.first_clicked_at::timestamptz AS first_clicked_at,
                zm.last_clicked_at::timestamptz AS last_clicked_at,
                zm.sent_at::timestamptz AS sent_at,
                zm.tracking_metadata
         FROM zalo_messages zm
         LEFT JOIN campaign_runs cr ON cr.id = zm.id_run
         WHERE zm.id_campaign = $2
           AND (
             zm.id_customer = $1
             OR EXISTS (
               SELECT 1
               FROM customer_purchases cpz
               WHERE cpz.id_customer = $1
                 AND cpz.id_campaign = $2
                 AND cpz.id_zalo_message = zm.id
             )
           )
           AND zm.id_run IS NOT NULL
         ORDER BY COALESCE(zm.sent_at, zm.created_at) ASC, zm.id ASC`,
        [customerId, campaignId]
      );
      return result.rows;
    } catch {
      // Backward compatibility when customer_purchases.id_zalo_message does not exist.
      const result = await db.query(
        `SELECT zm.id,
                zm.id_run,
                cr.run_name,
                zm.channel,
                zm.recipient_type,
                zm.recipient_value,
                zm.uid,
                zm.group_id,
                zm.account_id,
                zm.account_name,
                zm.message_text,
                zm.click_count,
                zm.first_clicked_at::timestamptz AS first_clicked_at,
                zm.last_clicked_at::timestamptz AS last_clicked_at,
                zm.sent_at::timestamptz AS sent_at,
                zm.tracking_metadata
         FROM zalo_messages zm
         LEFT JOIN campaign_runs cr ON cr.id = zm.id_run
         WHERE zm.id_customer = $1
           AND zm.id_campaign = $2
           AND zm.id_run IS NOT NULL
         ORDER BY COALESCE(zm.sent_at, zm.created_at) ASC, zm.id ASC`,
        [customerId, campaignId]
      );
      return result.rows;
    }
  }

  /**
   * Get customer-level email summary across all campaigns for a user.
   *
   * @param {number} customerId
   * @param {number} userId
   * @returns {Promise<object>}
   */
  async findCustomerSummary(customerId, userId) {
    const result = await db.query(
      `SELECT
          COALESCE(SUM(cc.email_received_count), 0)::INTEGER AS email_received_count,
          COALESCE(SUM(cc.email_opened_count), 0)::INTEGER AS email_opened_count,
          COALESCE(SUM(cc.email_clicked_count), 0)::INTEGER AS email_clicked_count,
          COALESCE(COUNT(*), 0)::INTEGER AS campaign_count
       FROM campaign_customers cc
       JOIN campaigns c ON c.id = cc.id_campaign
       WHERE cc.id_customer = $1
         AND c.id_user = $2`,
      [customerId, userId]
    );
    return result.rows[0] || {};
  }

  /**
   * Get campaign-level email summary across all participating customers.
   *
   * @param {number} campaignId
   * @param {number} userId
   * @returns {Promise<object>}
   */
  async findCampaignSummary(campaignId, userId) {
    const result = await db.query(
      `SELECT
          COALESCE(COUNT(*), 0)::INTEGER AS participant_count,
          COALESCE(SUM(cc.email_received_count), 0)::INTEGER AS email_received_count,
          COALESCE(SUM(cc.email_opened_count), 0)::INTEGER AS email_opened_count,
          COALESCE(SUM(cc.email_clicked_count), 0)::INTEGER AS email_clicked_count
       FROM campaign_customers cc
       JOIN campaigns c ON c.id = cc.id_campaign
       WHERE cc.id_campaign = $1
         AND c.id_user = $2`,
      [campaignId, userId]
    );
    return result.rows[0] || {};
  }

  /**
   * Get overall email summary across all campaigns for a user.
   *
   * @param {number} userId
   * @returns {Promise<object>}
   */
  async findOverallSummary(userId) {
    const result = await db.query(
      `SELECT
          COALESCE(COUNT(*), 0)::INTEGER AS participant_count,
          COALESCE(SUM(cc.email_received_count), 0)::INTEGER AS email_received_count,
          COALESCE(SUM(cc.email_opened_count), 0)::INTEGER AS email_opened_count,
          COALESCE(SUM(cc.email_clicked_count), 0)::INTEGER AS email_clicked_count
       FROM campaign_customers cc
       JOIN campaigns c ON c.id = cc.id_campaign
       WHERE c.id_user = $1`,
      [userId]
    );
    return result.rows[0] || {};
  }

  /**
   * Get conversion summary for a campaign.
   *
   * @param {number} campaignId
   * @param {number} userId
   * @param {string} purchaseOrderStatusExpr SQL expression for order status column
   * @returns {Promise<object>}
   */
  async findCampaignConversionSummary(campaignId, userId, purchaseOrderStatusExpr) {
    const result = await db.query(
      `SELECT
          COALESCE(COUNT(*) FILTER (
            WHERE ${purchaseOrderStatusExpr} = 'completed'
          ), 0)::INTEGER AS purchase_count,
          COALESCE(COUNT(*) FILTER (
            WHERE ${purchaseOrderStatusExpr} = 'on-hold'
          ), 0)::INTEGER AS interested_count,
          COALESCE(COUNT(DISTINCT cp.id_customer), 0)::INTEGER AS converted_customer_count,
          COALESCE(SUM(cp.amount), 0) AS revenue,
          COALESCE(SUM(
            CASE
              WHEN COALESCE(pe.event_data->>'attributedFromClick', 'false') IN ('true', '1', 'yes')
                THEN 1
              ELSE 0
            END
          ), 0)::INTEGER AS attributed_from_click_count
       FROM customer_purchases cp
       JOIN customers cu ON cu.id = cp.id_customer
       LEFT JOIN LATERAL (
          SELECT cj.event_data
          FROM customer_journey cj
          WHERE cj.id_customer = cp.id_customer
            AND cj.event_type = 'order_completed'
            AND COALESCE(cj.event_data->>'orderId', cj.event_data->>'order_id', '') = COALESCE(cp.order_id, '')
            AND COALESCE(cj.event_data->>'productName', '') = COALESCE(cp.product_name, '')
          ORDER BY cj.id DESC
          LIMIT 1
       ) pe ON TRUE
       WHERE cp.id_campaign = $1
         AND cu.id_user = $2`,
      [campaignId, userId]
    );
    return result.rows[0] || {};
  }

  /**
   * Get conversion summary for a specific customer.
   *
   * @param {number} customerId
   * @param {number} userId
   * @param {string} purchaseOrderStatusExpr SQL expression for order status column
   * @returns {Promise<object>}
   */
  async findCustomerConversionSummary(customerId, userId, purchaseOrderStatusExpr) {
    const result = await db.query(
      `SELECT
          COALESCE(COUNT(*) FILTER (
            WHERE ${purchaseOrderStatusExpr} = 'completed'
          ), 0)::INTEGER AS purchase_count,
          COALESCE(COUNT(*) FILTER (
            WHERE ${purchaseOrderStatusExpr} = 'on-hold'
          ), 0)::INTEGER AS interested_count,
          COALESCE(COUNT(DISTINCT cp.id_campaign), 0)::INTEGER AS campaign_conversion_count,
          COALESCE(SUM(cp.amount), 0) AS revenue,
          COALESCE(SUM(
            CASE
              WHEN COALESCE(pe.event_data->>'attributedFromClick', 'false') IN ('true', '1', 'yes')
                THEN 1
              ELSE 0
            END
          ), 0)::INTEGER AS attributed_from_click_count
       FROM customer_purchases cp
       JOIN customers cu ON cu.id = cp.id_customer
       LEFT JOIN LATERAL (
          SELECT cj.event_data
          FROM customer_journey cj
          WHERE cj.id_customer = cp.id_customer
            AND cj.event_type = 'order_completed'
            AND COALESCE(cj.event_data->>'orderId', cj.event_data->>'order_id', '') = COALESCE(cp.order_id, '')
            AND COALESCE(cj.event_data->>'productName', '') = COALESCE(cp.product_name, '')
          ORDER BY cj.id DESC
          LIMIT 1
       ) pe ON TRUE
       WHERE cp.id_customer = $1
         AND cp.id_campaign IS NOT NULL
         AND cu.id_user = $2`,
      [customerId, userId]
    );
    return result.rows[0] || {};
  }

  /**
   * Get overall conversion summary across all campaigns for a user.
   *
   * @param {number} userId
   * @param {string} purchaseOrderStatusExpr SQL expression for order status column
   * @returns {Promise<object>}
   */
  async findOverallConversionSummary(userId, purchaseOrderStatusExpr) {
    const result = await db.query(
      `SELECT
          COALESCE(COUNT(*) FILTER (
            WHERE ${purchaseOrderStatusExpr} = 'completed'
          ), 0)::INTEGER AS purchase_count,
          COALESCE(COUNT(*) FILTER (
            WHERE ${purchaseOrderStatusExpr} = 'on-hold'
          ), 0)::INTEGER AS interested_count,
          COALESCE(COUNT(DISTINCT cp.id_customer), 0)::INTEGER AS converted_customer_count,
          COALESCE(SUM(cp.amount), 0) AS revenue,
          COALESCE(SUM(
            CASE
              WHEN COALESCE(pe.event_data->>'attributedFromClick', 'false') IN ('true', '1', 'yes')
                THEN 1
              ELSE 0
            END
          ), 0)::INTEGER AS attributed_from_click_count
       FROM customer_purchases cp
       JOIN customers cu ON cu.id = cp.id_customer
       LEFT JOIN LATERAL (
          SELECT cj.event_data
          FROM customer_journey cj
          WHERE cj.id_customer = cp.id_customer
            AND cj.event_type = 'order_completed'
            AND COALESCE(cj.event_data->>'orderId', cj.event_data->>'order_id', '') = COALESCE(cp.order_id, '')
            AND COALESCE(cj.event_data->>'productName', '') = COALESCE(cp.product_name, '')
          ORDER BY cj.id DESC
          LIMIT 1
       ) pe ON TRUE
       WHERE cp.id_campaign IS NOT NULL
         AND cu.id_user = $1`,
      [userId]
    );
    return result.rows[0] || {};
  }

  /**
   * Get campaign run details for a set of run IDs.
   *
   * @param {number[]} runIds
   * @returns {Promise<object[]>}
   */
  async findRunsByIds(runIds) {
    if (!runIds || runIds.length === 0) return [];
    const result = await db.query(
      `SELECT id, run_name, status,
              started_at::timestamptz AS started_at,
              completed_at::timestamptz AS completed_at,
              run_type, run_metadata
       FROM campaign_runs
       WHERE id = ANY($1::int[])
       ORDER BY started_at DESC NULLS LAST, id DESC`,
      [runIds]
    );
    return result.rows;
  }

  /**
   * Get execution data rows used to build Zalo group name map.
   *
   * @param {number[]} runIds
   * @returns {Promise<object[]>}
   */
  async findZaloGroupExecutionData(runIds) {
    if (!runIds || runIds.length === 0) return [];
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
   * Resolve template_files rows for a set of storage keys.
   *
   * @param {string[]} storageKeys
   * @returns {Promise<object[]>}
   */
  async findTemplateFilesByStorageKeys(storageKeys) {
    if (!storageKeys || storageKeys.length === 0) return [];
    const result = await db.query(
      'SELECT id, storage_key FROM template_files WHERE storage_key = ANY($1)',
      [storageKeys]
    );
    return result.rows;
  }
}

export default new CustomerCampaignJourneyDetailRepository();
