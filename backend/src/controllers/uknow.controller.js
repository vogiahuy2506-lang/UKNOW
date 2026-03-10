import axios from 'axios';
import db from '../config/database.js';
import uknowReadService from '../services/uknow/uknowRead.service.js';
import uknowSyncService from '../services/uknow/uknowSync.service.js';

class UknowController {
  constructor() {
    this.baseUrl = process.env.UKNOW_API_URL || 'https://uknow.edu.vn/wp-json';
    this.consumerKey = process.env.UKNOW_CONSUMER_KEY;
    this.consumerSecret = process.env.UKNOW_CONSUMER_SECRET;
  }

  ensureCredentials() {
    if (!this.consumerKey || !this.consumerSecret) {
      throw new Error('Missing UKNOW API credentials');
    }
  }

  getAuthHeaders() {
    this.ensureCredentials();
    const credentials = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');

    return {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/json',
    };
  }

  parseMoney(value, fallback = 0) {
    const num = parseFloat(value);
    return Number.isFinite(num) ? num : fallback;
  }

  normalizeTextForMatch(value) {
    const text = this.toNullableText(value);
    if (!text) return '';

    return text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  slugify(value) {
    const normalized = this.normalizeTextForMatch(value);
    if (!normalized) return '';

    return normalized
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  toBoolean(value) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      return ['true', '1', 'yes'].includes(value.trim().toLowerCase());
    }
    if (typeof value === 'number') return value !== 0;
    return false;
  }

