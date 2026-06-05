import db from '../../config/database.js';
import webhookOrderRepository from '../../repositories/webhook/webhookOrder.repository.js';

class WebhookOrderService {
  static STATUS_RANK = { interested: 1, purchased: 2 };

  normalizeUtmSource(value) {
    const raw = String(value ?? '').trim().toLowerCase();
    if (!raw) return null;

    if (['zalo_group_campaign', 'zalo_group_campgingn'].includes(raw)) {
      return 'zalo_group_campaign';
    }
    if (['zalo_person_campaign', 'zalo_person_camgign'].includes(raw)) {
      return 'zalo_person_campaign';
    }
    if (['email_campaign', 'email_camgign'].includes(raw)) {
      return 'email_campaign';
    }
    return null;
  }

  mapOrderStatusToJourneyEventType(orderStatus) {
    if (['completed', 'processing'].includes(orderStatus)) return 'order_completed';
    if (orderStatus === 'on-hold') return 'order_pending';
    return null;
  }

  mapOrderStatusToPurchaseType(orderStatus) {
    return ['completed', 'processing'].includes(orderStatus) ? 'complete' : 'interested';
  }

  mapUtmSourceToJourneyChannel(utmSource) {
    const normalizedSource = this.normalizeUtmSource(utmSource);
    if (normalizedSource === 'zalo_group_campaign') return 'zalo_group';
    if (normalizedSource === 'zalo_person_campaign') return 'zalo';
    if (normalizedSource === 'email_campaign') return 'email';
    return 'woocommerce';
  }

  async hasDuplicateOrderStatus({ order, journeyEventType, purchaseType }) {
    const hasPurchase = await webhookOrderRepository.hasPurchaseForOrder(order.orderId, purchaseType);

    let hasJourney = false;
    if (journeyEventType) {
      hasJourney = await webhookOrderRepository.hasJourneyEventForOrder(order.orderId, order.status, journeyEventType);
    }

    return hasPurchase && journeyEventType && hasJourney;
  }

  async validateUtmParams(client, {
    utmCampaignId,
    utmCustomerId,
    utmEmailMsgId,
    utmZaloMsgId,
    utmRunId = null,
  }) {
    const missing = [];

    if (utmCampaignId) {
      const { rows } = await client.query('SELECT id FROM campaigns WHERE id = $1 LIMIT 1', [utmCampaignId]);
      if (rows.length === 0) missing.push(`campaign_id=${utmCampaignId}`);
    }

    if (utmCustomerId) {
      const { rows } = await client.query('SELECT id FROM customers WHERE id = $1 LIMIT 1', [utmCustomerId]);
      if (rows.length === 0) missing.push(`customer_id=${utmCustomerId}`);
    }

    if (utmEmailMsgId) {
      const { rows } = await client.query('SELECT id FROM email_messages WHERE id = $1 LIMIT 1', [utmEmailMsgId]);
      if (rows.length === 0) missing.push(`email_message_id=${utmEmailMsgId}`);
    }

    if (utmZaloMsgId) {
      const { rows } = await client.query('SELECT id FROM zalo_messages WHERE id = $1 LIMIT 1', [utmZaloMsgId]);
      if (rows.length === 0) missing.push(`zalo_message_id=${utmZaloMsgId}`);
    }

    if (utmRunId) {
      const { rows } = await client.query('SELECT id FROM campaign_runs WHERE id = $1 LIMIT 1', [utmRunId]);
      if (rows.length === 0) missing.push(`run_id=${utmRunId}`);
    }

    return {
      valid: missing.length === 0,
      missingFields: missing,
    };
  }

