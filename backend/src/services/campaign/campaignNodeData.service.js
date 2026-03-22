import db from '../../config/database.js';
import campaignFlowService from './campaignFlow.service.js';
import campaignCustomerRepository from '../../repositories/campaign/campaignCustomer.repository.js';
import customerInterestedService from '../customer/customerInterested.service.js';
import customerHelperService from '../customer/customerHelper.service.js';
import outboundMessageQueueService, {
  OUTBOUND_MESSAGE_JOB_TYPES,
} from '../queue/outboundMessageQueue.service.js';
import {
  getReadSheetBullmqWaitTimeoutMs,
  getReadSheetFetchTimeoutMs,
  getReadSheetParseYieldEveryRows,
  shouldReadSheetUseBullMq,
} from '../../utils/readSheetConfig.util.js';

const decodeJsQuotedString = (value = '') => {
  try {
    return JSON.parse(`"${String(value || '').replace(/"/g, '\\"')}"`);
  } catch {
    return String(value || '');
  }
};

/**
 * Resolve selection mode with backward compatibility from legacy selected IDs.
 *
 * @param {string|undefined|null} mode
 * @param {Array<any>} selectedIds
 * @returns {'all'|'fixed'|'all_exclude'}
 */
const resolveSelectionMode = (mode, selectedIds = []) => {
  const normalized = String(mode || '').trim().toLowerCase();
  if (normalized === 'fixed' || normalized === 'all_exclude') {
    return normalized;
  }
  return Array.isArray(selectedIds) && selectedIds.length > 0 ? 'fixed' : 'all';
};

/**
 * Ghi log ngắn gọn để theo dõi API đang được gọi trong campaign run.
 *
 * Luồng hoạt động:
 * 1. Nhận tên nguồn API và endpoint (hoặc mô tả lời gọi).
 * 2. Chuẩn hóa chuỗi để tránh log rỗng.
 * 3. In đúng 1 dòng log phục vụ theo dõi realtime.
 *
 * @param {string} source Tên nguồn API (ví dụ: google_sheet, uknow_api).
 * @param {string} endpoint Endpoint/URL hoặc tên lời gọi service.
 * @returns {void}
 */
const logApiCall = (source, endpoint) => {
  const normalizedSource = String(source || '').trim() || 'unknown_source';
  const normalizedEndpoint = String(endpoint || '').trim() || 'unknown_endpoint';
  console.log(`[CampaignRun][API] ${normalizedSource} -> ${normalizedEndpoint}`);
};

