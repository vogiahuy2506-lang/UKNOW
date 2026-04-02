import db from '../../config/database.js';
import customerHelperService from './customerHelper.service.js';

class CustomerCampaignJourneyDetailService {
  /**
   * Build composite key for run/group lookup.
   *
   * @param {number|string|null} runId
   * @param {string|null} groupId
   * @returns {string}
   */
  buildRunGroupKey(runId, groupId) {
    return `${String(runId ?? '').trim()}::${String(groupId ?? '').trim()}`;
  }

  /**
   * Extract group id from execution payload.
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
   * Extract group name from execution payload.
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

      const payloadEntries = [data];
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
   * Get campaign-scoped journey detail for one customer.
   *
   * @param {object} input
   * @returns {Promise<object>}
   */
  async getCampaignJourneyDetail({ userId, customerId, campaignId }) {
    if (!Number.isFinite(customerId) || !Number.isFinite(campaignId)) {
      const error = new Error('ID không hợp lệ');
      error.statusCode = 400;
      throw error;
    }

    const ownershipResult = await db.query(
      `SELECT c.id AS customer_id, cp.id AS campaign_id, cp.campaign_name
       FROM customers c
       JOIN campaigns cp ON cp.id = $2 AND cp.id_user = $3
       WHERE c.id = $1 AND c.id_user = $3`,
      [customerId, campaignId, userId]
    );

    if (ownershipResult.rows.length === 0) {
      const error = new Error('Không tìm thấy khách hàng hoặc chiến dịch');
      error.statusCode = 404;
      throw error;
    }

    const campaignInfo = ownershipResult.rows[0];
    const purchaseOrderStatusExpr = await customerHelperService.resolvePurchaseOrderStatusExpr('cp');

    const participationResult = await db.query(
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

    const emailsResult = await db.query(
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

    const journeyEventsResult = await db.query(
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

    const campaignPurchasesResult = await db.query(
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

    let zaloMessagesResult;
    try {
      zaloMessagesResult = await db.query(
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
    } catch {
      // Backward compatibility when customer_purchases.id_zalo_message does not exist.
      zaloMessagesResult = await db.query(
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
    }

    const participation = participationResult.rows[0] || null;
    const customerSummaryResult = await db.query(
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

    const campaignSummaryResult = await db.query(
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

    const overallSummaryResult = await db.query(
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

    const campaignConversionSummaryResult = await db.query(
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

    const customerConversionSummaryResult = await db.query(
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

    const overallConversionSummaryResult = await db.query(
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

    const customerSummary = customerSummaryResult.rows[0] || {};
    const campaignSummary = campaignSummaryResult.rows[0] || {};
    const overallSummary = overallSummaryResult.rows[0] || {};
    const campaignConversionSummary = campaignConversionSummaryResult.rows[0] || {};
    const customerConversionSummary = customerConversionSummaryResult.rows[0] || {};
    const overallConversionSummary = overallConversionSummaryResult.rows[0] || {};

    const runIdSet = new Set();
    emailsResult.rows.forEach((row) => {
      const runId = Number.parseInt(row.id_run, 10);
      if (Number.isFinite(runId)) runIdSet.add(runId);
    });
    journeyEventsResult.rows.forEach((row) => {
      const runId = Number.parseInt(row.id_run, 10);
      if (Number.isFinite(runId)) runIdSet.add(runId);
    });
    campaignPurchasesResult.rows.forEach((row) => {
      const runId = Number.parseInt(row.id_run, 10);
      if (Number.isFinite(runId)) runIdSet.add(runId);
    });
    zaloMessagesResult.rows.forEach((row) => {
      const runId = Number.parseInt(row.id_run, 10);
      if (Number.isFinite(runId)) runIdSet.add(runId);
    });

    const runIds = Array.from(runIdSet.values());
    let runs = [];
    if (runIds.length > 0) {
      const runResult = await db.query(
        `SELECT id, run_name, status,
                started_at::timestamptz AS started_at,
                completed_at::timestamptz AS completed_at,
                run_type, run_metadata
         FROM campaign_runs
         WHERE id = ANY($1::int[])
         ORDER BY started_at DESC NULLS LAST, id DESC`,
        [runIds]
      );
      runs = runResult.rows.map((row) => ({
        runId: row.id,
        runName: row.run_name || row.run_metadata?.runName || null,
        status: row.status || null,
        runType: row.run_type || null,
        startedAt: row.started_at || null,
        completedAt: row.completed_at || null,
      }));
    }
    const runInfoById = new Map(runs.map((run) => [Number(run.runId), run]));
    let runGroupNameMap = new Map();
    try {
      runGroupNameMap = await this.loadZaloGroupNameMapByRuns(runIds);
    } catch {
      runGroupNameMap = new Map();
    }

    const journeyByMessageId = {};
    for (const row of journeyEventsResult.rows) {
      const mid = Number(row.id_email_message);
      if (mid) {
        if (!journeyByMessageId[mid]) journeyByMessageId[mid] = [];
        journeyByMessageId[mid].push(row);
      }
    }
    const journeyByZaloMessageId = {};
    for (const row of journeyEventsResult.rows) {
      const mid = Number(row.id_zalo_message);
      if (mid) {
        if (!journeyByZaloMessageId[mid]) journeyByZaloMessageId[mid] = [];
        journeyByZaloMessageId[mid].push(row);
      }
    }

    /**
     * Build one normalized clicked-links list from journey rows.
     * Keep one entry per unique linkKey (fallback: targetUrl) and aggregate total clicks.
     *
     * @param {Array<object>} events
     * @param {'email_clicked'|'zalo_clicked'} eventType
     * @returns {Array<{linkKey: string, targetUrl: string|null, label: string|null, clickedAt: string|null, clickCount: number}>}
     */
    const buildClickedLinks = (events = [], eventType = 'email_clicked') => {
      const groupedByLink = new Map();
      events
        .filter((event) => event?.event_type === eventType)
        .forEach((event, index) => {
          const eventData = event?.event_data && typeof event.event_data === 'object'
            ? event.event_data
            : {};
          const targetUrl = String(eventData?.targetUrl || '').trim() || null;
          const label = String(eventData?.label || '').trim() || null;
          const rawLinkKey = String(eventData?.linkKey || '').trim();
          const fallbackKey = targetUrl || `event-${event?.id || index}`;
          const linkKey = rawLinkKey || fallbackKey;
          if (!groupedByLink.has(linkKey)) {
            groupedByLink.set(linkKey, {
              linkKey,
              targetUrl,
              label,
              clickedAt: event?.event_at || null,
              clickCount: 0,
            });
          }
          const item = groupedByLink.get(linkKey);
          item.clickCount += 1;
          const itemTime = item.clickedAt ? new Date(item.clickedAt).getTime() : Number.POSITIVE_INFINITY;
          const nextTime = event?.event_at ? new Date(event.event_at).getTime() : Number.POSITIVE_INFINITY;
          if (nextTime < itemTime) {
            item.clickedAt = event?.event_at || item.clickedAt;
          }
          if (!item.targetUrl && targetUrl) item.targetUrl = targetUrl;
          if (!item.label && label) item.label = label;
        });

      return Array.from(groupedByLink.values()).sort((a, b) => {
        const timeA = a.clickedAt ? new Date(a.clickedAt).getTime() : Number.POSITIVE_INFINITY;
        const timeB = b.clickedAt ? new Date(b.clickedAt).getTime() : Number.POSITIVE_INFINITY;
        return timeA - timeB;
      });
    };

    const missingSkKeys = [];
    for (const row of journeyEventsResult.rows) {
      if (row.event_type === 'attachment_downloaded') {
        const ed = row.event_data || {};
        if (!ed.fileId && ed.storageKey) missingSkKeys.push(ed.storageKey);
      }
    }
    const storageKeyToFileId = {};
    if (missingSkKeys.length > 0) {
      try {
        const skResult = await db.query(
          'SELECT id, storage_key FROM template_files WHERE storage_key = ANY($1)',
          [missingSkKeys]
        );
        for (const r of skResult.rows) storageKeyToFileId[r.storage_key] = r.id;
      } catch {
        // ignore
      }
    }

    return {
      customerId,
      campaignId: campaignInfo.campaign_id,
      campaignName: campaignInfo.campaign_name,
      participation: participation
        ? {
            joinedAt: participation.joined_at,
            emailReceivedCount: participation.email_received_count,
            emailOpenedCount: participation.email_opened_count,
            emailClickedCount: participation.email_clicked_count,
            hasOpened: participation.has_opened,
            hasClicked: participation.has_clicked,
            firstEmailSentAt: participation.first_email_sent_at,
            lastEmailSentAt: participation.last_email_sent_at,
            firstEmailOpenedAt: participation.first_email_opened_at,
            lastEmailOpenedAt: participation.last_email_opened_at,
            firstEmailClickedAt: participation.first_email_clicked_at,
            lastEmailClickedAt: participation.last_email_clicked_at,
            lastActivityAt: participation.last_activity_at,
          }
        : null,
      emails: emailsResult.rows.map((message, index) => {
        const eventsForEmail = journeyByMessageId[Number(message.id)] || [];
        const clickedLinks = buildClickedLinks(eventsForEmail, 'email_clicked');
        const firstClickedLink = clickedLinks[0] || null;
        const attachEvent = eventsForEmail
          .filter((e) => e.event_type === 'attachment_downloaded')
          .sort((a, b) => new Date(a.event_at) - new Date(b.event_at))[0];

        const clickLabel = firstClickedLink?.label || null;
        const clickUrl = firstClickedLink?.targetUrl || null;
        const attachStorageKey = attachEvent?.event_data?.storageKey || null;
        const templateAtts = Array.isArray(message.template_attachments)
          ? message.template_attachments
          : [];
        const attachmentDirectUrl = attachStorageKey
          ? (templateAtts.find(
              (a) => a.key === attachStorageKey || (a.url || '').includes(attachStorageKey)
            )?.url || null)
          : null;

        return {
          emailIndex: Number.isFinite(message.sequence_message_order)
            ? message.sequence_message_order
            : index + 1,
          runId: message.id_run || null,
          runName: message.run_name || runInfoById.get(Number(message.id_run))?.runName || null,
          emailMessageId: message.id,
          emailTemplateId: message.id_email_template,
          emailTemplateName: message.email_template_name,
          subject: message.subject,
          senderEmail: message.sender_email || null,
          senderName: message.sender_name || null,
          recipientEmail: message.recipient_email || null,
          recipientName: message.recipient_name || null,
          status: message.status,
          sentAt: message.sent_at,
          deliveredAt: message.delivered_at,
          firstOpenedAt: message.first_opened_at,
          lastOpenedAt: message.last_opened_at,
          openCount: message.open_count || 0,
          firstClickedAt: message.first_clicked_at,
          clickCount: message.click_count || 0,
          hasOpened: (message.open_count || 0) > 0,
          hasClicked: (message.click_count || 0) > 0,
          bodyHtml: message.body_html || null,
          bodyText: message.body_text || null,
          emailJourney: {
            sent: !!message.sent_at,
            sentAt: message.sent_at || null,
            opened: (message.open_count || 0) > 0 || (message.click_count || 0) > 0 || !!attachEvent,
            openedAt: message.first_opened_at || message.first_clicked_at || attachEvent?.event_at || null,
            clicked: (message.click_count || 0) > 0 || clickedLinks.length > 0,
            clickedAt: firstClickedLink?.clickedAt || message.first_clicked_at || null,
            clickedLabel: clickLabel || null,
            clickedUrl: clickUrl || null,
            clickedLinks,
            attachmentDownloaded: !!attachEvent,
            attachmentDownloadedAt: attachEvent?.event_at || null,
            attachmentName: attachEvent?.event_data?.displayName || null,
            attachmentOriginalName: attachEvent?.event_data?.originalName || attachEvent?.event_data?.storageKey?.split('/').pop() || null,
            attachmentFileId: attachEvent?.event_data?.fileId || storageKeyToFileId[attachEvent?.event_data?.storageKey] || null,
            attachmentDirectUrl,
          },
        };
      }),
      purchases: campaignPurchasesResult.rows.map((purchase) => {
        const normalizedOrderStatus = String(purchase.order_status || '')
          .trim()
          .toLowerCase()
          .replace('onhold', 'on-hold');
        const isInterested =
          normalizedOrderStatus === 'on-hold' ||
          String(purchase.product_type || '').toLowerCase() === 'interested';
        const statuses = [];
        if (isInterested) {
          statuses.push('Quan tâm');
        } else {
          statuses.push('Đã mua');
        }
        if ((purchase.email_received_count || 0) > 0) statuses.push('Đã nhận email');
        if (
          String(purchase.purchase_event_data?.attributedFromClick || '').toLowerCase() === 'true' ||
          (purchase.email_clicked_count || 0) > 0
        ) {
          statuses.push('Đã nhận link khóa học');
        }

        return {
          id: purchase.id,
          runId: purchase.id_run || null,
          runName: purchase.run_name || runInfoById.get(Number(purchase.id_run))?.runName || null,
          orderId: purchase.order_id,
          orderStatus: purchase.order_status || (isInterested ? 'on-hold' : 'completed'),
          idEmailMessage: purchase.id_email_message || null,
          idZaloMessage: purchase.id_zalo_message || null,
          productName: purchase.product_name,
          courseName: purchase.course_name,
          courseCode: purchase.course_code,
          amount: purchase.amount,
          currency: purchase.currency,
          purchaseDate: purchase.purchase_date,
          paymentMethod: purchase.payment_method,
          itemStatus: isInterested ? 'interested' : 'complete',
          statuses,
          emailReceivedCount: purchase.email_received_count || 0,
          emailClickedCount: purchase.email_clicked_count || 0,
          attributedFromClick:
            String(purchase.purchase_event_data?.attributedFromClick || '').toLowerCase() === 'true',
          clickAt: purchase.purchase_event_data?.clickAt || null,
          clickUrl: purchase.purchase_event_data?.clickUrl || null,
        };
      }),
      zaloMessages: zaloMessagesResult.rows.map((message) => {
        const clickedLinks = buildClickedLinks(
          journeyByZaloMessageId[Number(message.id)] || [],
          'zalo_clicked'
        );
        return {
          groupId: message.group_id || null,
          runId: message.id_run || null,
          id: message.id,
          runName: message.run_name || runInfoById.get(Number(message.id_run))?.runName || null,
          runDisplayName: message.id_run
            ? `Run #${message.id_run}${(message.run_name || runInfoById.get(Number(message.id_run))?.runName) ? ` · ${message.run_name || runInfoById.get(Number(message.id_run))?.runName}` : ''}`
            : null,
          channel: message.channel || 'zalo_personal',
          recipientType: message.recipient_type || null,
          recipientValue: message.recipient_value || null,
          groupName: message.tracking_metadata?.groupName || null,
          uid: message.uid || null,
          accountId: message.account_id || null,
          accountName: message.account_name || null,
          messageText: message.message_text || '',
          clickCount: Number(message.click_count || 0),
          firstClickedAt: message.first_clicked_at || null,
          lastClickedAt: message.last_clicked_at || null,
          sentAt: message.sent_at || null,
          clickedLinks,
          attachments: Array.isArray(message.tracking_metadata?.attachments)
            ? message.tracking_metadata.attachments
            : [],
          trackingMetadata: message.tracking_metadata || {},
        };
      }).map((message) => ({
        ...message,
        groupName: (() => {
          const normalizedGroupId = String(message.groupId || '').trim();
          const normalizedMetaName = String(message.groupName || '').trim();
          const fallbackName = runGroupNameMap.get(
            this.buildRunGroupKey(Number.parseInt(message.runId, 10), message.groupId)
          ) || null;
          if (normalizedMetaName && normalizedMetaName !== normalizedGroupId) return normalizedMetaName;
          if (fallbackName) return fallbackName;
          if (normalizedMetaName) return normalizedMetaName;
          return message.groupId || message.recipientValue || null;
        })(),
      })),
      journey: journeyEventsResult.rows.map((row) => customerHelperService.mapJourneyEvent(row)),
      runs,
      summaries: {
        byCampaign: {
          participantCount: campaignSummary.participant_count || 0,
          emailReceivedCount: campaignSummary.email_received_count || 0,
          emailOpenedCount: campaignSummary.email_opened_count || 0,
          emailClickedCount: campaignSummary.email_clicked_count || 0,
          purchaseCount: campaignConversionSummary.purchase_count || 0,
          interestedCount: campaignConversionSummary.interested_count || 0,
          convertedCustomerCount: campaignConversionSummary.converted_customer_count || 0,
          attributedFromClickCount: campaignConversionSummary.attributed_from_click_count || 0,
          revenue: campaignConversionSummary.revenue || 0,
        },
        byCustomer: {
          campaignCount: customerSummary.campaign_count || 0,
          emailReceivedCount: customerSummary.email_received_count || 0,
          emailOpenedCount: customerSummary.email_opened_count || 0,
          emailClickedCount: customerSummary.email_clicked_count || 0,
          purchaseCount: customerConversionSummary.purchase_count || 0,
          interestedCount: customerConversionSummary.interested_count || 0,
          campaignConversionCount: customerConversionSummary.campaign_conversion_count || 0,
          attributedFromClickCount: customerConversionSummary.attributed_from_click_count || 0,
          revenue: customerConversionSummary.revenue || 0,
        },
        overall: {
          participantCount: overallSummary.participant_count || 0,
          emailReceivedCount: overallSummary.email_received_count || 0,
          emailOpenedCount: overallSummary.email_opened_count || 0,
          emailClickedCount: overallSummary.email_clicked_count || 0,
          purchaseCount: overallConversionSummary.purchase_count || 0,
          interestedCount: overallConversionSummary.interested_count || 0,
          convertedCustomerCount: overallConversionSummary.converted_customer_count || 0,
          attributedFromClickCount: overallConversionSummary.attributed_from_click_count || 0,
          revenue: overallConversionSummary.revenue || 0,
        },
      },
    };
  }
}

export default new CustomerCampaignJourneyDetailService();