  async syncCustomerReferences(client, { primaryCustomerId, secondaryCustomerId }) {
    const primaryId = Number.parseInt(primaryCustomerId, 10);
    const secondaryId = Number.parseInt(secondaryCustomerId, 10);
    if (!Number.isFinite(primaryId) || !Number.isFinite(secondaryId) || primaryId === secondaryId) {
      return;
    }

    await client.query(
      `DELETE FROM campaign_customers cc_old
       USING campaign_customers cc_keep
       WHERE cc_old.id_customer = $1
         AND cc_keep.id_customer = $2
         AND cc_old.id_campaign = cc_keep.id_campaign`,
      [secondaryId, primaryId]
    );
    await client.query(
      `UPDATE campaign_customers
       SET id_customer = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id_customer = $2`,
      [primaryId, secondaryId]
    );
    await client.query(
      `DELETE FROM campaign_participations cp_old
       USING campaign_participations cp_keep
       WHERE cp_old.id_customer = $1
         AND cp_keep.id_customer = $2
         AND cp_old.id_campaign = cp_keep.id_campaign`,
      [secondaryId, primaryId]
    );
    await client.query('UPDATE campaign_participations SET id_customer = $1 WHERE id_customer = $2', [primaryId, secondaryId]);
    await client.query('UPDATE customer_purchases SET id_customer = $1 WHERE id_customer = $2', [primaryId, secondaryId]);
    await client.query('UPDATE customer_journey SET id_customer = $1 WHERE id_customer = $2', [primaryId, secondaryId]);
    await client.query('UPDATE email_messages SET id_customer = $1 WHERE id_customer = $2', [primaryId, secondaryId]);
    await client.query('UPDATE zalo_messages SET id_customer = $1 WHERE id_customer = $2', [primaryId, secondaryId]);
    await client.query('UPDATE campaign_executions SET id_customer = $1 WHERE id_customer = $2', [primaryId, secondaryId]);
  }

  async mergeCustomers(client, input = {}) {
    const primaryCustomerId = Number.parseInt(input.primaryCustomerId, 10);
    const secondaryCustomerId = Number.parseInt(input.secondaryCustomerId, 10);
    const userId = Number.parseInt(input.userId, 10);
    const fullName = String(input.fullName || '').trim() || null;
    const email = String(input.email || '').trim().toLowerCase() || null;
    const phone = String(input.phone || '').trim() || null;
    const utmZaloUid = String(input.utmZaloUid || '').trim() || null;
    const utmSource = this.normalizeUtmSource(input.utmSource) || null;

    if (
      !Number.isFinite(primaryCustomerId) ||
      !Number.isFinite(secondaryCustomerId) ||
      !Number.isFinite(userId) ||
      primaryCustomerId === secondaryCustomerId
    ) {
      return primaryCustomerId;
    }

    const customerRows = await client.query(
      `SELECT id, email, phone, zalo_id, zalo_phone, full_name, customer_source, utm_source,
              has_purchased, total_orders, total_spent, last_order_at
       FROM customers
       WHERE id_user = $1
         AND id IN ($2, $3)
       ORDER BY id ASC`,
      [userId, primaryCustomerId, secondaryCustomerId]
    );

    const primary = customerRows.rows.find((row) => Number.parseInt(row.id, 10) === primaryCustomerId);
    const secondary = customerRows.rows.find((row) => Number.parseInt(row.id, 10) === secondaryCustomerId);
    if (!primary || !secondary) return primaryCustomerId;

    const primaryLastOrderAt = primary.last_order_at ? new Date(primary.last_order_at) : null;
    const secondaryLastOrderAt = secondary.last_order_at ? new Date(secondary.last_order_at) : null;
    const mergedLastOrderAt = (!primaryLastOrderAt || (secondaryLastOrderAt && secondaryLastOrderAt > primaryLastOrderAt))
      ? secondaryLastOrderAt
      : primaryLastOrderAt;

    await client.query(
      `UPDATE customers
       SET email = $1,
           phone = $2,
           zalo_id = $3,
           zalo_phone = $4,
           full_name = $5,
           customer_source = $6,
           utm_source = $7,
           has_purchased = $8,
           total_orders = $9,
           total_spent = $10,
           last_order_at = $11,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $12
         AND id_user = $13`,
      [
        primary.email || secondary.email || email,
        primary.phone || secondary.phone || phone,
        primary.zalo_id || secondary.zalo_id || utmZaloUid,
        primary.zalo_phone || secondary.zalo_phone || phone,
        primary.full_name || secondary.full_name || fullName,
        primary.customer_source || secondary.customer_source || 'uknow_campaign',
        this.normalizeUtmSource(primary.utm_source) || this.normalizeUtmSource(secondary.utm_source) || utmSource,
        Boolean(primary.has_purchased) || Boolean(secondary.has_purchased),
        Number(primary.total_orders || 0) + Number(secondary.total_orders || 0),
        Number(primary.total_spent || 0) + Number(secondary.total_spent || 0),
        mergedLastOrderAt,
        primaryCustomerId,
        userId,
      ]
    );

    await this.syncCustomerReferences(client, { primaryCustomerId, secondaryCustomerId });
    await client.query('DELETE FROM customers WHERE id = $1 AND id_user = $2', [secondaryCustomerId, userId]);

    console.log(`[Webhook] Đã merge customer phụ id=${secondaryCustomerId} vào customer chính id=${primaryCustomerId}`);
    return primaryCustomerId;
  }

