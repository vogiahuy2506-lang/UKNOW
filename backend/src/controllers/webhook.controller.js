import crypto from 'crypto';
import db from '../config/database.js';

/**
 * WebhookController – xử lý webhook đơn hàng từ WooCommerce.
 *
 * Luồng xử lý khi nhận đơn hàng:
 *   1. Xác thực chữ ký HMAC-SHA256 (nếu cấu hình WC_WEBHOOK_SECRET)
 *   2. Parse UTM parameters từ _wc_order_attribution_session_entry:
 *      - utm_campaign: ID chiến dịch
 *      - utm_customer: ID khách hàng
 *      - utm_id_email: ID email message
 *      - utm_id_zalo_message: ID tin nhắn Zalo
 *      - utm_id_run: ID campaign run
 *   3. Yêu cầu tối thiểu: utm_campaign + (utm_id_email hoặc utm_id_zalo_message)
 *   4. Validate UTM parameters tồn tại trong database
 *   5. Tìm khách hàng theo email/phone
 *      - Zalo group: ưu tiên phone -> email
 *      - Zalo person/email campaign: ưu tiên email -> phone
 *      - Với các nguồn trên: có thể tạo mới nếu chưa có
 *   6. Ghi/Cập nhật customer_purchases với id_course (product_id) và id_campaign
 *      - Nếu đơn đã tồn tại và status thay đổi: update product_type
 *   7. Ghi customer_journey với event_type tùy theo order status:
 *      - completed/processing → "order_completed"
 *      - on-hold → "order_pending"
 *      - Mỗi lần webhook gọi sẽ ghi journey mới (tracking update)
 *   8. Cập nhật uknow_status trong campaign_customers (chỉ nâng cấp, không hạ)
 *
 * Biến môi trường:
 *   WC_WEBHOOK_SECRET     – secret để xác thực chữ ký (tùy chọn)
 *   WC_WEBHOOK_USER_ID    – id_user trong DB để gán khách hàng từ webhook
 */
class WebhookController {
  // Mapping trạng thái WooCommerce → uknow_status
  static WC_TO_UKNOW = {
    completed:  'purchased',
    processing: 'purchased',
    'on-hold':  'interested',
    pending:    'interested',
    cancelled:  null,
    refunded:   null,
    failed:     null,
  };

  // Thứ tự ưu tiên: số càng lớn thì càng cao – không cho phép downgrade
  static STATUS_RANK = { interested: 1, purchased: 2 };

  // ─── Xác thực chữ ký HMAC-SHA256 ─────────────────────────────────────────

  _verifySignature(req) {
    const secret = process.env.WC_WEBHOOK_SECRET;
    if (!secret) return true; // chưa cấu hình – bỏ qua xác thực

    const receivedSig = req.headers['x-wc-webhook-signature'];
    if (!receivedSig) {
      console.warn('[Webhook] Thiếu header X-WC-Webhook-Signature');
      return false;
    }

    if (!req.rawBody) {
      console.error('[Webhook] req.rawBody không tồn tại – kiểm tra cấu hình express.json verify');
      return false;
    }

    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(req.rawBody)
      .digest('base64');

    // So sánh timing-safe để tránh timing attack
    try {
      return crypto.timingSafeEqual(
        Buffer.from(receivedSig, 'base64'),
        Buffer.from(expectedSig, 'base64'),
      );
    } catch {
      return false;
    }
  }

  // ─── Trích xuất payload ───────────────────────────────────────────────────

