import db from '../../config/database.js';

class CampaignExecutionLogService {
  /**
   * Parse execution payload về object để có thể merge an toàn.
   *
   * @param {unknown} payload dữ liệu execution_data từ DB hoặc runtime
   * @returns {object|null} object đã parse hoặc null nếu không hợp lệ
   */
  parseExecutionPayload(payload) {
    if (!payload) return null;
    if (typeof payload === 'object') return payload;
    if (typeof payload !== 'string') return null;
    try {
      return JSON.parse(payload);
    } catch {
      return null;
    }
  }

  /**
   * Chuẩn hóa dữ liệu về dạng ổn định để so sánh chống trùng.
   *
   * @param {unknown} value dữ liệu bất kỳ cần chuẩn hóa
   * @returns {unknown} dữ liệu đã chuẩn hóa thứ tự key
   */
  canonicalizeComparableValue(value) {
    if (Array.isArray(value)) {
      return value.map((item) => this.canonicalizeComparableValue(item));
    }
    if (value && typeof value === 'object') {
      return Object.keys(value)
        .sort()
        .reduce((acc, key) => {
          acc[key] = this.canonicalizeComparableValue(value[key]);
          return acc;
        }, {});
    }
    return value;
  }

  /**
   * Tạo fingerprint ổn định cho item để dedupe dữ liệu.
   *
   * @param {unknown} item một item trong mảng payload
   * @returns {string} chuỗi fingerprint dùng để so sánh
   */
  stringifyComparableItem(item) {
    if (item == null) return '';
    if (typeof item !== 'object') return String(item);
    try {
      return JSON.stringify(this.canonicalizeComparableValue(item));
    } catch {
      return String(item);
    }
  }

  /**
   * Merge mảng items giữa dữ liệu cũ và mới.
   *
   * Luồng hoạt động:
   * 1. Giữ nguyên toàn bộ item cũ đã có trong DB.
   * 2. Chỉ thêm item mới nếu fingerprint chưa xuất hiện.
   * 3. Bỏ qua item bị trùng để tránh lặp khi ghi log nhiều lần cho cùng node trong một run.
   *
   * @param {Array<unknown>} existingItems item đã có trong DB
   * @param {Array<unknown>} incomingItems item mới từ lần update hiện tại
   * @returns {Array<unknown>} mảng item sau khi merge
   */
  mergeExecutionItems(existingItems = [], incomingItems = []) {
    const sourceExisting = Array.isArray(existingItems) ? existingItems : [];
    const sourceIncoming = Array.isArray(incomingItems) ? incomingItems : [];

    if (sourceIncoming.length === 0) return sourceExisting;
    if (sourceExisting.length === 0) return [...sourceIncoming];
    const merged = [...sourceExisting];
    const existingFingerprints = new Set(
      sourceExisting.map((item) => this.stringifyComparableItem(item))
    );

    sourceIncoming.forEach((item) => {
      const fingerprint = this.stringifyComparableItem(item);
      if (existingFingerprints.has(fingerprint)) return;
      merged.push(item);
      existingFingerprints.add(fingerprint);
    });

    return merged;
  }

  /**
   * Merge execution data mới vào dữ liệu cũ của cùng node để không mất lịch sử log.
   *
   * @param {unknown} existingPayload payload đang lưu trong DB
   * @param {unknown} incomingPayload payload mới từ lần cập nhật
   * @returns {object|null} payload đã merge
   */
  mergeExecutionData(existingPayload, incomingPayload) {
    const parsedExisting = this.parseExecutionPayload(existingPayload);
    const parsedIncoming = this.parseExecutionPayload(incomingPayload);

    if (!parsedIncoming) return parsedExisting;
    if (!parsedExisting) return parsedIncoming;

    const merged = {
      ...parsedExisting,
      ...parsedIncoming,
    };

    const existingItems = Array.isArray(parsedExisting.items) ? parsedExisting.items : [];
    const incomingItems = Array.isArray(parsedIncoming.items) ? parsedIncoming.items : [];
    if (existingItems.length > 0 || incomingItems.length > 0) {
      merged.items = this.mergeExecutionItems(existingItems, incomingItems);
    }

    const incomingSchema = Array.isArray(parsedIncoming.schema) ? parsedIncoming.schema : [];
    const existingSchema = Array.isArray(parsedExisting.schema) ? parsedExisting.schema : [];
    if (incomingSchema.length > 0) {
      merged.schema = incomingSchema;
    } else if (existingSchema.length > 0) {
      merged.schema = existingSchema;
    }

    const mergedMeta = {
      ...(parsedExisting.meta && typeof parsedExisting.meta === 'object' ? parsedExisting.meta : {}),
      ...(parsedIncoming.meta && typeof parsedIncoming.meta === 'object' ? parsedIncoming.meta : {}),
    };
    if (Array.isArray(merged.items)) {
      mergedMeta.totalItems = merged.items.length;
    }
    if (Object.keys(mergedMeta).length > 0) {
      merged.meta = mergedMeta;
    }

    if (!merged.message && parsedExisting.message) {
      merged.message = parsedExisting.message;
    }

    return merged;
  }