class CampaignNodeDataService {
  /**
   * Load items from a data node.
   *
   * @param {object} node
   * @param {number} userId
   * @param {Array<object>} allNodes
   * @returns {Promise<Array>}
   */
  async getCustomersFromDataNode(node, userId, allNodes = []) {
    const config = node.config || {};
    const subtype = node.node_subtype;

    switch (subtype) {
      case 'read_interested_customers':
      case 'interested_customers': {
        const interestedLimit = Number.isFinite(parseInt(config.interestedLimit, 10))
          ? parseInt(config.interestedLimit, 10)
          : 1000;
        const limit = Math.max(1, Math.min(interestedLimit, 5000));
        const selectedCourseIds = (Array.isArray(config.interestedCourseIds) ? config.interestedCourseIds : [])
          .map((v) => parseInt(v, 10))
          .filter((v, idx, arr) => Number.isFinite(v) && arr.indexOf(v) === idx);
        const selectedCourseStatuses = (Array.isArray(config.interestedCourseStatuses) ? config.interestedCourseStatuses : [])
          .map((v) => String(v || '').trim().toLowerCase())
          .filter((v, idx, arr) => v && arr.indexOf(v) === idx);
        const courseQuery = String(config.interestedCourseQuery || '').trim();
        const customerType = String(config.interestedCustomerType || 'interested').trim();
        const dataSource = String(config.interestedDataSource || 'database').trim().toLowerCase();
        const selectedCustomerIds = (Array.isArray(config.interestedSelectedCustomerIds) ? config.interestedSelectedCustomerIds : [])
          .map((v) => parseInt(v, 10))
          .filter((v, idx, arr) => Number.isFinite(v) && arr.indexOf(v) === idx);
        const excludedCustomerIds = (Array.isArray(config.interestedExcludedCustomerIds) ? config.interestedExcludedCustomerIds : [])
          .map((v) => parseInt(v, 10))
          .filter((v, idx, arr) => Number.isFinite(v) && arr.indexOf(v) === idx);
        const selectionMode = resolveSelectionMode(config.interestedSelectionMode, selectedCustomerIds);
        let interestedData;
        if (dataSource === 'api') {
          logApiCall('uknow_api', 'customerInterestedService.getInterestedCustomersFromUknowApi');
          interestedData = await customerInterestedService.getInterestedCustomersFromUknowApi({
            userId,
            limit,
            courseIds: selectedCourseIds.join(','),
            courseStatuses: selectedCourseStatuses.join(','),
            courseQuery,
            customerType,
          });
        } else {
          const purchaseOrderStatusExpr = await customerHelperService.resolvePurchaseOrderStatusExpr('cp');
          interestedData = await customerInterestedService.getInterestedCustomersWithCourses({
            userId,
            /**
             * Chạy node dữ liệu khách trong campaign flow luôn lấy theo phạm vi toàn tài khoản.
             * Mục tiêu là để chế độ continuous có thể bắt thêm khách mới từ database
             * theo đúng bộ lọc khóa học/trạng thái/loại trừ, thay vì bị chặn theo id_campaign cũ.
             */
            campaignId: null,
            limit,
            courseIds: selectedCourseIds.join(','),
            courseStatuses: selectedCourseStatuses.join(','),
            courseQuery,
            customerType,
            purchaseOrderStatusExpr,
          });
        }

        let items = Array.isArray(interestedData?.items) ? interestedData.items : [];
        if (selectionMode === 'fixed' && selectedCustomerIds.length > 0) {
          items = items.filter((row) => selectedCustomerIds.includes(parseInt(row.customerId, 10)));
        } else if (selectionMode === 'all_exclude' && excludedCustomerIds.length > 0) {
          const excludedSet = new Set(excludedCustomerIds);
          items = items.filter((row) => !excludedSet.has(parseInt(row.customerId, 10)));
        }
        return items;
      }

      case 'read_sheet':
      case 'google_sheet': {
        if (!config.sheetUrl) {
          return [];
        }
        const queueFeatureOn = outboundMessageQueueService.isQueueFeatureEnabled();
        if (shouldReadSheetUseBullMq(queueFeatureOn)) {
          return outboundMessageQueueService.enqueueAndWait({
            type: OUTBOUND_MESSAGE_JOB_TYPES.GOOGLE_SHEET_FETCH,
            payload: { config },
            waitTimeoutMs: getReadSheetBullmqWaitTimeoutMs(),
          });
        }
        return this.fetchGoogleSheetCustomersFromConfig(config);
      }

      case 'read_courses_db': {
        const selectedCourseIds = Array.isArray(config.coursesDbSelectedIds)
          ? config.coursesDbSelectedIds.map((id) => parseInt(id, 10)).filter((id) => Number.isFinite(id))
          : [];

        if (selectedCourseIds.length === 0) {
          return [];
        }

        const rawLimit = Number.isFinite(parseInt(config.coursesDbLimit, 10))
          ? parseInt(config.coursesDbLimit, 10)
          : 1000;
        const limit = Math.max(1, Math.min(rawLimit, 5000));
        const searchTerm = String(config.coursesDbSearchTerm || '').trim();
        const selectedStatuses = (Array.isArray(config.coursesDbStatuses) ? config.coursesDbStatuses : [])
          .map((item) => String(item || '').trim().toLowerCase())
          .filter((item, idx, arr) => item && arr.indexOf(item) === idx);

        const queryParams = [selectedCourseIds];
        let paramIdx = 2;
        let whereClause = 'WHERE c.id = ANY($1)';
        if (searchTerm) {
          whereClause += ` AND (c.course_name ILIKE $${paramIdx} OR c.course_code ILIKE $${paramIdx})`;
          queryParams.push(`%${searchTerm}%`);
          paramIdx += 1;
        }
        if (selectedStatuses.length > 0) {
          whereClause += ` AND c.status = ANY($${paramIdx})`;
          queryParams.push(selectedStatuses);
          paramIdx += 1;
        }
        queryParams.push(limit);

        const courseResult = await db.query(
          `SELECT
             c.id,
             c.course_code AS "courseCode",
             c.course_name AS "courseName",
             c.price,
             c.original_price AS "originalPrice",
             c.status,
             c.description,
             c.category,
             c.thumbnail_url AS "thumbnailUrl",
             c.created_at AS "createdAt",
             c.updated_at AS "updatedAt"
           FROM courses c
           ${whereClause}
           ORDER BY c.id DESC
           LIMIT $${paramIdx}`,
          queryParams
        );

        return courseResult.rows;
      }

      case 'manual_upload':
        return [];

      case 'save_customer':
      case 'customer_segment': {
        const sourceNodeId = config.saveCustomerNodeId;
        if (!sourceNodeId) {
          return [];
        }
        const sourceNode = allNodes.find((n) => String(n.id) === String(sourceNodeId));
        if (!sourceNode) {
          return [];
        }
        return this.getCustomersFromDataNode(sourceNode, userId, allNodes);
      }

      default:
        return [];
    }
  }