  async findAndUpdateCustomer(client, userId, order) {
    const { email, phone, fullName } = order.billing;
    const allowCreate = order?.allowCreateCustomer === true;
    const matchPriority = String(order?.matchPriority || 'email_first').toLowerCase() === 'phone_first'
      ? 'phone_first'
      : 'email_first';
    const utmZaloUid = String(order?.utmZaloUid || '').trim() || null;
    const normalizedEmail = String(email || '').trim().toLowerCase() || null;
    const normalizedPhone = String(phone || '').trim() || null;
    const normalizedSource = this.normalizeUtmSource(order?.utmSource) || null;

    if (!normalizedEmail && !normalizedPhone && !utmZaloUid) return null;

    const isPurchased = ['completed', 'processing'].includes(order.status);
    const findByUid = async () => {
      if (!utmZaloUid) return null;
      const result = await client.query(
        `SELECT id FROM customers WHERE id_user = $1 AND zalo_id = $2 ORDER BY id ASC LIMIT 1`,
        [userId, utmZaloUid]
      );
      const id = Number.parseInt(result.rows[0]?.id, 10);
      return Number.isFinite(id) ? id : null;
    };
    const findByEmail = async () => {
      if (!normalizedEmail) return null;
      const result = await client.query(
        `SELECT id FROM customers WHERE id_user = $1 AND LOWER(email) = $2 ORDER BY id ASC LIMIT 1`,
        [userId, normalizedEmail]
      );
      const id = Number.parseInt(result.rows[0]?.id, 10);
      return Number.isFinite(id) ? id : null;
    };
    const findByPhone = async () => {
      if (!normalizedPhone) return null;
      const result = await client.query(
        `SELECT id FROM customers WHERE id_user = $1 AND phone = $2 ORDER BY id ASC LIMIT 1`,
        [userId, normalizedPhone]
      );
      const id = Number.parseInt(result.rows[0]?.id, 10);
      return Number.isFinite(id) ? id : null;
    };

    const uidCustomerId = await findByUid();
    const emailCustomerId = await findByEmail();
    const phoneCustomerId = await findByPhone();
    const preferredContactCustomerId = matchPriority === 'phone_first'
      ? (phoneCustomerId || emailCustomerId || null)
      : (emailCustomerId || phoneCustomerId || null);

    let customerId = preferredContactCustomerId || uidCustomerId || null;
    if (Number.isFinite(preferredContactCustomerId) && Number.isFinite(uidCustomerId) && preferredContactCustomerId !== uidCustomerId) {
      customerId = await this.mergeCustomers(client, {
        userId,
        primaryCustomerId: preferredContactCustomerId,
        secondaryCustomerId: uidCustomerId,
        fullName,
        email: normalizedEmail,
        phone: normalizedPhone,
        utmZaloUid,
        utmSource: normalizedSource,
      });
    }

    if (!customerId) {
      if (!allowCreate) {
        console.log(
          `[Webhook] Không tìm thấy khách hàng với email=${normalizedEmail ?? 'null'} phone=${normalizedPhone ?? 'null'}` +
          ` zalo_uid=${utmZaloUid ?? 'null'} - bỏ qua`
        );
        return null;
      }

      const insertResult = await client.query(
        `INSERT INTO customers
           (id_user, email, phone, zalo_id, zalo_phone, full_name, customer_source, utm_source,
            has_purchased, total_orders, total_spent, last_order_at, created_at, updated_at)
         VALUES
           ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, $10, $11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         RETURNING id`,
        [
          userId,
          normalizedEmail,
          normalizedPhone,
          utmZaloUid,
          normalizedPhone,
          fullName || null,
          'uknow_campaign',
          normalizedSource,
          isPurchased,
          order.total,
          order.dateCreated,
        ]
      );
      customerId = Number.parseInt(insertResult.rows[0]?.id, 10) || null;
      if (!customerId) return null;
      console.log(
        `[Webhook] Tạo mới khách hàng id=${customerId} email=${normalizedEmail ?? 'null'}` +
        ` phone=${normalizedPhone ?? 'null'} zalo_uid=${utmZaloUid ?? 'null'}`
      );
      return customerId;
    }

    await client.query(
      `UPDATE customers
       SET
         full_name = COALESCE(NULLIF($1, ''), full_name),
         email = COALESCE($2, email),
         phone = COALESCE($3, phone),
         zalo_phone = COALESCE($4, zalo_phone),
         zalo_id = CASE
                    WHEN CAST($5 AS VARCHAR(100)) IS NOT NULL AND (zalo_id IS NULL OR zalo_id = '')
                      THEN CAST($5 AS VARCHAR(100))
                    ELSE zalo_id
                  END,
         customer_source = COALESCE(customer_source, 'uknow_campaign'),
         utm_source = COALESCE(utm_source, $6),
         has_purchased = CASE WHEN $7 THEN TRUE ELSE has_purchased END,
         total_orders = total_orders + 1,
         total_spent = total_spent + $8,
         last_order_at = GREATEST(COALESCE(last_order_at, $9), $9),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $10`,
      [
        fullName || '',
        normalizedEmail,
        normalizedPhone,
        normalizedPhone,
        utmZaloUid,
        normalizedSource,
        isPurchased,
        order.total,
        order.dateCreated,
        customerId,
      ]
    );
    console.log(
      `[Webhook] Cập nhật khách hàng id=${customerId} email=${normalizedEmail ?? 'null'}` +
      (utmZaloUid ? ` zalo_uid=${utmZaloUid}` : '')
    );

    return customerId;
  }

