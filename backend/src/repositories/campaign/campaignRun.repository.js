import db from '../../config/database.js';

class CampaignRunRepository {
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
