import db from '../../config/database.js';

class CampaignExecutionLogRepository {
  /**
   * Find the most recent execution log row for a given run and node.
   *
   * @param {number} runId
   * @param {string} nodeId
   * @returns {Promise<{id: number, execution_data: unknown, node_result_json: unknown}|null>}
   */
  async findLatestByRunAndNode(runId, nodeId) {
    const result = await db.query(
      `SELECT id, execution_data, node_result_json
       FROM campaign_executions
       WHERE id_run = $1
         AND node_id = $2
       ORDER BY id DESC
       LIMIT 1`,
      [runId, nodeId]
    );
    return result.rows[0] || null;
  }

  /**
   * Update an existing execution log row by id.
   *
   * @param {number} id primary key of the row to update
   * @param {object} fields
   * @param {number|null} fields.campaignId
   * @param {number|null} fields.safeCustomerId
   * @param {string} fields.status
   * @param {string|null} fields.actionType
   * @param {string|null} fields.nodeName
   * @param {string|null} fields.nodeType
   * @param {string|null} fields.nodeSubtype
   * @param {number|null} fields.nodeOrder
   * @param {number|null} fields.progressCurrent
   * @param {number|null} fields.progressTotal
   * @param {string|null} fields.serializedExecutionData
   * @param {string|null} fields.errorMessage
   * @returns {Promise<void>}
   */
  async updateExecutionLog(id, {
    campaignId,
    safeCustomerId,
    status,
    actionType,
    nodeName,
    nodeType,
    nodeSubtype,
    nodeOrder,
    progressCurrent,
    progressTotal,
    serializedExecutionData,
    errorMessage,
  }) {
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
        safeCustomerId,
        status,
        actionType,
        nodeName,
        nodeType,
        nodeSubtype,
        nodeOrder,
        progressCurrent,
        progressTotal,
        serializedExecutionData,
        serializedExecutionData,
        errorMessage,
        id,
      ]
    );
  }

  /**
   * Insert a new execution log row.
   *
   * @param {object} fields
   * @param {number|null} fields.campaignId
   * @param {number|null} fields.runId
   * @param {number|null} fields.safeCustomerId
   * @param {string} fields.status
   * @param {string|null} fields.actionType
   * @param {string|null} fields.nodeId
   * @param {string|null} fields.nodeName
   * @param {string|null} fields.nodeType
   * @param {string|null} fields.nodeSubtype
   * @param {number|null} fields.nodeOrder
   * @param {number|null} fields.progressCurrent
   * @param {number|null} fields.progressTotal
   * @param {string|null} fields.serializedExecutionData
   * @param {string|null} fields.errorMessage
   * @returns {Promise<void>}
   */
  async insertExecutionLog({
    campaignId,
    runId,
    safeCustomerId,
    status,
    actionType,
    nodeId,
    nodeName,
    nodeType,
    nodeSubtype,
    nodeOrder,
    progressCurrent,
    progressTotal,
    serializedExecutionData,
    errorMessage,
  }) {
    await db.query(
      `INSERT INTO campaign_executions
        (id_campaign, id_run, id_customer, status, action_type, node_id, node_name, node_type, node_subtype, node_order, progress_current, progress_total, execution_data, node_result_json, error_message, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        campaignId,
        runId,
        safeCustomerId,
        status,
        actionType,
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

  /**
   * Find customer id by email (case-insensitive, trimmed).
   *
   * @param {string} email
   * @returns {Promise<number|null>}
   */
  async findCustomerIdByEmail(email) {
    const result = await db.query(
      `SELECT id FROM customers WHERE LOWER(TRIM(email)) = $1 ORDER BY id ASC LIMIT 1`,
      [email]
    );
    return result.rows[0]?.id ?? null;
  }

  /**
   * Check whether a customer PK exists.
   *
   * @param {number} customerId
   * @returns {Promise<boolean>}
   */
  async customerExists(customerId) {
    const result = await db.query(
      `SELECT id FROM customers WHERE id = $1 LIMIT 1`,
      [customerId]
    );
    return result.rows.length > 0;
  }
}

export default new CampaignExecutionLogRepository();
