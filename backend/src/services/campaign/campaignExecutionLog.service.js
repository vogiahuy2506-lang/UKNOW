import db from '../../config/database.js';

class CampaignExecutionLogService {
  constructor() {
    this.runContinuousModeCache = new Map();
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
    const serializedExecutionData = executionData ? JSON.stringify(executionData) : null;
    const isContinuousMode = await this.isContinuousRun(runId);

    /**
     * Chế độ continuous chỉ giữ 1 log mới nhất cho mỗi node trong cùng run.
     * Nếu node đã có log trước đó thì update lại bản ghi cũ, tránh phình bảng log.
     */
    if (isContinuousMode && nodeId) {
      const updateResult = await db.query(
        `WITH target AS (
           SELECT id
           FROM campaign_executions
           WHERE id_run = $1
             AND node_id = $2
           ORDER BY id DESC
           LIMIT 1
         )
         UPDATE campaign_executions ce
         SET id_campaign = $3,
             id_customer = $4,
             status = $5,
             action_type = $6,
             node_name = $7,
             node_type = $8,
             node_subtype = $9,
             node_order = $10,
             progress_current = $11,
             progress_total = $12,
             execution_data = $13,
             node_result_json = $14,
             error_message = $15,
             updated_at = CURRENT_TIMESTAMP
         FROM target
         WHERE ce.id = target.id
         RETURNING ce.id`,
        [
          runId,
          nodeId,
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
          serializedExecutionData,
          serializedExecutionData,
          errorMessage,
        ]
      );

      if (updateResult.rows.length > 0) return;
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
