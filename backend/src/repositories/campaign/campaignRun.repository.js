import db from '../../config/database.js';

class CampaignRunRepository {
  async hasSkippedSendsColumn() {
    if (typeof this._hasSkippedSendsColumn === 'boolean') {
      return this._hasSkippedSendsColumn;
    }

    try {
      const result = await db.query(
        `SELECT 1
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'campaign_runs'
           AND column_name = 'skipped_sends'
         LIMIT 1`
      );
      this._hasSkippedSendsColumn = result.rows.length > 0;
    } catch {
      this._hasSkippedSendsColumn = false;
    }

    return this._hasSkippedSendsColumn;
  }

  /**
   * SELECT run_metadata FROM campaign_runs WHERE id = $1 AND status = 'running'
   *
   * @param {number} runId
   * @returns {Promise<object|null>} run_metadata object or null
   */
  async getRunMetadata(runId) {
    const result = await db.query(
      `SELECT run_metadata FROM campaign_runs WHERE id = $1 AND status = 'running' LIMIT 1`,
      [runId]
    );
    return result.rows[0]?.run_metadata || null;
  }

  /**
   * Remove multiple keys from run_metadata JSONB column.
   *
   * @param {number} runId
   * @param {string[]} keys array of metadata keys to remove
   * @returns {Promise<void>}
   */
  async clearDeferMetadataKeys(runId, keys) {
    if (!Array.isArray(keys) || keys.length === 0) return;
    // Build: ... - $2::text - $3::text - ...
    const removals = keys.map((_k, i) => `- $${i + 2}::text`).join(' ');
    await db.query(
      `UPDATE campaign_runs
       SET run_metadata = COALESCE(run_metadata, '{}'::jsonb) ${removals}
       WHERE id = $1 AND status = 'running'`,
      [runId, ...keys]
    );
  }

  /**
   * Merge a patch object into run_metadata JSONB.
   *
   * @param {number} runId
   * @param {object} patch object to merge
   * @returns {Promise<void>}
   */
  async patchRunMetadata(runId, patch) {
    await db.query(
      `UPDATE campaign_runs
       SET run_metadata = COALESCE(run_metadata, '{}'::jsonb) || $1::jsonb
       WHERE id = $2 AND status = 'running'`,
      [JSON.stringify(patch), runId]
    );
  }

  /**
   * Update run progress counters.
   *
   * @param {number} runId
   * @param {{totalRecipients: number, successfulSends: number, failedSends: number, skippedSends: number}} counts
   * @returns {Promise<void>}
   */
  async updateRunProgress(runId, { totalRecipients, successfulSends, failedSends, skippedSends }) {
    if (!(await this.hasSkippedSendsColumn())) {
      await db.query(
        `UPDATE campaign_runs
         SET total_recipients = $1,
             successful_sends = $2,
             failed_sends = $3
         WHERE id = $4`,
        [totalRecipients, successfulSends, failedSends, runId]
      );
      return;
    }

    await db.query(
      `UPDATE campaign_runs
       SET total_recipients = $1,
           successful_sends = $2,
           failed_sends = $3,
           skipped_sends = $4
       WHERE id = $5`,
      [totalRecipients, successfulSends, failedSends, skippedSends, runId]
    );
  }

  /**
   * Set run_name on the run record (best-effort, ignores missing column).
   *
   * @param {number} runId
   * @param {string} runName
   * @returns {Promise<void>}
   */
  async updateRunName(runId, runName) {
    await db.query(
      `UPDATE campaign_runs SET run_name = $1 WHERE id = $2`,
      [runName, runId]
    );
  }

  /**
   * Stop a running campaign run.
   * Returns the updated rows (empty if not found/already stopped).
   *
   * @param {number} runId
   * @param {boolean} isAdmin
   * @param {number} userId
   * @returns {Promise<{id: number, status: string}[]>}
   */
  async stopRun(runId, isAdmin, userId) {
    const result = await db.query(
      `UPDATE campaign_runs cr
       SET status = 'stopped',
           completed_at = CURRENT_TIMESTAMP,
           error_message = 'Đã dừng bởi người dùng'
       FROM campaigns c
       WHERE cr.id = $1
         AND cr.id_campaign = c.id
         AND ($2::boolean = TRUE OR c.id_user = $3)
         AND cr.status = 'running'
       RETURNING cr.id, cr.status`,
      [runId, isAdmin, userId]
    );
    return result.rows;
  }

  /**
   * Check whether the run exists for the given user/admin scope.
   *
   * @param {number} runId
   * @param {boolean} isAdmin
   * @param {number} userId
   * @returns {Promise<boolean>}
   */
  async checkRunExists(runId, isAdmin, userId) {
    const result = await db.query(
      `SELECT 1
       FROM campaign_runs cr
       JOIN campaigns c ON c.id = cr.id_campaign
       WHERE cr.id = $1
         AND ($2::boolean = TRUE OR c.id_user = $3)
       LIMIT 1`,
      [runId, isAdmin, userId]
    );
    return result.rows.length > 0;
  }