  /**
   * Chuẩn hóa giá trị utm_source cho webhook Zalo.
   *
   * @param {unknown} value
   * @returns {'zalo_group_campaign'|'zalo_person_campaign'|'email_campaign'|null}
   */
  _normalizeUtmSource(value) {
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

  /**
   * Map WooCommerce order status sang journey event type.
   *
   * @param {string | null | undefined} orderStatus
   * @returns {'order_completed'|'order_pending'|null}
   */
  _mapOrderStatusToJourneyEventType(orderStatus) {
    if (['completed', 'processing'].includes(orderStatus)) return 'order_completed';
    if (orderStatus === 'on-hold') return 'order_pending';
    return null;
  }

  /**
   * Map WooCommerce order status sang product_type lưu ở customer_purchases.
   *
   * @param {string | null | undefined} orderStatus
   * @returns {'interested'|'complete'}
   */
  _mapOrderStatusToPurchaseType(orderStatus) {
    return ['completed', 'processing'].includes(orderStatus) ? 'complete' : 'interested';
  }

  _extractOrderFields(payload) {
    const billing = payload.billing ?? {};

    // Trích xuất UTM tracking từ _wc_order_attribution_session_entry
    const metaData = Array.isArray(payload.meta_data) ? payload.meta_data : [];
    const findMeta = (key) => {
      const item = metaData.find((m) => m.key === key || m.key === `_${key}`);
      return item?.value ?? null;
    };

    // Parse UTM từ session entry URL
    let utmCampaignId = null;
    let utmCustomerId = null;
    let utmEmailMsgId = null;
    let utmZaloMsgId = null;
    let utmRunId = null;
    let utmSource = null;
    let utmZaloUid = null;

    const sessionEntry = findMeta('wc_order_attribution_session_entry');
    if (sessionEntry) {
      try {
        const url = new URL(sessionEntry);
        const params = url.searchParams;
        
        utmCampaignId = parseInt(params.get('utm_campaign') ?? '0', 10) || null;
        utmCustomerId = parseInt(params.get('utm_customer') ?? '0', 10) || null;
        utmEmailMsgId = parseInt(params.get('utm_id_email') ?? '0', 10) || null;
        utmZaloMsgId = parseInt(params.get('utm_id_zalo_message') ?? '0', 10) || null;
        utmRunId = parseInt(params.get('utm_id_run') ?? '0', 10) || null;
        utmSource = this._normalizeUtmSource(params.get('utm_source'));
        utmZaloUid = String(params.get('utm_zalo_uid') ?? '').trim() || null;
      } catch (err) {
        console.warn('[Webhook] Lỗi parse URL từ session_entry:', err.message);
      }
    }

    const lineItems = (payload.line_items ?? []).map((item) => ({
      productId:   item.product_id,
      variationId: item.variation_id || null,
      name:        item.name,
      sku:         item.sku || null,
      quantity:    item.quantity,
      total:       parseFloat(item.total) || 0,
    }));

    return {
      orderId:       String(payload.id),
      orderNumber:   payload.number,
      status:        payload.status,
      dateCreated:   payload.date_created ? new Date(payload.date_created) : new Date(),
      currency:      payload.currency || 'VND',
      total:         parseFloat(payload.total) || 0,
      paymentMethod: payload.payment_method || null,
      billing: {
        fullName: `${billing.first_name ?? ''} ${billing.last_name ?? ''}`.trim() || null,
        email:    billing.email?.toLowerCase().trim() || null,
        phone:    billing.phone?.trim() || null,
      },
      lineItems,
      utmCampaignId,
      utmCustomerId,
      utmEmailMsgId,
      utmZaloMsgId,
      utmRunId,
      utmSource,
      utmZaloUid,
    };
  }

  // ─── Validate UTM parameters exist in DB ──────────────────────────────────

  /**
   * Kiểm tra UTM parameters có tồn tại trong database không.
   * Trả về { valid: boolean, missingFields: string[] }
   */
  async _validateUtmParams(
    client,
    utmCampaignId,
    utmCustomerId,
    utmEmailMsgId,
    utmZaloMsgId,
    utmRunId = null
  ) {
    const missing = [];

    // Kiểm tra campaign tồn tại
    if (utmCampaignId) {
      const { rows } = await client.query(
        `SELECT id FROM campaigns WHERE id = $1 LIMIT 1`,
        [utmCampaignId],
      );
      if (rows.length === 0) {
        missing.push(`campaign_id=${utmCampaignId}`);
      }
    }

    // Kiểm tra customer tồn tại
    if (utmCustomerId) {
      const { rows } = await client.query(
        `SELECT id FROM customers WHERE id = $1 LIMIT 1`,
        [utmCustomerId],
      );
      if (rows.length === 0) {
        missing.push(`customer_id=${utmCustomerId}`);
      }
    }

    // Kiểm tra email message tồn tại
    if (utmEmailMsgId) {
      const { rows } = await client.query(
        `SELECT id FROM email_messages WHERE id = $1 LIMIT 1`,
        [utmEmailMsgId],
      );
      if (rows.length === 0) {
        missing.push(`email_message_id=${utmEmailMsgId}`);
      }
    }

    if (utmZaloMsgId) {
      const { rows } = await client.query(
        `SELECT id FROM zalo_messages WHERE id = $1 LIMIT 1`,
        [utmZaloMsgId],
      );
      if (rows.length === 0) {
        missing.push(`zalo_message_id=${utmZaloMsgId}`);
      }
    }

    // Kiểm tra campaign run tồn tại (nếu có)
    if (utmRunId) {
      const { rows } = await client.query(
        `SELECT id FROM campaign_runs WHERE id = $1 LIMIT 1`,
        [utmRunId],
      );
      if (rows.length === 0) {
        missing.push(`run_id=${utmRunId}`);
      }
    }

    return {
      valid: missing.length === 0,
      missingFields: missing,
    };
  }

  // ─── Tìm khách hàng (không tạo mới) ──────────────────────────────────────

  /**
   * Đồng bộ khóa ngoại từ bản ghi khách hàng phụ sang bản ghi chính.
   *
   * @param {import('pg').PoolClient} client
   * @param {{ primaryCustomerId: number, secondaryCustomerId: number }} input
   * @returns {Promise<void>}
   */
  async _syncCustomerReferences(client, { primaryCustomerId, secondaryCustomerId }) {
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
    await client.query(
      `UPDATE campaign_participations
       SET id_customer = $1
       WHERE id_customer = $2`,
      [primaryId, secondaryId]
    );

    await client.query(
      `UPDATE customer_purchases
       SET id_customer = $1
       WHERE id_customer = $2`,
      [primaryId, secondaryId]
    );
    await client.query(
      `UPDATE customer_journey
       SET id_customer = $1
       WHERE id_customer = $2`,
      [primaryId, secondaryId]
    );
    await client.query(
      `UPDATE email_messages
       SET id_customer = $1
       WHERE id_customer = $2`,
      [primaryId, secondaryId]
    );
    await client.query(
      `UPDATE zalo_messages
       SET id_customer = $1
       WHERE id_customer = $2`,
      [primaryId, secondaryId]
    );
    await client.query(
      `UPDATE campaign_executions
       SET id_customer = $1
       WHERE id_customer = $2`,
      [primaryId, secondaryId]
    );
  }

  /**
   * Gộp bản ghi khách hàng theo nguyên tắc ưu tiên record có email/sđt.
   *
   * @param {import('pg').PoolClient} client
   * @param {object} input
   * @returns {Promise<number>}
   */
  async _mergeCustomers(client, input = {}) {
    const primaryCustomerId = Number.parseInt(input.primaryCustomerId, 10);
    const secondaryCustomerId = Number.parseInt(input.secondaryCustomerId, 10);
    const userId = Number.parseInt(input.userId, 10);
    const fullName = String(input.fullName || '').trim() || null;
    const email = String(input.email || '').trim().toLowerCase() || null;
    const phone = String(input.phone || '').trim() || null;
    const utmZaloUid = String(input.utmZaloUid || '').trim() || null;
    const utmSource = this._normalizeUtmSource(input.utmSource) || null;

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

    const mergedEmail = primary.email || secondary.email || email;
    const mergedPhone = primary.phone || secondary.phone || phone;
    const mergedZaloId = primary.zalo_id || secondary.zalo_id || utmZaloUid;
    const mergedZaloPhone = primary.zalo_phone || secondary.zalo_phone || phone;
    const mergedFullName = primary.full_name || secondary.full_name || fullName;
    const mergedSource = primary.customer_source || secondary.customer_source || 'uknow_campaign';
    const mergedUtmSource = this._normalizeUtmSource(primary.utm_source)
      || this._normalizeUtmSource(secondary.utm_source)
      || utmSource;
    const mergedHasPurchased = Boolean(primary.has_purchased) || Boolean(secondary.has_purchased);
    const mergedTotalOrders = Number(primary.total_orders || 0) + Number(secondary.total_orders || 0);
    const mergedTotalSpent = Number(primary.total_spent || 0) + Number(secondary.total_spent || 0);
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
        mergedEmail,
        mergedPhone,
        mergedZaloId,
        mergedZaloPhone,
        mergedFullName,
        mergedSource,
        mergedUtmSource,
        mergedHasPurchased,
        mergedTotalOrders,
        mergedTotalSpent,
        mergedLastOrderAt,
        primaryCustomerId,
        userId,
      ]
    );