  parseJsonSafely(value, fallback = {}) {
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'object') return value;

    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return fallback;
      }
    }

    return fallback;
  }

  toNullableText(value) {
    if (typeof value !== 'string') return null;
    const text = value.trim();
    return text.length > 0 ? text : null;
  }

  /**
   * Chuẩn hóa trạng thái khóa học theo WooCommerce status.
   *
   * @param {string|null|undefined} rawStatus trạng thái gốc từ API hoặc input khác
   * @returns {string} trạng thái hợp lệ để lưu DB
   */
  normalizeCourseStatus(rawStatus) {
    const normalized = this.toNullableText(rawStatus)?.toLowerCase();
    return normalized || 'publish';
  }

  async hasPurchaseOrderStatusColumn() {
    if (typeof this.purchaseOrderStatusColumnExists !== 'boolean') {
      try {
        const result = await db.query(
          `SELECT 1
           FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = 'customer_purchases'
             AND column_name = 'order_status'
           LIMIT 1`
        );
        this.purchaseOrderStatusColumnExists = result.rows.length > 0;
      } catch {
        this.purchaseOrderStatusColumnExists = false;
      }
    }

    return this.purchaseOrderStatusColumnExists;
  }

  async resolvePurchaseOrderStatusExpr(alias = 'cp') {
    const hasOrderStatusColumn = await this.hasPurchaseOrderStatusColumn();
    if (hasOrderStatusColumn) {
      return `COALESCE(NULLIF(${alias}.order_status, ''), CASE WHEN COALESCE(${alias}.product_type, '') = 'interested' THEN 'on-hold' ELSE 'completed' END)`;
    }

    return `CASE WHEN COALESCE(${alias}.product_type, '') = 'interested' THEN 'on-hold' ELSE 'completed' END`;
  }

  formatName(firstName, lastName) {
    return this.toNullableText(`${firstName || ''} ${lastName || ''}`);
  }

  getLineItemProductId(lineItem = {}) {
    if (lineItem?.product_id) return String(lineItem.product_id);

    if (Array.isArray(lineItem?.meta_data)) {
      const meta = lineItem.meta_data.find((item) =>
        ['_course_id', 'course_id', 'product_id'].includes(String(item?.key || '').toLowerCase())
      );
      if (meta?.value !== undefined && meta?.value !== null && String(meta.value).trim().length > 0) {
        return String(meta.value).trim();
      }
    }

    return null;
  }

  normalizeUrl(value) {
    const raw = this.toNullableText(value);
    if (!raw) return '';

    try {
      return decodeURIComponent(raw).toLowerCase();
    } catch {
      return raw.toLowerCase();
    }
  }

  async findCustomer(client, userId, email, phone) {
    const normalizedEmail = this.toNullableText(email)?.toLowerCase() || null;
    const normalizedPhone = this.toNullableText(phone);

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

  async upsertCustomer(client, userId, payload = {}) {
    const email = this.toNullableText(payload.email);
    const phone = this.toNullableText(payload.phone);

    if (!email && !phone) {
      return { customerId: null, inserted: false, updated: false };
    }

    const fullName = this.toNullableText(payload.fullName);
    const customerSource = this.toNullableText(payload.customerSource) || 'uknow';
    const hasPurchased = payload.hasPurchased === true;
    const totalOrders = Number.isFinite(payload.totalOrders) ? payload.totalOrders : null;
    const totalSpent = Number.isFinite(payload.totalSpent) ? payload.totalSpent : null;
    const lastOrderAt = payload.lastOrderAt || null;

    const existingCustomer = await this.findCustomer(client, userId, email, phone);

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

  /**
   * Fetch chi tiết product từ UKNOW WooCommerce API
   * @param {string|number} productId - ID của product cần lấy
   * @returns {Promise<object|null>} Product data hoặc null nếu không tìm thấy
   */
  async fetchProductById(productId) {
    if (!productId) return null;

    try {
      const response = await axios.get(`${this.baseUrl}/wc/v3/products/${productId}`, {
        headers: this.getAuthHeaders(),
      });

      return response.data || null;
    } catch (error) {
      // Nếu product không tồn tại (404) hoặc lỗi khác, return null
      console.warn(`Không thể lấy thông tin product ${productId}:`, error.response?.status, error.message);
      return null;
    }
  }

  async upsertCourse(client, userId, product = {}) {
    const productId = product?.id ? String(product.id) : null;
    if (!productId) {
      return { courseId: null, inserted: false, updated: false };
    }

    const category = Array.isArray(product.categories) && product.categories.length > 0
      ? this.toNullableText(product.categories[0]?.name)
      : null;

    const thumbnailUrl = Array.isArray(product.images) && product.images.length > 0
      ? this.toNullableText(product.images[0]?.src)
      : null;

    const courseName = this.toNullableText(product.name) || `Product #${productId}`;
    const description = this.toNullableText(product.short_description) || this.toNullableText(product.description);
    const price = this.parseMoney(product.price);
    const originalPrice = this.parseMoney(product.regular_price, price);
    const status = this.normalizeCourseStatus(product.status);

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

  /**
   * Đảm bảo course tồn tại trong DB từ lineItem bằng cách fetch chi tiết product từ API
   * @param {object} client - Database client
   * @param {number} userId - ID của user
   * @param {object} lineItem - Line item từ order
   * @param {object} productCache - Cache object để lưu product đã fetch (tránh fetch lại)
   * @returns {Promise<{courseId: number|null, inserted: boolean, updated: boolean}>}
   */
  async ensureCourseFromLineItem(client, userId, lineItem = {}, productCache = {}) {
    const productId = this.getLineItemProductId(lineItem);
    if (!productId) return { courseId: null, inserted: false, updated: false };

    // Kiểm tra xem course đã tồn tại chưa
    const existing = await client.query(
      `SELECT id
       FROM courses
       WHERE id_user = $1
         AND course_code = $2
       LIMIT 1`,
      [userId, productId]
    );

    // Nếu đã tồn tại, trả về luôn
    if (existing.rows.length > 0) {
      return { courseId: existing.rows[0].id, inserted: false, updated: false };
    }

    // Fetch chi tiết product từ API (hoặc lấy từ cache)
    let product = productCache[productId];
    if (!product) {
      product = await this.fetchProductById(productId);
      if (product) {
        productCache[productId] = product; // Cache lại để tránh fetch lại
      }
    }

    // Nếu fetch được product, dùng upsertCourse để insert/update với thông tin đầy đủ
    if (product) {
      return await this.upsertCourse(client, userId, product);
    }

    // Fallback: nếu không fetch được product, tạo course với thông tin từ lineItem
    const courseName = this.toNullableText(lineItem.name) || `Product #${productId}`;
    const price = this.parseMoney(lineItem.price);
    const inserted = await client.query(
      `INSERT INTO courses (id_user, course_name, course_code, price, original_price, status)
       VALUES ($1, $2, $3, $4, $5, 'publish')
       RETURNING id`,
      [userId, courseName, productId, price, price]
    );

    return { courseId: inserted.rows[0].id, inserted: true, updated: false };
  }

  async refreshCustomerPurchaseStats(client, customerId) {
    const purchaseOrderStatusExpr = await this.resolvePurchaseOrderStatusExpr('cp');

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
    const totalSpent = this.parseMoney(stats.rows[0]?.total_spent, 0);
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

  async findClickAttribution(client, customerId, lineItem = {}, purchaseDate) {
    const productId = this.getLineItemProductId(lineItem);
    const productNameSlug = this.slugify(lineItem?.name || '');

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
      const eventData = this.parseJsonSafely(row.event_data, {});
      const targetUrl = this.normalizeUrl(eventData.targetUrl || eventData.url || '');
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

    if (!best) return null;
    return best;
  }

  async upsertPurchaseJourneyEvent(client, payload) {
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
      productName: this.toNullableText(productName),
      amount: this.parseMoney(amount),
      currency: this.toNullableText(currency) || 'VND',
      runId: Number.isFinite(Number(runId)) ? Number(runId) : null,
      emailMessageId: Number.isFinite(Number(emailMessageId)) ? Number(emailMessageId) : null,
      attributedFromClick: Boolean(attributedFromClick),
      clickAt: clickAt || null,
      clickUrl: this.toNullableText(clickUrl),
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

  async recalculateCampaignConversion(client, campaignId) {
    const campaignIdNum = parseInt(campaignId, 10);
    if (!Number.isFinite(campaignIdNum)) return;
    const purchaseOrderStatusExpr = await this.resolvePurchaseOrderStatusExpr('cp');

    const conversionResult = await client.query(
      `SELECT
          COUNT(DISTINCT id_customer)::INTEGER AS total_converted,
          COALESCE(SUM(amount), 0) AS total_revenue
       FROM customer_purchases cp
       WHERE cp.id_campaign = $1
         AND ${purchaseOrderStatusExpr} = 'completed'`,
      [campaignIdNum]
    );

    const totalConverted = parseInt(conversionResult.rows[0]?.total_converted || 0, 10);
    const totalRevenue = this.parseMoney(conversionResult.rows[0]?.total_revenue, 0);

    await client.query(
      `UPDATE campaigns
       SET
         total_converted = $1,
         total_revenue = $2,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [totalConverted, totalRevenue, campaignIdNum]
    );
  }

  async getCustomers(req, res) {
    return uknowReadService.getCustomers(this, req, res);
  }

  async getCourses(req, res) {
    return uknowReadService.getCourses(this, req, res);
  }

  async getOrders(req, res) {
    return uknowReadService.getOrders(this, req, res);
  }

  async syncCustomers(req, res) {
    return uknowSyncService.syncCustomers(this, req, res);
  }

  async syncCourses(req, res) {
    return uknowSyncService.syncCourses(this, req, res);
  }

  async syncOrders(req, res) {
    return uknowSyncService.syncOrders(this, req, res);
  }

  async getOrder(req, res) {
    return uknowReadService.getOrder(this, req, res);
  }

  async syncOrder(req, res) {
    return uknowSyncService.syncOrder(this, req, res);
  }

  /**
   * Đảm bảo cột uknow_status tồn tại trong bảng campaign_customers.
   * Chạy một lần rồi cache kết quả để tránh gọi lại.
   */
  async ensureUknowStatusColumn() {
    if (this._uknowStatusColumnEnsured) return;
    await db.query(
      `ALTER TABLE campaign_customers ADD COLUMN IF NOT EXISTS uknow_status VARCHAR(20) DEFAULT NULL`
    );
    this._uknowStatusColumnEnsured = true;
  }

  async syncCampaignUknow(req, res) {
    return uknowSyncService.syncCampaignUknow(this, req, res);
  }
}

export default new UknowController();
