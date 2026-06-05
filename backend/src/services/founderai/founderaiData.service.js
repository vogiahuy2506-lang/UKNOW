class FounderaiDataService {
  async findCustomer({ ctx, client, userId, email, phone }) {
    const normalizedEmail = ctx.toNullableText(email)?.toLowerCase() || null;
    const normalizedPhone = ctx.toNullableText(phone);

    if (normalizedEmail) {
      const byEmail = await client.query(
        `SELECT id
         FROM customers
         WHERE id_user = $1
           AND LOWER(email) = $2
         ORDER BY id ASC
         LIMIT 1`,
        [userId, normalizedEmail]
      );

      if (byEmail.rows.length > 0) return byEmail.rows[0];
    }

    if (normalizedPhone) {
      const byPhone = await client.query(
        `SELECT id
         FROM customers
         WHERE id_user = $1
           AND phone = $2
         ORDER BY id ASC
         LIMIT 1`,
        [userId, normalizedPhone]
      );

      if (byPhone.rows.length > 0) return byPhone.rows[0];
    }

    return null;
  }

  async upsertCustomer({ ctx, client, userId, payload = {} }) {
    const email = ctx.toNullableText(payload.email);
    const phone = ctx.toNullableText(payload.phone);

    if (!email && !phone) {
      return { customerId: null, inserted: false, updated: false };
    }

    const fullName = ctx.toNullableText(payload.fullName);
    const customerSource = ctx.toNullableText(payload.customerSource) || 'founderai';
    const hasPurchased = payload.hasPurchased === true;
    const totalOrders = Number.isFinite(payload.totalOrders) ? payload.totalOrders : null;
    const totalSpent = Number.isFinite(payload.totalSpent) ? payload.totalSpent : null;
    const lastOrderAt = payload.lastOrderAt || null;
    const existingCustomer = await this.findCustomer({ ctx, client, userId, email, phone });

    if (!existingCustomer) {
      const insertResult = await client.query(
        `INSERT INTO customers (
            id_user, email, phone, full_name, customer_source,
            has_purchased, total_orders, total_spent, last_order_at
         ) VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 0), COALESCE($8, 0), $9)
         RETURNING id`,
        [
          userId,
          email,
          phone,
          fullName,
          customerSource,
          hasPurchased,
          totalOrders,
          totalSpent,
          lastOrderAt,
        ]
      );

      return { customerId: insertResult.rows[0].id, inserted: true, updated: false };
    }

    await client.query(
      `UPDATE customers
       SET
         email = COALESCE($1, email),
         phone = COALESCE($2, phone),
         full_name = COALESCE($3, full_name),
         customer_source = COALESCE($4, customer_source),
         has_purchased = CASE WHEN $5 THEN TRUE ELSE has_purchased END,
         total_orders = COALESCE($6, total_orders),
         total_spent = COALESCE($7, total_spent),
         last_order_at = COALESCE($8, last_order_at),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $9`,
      [
        email,
        phone,
        fullName,
        customerSource,
        hasPurchased,
        totalOrders,
        totalSpent,
        lastOrderAt,
        existingCustomer.id,
      ]
    );

    return { customerId: existingCustomer.id, inserted: false, updated: true };
  }

  async upsertCourse({ ctx, client, userId, product = {} }) {
    const productId = product?.id ? String(product.id) : null;
    if (!productId) {
      return { courseId: null, inserted: false, updated: false };
    }

    const category = Array.isArray(product.categories) && product.categories.length > 0
      ? ctx.toNullableText(product.categories[0]?.name)
      : null;
    const thumbnailUrl = Array.isArray(product.images) && product.images.length > 0
      ? ctx.toNullableText(product.images[0]?.src)
      : null;
    const courseName = ctx.toNullableText(product.name) || `Product #${productId}`;
    const description = ctx.toNullableText(product.short_description) || ctx.toNullableText(product.description);
    const price = ctx.parseMoney(product.price);
    const originalPrice = ctx.parseMoney(product.regular_price, price);
    const status = ctx.normalizeCourseStatus(product.status);

    const existingCourse = await client.query(
      `SELECT id
       FROM courses
       WHERE id_user = $1
         AND course_code = $2
       LIMIT 1`,
      [userId, productId]
    );

    if (existingCourse.rows.length === 0) {
      const inserted = await client.query(
        `INSERT INTO courses (
            id_user, course_name, course_code, description,
            price, original_price, category, thumbnail_url, status
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id`,
        [userId, courseName, productId, description, price, originalPrice, category, thumbnailUrl, status]
      );

      return { courseId: inserted.rows[0].id, inserted: true, updated: false };
    }

    await client.query(
      `UPDATE courses
       SET
         course_name = COALESCE($1, course_name),
         description = COALESCE($2, description),
         price = COALESCE($3, price),
         original_price = COALESCE($4, original_price),
         category = COALESCE($5, category),
         thumbnail_url = COALESCE($6, thumbnail_url),
         status = COALESCE($7, status),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $8`,
      [courseName, description, price, originalPrice, category, thumbnailUrl, status, existingCourse.rows[0].id]
    );

    return { courseId: existingCourse.rows[0].id, inserted: false, updated: true };
  }

  async ensureCourseFromLineItem({ ctx, client, userId, lineItem = {}, productCache = {} }) {
    const productId = ctx.getLineItemProductId(lineItem);
    if (!productId) return { courseId: null, inserted: false, updated: false };

    const existing = await client.query(
      `SELECT id
       FROM courses
       WHERE id_user = $1
         AND course_code = $2
       LIMIT 1`,
      [userId, productId]
    );

    if (existing.rows.length > 0) {
      return { courseId: existing.rows[0].id, inserted: false, updated: false };
    }

    let product = productCache[productId];
    if (!product) {
      product = await ctx.fetchProductById(productId);
      if (product) {
        productCache[productId] = product;
      }
    }

    if (product) {
      return this.upsertCourse({ ctx, client, userId, product });
    }

    const courseName = ctx.toNullableText(lineItem.name) || `Product #${productId}`;
    const price = ctx.parseMoney(lineItem.price);
    const inserted = await client.query(
      `INSERT INTO courses (id_user, course_name, course_code, price, original_price, status)
       VALUES ($1, $2, $3, $4, $5, 'publish')
       RETURNING id`,
      [userId, courseName, productId, price, price]
    );

    return { courseId: inserted.rows[0].id, inserted: true, updated: false };
  }

  async refreshCustomerPurchaseStats({ ctx, client, customerId }) {
    const purchaseOrderStatusExpr = await ctx.resolvePurchaseOrderStatusExpr('cp');
    const stats = await client.query(
      `SELECT
         COUNT(DISTINCT order_id) FILTER (WHERE order_id IS NOT NULL) AS total_orders_with_id,
         COUNT(*) FILTER (WHERE order_id IS NULL) AS total_orders_without_id,
         COALESCE(SUM(amount), 0) AS total_spent,
         MAX(purchase_date) AS last_order_at
       FROM customer_purchases cp
       WHERE cp.id_customer = $1
         AND ${purchaseOrderStatusExpr} = 'completed'`,
      [customerId]
    );

    const totalOrders =
      parseInt(stats.rows[0]?.total_orders_with_id || 0, 10) +
      parseInt(stats.rows[0]?.total_orders_without_id || 0, 10);
    const totalSpent = ctx.parseMoney(stats.rows[0]?.total_spent, 0);
    const lastOrderAt = stats.rows[0]?.last_order_at || null;
    const hasPurchased = totalOrders > 0;

    await client.query(
      `UPDATE customers
       SET
         has_purchased = $1,
         total_orders = $2,
         total_spent = $3,
         last_order_at = $4,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $5`,
      [hasPurchased, totalOrders, totalSpent, lastOrderAt, customerId]
    );
  }

  async findClickAttribution({ ctx, client, customerId, lineItem = {}, purchaseDate }) {
    const productId = ctx.getLineItemProductId(lineItem);
    const productNameSlug = ctx.slugify(lineItem?.name || '');
    const clicksResult = await client.query(
      `SELECT id_campaign, id_email_message, event_at, event_data
       FROM customer_journey
       WHERE id_customer = $1
         AND event_type = 'email_clicked'
         AND event_at <= $2
       ORDER BY event_at DESC
       LIMIT 50`,
      [customerId, purchaseDate]
    );

    let best = null;
    const purchaseAt = new Date(purchaseDate).getTime();

    for (const row of clicksResult.rows) {
      const eventData = ctx.parseJsonSafely(row.event_data, {});
      const targetUrl = ctx.normalizeUrl(eventData.targetUrl || eventData.url || '');
      if (!targetUrl) continue;

      let score = 0;
      if (productId && targetUrl.includes(String(productId).toLowerCase())) score += 8;
      if (productNameSlug && targetUrl.includes(productNameSlug)) score += 6;
      if (targetUrl.includes('/courses/')) score += 3;
      if (targetUrl.includes('/san-pham/')) score += 3;

      if (Number.isFinite(purchaseAt)) {
        const clickedAt = new Date(row.event_at).getTime();
        if (Number.isFinite(clickedAt)) {
          const hoursDiff = (purchaseAt - clickedAt) / (1000 * 60 * 60);
          if (hoursDiff >= 0 && hoursDiff <= 24) score += 2;
          else if (hoursDiff > 24 && hoursDiff <= 24 * 7) score += 1;
        }
      }

      if (score <= 0) continue;
      if (!best || score > best.score) {
        best = {
          score,
          campaignId: row.id_campaign || null,
          emailMessageId: row.id_email_message || null,
          clickedAt: row.event_at,
          targetUrl,
        };
      }
    }

    return best;
  }

  async upsertPurchaseJourneyEvent({ ctx, client, payload }) {
    const {
      eventType = 'order_completed',
      customerId,
      campaignId,
      emailMessageId,
      runId,
      zaloMessageId,
      orderId,
      productId,
      productName,
      purchaseDate,
      amount,
      currency,
      attributedFromClick,
      clickAt,
      clickUrl,
    } = payload;

    if (!customerId) return;

    const eventData = {
      orderId: orderId ? String(orderId) : null,
      order_id: orderId ? String(orderId) : null,
      productId: productId ? String(productId) : null,
      productName: ctx.toNullableText(productName),
      amount: ctx.parseMoney(amount),
      currency: ctx.toNullableText(currency) || 'VND',
      runId: Number.isFinite(Number(runId)) ? Number(runId) : null,
      emailMessageId: Number.isFinite(Number(emailMessageId)) ? Number(emailMessageId) : null,
      attributedFromClick: Boolean(attributedFromClick),
      clickAt: clickAt || null,
      clickUrl: ctx.toNullableText(clickUrl),
      description:
        eventType === 'order_pending'
          ? 'Khach hang da tao don hang nhung chua hoan thanh thanh toan'
          : attributedFromClick
            ? 'Khach hang hoan thanh don hang sau khi click link trong chien dich'
            : 'Khach hang hoan thanh don hang',
    };

    const existingEvent = await client.query(
      `SELECT id
       FROM customer_journey
       WHERE id_customer = $1
         AND event_type = $4
         AND COALESCE(event_data->>'orderId', event_data->>'order_id', '') = $2
         AND COALESCE(event_data->>'productId', '') = $3
       ORDER BY id DESC
       LIMIT 1`,
      [customerId, eventData.orderId || '', eventData.productId || '', eventType]
    );

    if (existingEvent.rows.length > 0) {
      await client.query(
        `UPDATE customer_journey
         SET
           id_campaign = COALESCE($1, id_campaign),
           id_email_message = COALESCE($2, id_email_message),
           id_run = COALESCE($3, id_run),
           id_zalo_message = COALESCE($4, id_zalo_message),
           event_data = $5::jsonb,
           event_at = COALESCE($6, event_at)
         WHERE id = $7`,
        [
          campaignId,
          emailMessageId,
          runId || null,
          zaloMessageId || null,
          JSON.stringify(eventData),
          purchaseDate || null,
          existingEvent.rows[0].id,
        ]
      );
      return;
    }

    await client.query(
      `INSERT INTO customer_journey (
          id_customer, id_campaign, id_run, event_type, event_channel,
          id_email_message, id_zalo_message, event_data, event_at
       ) VALUES ($1, $2, $3, $4, 'purchase', $5, $6, $7::jsonb, $8)`,
      [
        customerId,
        campaignId,
        runId || null,
        eventType,
        emailMessageId,
        zaloMessageId || null,
        JSON.stringify(eventData),
        purchaseDate || new Date().toISOString(),
      ]
    );
  }

  async recalculateCampaignConversion({ ctx, client, campaignId }) {
    const campaignIdNum = parseInt(campaignId, 10);
    if (!Number.isFinite(campaignIdNum)) return;
    const purchaseOrderStatusExpr = await ctx.resolvePurchaseOrderStatusExpr('cp');

    const conversionResult = await client.query(
      `SELECT
          COUNT(DISTINCT id_customer)::INTEGER AS total_converted,
          COALESCE(SUM(amount), 0) AS total_revenue
       FROM customer_purchases cp
       WHERE cp.id_campaign = $1
         AND ${purchaseOrderStatusExpr} = 'completed'`,
      [campaignIdNum]
    );

    await client.query(
      `UPDATE campaigns
       SET
         total_converted = $1,
         total_revenue = $2,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [
        parseInt(conversionResult.rows[0]?.total_converted || 0, 10),
        ctx.parseMoney(conversionResult.rows[0]?.total_revenue, 0),
        campaignIdNum,
      ]
    );
  }
}

export default new FounderaiDataService();
