import db from '../../config/database.js';
import { safeMetadataTimestampSql } from '../../utils/metadataTimestampSql.util.js';

const SAFE_NEXT_DUE_AT_SQL = safeMetadataTimestampSql("meta->>'nextDueAt'");

class RecipientLedgerRepository {
  /**
   * Read recipient step progress from the ledger table.
   *
   * @param {object} input
   * @param {number} input.runId
   * @param {number|string} input.nodeId
   * @param {string} input.channel
   * @param {string} input.recipientKey already-normalized (lowercase)
   * @returns {Promise<{last_completed_step: number, is_fully_completed: boolean, meta: object, updated_at: Date, updated_at_epoch_us: string}|null>}
   */
  async getRecipientProgress({ runId, nodeId, channel, recipientKey }) {
    const result = await db.query(
      `SELECT last_completed_step, is_fully_completed, meta, updated_at,
              EXTRACT(EPOCH FROM updated_at) * 1000000 AS updated_at_epoch_us
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
    const { rows } = await db.query(
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
          last_completed_step = CASE
            WHEN campaign_run_recipient_steps.is_fully_completed
                 OR (EXCLUDED.last_completed_step < campaign_run_recipient_steps.last_completed_step) THEN
              campaign_run_recipient_steps.last_completed_step
            ELSE EXCLUDED.last_completed_step
          END,
          is_fully_completed = CASE
            WHEN campaign_run_recipient_steps.is_fully_completed
                 OR (EXCLUDED.last_completed_step < campaign_run_recipient_steps.last_completed_step) THEN
              campaign_run_recipient_steps.is_fully_completed
            ELSE (campaign_run_recipient_steps.is_fully_completed OR EXCLUDED.is_fully_completed)
          END,
          last_sent_at = CASE
            WHEN campaign_run_recipient_steps.is_fully_completed
                 OR (EXCLUDED.last_completed_step < campaign_run_recipient_steps.last_completed_step) THEN
              campaign_run_recipient_steps.last_sent_at
            ELSE CURRENT_TIMESTAMP
          END,
          meta = CASE
            WHEN campaign_run_recipient_steps.is_fully_completed
                 OR (EXCLUDED.last_completed_step < campaign_run_recipient_steps.last_completed_step) THEN
              campaign_run_recipient_steps.meta
            ELSE
              CASE
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
              END
          END,
          updated_at = CASE
            WHEN campaign_run_recipient_steps.is_fully_completed
                 OR (EXCLUDED.last_completed_step < campaign_run_recipient_steps.last_completed_step) THEN
              campaign_run_recipient_steps.updated_at
            ELSE CURRENT_TIMESTAMP
          END
       RETURNING last_completed_step, is_fully_completed, last_sent_at, meta, updated_at,
                 EXTRACT(EPOCH FROM updated_at) * 1000000 AS updated_at_epoch_us`,
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

    // ON CONFLICT có thể từ chối stale write. Caller phải dùng row authoritative
    // này thay vì giữ payload vừa gửi trong in-memory progress map.
    return rows[0] || null;
  }

  /**
   * Count incomplete recipients that have a valid future nextDueAt, plus any
   * incomplete recipient that is due now, has no due time, or has malformed metadata.
   * A caller may defer an entire run only when the latter count is zero.
   *
   * @param {number} runId
   * @returns {Promise<{
   *   pending_count: number,
   *   pending_without_future_due: number,
   *   pending_with_retry_meta: number,
   *   next_due_at: Date|null
   * }>}
   */
  async countPendingDue(runId) {
    const result = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE safe_due.next_due_at > NOW())::int AS pending_count,
         COUNT(*) FILTER (
           WHERE safe_due.next_due_at IS NULL
              OR safe_due.next_due_at <= NOW()
         )::int AS pending_without_future_due,
         MIN(safe_due.next_due_at) FILTER (
           WHERE safe_due.next_due_at > NOW()
         ) AS next_due_at,
         COUNT(*) FILTER (
           WHERE safe_due.next_due_at > NOW()
             AND meta ? 'retryCount'
             AND TRIM(COALESCE(meta->>'retryCount', '')) <> ''
             AND TRIM(meta->>'retryCount') ~ '^0*[1-9][0-9]*$'
         )::int AS pending_with_retry_meta
       FROM campaign_run_recipient_steps
       CROSS JOIN LATERAL (
         SELECT ${SAFE_NEXT_DUE_AT_SQL} AS next_due_at
       ) safe_due
       WHERE id_run = $1
         AND COALESCE(is_fully_completed, FALSE) = FALSE`,
      [runId]
    );
    return result.rows[0] ?? {
      pending_count: 0,
      pending_without_future_due: 0,
      pending_with_retry_meta: 0,
      next_due_at: null,
    };
  }
}

export default new RecipientLedgerRepository();
