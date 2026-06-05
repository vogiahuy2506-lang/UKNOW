import axios from 'axios';
import founderaiReadService from '../services/founderai/founderaiRead.service.js';
import founderaiSyncService from '../services/founderai/founderaiSync.service.js';
import founderaiDataService from '../services/founderai/founderaiData.service.js';
import founderaiSchemaRepository from '../repositories/founderai/founderaiSchema.repository.js';

class FounderAIController {
  constructor() {
    this.baseUrl = process.env.UKNOW_API_URL || 'https://founderai.biz/wp-json';
    this.consumerKey = process.env.UKNOW_CONSUMER_KEY;
    this.consumerSecret = process.env.UKNOW_CONSUMER_SECRET;
  }

  ensureCredentials() {
    if (!this.consumerKey || !this.consumerSecret) {
      throw new Error('Missing Founder AI API credentials');
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
        this.purchaseOrderStatusColumnExists = await founderaiSchemaRepository.hasPurchaseOrderStatusColumn();
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
    return founderaiDataService.findCustomer({ ctx: this, client, userId, email, phone });
  }

  async upsertCustomer(client, userId, payload = {}) {
    return founderaiDataService.upsertCustomer({ ctx: this, client, userId, payload });
  }

  /**
   * Fetch chi tiết product từ Founder AI WooCommerce API
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
    return founderaiDataService.upsertCourse({ ctx: this, client, userId, product });
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
    return founderaiDataService.ensureCourseFromLineItem({ ctx: this, client, userId, lineItem, productCache });
  }

  async refreshCustomerPurchaseStats(client, customerId) {
    return founderaiDataService.refreshCustomerPurchaseStats({ ctx: this, client, customerId });
  }

  async findClickAttribution(client, customerId, lineItem = {}, purchaseDate) {
    return founderaiDataService.findClickAttribution({ ctx: this, client, customerId, lineItem, purchaseDate });
  }

  async upsertPurchaseJourneyEvent(client, payload) {
    return founderaiDataService.upsertPurchaseJourneyEvent({ ctx: this, client, payload });
  }

  async recalculateCampaignConversion(client, campaignId) {
    return founderaiDataService.recalculateCampaignConversion({ ctx: this, client, campaignId });
  }

  async getCustomers(req, res) {
    try {
      const { page = 1, per_page: perPage = 100 } = req.query;
      const data = await founderaiReadService.getCustomers({ ctx: this, page, perPage });
      return res.json({ success: true, data });
    } catch (error) {
      console.error('Get Founder AI customers error:', error.response?.data || error.message);
      return res.status(500).json({ success: false, message: 'Khong the lay du lieu khach hang tu Founder AI' });
    }
  }

  async getCourses(req, res) {
    try {
      const { page = 1, per_page: perPage = 100, status = 'any' } = req.query;
      const data = await founderaiReadService.getCourses({ ctx: this, page, perPage, status });
      return res.json({ success: true, data });
    } catch (error) {
      console.error('Get Founder AI courses error:', error.response?.data || error.message);
      return res.status(500).json({ success: false, message: 'Khong the lay du lieu khoa hoc tu Founder AI' });
    }
  }

  async getOrders(req, res) {
    try {
      const { page = 1, per_page: perPage = 100, status = 'completed,on-hold' } = req.query;
      const data = await founderaiReadService.getOrders({ ctx: this, page, perPage, status });
      return res.json({ success: true, data });
    } catch (error) {
      console.error('Get Founder AI orders error:', error.response?.data || error.message);
      return res.status(500).json({ success: false, message: 'Khong the lay du lieu don hang tu Founder AI' });
    }
  }

  async syncCustomers(req, res) {
    try {
      const userId = req.user.id;
      const result = await founderaiSyncService.syncCustomers({ ctx: this, userId });
      return res.json({ success: true, ...result });
    } catch (error) {
      if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
      console.error('Sync Founder AI customers error:', error.message);
      return res.status(500).json({ success: false, message: 'Khong the dong bo khach hang tu Founder AI' });
    }
  }

  async syncCourses(req, res) {
    try {
      const userId = req.user.id;
      const result = await founderaiSyncService.syncCourses({ ctx: this, userId });
      return res.json({ success: true, ...result });
    } catch (error) {
      if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
      console.error('Sync Founder AI courses error:', error.message);
      return res.status(500).json({ success: false, message: 'Khong the dong bo khoa hoc tu Founder AI' });
    }
  }

  async syncOrders(req, res) {
    try {
      const userId = req.user.id;
      const result = await founderaiSyncService.syncOrders({
        ctx: this,
        userId,
        status: req.query?.status,
        onlyMissing: req.query?.onlyMissing,
        sources: req.query?.sources,
        days: req.query?.days,
        startDate: req.query?.startDate,
        endDate: req.query?.endDate,
      });
      return res.json({ success: true, ...result });
    } catch (error) {
      if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
      console.error('Sync Founder AI orders error:', error.message);
      return res.status(500).json({ success: false, message: 'Khong the dong bo don hang tu Founder AI' });
    }
  }

  async getOrder(req, res) {
    try {
      const { orderId } = req.params;
      const data = await founderaiReadService.getOrder({ ctx: this, orderId });
      return res.json({ success: true, data });
    } catch (error) {
      if (error.statusCode === 400) return res.status(400).json({ success: false, message: error.message });
      if (error.response?.status === 404) return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });
      console.error('Get Founder AI order error:', error.response?.data || error.message);
      return res.status(500).json({ success: false, message: 'Không thể lấy thông tin đơn hàng từ Founder AI' });
    }
  }

  async syncOrder(req, res) {
    try {
      const userId = req.user.id;
      const { orderId } = req.params;
      const result = await founderaiSyncService.syncOrder({ ctx: this, userId, orderId });
      return res.json({ success: true, ...result });
    } catch (error) {
      if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
      console.error('Sync Founder AI single order error:', error.message);
      return res.status(500).json({ success: false, message: 'Không thể đồng bộ đơn hàng từ Founder AI' });
    }
  }

  /**
   * Đảm bảo cột uknow_status tồn tại trong bảng campaign_customers.
   * Chạy một lần rồi cache kết quả để tránh gọi lại.
   */
  async ensureUknowStatusColumn() {
    if (this._uknowStatusColumnEnsured) return;
    await founderaiSchemaRepository.ensureUknowStatusColumn();
    this._uknowStatusColumnEnsured = true;
  }

  async syncCampaignUknow(req, res) {
    try {
      const userId = req.user.id;
      const campaignId = req.params.id;
      const result = await founderaiSyncService.syncCampaignUknow({ ctx: this, userId, campaignId });
      return res.json({ success: true, ...result });
    } catch (error) {
      if (error.statusCode) return res.status(error.statusCode).json({ success: false, message: error.message });
      console.error('Lỗi đồng bộ Founder AI chiến dịch:', error.message);
      return res.status(500).json({ success: false, message: 'Lỗi khi đồng bộ từ Founder AI' });
    }
  }
}

export default new FounderAIController();