  async findRuns({ userId, isAdmin, campaignId = null, scheduleId = null, limit = 50 }) {
    const skippedSendsSelect = (await this.hasSkippedSendsColumn())
      ? 'cr.skipped_sends'
      : '0::integer';

    let query = `
      SELECT
        cr.id,
        cr.id_campaign,
        cr.id_schedule,
        cr.run_type,
        cr.status,
        cr.started_at::timestamptz AS started_at,
        cr.completed_at::timestamptz AS completed_at,
        cr.total_recipients,
        cr.successful_sends,
        cr.failed_sends,
        ${skippedSendsSelect} AS skipped_sends,
        cr.error_message,
        cr.run_metadata,
        cr.created_at::timestamptz AS created_at,
        cr.run_name,
        c.campaign_name,
        cs.schedule_name
      FROM campaign_runs cr
      JOIN campaigns c ON cr.id_campaign = c.id
      LEFT JOIN campaign_schedules cs ON cr.id_schedule = cs.id
      WHERE ($1::boolean = TRUE OR c.id_user = $2)
    `;
    const params = [isAdmin, userId];
    let paramIndex = 3;

    if (campaignId) {
      query += ` AND cr.id_campaign = $${paramIndex}`;
      params.push(campaignId);
      paramIndex += 1;
    }

    if (scheduleId) {
      query += ` AND cr.id_schedule = $${paramIndex}`;
      params.push(scheduleId);
      paramIndex += 1;
    }

    query += ` ORDER BY cr.started_at DESC LIMIT $${paramIndex}`;
    params.push(limit);

    const result = await db.query(query, params);
    return result.rows;
  }

  async findRunById({ runId, isAdmin, userId }) {
    const skippedSendsSelect = (await this.hasSkippedSendsColumn())
      ? 'cr.skipped_sends'
      : '0::integer';

    const result = await db.query(
      `SELECT
         cr.id,
         cr.id_campaign,
         cr.id_schedule,
         cr.run_type,
         cr.status,
         cr.started_at::timestamptz AS started_at,
         cr.completed_at::timestamptz AS completed_at,
         cr.total_recipients,
         cr.successful_sends,
         cr.failed_sends,
         ${skippedSendsSelect} AS skipped_sends,
         cr.error_message,
         cr.run_metadata,
         cr.created_at::timestamptz AS created_at,
         cr.run_name,
         c.campaign_name,
         cs.schedule_name
       FROM campaign_runs cr
       JOIN campaigns c ON cr.id_campaign = c.id
       LEFT JOIN campaign_schedules cs ON cr.id_schedule = cs.id
       WHERE cr.id = $1
         AND ($2::boolean = TRUE OR c.id_user = $3)`,
      [runId, isAdmin, userId]
    );
    return result.rows[0] || null;
  }

  async findExecutionLogs(runId) {
    const result = await db.query(
      `SELECT
         ce.id,
         ce.id_campaign,
         ce.id_run,
         ce.id_customer,
         ce.status,
         ce.action_type,
         ce.path_taken,
         ce.execution_data,
         ce.error_message,
         ce.created_at::timestamptz AS created_at,
         ce.updated_at::timestamptz AS updated_at,
         ce.node_id,
         ce.node_name,
         ce.node_type,
         ce.node_subtype,
         ce.node_order,
         ce.progress_current,
         ce.progress_total,
         ce.node_result_json
       FROM campaign_executions ce
       WHERE ce.id_run = $1
       ORDER BY ce.node_order ASC NULLS LAST, ce.created_at ASC, ce.id ASC`,
      [runId]
    );
    return result.rows;
  }

  async findExecutionLogsIncremental({ runId, afterId = null, updatedAfterIso = null, fetchSize }) {
    const result = await db.query(
      `SELECT
         ce.id,
         ce.id_campaign,
         ce.id_run,
         ce.id_customer,
         ce.status,
         ce.action_type,
         ce.path_taken,
         ce.execution_data,
         ce.error_message,
         ce.created_at::timestamptz AS created_at,
         ce.updated_at::timestamptz AS updated_at,
         ce.node_id,
         ce.node_name,
         ce.node_type,
         ce.node_subtype,
         ce.node_order,
         ce.progress_current,
         ce.progress_total,
         ce.node_result_json
       FROM campaign_executions ce
       WHERE ce.id_run = $1
         AND ($2::BIGINT IS NULL OR ce.id > $2)
         AND (
           $3::TIMESTAMPTZ IS NULL
           OR ce.updated_at::timestamptz > $3::TIMESTAMPTZ
         )
       ORDER BY ce.id ASC
       LIMIT $4`,
      [runId, afterId, updatedAfterIso, fetchSize]
    );
    return result.rows;
  }