  /**
   * Tải CSV công khai từ Google Sheet, parse và map từng dòng thành object theo header.
   * Dùng chung cho luồng inline và worker BullMQ `GOOGLE_SHEET_FETCH`.
   *
   * Luồng hoạt động:
   * 1. Kiểm tra URL, lấy spreadsheetId, gọi htmlview để xác nhận tên sheet tồn tại.
   * 2. Tải CSV qua gviz (timeout theo `READ_SHEET_FETCH_TIMEOUT_MS`).
   * 3. Parse Papa, map dòng dữ liệu; cứ mỗi N dòng đã ghi nhận thì nhường event loop để tránh block lâu.
   *
   * @param {object} config cấu hình node read_sheet (sheetUrl, sheetName, headerRow, dataStartRow, ...)
   * @returns {Promise<Array<object>>}
   */
  async fetchGoogleSheetCustomersFromConfig(config) {
    const sheetUrl = config?.sheetUrl;
    const sheetName = String(config?.sheetName || 'Sheet1').trim() || 'Sheet1';
    const headerRowRaw = Number.parseInt(config?.headerRow, 10);
    const headerRow = Number.isFinite(headerRowRaw) ? Math.max(1, headerRowRaw) : 1;
    const dataStartRowRaw = Number.parseInt(config?.dataStartRow, 10);
    const dataStartRow = Number.isFinite(dataStartRowRaw) ? Math.max(1, dataStartRowRaw) : 2;

    if (!sheetUrl) {
      return [];
    }

    const fetchTimeoutMs = getReadSheetFetchTimeoutMs();
    const yieldEvery = getReadSheetParseYieldEveryRows();

    try {
      const spreadsheetIdMatch = sheetUrl.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
      if (!spreadsheetIdMatch) {
        return [];
      }

      const spreadsheetId = spreadsheetIdMatch[1];
      const csvUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
      const worksheetHtmlViewUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/htmlview`;

      const axios = (await import('axios')).default;
      const Papa = (await import('papaparse')).default;
      logApiCall('google_sheet', worksheetHtmlViewUrl);
      const validationResponse = await axios.get(worksheetHtmlViewUrl, {
        responseType: 'text',
        timeout: fetchTimeoutMs,
        validateStatus: () => true,
      });
      if (validationResponse.status >= 400) {
        return [];
      }
      const html = String(validationResponse.data || '');
      const worksheetNames = [];
      const regex = /items\.push\(\{name:\s*"((?:\\.|[^"\\])*)"/g;
      let match;
      while ((match = regex.exec(html))) {
        const decoded = decodeJsQuotedString(match[1]).trim();
        if (decoded) worksheetNames.push(decoded);
      }
      const dedupedWorksheetNames = Array.from(new Set(worksheetNames));
      if (!dedupedWorksheetNames.includes(sheetName)) {
        return [];
      }

      logApiCall('google_sheet', csvUrl);
      const response = await axios.get(csvUrl, {
        responseType: 'text',
        timeout: fetchTimeoutMs,
        validateStatus: () => true,
      });
      if (response.status >= 400) {
        return [];
      }
      const contentType = String(response.headers?.['content-type'] || '').toLowerCase();
      const bodyText = typeof response.data === 'string' ? response.data : '';
      const isHtml = contentType.includes('text/html') || bodyText.trim().startsWith('<!DOCTYPE html');
      if (isHtml) {
        return [];
      }

      const parsed = Papa.parse(bodyText, { skipEmptyLines: true });
      if (parsed.errors && parsed.errors.length) {
        return [];
      }

      const rows = Array.isArray(parsed.data) ? parsed.data : [];
      if (!rows.length) {
        return [];
      }

      const headerIdx = Math.min(rows.length - 1, Math.max(0, headerRow - 1));
      const headerRowData = Array.isArray(rows[headerIdx]) ? rows[headerIdx] : [];
      const headerColumns = headerRowData.map((cell) => String(cell ?? '').trim());

      const columnIndexMap = {};
      headerColumns.forEach((colName, idx) => {
        if (colName) columnIndexMap[colName] = idx;
      });
      const namedHeaderIndices = Object.values(columnIndexMap).sort((a, b) => a - b);

      const dataStartIdx = Math.min(rows.length, Math.max(dataStartRow - 1, headerIdx + 1));
      const customers = [];
      let acceptedRowCount = 0;

      for (let rowIdx = dataStartIdx; rowIdx < rows.length; rowIdx += 1) {
        const row = rows[rowIdx];
        if (!Array.isArray(row) || !row.length) continue;

        /**
         * Đồng bộ với luồng preview ở Builder:
         * - Luôn đọc theo các cột header thực tế của sheet hiện tại.
         * - Gắn `row_number` để UI/flow phía sau có thể trace ngược dòng gốc.
         * - Chỉ bỏ qua dòng trống hoàn toàn.
         */
        const customer = { row_number: rowIdx + 1 };
        let hasAnyValue = false;
        namedHeaderIndices.forEach((colIdx) => {
          const headerName = String(headerRowData[colIdx] ?? '').trim();
          if (!headerName) return;
          const rawValue = String(row[colIdx] ?? '').trim();
          customer[headerName] = rawValue;
          if (rawValue) hasAnyValue = true;
        });

        if (hasAnyValue) {
          customers.push(customer);
          acceptedRowCount += 1;
          // Nhường event loop theo lô để sheet ~10k dòng không block một chunk quá dài
          if (acceptedRowCount % yieldEvery === 0) {
            await new Promise((resolve) => setImmediate(resolve));
          }
        }
      }

      return customers;
    } catch (error) {
      console.error('[fetchGoogleSheetCustomersFromConfig] Lỗi đọc Google Sheet:', error.message);
      return [];
    }
  }

  /**
   * Đẩy tác vụ lưu khách hàng của node `save_customer` vào BullMQ.
   *
   * Luồng hoạt động:
   * 1. Chuẩn hóa payload để worker có đủ context lưu dữ liệu.
   * 2. Enqueue job `customer.save` và chờ kết quả xử lý cuối cùng.
   * 3. Fallback inline tự động nếu BullMQ/Redis tạm thời chưa sẵn sàng.
   *
   * @param {Array<object>} customers danh sách dữ liệu đầu vào từ node nguồn
   * @param {number} campaignId id campaign đang chạy
   * @param {number} userId id người dùng sở hữu campaign
   * @param {object} saveNode cấu hình node save_customer
   * @param {number|null} runId id phiên chạy campaign
   * @returns {Promise<{saved:number,updated:number,skipped:number,unchanged:number}>}
   */
  async saveCustomersFromCampaign(customers, campaignId, userId, saveNode, runId = null) {
    return outboundMessageQueueService.enqueueAndWait({
      type: OUTBOUND_MESSAGE_JOB_TYPES.CUSTOMER_SAVE,
      payload: {
        customers,
        campaignId,
        userId,
        saveNode,
        runId,
      },
    });
  }

  /**
   * Lưu khách hàng trực tiếp vào database với cơ chế dedupe + upsert.
   * Hàm này được worker BullMQ gọi để xử lý dữ liệu thật của một job.
   *
   * Luồng hoạt động (tối ưu timeout):
   * 1. Mở transaction và `SET LOCAL statement_timeout` (mặc định 10 phút, xem env bên dưới).
   * 2. Preload một lần các bản ghi `customers` của `id_user` khớp email/phone trong batch (giảm N+1).
   * 3. Với từng khách: tra map bộ nhớ (cùng thứ tự ưu tiên trùng như SELECT cũ), UPDATE/INSERT, cập nhật map nếu cần.
   *
   * Biến môi trường: `SAVE_CUSTOMERS_STATEMENT_TIMEOUT_MS` — thời gian tối đa mỗi câu lệnh SQL trong transaction (ms).
   * Đặt `0` để tắt giới hạn (chỉ nên dùng khi tin tưởng batch). Mặc định khi không khai báo: 600000.
   *
   * @param {Array<object>} customers
   * @param {number} campaignId
   * @param {number} userId
   * @param {object} saveNode
   * @param {number|null} runId
   * @returns {Promise<{saved:number,updated:number,skipped:number,unchanged:number}>}
   */
  async saveCustomersFromCampaignDirect(customers, campaignId, userId, saveNode, runId = null) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      /**
       * Pool mặc định đặt `statement_timeout` 30s (`database.js`), trong khi batch lưu khách
       * có thể kéo dài (nhiều UPDATE/INSERT + participation). Nới hạn **chỉ trong transaction này**
       * để tránh lỗi 57014; có thể cấu hình bằng `SAVE_CUSTOMERS_STATEMENT_TIMEOUT_MS` (ms), 0 = tắt giới hạn.
       */
      const saveCustomersStmtTimeoutMs = (() => {
        const raw = process.env.SAVE_CUSTOMERS_STATEMENT_TIMEOUT_MS;
        if (raw === undefined || raw === '') return 600_000;
        const n = Number.parseInt(String(raw), 10);
        return Number.isFinite(n) && n >= 0 ? n : 600_000;
      })();
      if (saveCustomersStmtTimeoutMs > 0) {
        await client.query(`SET LOCAL statement_timeout = ${saveCustomersStmtTimeoutMs}`);
      } else {
        await client.query('SET LOCAL statement_timeout = 0');
      }

      const config = saveNode?.config || {};
      const fieldMap = config.saveCustomerFieldMap || {};
      const normalizeValue = (value) => {
        if (value == null) return null;
        if (typeof value === 'string') {
          const trimmed = value.trim();
          return trimmed === '' ? null : trimmed;
        }
        return value;
      };
      const normalizeEmail = (value) => {
        const normalized = normalizeValue(value);
        return normalized ? String(normalized).toLowerCase() : null;
      };
      /** Chuẩn hóa chuỗi để so sánh với cột text trong DB (trim, rỗng → null). */
      const normText = (value) => {
        if (value == null) return null;
        const s = String(value).trim();
        return s === '' ? null : s;
      };
      /** Email khi so sánh: luôn lowercase. */
      const normEmailKey = (value) => {
        const t = normText(value);
        return t ? t.toLowerCase() : null;
      };
      /** So sánh gender / customer_source không phân biệt hoa thường. */
      const normLower = (value) => {
        const t = normText(value);
        return t ? t.toLowerCase() : null;
      };
      /**
       * Trùng khớp trạng thái sau UPDATE (cùng semantics COALESCE như câu SQL) với dữ liệu hiện có.
       * Nếu true thì không cần chạy UPDATE — tránh cập nhật `updated_at` oan.
       *
       * @param {object} row bản ghi `customers` từ DB (snake_case)
       * @param {object} incoming các trường đã map từ campaign (đã chuẩn hóa)
       */
      const isCustomerRowUnchanged = (row, incoming) => {
        const {
          email: inEmail,
          phone: inPhone,
          fullName: inFullName,
          gender: inGender,
          customerSource: inCustomerSource,
          notes: inNotes,
        } = incoming;
        const effEmail = inEmail != null ? inEmail : normEmailKey(row.email);
        const effPhone = inPhone != null ? inPhone : normText(row.phone);
        const effFullName = inFullName != null ? inFullName : normText(row.full_name);
        const effGender = inGender != null ? normLower(inGender) : normLower(row.gender);
        const effSource = normLower(inCustomerSource);
        const effNotes = inNotes != null ? normText(inNotes) : normText(row.notes);

        return (
          effEmail === normEmailKey(row.email)
          && effPhone === normText(row.phone)
          && effFullName === normText(row.full_name)
          && effGender === normLower(row.gender)
          && effSource === normLower(row.customer_source)
          && effNotes === normText(row.notes)
        );
      };
      const pairKey = (email, phone) => `${String(email || '')}|${String(phone || '')}`;

      const dedupedMap = new Map();
      for (const customerData of customers || []) {
        const mapped = {
          email: normalizeEmail(campaignFlowService.getFieldValue(customerData, fieldMap.email)),
          phone: normalizeValue(campaignFlowService.getFieldValue(customerData, fieldMap.phone)),
          fullName: normalizeValue(campaignFlowService.getFieldValue(customerData, fieldMap.fullName)),
          gender: normalizeValue(campaignFlowService.getFieldValue(customerData, fieldMap.gender)),
          customerSource: normalizeValue(campaignFlowService.getFieldValue(customerData, fieldMap.customerSource)) || 'campaign',
          notes: normalizeValue(campaignFlowService.getFieldValue(customerData, fieldMap.notes)),
        };
        if (!mapped.email && !mapped.phone) continue;
        const key = pairKey(mapped.email, mapped.phone);
        const prev = dedupedMap.get(key) || {};
        dedupedMap.set(key, {
          email: mapped.email || prev.email || null,
          phone: mapped.phone || prev.phone || null,
          fullName: mapped.fullName || prev.fullName || null,
          gender: mapped.gender || prev.gender || null,
          customerSource: mapped.customerSource || prev.customerSource || 'campaign',
          notes: mapped.notes || prev.notes || null,
        });
      }
      const normalizedCustomers = Array.from(dedupedMap.values());

      // --- Preload: một (hoặc vài) query thay cho N+1 SELECT; map bộ nhớ giữ đúng thứ tự ưu tiên trùng như cũ ---
      const emailSet = new Set();
      const phoneSet = new Set();
      for (const c of normalizedCustomers) {
        if (c.email) emailSet.add(c.email);
        if (c.phone) phoneSet.add(c.phone);
      }
      const preloadEmails = Array.from(emailSet);
      const preloadPhones = Array.from(phoneSet);

      const byEmailPhone = new Map();
      const byEmail = new Map();
      const byPhone = new Map();

      /** Gỡ một bản ghi khỏi các map tra cứu (trước khi đổi email/phone hoặc trùng lặp key). */
      const unindexCustomerRow = (row) => {
        const e = normEmailKey(row.email);
        const p = normText(row.phone);
        if (e && p) byEmailPhone.delete(pairKey(e, p));
        if (e && byEmail.get(e) === row) byEmail.delete(e);
        if (p && byPhone.get(p) === row) byPhone.delete(p);
      };

      /** Đưa bản ghi vào map; mỗi key chỉ giữ bản đầu tiên (tương đương LIMIT 1 không ORDER BY). */
      const indexCustomerRow = (row) => {
        const e = normEmailKey(row.email);
        const p = normText(row.phone);
        if (e && p) {
          const k = pairKey(e, p);
          if (!byEmailPhone.has(k)) byEmailPhone.set(k, row);
        }
        if (e && !byEmail.has(e)) byEmail.set(e, row);
        if (p && !byPhone.has(p)) byPhone.set(p, row);
      };

      /**
       * Tìm bản ghi hiện có giống chuỗi SELECT cũ: ưu tiên khớp email+phone, rồi email, rồi phone.
       *
       * @param {string|null} email
       * @param {string|null} phone
       * @returns {object|null}
       */
      const resolveExistingCustomerRow = (email, phone) => {
        if (email && phone) {
          const exact = byEmailPhone.get(pairKey(email, phone));
          if (exact) return exact;
          const byE = byEmail.get(email);
          if (byE) return byE;
          const byP = byPhone.get(phone);
          if (byP) return byP;
          return null;
        }
        if (email) return byEmail.get(email) || null;
        if (phone) return byPhone.get(phone) || null;
        return null;
      };

      if (preloadEmails.length > 0 || preloadPhones.length > 0) {
        const parts = [];
        const params = [userId];
        let pi = 2;
        if (preloadEmails.length > 0) {
          parts.push(`LOWER(email) = ANY($${pi}::text[])`);
          params.push(preloadEmails);
          pi += 1;
        }
        if (preloadPhones.length > 0) {
          parts.push(`phone = ANY($${pi}::text[])`);
          params.push(preloadPhones);
          pi += 1;
        }
        const preloadSql = `SELECT * FROM customers WHERE id_user = $1 AND (${parts.join(' OR ')})`;
        const { rows: preloadRows } = await client.query(preloadSql, params);
        for (const row of preloadRows) {
          indexCustomerRow(row);
        }
      }

      let saved = 0;
      let updated = 0;
      let skipped = 0;
      let unchanged = 0;

      for (const customerData of normalizedCustomers) {
        const email = customerData.email;
        const phone = customerData.phone;
        const fullName = customerData.fullName;
        const gender = customerData.gender;
        const customerSource = customerData.customerSource || 'campaign';
        const notes = customerData.notes;

        if (!email && !phone) {
          skipped += 1;
          continue;
        }

        const existingRow = resolveExistingCustomerRow(email, phone);

        if (existingRow?.id) {
          const incomingForCompare = {
            email,
            phone,
            fullName,
            gender,
            customerSource,
            notes,
          };
          if (isCustomerRowUnchanged(existingRow, incomingForCompare)) {
            unchanged += 1;
          } else {
            unindexCustomerRow(existingRow);
            await client.query(
              `UPDATE customers SET
              email = COALESCE($1, email),
              phone = COALESCE($2, phone),
              full_name = COALESCE($3, full_name),
              gender = COALESCE($4, gender),
              customer_source = COALESCE($5, customer_source),
              notes = COALESCE($6, notes),
              updated_at = CURRENT_TIMESTAMP
             WHERE id = $7 AND id_user = $8`,
              [email, phone, fullName, gender, customerSource, notes, existingRow.id, userId]
            );
            // Đồng bộ object + map để lượt sau trong cùng transaction thấy đúng COALESCE như DB
            existingRow.email = email != null ? email : existingRow.email;
            existingRow.phone = phone != null ? phone : existingRow.phone;
            existingRow.full_name = fullName != null ? fullName : existingRow.full_name;
            existingRow.gender = gender != null ? gender : existingRow.gender;
            existingRow.customer_source = customerSource != null ? customerSource : existingRow.customer_source;
            existingRow.notes = notes != null ? notes : existingRow.notes;
            indexCustomerRow(existingRow);
            updated += 1;
          }
          await campaignCustomerRepository.ensureCampaignParticipation(client, campaignId, existingRow.id, runId);
        } else {
          const insertResult = await client.query(
            `INSERT INTO customers (id_user, email, phone, full_name, gender, customer_source, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [userId, email, phone, fullName, gender, customerSource, notes]
          );
          const insertedRow = insertResult.rows[0];
          saved += 1;
          if (insertedRow?.id) {
            indexCustomerRow(insertedRow);
            await campaignCustomerRepository.ensureCampaignParticipation(client, campaignId, insertedRow.id, runId);
          }
        }
      }

      await client.query('COMMIT');
      return { saved, updated, skipped, unchanged };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[saveCustomersFromCampaignDirect] Error:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}

export default new CampaignNodeDataService();
