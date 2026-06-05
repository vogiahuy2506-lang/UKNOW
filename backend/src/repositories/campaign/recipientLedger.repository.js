import db from '../../config/database.js';

class RecipientLedgerRepository {
  /**
   * Read recipient step progress from the ledger table.
   *
   * @param {object} input
   * @param {number} input.runId
   * @param {number|string} input.nodeId
   * @param {string} input.channel
   * @param {string} input.recipientKey already-normalized (lowercase)
   * @returns {Promise<{last_completed_step: number, is_fully_completed: boolean, meta: object}|null>}
   */
  async getRecipientProgress({ runId, nodeId, channel, recipientKey }) {
    const result = await db.query(
      `SELECT last_completed_step, is_fully_completed, meta
       FROM campaign_run_recipient_steps
       WHERE id_run = $1
         AND id_node = $2
         AND channel = $3
         AND recipient_key = $4
       LIMIT 1`,
      [runId, nodeId, channel, recipientKey]
    );
    return result.rows[0] ?? null;
  }

  /**
   * Upsert (insert or update) a recipient step progress row.
   *
   * The complex CASE logic handles optional removal of `retryCount` and
   * `zaloSendFailureCount`/`zaloAbandonReason` from the meta JSONB.
   *
   * @param {object} input
   * @param {number} input.runId
   * @param {number} input.campaignId
   * @param {number|string} input.nodeId
   * @param {string} input.channel
   * @param {string} input.recipientKey
   * @param {number} input.completedStep
   * @param {boolean} input.isFullyCompleted
   * @param {object} input.metaPayload raw meta JSONB payload to merge
   * @param {boolean} input.removeRetryCountFromMeta
   * @param {boolean} input.removeZaloFailureFromMeta
   * @returns {Promise<void>}
   */
  async upsertRecipientProgress({
    runId,
    campaignId,
    nodeId,
    channel,
    recipientKey,
    completedStep,
    isFullyCompleted,
    metaPayload,
    removeRetryCountFromMeta,
    removeZaloFailureFromMeta,
  }) {
    await db.query(
      `INSERT INTO campaign_run_recipient_steps
       (id_run, id_campaign, id_node, channel, recipient_key, last_completed_step, is_fully_completed, last_sent_at, meta, updated_at)
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP,
         CASE
           WHEN COALESCE($9::boolean, FALSE) THEN
             CASE WHEN COALESCE($10::boolean, FALSE) THEN ($8::jsonb - 'retryCount' - 'zaloSendFailureCount' - 'zaloAbandonReason')
             ELSE ($8::jsonb - 'retryCount') END
           WHEN COALESCE($10::boolean, FALSE) THEN ($8::jsonb - 'zaloSendFailureCount' - 'zaloAbandonReason')
           ELSE $8::jsonb
         END,
         CURRENT_TIMESTAMP
       )
       ON CONFLICT (id_run, id_node, channel, recipient_key)
       DO UPDATE SET
         last_completed_step = GREATEST(campaign_run_recipient_steps.last_completed_step, EXCLUDED.last_completed_step),
         is_fully_completed = campaign_run_recipient_steps.is_fully_completed OR EXCLUDED.is_fully_completed,
         last_sent_at = CURRENT_TIMESTAMP,
         meta = CASE
           WHEN COALESCE($9::boolean, FALSE) THEN
             CASE WHEN COALESCE($10::boolean, FALSE) THEN (
               COALESCE(campaign_run_recipient_steps.meta, '{}'::jsonb) || EXCLUDED.meta
             ) - 'retryCount' - 'zaloSendFailureCount' - 'zaloAbandonReason'
             ELSE (
               COALESCE(campaign_run_recipient_steps.meta, '{}'::jsonb) || EXCLUDED.meta
             ) - 'retryCount' END
           WHEN COALESCE($10::boolean, FALSE) THEN (
             COALESCE(campaign_run_recipient_steps.meta, '{}'::jsonb) || EXCLUDED.meta
           ) - 'zaloSendFailureCount' - 'zaloAbandonReason'
           ELSE COALESCE(campaign_run_recipient_steps.meta, '{}'::jsonb) || EXCLUDED.meta
         END,
         updated_at = CURRENT_TIMESTAMP`,
      [
        runId,
        campaignId,
        nodeId,
        channel,
        recipientKey,
        completedStep,
        isFullyCompleted,
        JSON.stringify(metaPayload),
        removeRetryCountFromMeta,
        removeZaloFailureFromMeta,
      ]
    );
  }

  /**
   * Count recipients with a future nextDueAt (pending completion) and those with retryCount in meta.
   *
   * @param {number} runId
   * @returns {Promise<{pending_count: number, pending_with_retry_meta: number}>}
   */
  async countPendingDue(runId) {
    const result = await db.query(
      `SELECT
         COUNT(*)::int AS pending_count,
         COUNT(*) FILTER (
           WHERE meta ? 'retryCount'
             AND TRIM(COALESCE(meta->>'retryCount', '')) <> ''
             AND TRIM(meta->>'retryCount') ~ '^[0-9]+$'
             AND (meta->>'retryCount')::int > 0
         )::int AS pending_with_retry_meta
       FROM campaign_run_recipient_steps
       WHERE id_run = $1
         AND COALESCE(is_fully_completed, FALSE) = FALSE
         AND NULLIF(TRIM(COALESCE(meta->>'nextDueAt', '')), '') IS NOT NULL
         AND (meta->>'nextDueAt')::timestamptz > NOW()`,
      [runId]
    );
    return result.rows[0] ?? { pending_count: 0, pending_with_retry_meta: 0 };
  }
}

export default new RecipientLedgerRepository();