  async getTrackingSummary(runId, purchaseOrderStatusExpr) {
    const normalizedStatusExpr = `LOWER(TRIM(COALESCE(${purchaseOrderStatusExpr}, '')))`;
    const purchaseSummaryResult = await db.query(
      `SELECT
         COALESCE(COUNT(*) FILTER (
           WHERE ${normalizedStatusExpr} IN ('completed', 'processing')
         ), 0)::INTEGER AS purchase_count,
         COALESCE(COUNT(*) FILTER (
           WHERE ${normalizedStatusExpr} IN (
             'on-hold', 'on-holder', 'onhold', 'pending', 'interested'
           )
         ), 0)::INTEGER AS pending_count,
         COALESCE(COUNT(DISTINCT cp.id_customer), 0)::INTEGER AS customer_with_order_count
       FROM customer_purchases cp
       WHERE cp.id_run = $1`,
      [runId]
    );
    const clickSummaryResult = await db.query(
      `SELECT
         COALESCE(COUNT(*), 0)::INTEGER AS link_click_count
       FROM customer_journey cj
       WHERE cj.id_run = $1
         AND cj.event_type IN ('email_clicked', 'zalo_clicked')`,
      [runId]
    );

    return {
      ...(purchaseSummaryResult.rows[0] || {}),
      ...(clickSummaryResult.rows[0] || {}),
    };
  }

  /**
   * Get the current status of a run.
   *
   * @param {number} runId
   * @returns {Promise<string|null>}
   */
  async getRunStatus(runId) {
    const result = await db.query(
      `SELECT status FROM campaign_runs WHERE id = $1 LIMIT 1`,
      [runId]
    );
    return result.rows[0]?.status ?? null;
  }

  /**
   * Fetch run_metadata, successful_sends, failed_sends for execution bootstrap.
   *
   * @param {number} runId
   * @returns {Promise<{run_metadata: object, successful_sends: number, failed_sends: number}|null>}
   */
  async getRunForExecution(runId) {
    const result = await db.query(
      `SELECT run_metadata, successful_sends, failed_sends
       FROM campaign_runs
       WHERE id = $1
       LIMIT 1`,
      [runId]
    );
    return result.rows[0] ?? null;
  }

  /**
   * Finalize run: set status to completed or keep running when pending recipients exist.
   *
   * @param {number} runId
   * @param {boolean} hasPendingRecipientDue keep running when true
   * @param {{totalRecipients: number, successfulSends: number, failedSends: number, skippedSends: number}} counts
   * @returns {Promise<void>}
   */
  async finalizeRun(runId, hasPendingRecipientDue, { totalRecipients, successfulSends, failedSends, skippedSends }) {
    if (!(await this.hasSkippedSendsColumn())) {
      await db.query(
        hasPendingRecipientDue
          ? `UPDATE campaign_runs SET
             status = 'running',
             completed_at = NULL,
             total_recipients = $1,
             successful_sends = $2,
             failed_sends = $3
             WHERE id = $4
               AND status = 'running'`
          : `UPDATE campaign_runs SET
             status = 'completed',
             completed_at = CURRENT_TIMESTAMP,
             total_recipients = $1,
             successful_sends = $2,
             failed_sends = $3
             WHERE id = $4
               AND status = 'running'`,
        [totalRecipients, successfulSends, failedSends, runId]
      );
      return;
    }

    await db.query(
      hasPendingRecipientDue
        ? `UPDATE campaign_runs SET
           status = 'running',
           completed_at = NULL,
           total_recipients = $1,
           successful_sends = $2,
           failed_sends = $3,
           skipped_sends = $4
           WHERE id = $5
             AND status = 'running'`
        : `UPDATE campaign_runs SET
           status = 'completed',
           completed_at = CURRENT_TIMESTAMP,
           total_recipients = $1,
           successful_sends = $2,
           failed_sends = $3,
           skipped_sends = $4
           WHERE id = $5
             AND status = 'running'`,
      [totalRecipients, successfulSends, failedSends, skippedSends, runId]
    );
  }

  /**
   * Mark run as completed with an error message (e.g. campaign paused by Zalo pool unavailable).
   *
   * @param {number} runId
   * @param {string} errorMessage
   * @returns {Promise<void>}
   */
  async completeRunWithError(runId, errorMessage) {
    await db.query(
      `UPDATE campaign_runs SET
       status = 'completed',
       completed_at = CURRENT_TIMESTAMP,
       error_message = $1
       WHERE id = $2`,
      [errorMessage, runId]
    );
  }

  /**
   * Mark run as failed.
   *
   * @param {number} runId
   * @param {string} errorMessage
   * @returns {Promise<void>}
   */
  async failRun(runId, errorMessage) {
    await db.query(
      `UPDATE campaign_runs SET
       status = 'failed',
       completed_at = CURRENT_TIMESTAMP,
       error_message = $1
       WHERE id = $2`,
      [errorMessage, runId]
    );
  }
}

export default new CampaignRunRepository();