  /**
   * Ghi hoặc cập nhật một dòng log execution cho node trong lần chạy chiến dịch.
   *
   * Luồng hoạt động:
   * 1. Với mọi loại run, nếu có `node.id` thì coi khóa ổn định là `(id_run, node_id)`.
   * 2. Đã có bản ghi: UPDATE bản mới nhất (ORDER BY id DESC), merge `execution_data` để giữ items tiến độ và tránh trùng.
   * 3. Chưa có: INSERT hàng mới. Không có `node_id` thì luôn INSERT (không đủ khóa upsert).
   * 4. `created_at` giữ nguyên khi UPDATE; `updated_at` luôn cập nhật.
   *
   * @param {object} input
   * @param {number|null} input.campaignId id chiến dịch
   * @param {number|null} input.runId id lượt chạy
   * @param {object} input.node metadata node (id, node_name, node_type, …)
   * @param {number|null} [input.customerId]
   * @param {string} [input.status]
   * @param {unknown} [input.executionData] payload log (object hoặc JSON string)
   * @param {string|null} [input.errorMessage]
   * @param {number|null} [input.progressCurrent]
   * @param {number|null} [input.progressTotal]
   * @returns {Promise<void>}
   */
  async logExecutionNode({
    campaignId,
    runId,
    node,
    customerId = null,
    status = 'success',
    executionData = null,
    errorMessage = null,
    progressCurrent = null,
    progressTotal = null,
  }) {
    if (!runId || !node) return;
    const nodeId = node.id || null;
    const nodeName = node.node_name || null;
    const nodeType = node.node_type || null;
    const nodeSubtype = node.node_subtype || null;
    const nodeOrder = Number.isFinite(parseInt(node.execution_order, 10))
      ? parseInt(node.execution_order, 10)
      : null;
    const parsedIncomingExecutionData = this.parseExecutionPayload(executionData);
    const serializedExecutionData = parsedIncomingExecutionData
      ? JSON.stringify(parsedIncomingExecutionData)
      : null;

    // Một node trong một run chỉ nên một hàng log; mọi lần ghi sau cập nhật + merge payload.
    if (nodeId) {
      const existingLogResult = await db.query(
        `SELECT id, execution_data, node_result_json
         FROM campaign_executions
         WHERE id_run = $1
           AND node_id = $2
         ORDER BY id DESC
         LIMIT 1`,
        [runId, nodeId]
      );

      if (existingLogResult.rows.length > 0) {
        const existingLog = existingLogResult.rows[0];
        const mergedExecutionData = this.mergeExecutionData(
          existingLog.execution_data ?? existingLog.node_result_json,
          parsedIncomingExecutionData
        );
        const serializedMergedExecutionData = mergedExecutionData
          ? JSON.stringify(mergedExecutionData)
          : null;

        await db.query(
          `UPDATE campaign_executions
           SET id_campaign = $1,
               id_customer = $2,
               status = $3,
               action_type = $4,
               node_name = $5,
               node_type = $6,
               node_subtype = $7,
               node_order = $8,
               progress_current = $9,
               progress_total = $10,
               execution_data = $11,
               node_result_json = $12,
               error_message = $13,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $14`,
          [
            campaignId,
            customerId,
            status,
            nodeSubtype || nodeType,
            nodeName,
            nodeType,
            nodeSubtype,
            nodeOrder,
            progressCurrent,
            progressTotal,
            serializedMergedExecutionData,
            serializedMergedExecutionData,
            errorMessage,
            existingLog.id,
          ]
        );
        return;
      }
    }

    await db.query(
      `INSERT INTO campaign_executions
        (id_campaign, id_run, id_customer, status, action_type, node_id, node_name, node_type, node_subtype, node_order, progress_current, progress_total, execution_data, node_result_json, error_message, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        campaignId,
        runId,
        customerId,
        status,
        nodeSubtype || nodeType,
        nodeId,
        nodeName,
        nodeType,
        nodeSubtype,
        nodeOrder,
        progressCurrent,
        progressTotal,
        serializedExecutionData,
        serializedExecutionData,
        errorMessage,
      ]
    );
  }
}

export default new CampaignExecutionLogService();