  async resolveWebhookUtmSource(client, order) {
    if (order?.utmSource) return this.normalizeUtmSource(order.utmSource);
    if (!order?.utmZaloMsgId) return null;

    const sourceResult = await client.query(
      `SELECT channel FROM zalo_messages WHERE id = $1 LIMIT 1`,
      [order.utmZaloMsgId]
    );
    const channel = String(sourceResult.rows[0]?.channel || '').trim().toLowerCase();
    if (channel === 'zalo_group') return 'zalo_group_campaign';
    if (channel === 'zalo_personal') return 'zalo_person_campaign';
    return null;
  }

  async insertPurchases(client, customerId, order, campaignId = null, emailMsgId = null, runId = null, zaloMessageId = null) {
    const productType = this.mapOrderStatusToPurchaseType(order.status);

    for (const item of order.lineItems) {
      let courseId = null;
      if (item.productId) {
        const courseResult = await client.query(
          'SELECT id FROM courses WHERE course_code = $1 LIMIT 1',
          [String(item.productId)]
        );
        if (courseResult.rows.length > 0) {
          courseId = courseResult.rows[0].id;
        } else {
          console.warn(`[Webhook] Không tìm thấy khóa học với course_code="${item.productId}" – bỏ qua purchase này`);
          continue;
        }
      }

      const existing = await client.query(
        `SELECT id, product_type FROM customer_purchases
         WHERE id_customer = $1 AND order_id = $2
         LIMIT 1`,
        [customerId, order.orderId]
      );

      if (existing.rows.length > 0) {
        if (existing.rows[0].product_type !== 'complete' && productType === 'complete') {
          await client.query(
            `UPDATE customer_purchases
             SET product_type = 'complete',
                 id_email_message = COALESCE(id_email_message, $2),
                 id_zalo_message = COALESCE(id_zalo_message, $3)
             WHERE id = $1`,
            [existing.rows[0].id, emailMsgId, zaloMessageId]
          );
          console.log(`[Webhook] Cập nhật product_type: interested → complete cho "${item.name}"`);
        } else {
          console.log(`[Webhook] Purchase đã tồn tại, bỏ qua: "${item.name}"`);
        }
        continue;
      }

      await client.query(
        `INSERT INTO customer_purchases
           (id_customer, id_course, id_campaign, id_run, product_name, product_type, amount, currency,
            purchase_date, order_id, payment_method, id_email_message, id_zalo_message, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP)`,
        [
          customerId,
          courseId,
          campaignId,
          runId,
          item.name,
          productType,
          item.total,
          order.currency,
          order.dateCreated,
          order.orderId,
          order.paymentMethod,
          emailMsgId,
          zaloMessageId,
        ]
      );
      console.log(`[Webhook] Ghi purchase: "${item.name}" (courseId=${courseId}) – ${item.total} ${order.currency}`);
    }
  }