    await this._syncCustomerReferences(client, {
      primaryCustomerId,
      secondaryCustomerId,
    });

    await client.query(
      `DELETE FROM customers
       WHERE id = $1
         AND id_user = $2`,
      [secondaryCustomerId, userId]
    );

    console.log(
      `[Webhook] Đã merge customer phụ id=${secondaryCustomerId} vào customer chính id=${primaryCustomerId}`,
    );
    return primaryCustomerId;
  }

  /**
   * Tìm và đồng bộ customer theo luồng webhook (ưu tiên record có email/sđt).
   *
   * @param {import('pg').PoolClient} client
   * @param {number} userId
   * @param {object} order
   * @returns {Promise<number|null>}
   */
  async _findAndUpdateCustomer(client, userId, order) {
    const { email, phone, fullName } = order.billing;
    const allowCreate = order?.allowCreateCustomer === true;
    const matchPriority = String(order?.matchPriority || 'email_first').toLowerCase() === 'phone_first'
      ? 'phone_first'
      : 'email_first';
    const utmZaloUid = String(order?.utmZaloUid || '').trim() || null;
    const normalizedEmail = String(email || '').trim().toLowerCase() || null;
    const normalizedPhone = String(phone || '').trim() || null;
    const normalizedSource = this._normalizeUtmSource(order?.utmSource) || null;

    if (!normalizedEmail && !normalizedPhone && !utmZaloUid) return null;

    const isPurchased = ['completed', 'processing'].includes(order.status);
    const findByUid = async () => {
      if (!utmZaloUid) return null;
      const result = await client.query(
        `SELECT id
         FROM customers
         WHERE id_user = $1
           AND zalo_id = $2
         ORDER BY id ASC
         LIMIT 1`,
        [userId, utmZaloUid]
      );
      const id = Number.parseInt(result.rows[0]?.id, 10);
      return Number.isFinite(id) ? id : null;
    };
    const findByEmail = async () => {
      if (!normalizedEmail) return null;
      const result = await client.query(
        `SELECT id
         FROM customers
         WHERE id_user = $1
           AND LOWER(email) = $2
         ORDER BY id ASC
         LIMIT 1`,
        [userId, normalizedEmail]
      );
      const id = Number.parseInt(result.rows[0]?.id, 10);
      return Number.isFinite(id) ? id : null;
    };
    const findByPhone = async () => {
      if (!normalizedPhone) return null;
      const result = await client.query(
        `SELECT id
         FROM customers
         WHERE id_user = $1
           AND phone = $2
         ORDER BY id ASC
         LIMIT 1`,
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
      customerId = await this._mergeCustomers(client, {
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
          ` zalo_uid=${utmZaloUid ?? 'null'} - bỏ qua`,
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
        ],
      );
      customerId = Number.parseInt(insertResult.rows[0]?.id, 10) || null;
      if (!customerId) return null;
      console.log(
        `[Webhook] Tạo mới khách hàng id=${customerId} email=${normalizedEmail ?? 'null'}` +
        ` phone=${normalizedPhone ?? 'null'} zalo_uid=${utmZaloUid ?? 'null'}`,
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
      ],
    );
    console.log(
      `[Webhook] Cập nhật khách hàng id=${customerId} email=${normalizedEmail ?? 'null'}` +
      (utmZaloUid ? ` zalo_uid=${utmZaloUid}` : ''),
    );

    return customerId;
  }

  /**
   * Resolve normalized utm source from URL or linked zalo_message channel.
   *
   * @param {import('pg').PoolClient} client
   * @param {object} order
   * @returns {Promise<'zalo_group_campaign'|'zalo_person_campaign'|'email_campaign'|null>}
   */
  async _resolveWebhookUtmSource(client, order) {
    if (order?.utmSource) return this._normalizeUtmSource(order.utmSource);
    if (!order?.utmZaloMsgId) return null;

    const sourceResult = await client.query(
      `SELECT channel
       FROM zalo_messages
       WHERE id = $1
       LIMIT 1`,
      [order.utmZaloMsgId]
    );
    const channel = String(sourceResult.rows[0]?.channel || '').trim().toLowerCase();
    if (channel === 'zalo_group') return 'zalo_group_campaign';
    if (channel === 'zalo_personal') return 'zalo_person_campaign';
    return null;
  }

  /**
   * Map utm_source đã normalize sang event_channel trong customer_journey.
   *
   * @param {'zalo_group_campaign'|'zalo_person_campaign'|'email_campaign'|null|undefined} utmSource
   * @returns {'zalo_group'|'zalo'|'email'|'woocommerce'}
   */
  _mapUtmSourceToJourneyChannel(utmSource) {
    const normalizedSource = this._normalizeUtmSource(utmSource);
    if (normalizedSource === 'zalo_group_campaign') return 'zalo_group';
    if (normalizedSource === 'zalo_person_campaign') return 'zalo';
    if (normalizedSource === 'email_campaign') return 'email';
    return 'woocommerce';
  }

  // ─── Ghi purchases ────────────────────────────────────────────────────────

  async _insertPurchases(
    client,
    customerId,
    order,
    campaignId = null,
    emailMsgId = null,
    runId = null,
    zaloMessageId = null
  ) {
    // product_type được frontend dùng để hiển thị badge trạng thái
    const productType = this._mapOrderStatusToPurchaseType(order.status);

    for (const item of order.lineItems) {
      // Tìm id của course dựa trên course_code (productId từ WooCommerce)
      let courseId = null;
      if (item.productId) {
        const courseResult = await client.query(
          `SELECT id FROM courses WHERE course_code = $1 LIMIT 1`,
          [String(item.productId)],
        );
        if (courseResult.rows.length > 0) {
          courseId = courseResult.rows[0].id;
        } else {
          console.warn(`[Webhook] Không tìm thấy khóa học với course_code="${item.productId}" – bỏ qua purchase này`);
          continue;
        }
      }

      // Tránh trùng lặp: cùng khách hàng, cùng order_id
      const existing = await client.query(
        `SELECT id, product_type FROM customer_purchases
         WHERE id_customer = $1 AND order_id = $2 
         LIMIT 1`,
        [customerId, order.orderId],
      );

      if (existing.rows.length > 0) {
        // Nâng cấp product_type nếu đơn chuyển từ interested → complete
        // (WooCommerce sẽ gọi webhook lại khi order status thay đổi)
        if (existing.rows[0].product_type !== 'complete' && productType === 'complete') {
          await client.query(
            `UPDATE customer_purchases
             SET product_type = 'complete',
                 id_email_message = COALESCE(id_email_message, $2),
                 id_zalo_message = COALESCE(id_zalo_message, $3)
             WHERE id = $1`,
            [existing.rows[0].id, emailMsgId, zaloMessageId],
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
          courseId,                     // id_course từ bảng courses (dựa trên course_code)
          campaignId,                   // id_campaign từ UTM
          runId,
          item.name,
          productType,
          item.total,
          order.currency,
          order.dateCreated,
          order.orderId,
          order.paymentMethod,
          emailMsgId,                   // id_email_message từ UTM
          zaloMessageId,
        ],
      );
      console.log(`[Webhook] Ghi purchase: "${item.name}" (courseId=${courseId}) – ${item.total} ${order.currency}`);
    }
  }

  // ─── Ghi journey event ────────────────────────────────────────────────────

  /**
   * Ghi sự kiện vào customer_journey dựa trên trạng thái đơn hàng.
   * - completed/processing: event_type = "order_completed"
   * - on-hold: event_type = "order_pending"
   * 
   * Note: Mỗi lần webhook được gọi sẽ ghi journey mới.
   * Khi đơn update từ on-hold → completed, WooCommerce gọi webhook lại,
   * hệ thống sẽ tự động ghi thêm journey "order_completed".
   */
  async _insertJourneyEvent(
    client,
    customerId,
    order,
    campaignId = null,
    emailMsgId = null,
    runId = null,
    zaloMessageId = null,
    utmSource = null
  ) {
    const eventType = this._mapOrderStatusToJourneyEventType(order.status);
    const eventChannel = this._mapUtmSourceToJourneyChannel(utmSource || order?.utmSource || null);
    let eventData = {
      order_id: order.orderId,
      order_number: order.orderNumber,
      status: order.status,
      total: order.total,
      currency: order.currency,
    };

    // Map trạng thái đơn hàng sang event_type
    if (eventType === 'order_completed') {
      // Thêm chi tiết sản phẩm
      eventData.products = order.lineItems.map(item => ({
        product_id: item.productId,
        product_name: item.name,
        quantity: item.quantity,
        total: item.total,
      }));
    } else if (eventType === 'order_pending') {
      eventData.products = order.lineItems.map(item => ({
        product_id: item.productId,
        product_name: item.name,
        quantity: item.quantity,
        total: item.total,
      }));
    } else {
      // Các trạng thái khác (cancelled, refunded, failed) không ghi journey
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
      ],
    );

    console.log(
      `[Webhook] Ghi journey: event_type="${eventType}" customer=${customerId} ` +
      `campaign=${campaignId ?? 'null'} products=${order.lineItems.length}`,
    );
  }

  /**
   * Liên kết bản ghi message với customer vừa resolve từ webhook.
   * - email_messages: luôn cập nhật id_customer nếu còn null.
   * - zalo_messages: chỉ cập nhật khi bảng/cột tồn tại để tránh lỗi runtime.
   *
   * @param {import('pg').PoolClient} client
   * @param {{ customerId: number, emailMsgId?: number | null, zaloMsgId?: number | null }} params
   * @returns {Promise<void>}
   */
  async _linkMessagesToCustomer(
    client,
    { customerId, emailMsgId = null, zaloMsgId = null } = {}
  ) {
    const parsedCustomerId = Number.parseInt(customerId, 10);
    const parsedEmailMsgId = Number.parseInt(emailMsgId, 10);
    const parsedZaloMsgId = Number.parseInt(zaloMsgId, 10);
    if (!Number.isFinite(parsedCustomerId)) return;

    if (Number.isFinite(parsedEmailMsgId)) {
      await client.query(
        `UPDATE email_messages
         SET id_customer = COALESCE(id_customer, $2)
         WHERE id = $1`,
        [parsedEmailMsgId, parsedCustomerId],
      );
    }

    if (Number.isFinite(parsedZaloMsgId)) {
      const zaloCustomerColumn = await client.query(
        `SELECT 1
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'zalo_messages'
           AND column_name = 'id_customer'
         LIMIT 1`,
      );

      if (zaloCustomerColumn.rows.length > 0) {
        await client.query(
          `UPDATE zalo_messages
           SET id_customer = COALESCE(id_customer, $2)
           WHERE id = $1`,
          [parsedZaloMsgId, parsedCustomerId],
        );
      }

      // Giữ hành vi merge khách cho bản ghi gửi Zalo cá nhân trong journey.
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

  /**
   * Ensure one Zalo click journey event exists for attributed customer/message.
   * This helps Zalo group orders keep click journey even when click happened
   * before customer could be resolved.
   *
   * @param {import('pg').PoolClient} client
   * @param {object} input
   * @returns {Promise<void>}
   */
  async _ensureZaloClickJourneyEvent(
    client,
    {
      customerId,
      campaignId = null,
      runId = null,
      zaloMessageId = null,
    } = {}
  ) {
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
    const finalCampaignId = campaignId || message.id_campaign || null;
    const finalRunId = runId || message.id_run || null;
    const eventAt = message.last_clicked_at || message.first_clicked_at || new Date();

    await client.query(
      `INSERT INTO customer_journey
         (id_customer, id_campaign, id_run, event_type, event_channel, id_zalo_message, event_data, event_at)
       VALUES
         ($1, $2, $3, 'zalo_clicked', 'zalo', $4, $5::jsonb, $6)`,
      [
        parsedCustomerId,
        finalCampaignId,
        finalRunId,
        parsedMessageId,
        JSON.stringify({
          description: 'Khách hàng đã nhấp link trong tin nhắn Zalo',
          targetUrl: message.tracking_metadata?.lastClickedUrl || null,
          groupId: message.group_id || null,
          clickCount: Number(message.click_count || 0),
          source: 'woocommerce_webhook',
        }),
        eventAt,
      ],
    );
  }

  // ─── Cập nhật uknow_status ────────────────────────────────────────────────

  /**
   * Cập nhật uknow_status cho tất cả chiến dịch mà khách hàng đang tham gia.
   * Quy tắc: chỉ nâng cấp (interested → purchased), không bao giờ hạ cấp.
   */
  async _updateCampaignStatus(
    client,
    customerId,
    newStatus,
    fallbackCampaignId = null,
    utmEmailMsgId = null,
    utmZaloMsgId = null
  ) {
    const rank = WebhookController.STATUS_RANK;
    const newRank = rank[newStatus] ?? 0;
    if (newRank === 0) return;

    const { rows } = await client.query(
      `SELECT id_campaign, uknow_status FROM campaign_customers WHERE id_customer = $1`,
      [customerId],
    );

    if (rows.length === 0) {
      // Fallback 1: dùng campaign_id từ UTM meta của đơn hàng
      let targetCampaignId = fallbackCampaignId;

      // Fallback 2: tra cứu trực tiếp theo utm_id (email_messages.id) nếu có
      if (!targetCampaignId && utmEmailMsgId) {
        const emailRes = await client.query(
          `SELECT id_campaign FROM email_messages WHERE id = $1 AND id_campaign IS NOT NULL LIMIT 1`,
          [utmEmailMsgId],
        );
        if (emailRes.rows.length > 0) {
          targetCampaignId = emailRes.rows[0].id_campaign;
          console.log(`[Webhook] Tìm được campaign ${targetCampaignId} qua utm_id_email=${utmEmailMsgId}`);
        }
      }

      // Fallback 3: tra cứu email_messages để tìm campaign gần nhất đã gửi email cho khách hàng này
      if (!targetCampaignId) {
        const emailRes = await client.query(
          `SELECT id_campaign FROM email_messages
           WHERE id_customer = $1 AND id_campaign IS NOT NULL
           ORDER BY sent_at DESC NULLS LAST
           LIMIT 1`,
          [customerId],
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
          [targetCampaignId, customerId, newStatus],
        );
        console.log(
          `[Webhook] Liên kết khách hàng ${customerId} → campaign ${targetCampaignId}` +
          ` qua ${fallbackCampaignId ? 'UTM meta' : 'email_messages'} (status=${newStatus})`,
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
          [newStatus, row.id_campaign, customerId],
        );
        updatedCount++;
        console.log(
          `[Webhook] uknow_status: ${row.uknow_status ?? 'null'} → ${newStatus}` +
          ` (campaign=${row.id_campaign}, customer=${customerId})`,
        );
      }
    }

    if (updatedCount === 0) {
      console.log(`[Webhook] Không có chiến dịch nào cần cập nhật – status hiện tại đã bằng hoặc cao hơn`);
    }
  }

  // ─── Handler chính ────────────────────────────────────────────────────────

  /**
   * POST /api/webhooks/woocommerce/order
   */
  handleOrder(req, res) {
    // Trả 200 ngay để WooCommerce không retry
    res.status(200).json({ success: true, message: 'Webhook nhận thành công' });

    setImmediate(async () => {
      try {
        // 1. Xác thực chữ ký
        if (!this._verifySignature(req)) {
          console.warn('[Webhook] Chữ ký không hợp lệ – payload bị bỏ qua');
          return;
        }

        const payload = req.body;
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
          console.warn('[Webhook] Payload không hợp lệ hoặc rỗng');
          return;
        }

        // 2. Kiểm tra WC_WEBHOOK_USER_ID
        const userId = parseInt(process.env.WC_WEBHOOK_USER_ID, 10);
        if (!Number.isFinite(userId)) {
          console.error('[Webhook] WC_WEBHOOK_USER_ID chưa cấu hình – bỏ qua lưu database');
          console.log('[Webhook] Raw payload:', JSON.stringify(payload, null, 2));
          return;
        }

        const order = this._extractOrderFields(payload);
        const newUknowStatus = WebhookController.WC_TO_UKNOW[order.status] ?? null;

        console.log(
          `[Webhook] Nhận đơn #${order.orderNumber} | WC status="${order.status}"` +
          ` | uknow_status="${newUknowStatus}" | email=${order.billing.email}` +
          ` | utm_campaign=${order.utmCampaignId ?? '-'} ` +
          ` | utm_source=${order.utmSource ?? '-'} ` +
          ` | utm_customer=${order.utmCustomerId ?? '-'} ` +
          ` | utm_id_email=${order.utmEmailMsgId ?? '-'} ` +
          ` | utm_id_zalo_message=${order.utmZaloMsgId ?? '-'} ` +
          ` | utm_id_run=${order.utmRunId ?? '-'} ` +
          ` | utm_zalo_uid=${order.utmZaloUid ?? '-'}`,
        );

        // Hỗ trợ tracking từ email hoặc Zalo:
        // yêu cầu campaign + một message id (email hoặc zalo).
        if (!order.utmCampaignId || (!order.utmEmailMsgId && !order.utmZaloMsgId)) {
          console.warn(
            `[Webhook] Thiếu UTM parameters: ` +
            `utm_campaign=${order.utmCampaignId ?? 'null'}, ` +
            `utm_id_email=${order.utmEmailMsgId ?? 'null'}, ` +
            `utm_id_zalo_message=${order.utmZaloMsgId ?? 'null'} – bỏ qua`,
          );
          return;
        }

        const journeyEventType = this._mapOrderStatusToJourneyEventType(order.status);
        const purchaseType = this._mapOrderStatusToPurchaseType(order.status);

        // Chỉ bỏ qua khi: đơn đã lưu với cùng status và journey đã có cùng event_type + status.
        const purchaseDedupCheck = await db.query(
          `SELECT 1
           FROM customer_purchases
           WHERE order_id = $1
             AND product_type = $2
           LIMIT 1`,
          [order.orderId, purchaseType],
        );

        let journeyDedupCheck = { rows: [] };
        if (journeyEventType) {
          journeyDedupCheck = await db.query(
            `SELECT 1
             FROM customer_journey
             WHERE event_data->>'order_id' = $1
               AND event_data->>'status' = $2
               AND event_type = $3
             LIMIT 1`,
            [order.orderId, order.status, journeyEventType],
          );
        }

        if (
          purchaseDedupCheck.rows.length > 0 &&
          journeyEventType &&
          journeyDedupCheck.rows.length > 0
        ) {
          console.log(
            `[Webhook] Bỏ qua đơn #${order.orderNumber}: order/status/event_type không đổi (${order.status}/${journeyEventType})`,
          );
          return;
        }

        const client = await db.getClient();
        try {
          await client.query('BEGIN');

          // 3. Validate UTM parameters tồn tại trong database
          const validation = await this._validateUtmParams(
            client,
            order.utmCampaignId,
            order.utmCustomerId,
            order.utmEmailMsgId,
            order.utmZaloMsgId,
            order.utmRunId,
          );

          if (!validation.valid) {
            console.warn(
              `[Webhook] UTM parameters không hợp lệ – không tìm thấy: ${validation.missingFields.join(', ')}`,
            );
            await client.query('ROLLBACK');
            return;
          }

          // 4. Tìm khách hàng (không tạo mới)
          const webhookUtmSource = await this._resolveWebhookUtmSource(client, order);
          const isZaloGroupWebhook = webhookUtmSource === 'zalo_group_campaign';
          const isZaloPersonWebhook = webhookUtmSource === 'zalo_person_campaign';
          const isEmailCampaignWebhook = webhookUtmSource === 'email_campaign';

          const customerId = await this._findAndUpdateCustomer(client, userId, {
            ...order,
            utmSource: webhookUtmSource || order.utmSource || null,
            allowCreateCustomer:
              isZaloGroupWebhook || isZaloPersonWebhook || isEmailCampaignWebhook,
            matchPriority: isZaloGroupWebhook ? 'phone_first' : 'email_first',
          });
          if (!customerId) {
            console.warn('[Webhook] Không tìm thấy khách hàng trong hệ thống – bỏ qua');
            await client.query('ROLLBACK');
            return;
          }

          await this._linkMessagesToCustomer(client, {
            customerId,
            emailMsgId: order.utmEmailMsgId,
            zaloMsgId: order.utmZaloMsgId,
          });

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

          // Zalo group click có thể không gắn id_customer cụ thể; không bù click journey ở webhook order.
          if (order.utmZaloMsgId && !isZaloGroupWebhook) {
            await this._ensureZaloClickJourneyEvent(client, {
              customerId,
              campaignId: order.utmCampaignId,
              runId,
              zaloMessageId: order.utmZaloMsgId,
            });
          } else if (order.utmZaloMsgId && isZaloGroupWebhook) {
            console.log('[Webhook] Bỏ qua auto-insert zalo_clicked trong order webhook cho nguồn zalo_group');
          }

          // 5. Ghi purchases cho từng sản phẩm với id_course, id_campaign và id_email_message
          if (order.lineItems.length > 0) {
            await this._insertPurchases(
              client,
              customerId,
              order,
              order.utmCampaignId,
              order.utmEmailMsgId,
              runId,
              order.utmZaloMsgId
            );
          }

          // 6. Ghi journey event
          await this._insertJourneyEvent(
            client,
            customerId,
            order,
            order.utmCampaignId,
            order.utmEmailMsgId,
            runId,
            order.utmZaloMsgId,
            webhookUtmSource || order.utmSource || null,
          );

          // 7. Cập nhật uknow_status trong tất cả campaign_customers liên quan
          if (newUknowStatus) {
            await this._updateCampaignStatus(
              client,
              customerId,
              newUknowStatus,
              order.utmCampaignId ?? null,
              order.utmEmailMsgId ?? null,
              order.utmZaloMsgId ?? null
            );
          }

          await client.query('COMMIT');
          console.log(
            `[Webhook] ✓ Xử lý xong đơn #${order.orderNumber} – customerId=${customerId}`,
          );
        } catch (err) {
          await client.query('ROLLBACK');
          console.error('[Webhook] Lỗi xử lý, đã rollback:', err);
        } finally {
          client.release();
        }
      } catch (err) {
        console.error('[Webhook] Lỗi ngoài transaction:', err);
      }
    });
  }
}

export default new WebhookController();
