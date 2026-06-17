/**
 * Shared SQL for delivery monitor "top runs" table.
 * Combines journey sends, message-level failures, execution failures, and run counters.
 *
 * @param {{ limit: number, userScoped?: boolean }} options
 * @returns {string}
 */
export function buildTopRunsQuery({ limit, userScoped = false }) {
  const userFilter = userScoped ? 'AND c.id_user = $2' : '';

  return `
    WITH run_base AS (
      SELECT
        cr.id,
        cr.run_name,
        cr.status,
        cr.started_at,
        cr.completed_at,
        cr.total_recipients,
        COALESCE(cr.successful_sends, 0)::int AS run_successful_sends,
        COALESCE(cr.failed_sends, 0)::int AS run_failed_sends,
        COALESCE(cr.skipped_sends, 0)::int AS skipped_sends,
        cr.error_message,
        cr.run_metadata,
        c.campaign_name,
        c.campaign_type,
        EXTRACT(EPOCH FROM (COALESCE(cr.completed_at, NOW()) - cr.started_at))::float AS duration_seconds
      FROM campaign_runs cr
      JOIN campaigns c ON c.id = cr.id_campaign
      WHERE cr.started_at >= NOW() - ($1::int * INTERVAL '1 day')
        ${userFilter}
    ),
    sent_by_run AS (
      SELECT cj.id_run, COUNT(*)::int AS successful_sends
      FROM customer_journey cj
      JOIN run_base rb ON rb.id = cj.id_run
      WHERE cj.event_type IN ('email_sent', 'zalo_sent')
      GROUP BY cj.id_run
    ),
    execution_failures_by_run AS (
      SELECT ce.id_run, COUNT(*)::int AS failed_sends
      FROM campaign_executions ce
      JOIN run_base rb ON rb.id = ce.id_run
      WHERE LOWER(COALESCE(ce.status::text, '')) IN ('failed', 'error', 'failure')
      GROUP BY ce.id_run
    ),
    email_failures_by_run AS (
      SELECT em.id_run, COUNT(*)::int AS failed_sends
      FROM email_messages em
      JOIN run_base rb ON rb.id = em.id_run
      WHERE LOWER(COALESCE(em.status::text, '')) IN ('failed', 'bounced', 'error')
      GROUP BY em.id_run
    ),
    run_metrics AS (
      SELECT
        rb.*,
        GREATEST(COALESCE(sbr.successful_sends, 0), rb.run_successful_sends)::int AS successful_sends,
        GREATEST(
          rb.run_failed_sends,
          COALESCE(efbr.failed_sends, 0),
          COALESCE(emfbr.failed_sends, 0),
          CASE
            WHEN LOWER(rb.status) = 'failed'
              AND NULLIF(BTRIM(COALESCE(rb.error_message, '')), '') IS NOT NULL
              AND GREATEST(COALESCE(sbr.successful_sends, 0), rb.run_successful_sends) = 0
              AND rb.run_failed_sends = 0
              AND COALESCE(efbr.failed_sends, 0) = 0
              AND COALESCE(emfbr.failed_sends, 0) = 0
            THEN 1
            ELSE 0
          END
        )::int AS failed_sends
      FROM run_base rb
      LEFT JOIN sent_by_run sbr ON sbr.id_run = rb.id
      LEFT JOIN execution_failures_by_run efbr ON efbr.id_run = rb.id
      LEFT JOIN email_failures_by_run emfbr ON emfbr.id_run = rb.id
    )
    SELECT
      rm.id,
      rm.run_name,
      rm.status,
      rm.started_at::timestamptz AS started_at,
      rm.completed_at::timestamptz AS completed_at,
      rm.total_recipients,
      rm.successful_sends,
      rm.failed_sends,
      rm.skipped_sends,
      rm.error_message,
      rm.campaign_name,
      rm.campaign_type,
      rm.run_metadata->>'lastResumeExpectedAt' AS last_resume_expected_at,
      rm.run_metadata->>'lastResumeActualAt' AS last_resume_actual_at,
      rm.run_metadata->>'lastResumeDriftMs' AS last_resume_drift_ms,
      rm.run_metadata->>'lastResumeReason' AS last_resume_reason,
      rm.run_metadata->>'lastResumeResumedBy' AS last_resume_resumed_by,
      rm.run_metadata->>'lastResumeStep' AS last_resume_step,
      COALESCE(rm.run_metadata->>'nonContinuousDeferredUntil', rm.run_metadata->>'zaloOutboundDeferredUntil') AS deferred_until,
      COALESCE(rm.run_metadata->>'nonContinuousDeferredReason', rm.run_metadata->>'zaloDeferredReason') AS deferred_reason,
      rm.duration_seconds
    FROM run_metrics rm
    ORDER BY
      rm.started_at DESC
    LIMIT ${Number.parseInt(limit, 10)}`;
}

/**
 * @param {object} row
 * @returns {object}
 */
export function mapTopRunRow(row) {
  const toNumber = (value) => Number(value || 0);
  const successfulSends = toNumber(row.successful_sends);
  const failedSends = toNumber(row.failed_sends);
  const attempts = successfulSends + failedSends;
  const durationSeconds = Math.max(0, toNumber(row.duration_seconds));
  const minutes = Math.max(durationSeconds / 60, 1 / 60);
  const rawDriftMs = row.last_resume_drift_ms === null || row.last_resume_drift_ms === undefined
    ? null
    : Number(row.last_resume_drift_ms);
  const lastResumeDriftMs = Number.isFinite(rawDriftMs) ? Math.max(0, rawDriftMs) : null;

  return {
    id: row.id,
    runName: row.run_name,
    campaignName: row.campaign_name,
    campaignType: row.campaign_type,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    totalRecipients: toNumber(row.total_recipients),
    successfulSends,
    failedSends,
    skippedSends: toNumber(row.skipped_sends),
    durationSeconds,
    throughputPerMinute: Math.round((successfulSends / minutes) * 10) / 10,
    failureRate: attempts > 0 ? Math.round((failedSends / attempts) * 1000) / 10 : 0,
    errorMessage: row.error_message,
    hasRunError: Boolean(String(row.error_message || '').trim()),
    lastResumeExpectedAt: row.last_resume_expected_at || null,
    lastResumeActualAt: row.last_resume_actual_at || null,
    lastResumeDriftMs,
    lastResumeReason: row.last_resume_reason || null,
    lastResumeResumedBy: row.last_resume_resumed_by || null,
    lastResumeStep: row.last_resume_step === null || row.last_resume_step === undefined ? null : toNumber(row.last_resume_step),
    deferredUntil: row.deferred_until || null,
    deferredReason: row.deferred_reason || null,
  };
}