  async insertJourneyEvent(client, customerId, order, campaignId = null, emailMsgId = null, runId = null, zaloMessageId = null, utmSource = null) {
    const eventType = this.mapOrderStatusToJourneyEventType(order.status);
    const eventChannel = this.mapUtmSourceToJourneyChannel(utmSource || order?.utmSource || null);
    const eventData = {
      order_id: order.orderId,
      order_number: order.orderNumber,
      status: order.status,
      total: order.total,
      currency: order.currency,
    };

    if (eventType === 'order_completed' || eventType === 'order_pending') {
      eventData.products = order.lineItems.map((item) => ({
        product_id: item.productId,
        product_name: item.name,
        quantity: item.quantity,
        total: item.total,
      }));
    } else {
      return;
    }

    await client.query(
      `INSERT INTO customer_journey
         (id_customer, id_campaign, id_run, event_type, event_channel, id_email_message, id_zalo_message, event_data, event_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        customerId,
        campaignId,
        runId,
        eventType,
        eventChannel,
        emailMsgId,
        zaloMessageId,
        JSON.stringify(eventData),
        order.dateCreated,
      ]
    );

    console.log(
      `[Webhook] Ghi journey: event_type="${eventType}" customer=${customerId} ` +
      `campaign=${campaignId ?? 'null'} products=${order.lineItems.length}`
    );
  }

  async linkMessagesToCustomer(client, { customerId, emailMsgId = null, zaloMsgId = null } = {}) {
    const parsedCustomerId = Number.parseInt(customerId, 10);
    const parsedEmailMsgId = Number.parseInt(emailMsgId, 10);
    const parsedZaloMsgId = Number.parseInt(zaloMsgId, 10);
    if (!Number.isFinite(parsedCustomerId)) return;

    if (Number.isFinite(parsedEmailMsgId)) {
      await client.query(
        `UPDATE email_messages
         SET id_customer = COALESCE(id_customer, $2)
         WHERE id = $1`,
        [parsedEmailMsgId, parsedCustomerId]
      );
    }

    if (Number.isFinite(parsedZaloMsgId)) {
      const zaloCustomerColumn = await client.query(
        `SELECT 1
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'zalo_messages'
           AND column_name = 'id_customer'
         LIMIT 1`
      );

      if (zaloCustomerColumn.rows.length > 0) {
        await client.query(
          `UPDATE zalo_messages
           SET id_customer = COALESCE(id_customer, $2)
           WHERE id = $1`,
          [parsedZaloMsgId, parsedCustomerId]
        );
      }

      await client.query(
        `UPDATE customer_journey
         SET id_customer = COALESCE(id_customer, $2)
         WHERE id_zalo_message = $1
           AND event_type = 'zalo_sent'
           AND event_channel = 'zalo'`,
        [parsedZaloMsgId, parsedCustomerId]
      );
    }
  }

  async ensureZaloClickJourneyEvent(client, { customerId, campaignId = null, runId = null, zaloMessageId = null } = {}) {
    const parsedCustomerId = Number.parseInt(customerId, 10);
    const parsedMessageId = Number.parseInt(zaloMessageId, 10);
    if (!Number.isFinite(parsedCustomerId) || !Number.isFinite(parsedMessageId)) return;

    const existingClick = await client.query(
      `SELECT 1
       FROM customer_journey
       WHERE id_customer = $1
         AND id_zalo_message = $2
         AND event_type = 'zalo_clicked'
       LIMIT 1`,
      [parsedCustomerId, parsedMessageId]
    );
    if (existingClick.rows.length > 0) return;

    const messageResult = await client.query(
      `SELECT id_campaign, id_run, group_id, click_count, first_clicked_at, last_clicked_at, tracking_metadata
       FROM zalo_messages
       WHERE id = $1
       LIMIT 1`,
      [parsedMessageId]
    );
    const message = messageResult.rows[0] || {};
    const eventAt = message.last_clicked_at || message.first_clicked_at || new Date();

    await client.query(
      `INSERT INTO customer_journey
         (id_customer, id_campaign, id_run, event_type, event_channel, id_zalo_message, event_data, event_at)
       VALUES
         ($1, $2, $3, 'zalo_clicked', 'zalo', $4, $5::jsonb, $6)`,
      [
        parsedCustomerId,
        campaignId || message.id_campaign || null,
        runId || message.id_run || null,
        parsedMessageId,
        JSON.stringify({
          description: 'Khách hàng đã nhấp link trong tin nhắn Zalo',
          targetUrl: message.tracking_metadata?.lastClickedUrl || null,
          groupId: message.group_id || null,
          clickCount: Number(message.click_count || 0),
          source: 'woocommerce_webhook',
        }),
        eventAt,
      ]
    );
  }

  async resolveRunId(client, order) {
    let runId = order.utmRunId || null;
    if (order.utmEmailMsgId) {
      const runResult = await client.query(
        'SELECT id_run FROM email_messages WHERE id = $1 LIMIT 1',
        [order.utmEmailMsgId]
      );
      runId = runId || runResult.rows[0]?.id_run || null;
    }
    if (!runId && order.utmZaloMsgId) {
      const runResult = await client.query(
        'SELECT id_run FROM zalo_messages WHERE id = $1 LIMIT 1',
        [order.utmZaloMsgId]
      );
      runId = runResult.rows[0]?.id_run || null;
    }
    return runId;
  }

  async updateCampaignStatus(client, customerId, newStatus, fallbackCampaignId = null, utmEmailMsgId = null, utmZaloMsgId = null) {
    const rank = WebhookOrderService.STATUS_RANK;
    const newRank = rank[newStatus] ?? 0;
    if (newRank === 0) return;

    const { rows } = await client.query(
      'SELECT id_campaign, uknow_status FROM campaign_customers WHERE id_customer = $1',
      [customerId]
    );

    if (rows.length === 0) {
      let targetCampaignId = fallbackCampaignId;

      if (!targetCampaignId && utmEmailMsgId) {
        const emailRes = await client.query(
          'SELECT id_campaign FROM email_messages WHERE id = $1 AND id_campaign IS NOT NULL LIMIT 1',
          [utmEmailMsgId]
        );
        if (emailRes.rows.length > 0) {
          targetCampaignId = emailRes.rows[0].id_campaign;
          console.log(`[Webhook] Tìm được campaign ${targetCampaignId} qua utm_id_email=${utmEmailMsgId}`);
        }
      }

      if (!targetCampaignId) {
        const emailRes = await client.query(
          `SELECT id_campaign FROM email_messages
           WHERE id_customer = $1 AND id_campaign IS NOT NULL
           ORDER BY sent_at DESC NULLS LAST
           LIMIT 1`,
          [customerId]
        );
        if (emailRes.rows.length > 0) {
          targetCampaignId = emailRes.rows[0].id_campaign;
        }
      }

      if (!targetCampaignId && utmZaloMsgId) {
        const zaloRes = await client.query(
          `SELECT id_campaign
           FROM zalo_messages
           WHERE id = $1
             AND id_campaign IS NOT NULL
           LIMIT 1`,
          [utmZaloMsgId]
        );
        if (zaloRes.rows.length > 0) {
          targetCampaignId = zaloRes.rows[0].id_campaign;
        }
      }

      if (targetCampaignId) {
        await client.query(
          `INSERT INTO campaign_customers
             (id_campaign, id_customer, uknow_status, joined_at, last_activity_at, updated_at)
           VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           ON CONFLICT (id_campaign, id_customer) DO UPDATE SET
             uknow_status     = CASE
               WHEN campaign_customers.uknow_status IS NULL THEN EXCLUDED.uknow_status
               WHEN COALESCE(campaign_customers.uknow_status, '') = 'interested' AND $3 = 'purchased' THEN 'purchased'
               ELSE campaign_customers.uknow_status
             END,
             last_activity_at = CURRENT_TIMESTAMP,
             updated_at       = CURRENT_TIMESTAMP`,
          [targetCampaignId, customerId, newStatus]
        );
        console.log(
          `[Webhook] Liên kết khách hàng ${customerId} → campaign ${targetCampaignId}` +
          ` qua ${fallbackCampaignId ? 'UTM meta' : 'email_messages'} (status=${newStatus})`
        );
      } else {
        console.log(`[Webhook] Khách hàng ${customerId} chưa tham gia chiến dịch nào và không có dữ liệu email`);
      }
      return;
    }

    let updatedCount = 0;
    for (const row of rows) {
      const currentRank = rank[row.uknow_status] ?? 0;
      if (newRank > currentRank) {
        await client.query(
          `UPDATE campaign_customers
           SET uknow_status     = $1,
               last_activity_at = CURRENT_TIMESTAMP,
               updated_at       = CURRENT_TIMESTAMP
           WHERE id_campaign = $2 AND id_customer = $3`,
          [newStatus, row.id_campaign, customerId]
        );
        updatedCount += 1;
        console.log(
          `[Webhook] uknow_status: ${row.uknow_status ?? 'null'} → ${newStatus}` +
          ` (campaign=${row.id_campaign}, customer=${customerId})`
        );
      }
    }

    if (updatedCount === 0) {
      console.log('[Webhook] Không có chiến dịch nào cần cập nhật – status hiện tại đã bằng hoặc cao hơn');
    }
  }

  async processOrder({ order, userId, newUknowStatus }) {
    const journeyEventType = this.mapOrderStatusToJourneyEventType(order.status);
    const purchaseType = this.mapOrderStatusToPurchaseType(order.status);

    const isDuplicate = await this.hasDuplicateOrderStatus({ order, journeyEventType, purchaseType });
    if (isDuplicate) {
      console.log(
        `[Webhook] Bỏ qua đơn #${order.orderNumber}: order/status/event_type không đổi (${order.status}/${journeyEventType})`
      );
      return { skipped: true, reason: 'duplicate' };
    }

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      const validation = await this.validateUtmParams(client, {
        utmCampaignId: order.utmCampaignId,
        utmCustomerId: order.utmCustomerId,
        utmEmailMsgId: order.utmEmailMsgId,
        utmZaloMsgId: order.utmZaloMsgId,
        utmRunId: order.utmRunId,
      });

