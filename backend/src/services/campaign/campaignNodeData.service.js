import db from '../../config/database.js';
import campaignFlowService from './campaignFlow.service.js';
import campaignCustomerRepository from '../../repositories/campaign/campaignCustomer.repository.js';
import customerInterestedService from '../customer/customerInterested.service.js';
import customerHelperService from '../customer/customerHelper.service.js';
import outboundMessageQueueService, {
  OUTBOUND_MESSAGE_JOB_TYPES,
} from '../queue/outboundMessageQueue.service.js';

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
        const sheetUrl = config.sheetUrl;
        const sheetName = String(config.sheetName || 'Sheet1').trim() || 'Sheet1';
        const headerRowRaw = Number.parseInt(config.headerRow, 10);
        const headerRow = Number.isFinite(headerRowRaw) ? Math.max(1, headerRowRaw) : 1;
        const dataStartRowRaw = Number.parseInt(config.dataStartRow, 10);
        const dataStartRow = Number.isFinite(dataStartRowRaw) ? Math.max(1, dataStartRowRaw) : 2;

        if (!sheetUrl) {
          return [];
        }

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
            timeout: 15000,
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
            timeout: 15000,
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
            }
          }

          return customers;
        } catch (error) {
          console.error('[getCustomersFromDataNode] Lỗi đọc Google Sheet:', error.message);
          return [];
        }
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
   * @returns {Promise<{saved:number,updated:number,skipped:number}>}
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
   * @param {Array<object>} customers
   * @param {number} campaignId
   * @param {number} userId
   * @param {object} saveNode
   * @param {number|null} runId
   * @returns {Promise<{saved:number,updated:number,skipped:number}>}
   */
  async saveCustomersFromCampaignDirect(customers, campaignId, userId, saveNode, runId = null) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');

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

      let saved = 0;
      let updated = 0;
      let skipped = 0;

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

        let existingRow = null;
        if (email && phone) {
          let result = await client.query(
            'SELECT * FROM customers WHERE id_user = $1 AND LOWER(email) = $2 AND phone = $3 LIMIT 1',
            [userId, email, phone]
          );
          existingRow = result.rows[0] || null;
          if (!existingRow) {
            result = await client.query(
              'SELECT * FROM customers WHERE id_user = $1 AND LOWER(email) = $2 LIMIT 1',
              [userId, email]
            );
            existingRow = result.rows[0] || null;
          }
          if (!existingRow) {
            result = await client.query(
              'SELECT * FROM customers WHERE id_user = $1 AND phone = $2 LIMIT 1',
              [userId, phone]
            );
            existingRow = result.rows[0] || null;
          }
        } else if (email) {
          const result = await client.query(
            'SELECT * FROM customers WHERE id_user = $1 AND LOWER(email) = $2 LIMIT 1',
            [userId, email]
          );
          existingRow = result.rows[0] || null;
        } else if (phone) {
          const result = await client.query(
            'SELECT * FROM customers WHERE id_user = $1 AND phone = $2 LIMIT 1',
            [userId, phone]
          );
          existingRow = result.rows[0] || null;
        }

        if (existingRow?.id) {
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
          updated += 1;
          await campaignCustomerRepository.ensureCampaignParticipation(client, campaignId, existingRow.id, runId);
        } else {
          const insertResult = await client.query(
            `INSERT INTO customers (id_user, email, phone, full_name, gender, customer_source, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id`,
            [userId, email, phone, fullName, gender, customerSource, notes]
          );
          const customerId = insertResult.rows[0]?.id;
          saved += 1;
          if (customerId) {
            await campaignCustomerRepository.ensureCampaignParticipation(client, campaignId, customerId, runId);
          }
        }
      }

      await client.query('COMMIT');
      return { saved, updated, skipped };
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
