import db from '../../config/database.js';

class CampaignExecutionLogService {
  constructor() {
    this.runContinuousModeCache = new Map();
  }

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
   * 3. Bỏ qua item bị trùng để tránh lặp dữ liệu ở continuous mode.
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
   * Xác định run hiện tại có bật continuousMode hay không.
   *
   * Luồng hoạt động:
   * 1. Dùng cache theo `runId` để tránh query lặp lại khi log nhiều lần.
   * 2. Đọc `run_metadata.continuousMode` từ `campaign_runs`.
   * 3. Chuẩn hóa giá trị boolean/string để xử lý ổn định cho dữ liệu cũ.
   *
   * @param {number|string|null} runId id của campaign run
   * @returns {Promise<boolean>} true nếu run đang chạy continuous mode
   */
  async isContinuousRun(runId) {
    if (!runId) return false;
    const runKey = String(runId);
    if (this.runContinuousModeCache.has(runKey)) {
      return this.runContinuousModeCache.get(runKey) === true;
    }

    let isContinuousMode = false;
    try {
      const runResult = await db.query(
        `SELECT run_metadata
         FROM campaign_runs
         WHERE id = $1
         LIMIT 1`,
        [runId]
      );
      const rawContinuousMode = runResult.rows[0]?.run_metadata?.continuousMode;
      isContinuousMode = rawContinuousMode === true
        || String(rawContinuousMode || '').trim().toLowerCase() === 'true';
    } catch {
      isContinuousMode = false;
    }

    this.runContinuousModeCache.set(runKey, isContinuousMode);
    return isContinuousMode;
  }

  /**
   * Persist one execution log row for a campaign node.
   *
   * @param {object} input
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
    const isContinuousMode = await this.isContinuousRun(runId);

    /**
     * Chế độ continuous chỉ giữ 1 log mới nhất cho mỗi node trong cùng run.
     * Nếu node đã có log trước đó thì update lại bản ghi cũ, tránh phình bảng log.
     */
    if (isContinuousMode && nodeId) {
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