      if (!validation.valid) {
        console.warn(`[Webhook] UTM parameters không hợp lệ – không tìm thấy: ${validation.missingFields.join(', ')}`);
        await client.query('ROLLBACK');
        return { skipped: true, reason: 'invalid_utm' };
      }

      const webhookUtmSource = await this.resolveWebhookUtmSource(client, order);
      const isZaloGroupWebhook = webhookUtmSource === 'zalo_group_campaign';
      const isZaloPersonWebhook = webhookUtmSource === 'zalo_person_campaign';
      const isEmailCampaignWebhook = webhookUtmSource === 'email_campaign';

      const customerId = await this.findAndUpdateCustomer(client, userId, {
        ...order,
        utmSource: webhookUtmSource || order.utmSource || null,
        allowCreateCustomer: isZaloGroupWebhook || isZaloPersonWebhook || isEmailCampaignWebhook,
        matchPriority: isZaloGroupWebhook ? 'phone_first' : 'email_first',
      });
      if (!customerId) {
        console.warn('[Webhook] Không tìm thấy khách hàng trong hệ thống – bỏ qua');
        await client.query('ROLLBACK');
        return { skipped: true, reason: 'customer_not_found' };
      }

      await this.linkMessagesToCustomer(client, {
        customerId,
        emailMsgId: order.utmEmailMsgId,
        zaloMsgId: order.utmZaloMsgId,
      });

