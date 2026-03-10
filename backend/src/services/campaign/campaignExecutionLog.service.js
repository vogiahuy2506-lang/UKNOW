import db from '../../config/database.js';

class CampaignExecutionLogService {
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
        executionData ? JSON.stringify(executionData) : null,
        executionData ? JSON.stringify(executionData) : null,
        errorMessage,
      ]
    );
  }
}

export default new CampaignExecutionLogService();