      const runId = await this.resolveRunId(client, order);

      if (order.utmZaloMsgId && !isZaloGroupWebhook) {
        await this.ensureZaloClickJourneyEvent(client, {
          customerId,
          campaignId: order.utmCampaignId,
          runId,
          zaloMessageId: order.utmZaloMsgId,
        });
      } else if (order.utmZaloMsgId && isZaloGroupWebhook) {
        console.log('[Webhook] Bỏ qua auto-insert zalo_clicked trong order webhook cho nguồn zalo_group');
      }

      if (order.lineItems.length > 0) {
        await this.insertPurchases(
          client,
          customerId,
          order,
          order.utmCampaignId,
          order.utmEmailMsgId,
          runId,
          order.utmZaloMsgId
        );
      }

      await this.insertJourneyEvent(
        client,
        customerId,
        order,
        order.utmCampaignId,
        order.utmEmailMsgId,
        runId,
        order.utmZaloMsgId,
        webhookUtmSource || order.utmSource || null
      );

      if (newUknowStatus) {
        await this.updateCampaignStatus(
          client,
          customerId,
          newUknowStatus,
          order.utmCampaignId ?? null,
          order.utmEmailMsgId ?? null,
          order.utmZaloMsgId ?? null
        );
      }

      await client.query('COMMIT');
      console.log(`[Webhook] ✓ Xử lý xong đơn #${order.orderNumber} – customerId=${customerId}`);
      return { skipped: false, customerId };
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('[Webhook] Lỗi xử lý, đã rollback:', err);
      return { skipped: true, reason: 'error', error: err };
    } finally {
      client.release();
    }
  }
}

export default new WebhookOrderService();
