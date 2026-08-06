import db from '../../config/database.js';

/** Audit logs started with migration 040 — surface this on every chart. */
export const FUNNEL_DATA_SINCE = '2025-06-01';

/**
 * Activation funnel counts (distinct workspaces / owners).
 * Steps use audit_logs + orders; channel connect needs EMAIL/ZALO_ACCOUNT_CONNECTED (0c).
 */
export async function getFunnelSteps({ since = FUNNEL_DATA_SINCE } = {}) {
  const { rows } = await db.query(
    `WITH base AS (
       SELECT
         COALESCE(owner_id, id_user) AS workspace_id,
         action,
         created_at
       FROM audit_logs
       WHERE created_at >= $1::timestamptz
         AND action IN (
           'USER_REGISTERED',
           'EMAIL_ACCOUNT_CONNECTED',
           'ZALO_ACCOUNT_CONNECTED',
           'CAMPAIGN_CREATED',
           'CAMPAIGN_RUN_STARTED'
         )
     ),
     registered AS (
       SELECT DISTINCT workspace_id FROM base WHERE action = 'USER_REGISTERED'
     ),
     channel AS (
       SELECT DISTINCT workspace_id FROM base
       WHERE action IN ('EMAIL_ACCOUNT_CONNECTED', 'ZALO_ACCOUNT_CONNECTED')
     ),
     campaign AS (
       SELECT DISTINCT workspace_id FROM base WHERE action = 'CAMPAIGN_CREATED'
     ),
     run_started AS (
       SELECT DISTINCT workspace_id FROM base WHERE action = 'CAMPAIGN_RUN_STARTED'
     ),
     paid AS (
       SELECT DISTINCT o.user_id AS workspace_id
       FROM orders o
       WHERE o.status = 'success'
         AND COALESCE(o.payment_method, 'payos') != 'free'
         AND o.created_at >= $1::timestamptz
         AND o.user_id IS NOT NULL
     )
     SELECT
       (SELECT COUNT(*) FROM registered)::int AS registered,
       (SELECT COUNT(*) FROM channel)::int AS channelConnected,
       (SELECT COUNT(*) FROM campaign)::int AS campaignCreated,
       (SELECT COUNT(*) FROM run_started)::int AS campaignRunStarted,
       (SELECT COUNT(*) FROM paid)::int AS paid`
    ,
    [since]
  );
  return rows[0];
}

/** Cohort by registration month → % reaching each later step. */
export async function getFunnelCohorts({ since = FUNNEL_DATA_SINCE } = {}) {
  const { rows } = await db.query(
    `WITH regs AS (
       SELECT
         COALESCE(owner_id, id_user) AS workspace_id,
         date_trunc('month', created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AS cohort_month
       FROM audit_logs
       WHERE action = 'USER_REGISTERED'
         AND created_at >= $1::timestamptz
     ),
     channel AS (
       SELECT DISTINCT COALESCE(owner_id, id_user) AS workspace_id
       FROM audit_logs
       WHERE action IN ('EMAIL_ACCOUNT_CONNECTED', 'ZALO_ACCOUNT_CONNECTED')
         AND created_at >= $1::timestamptz
     ),
     campaign AS (
       SELECT DISTINCT COALESCE(owner_id, id_user) AS workspace_id
       FROM audit_logs
       WHERE action = 'CAMPAIGN_CREATED' AND created_at >= $1::timestamptz
     ),
     paid AS (
       SELECT DISTINCT user_id AS workspace_id
       FROM orders
       WHERE status = 'success'
         AND COALESCE(payment_method, 'payos') != 'free'
         AND created_at >= $1::timestamptz
         AND user_id IS NOT NULL
     )
     SELECT
       TO_CHAR(r.cohort_month, 'MM/YYYY') AS cohort,
       r.cohort_month AS "cohortDate",
       COUNT(DISTINCT r.workspace_id)::int AS registered,
       COUNT(DISTINCT ch.workspace_id)::int AS channelConnected,
       COUNT(DISTINCT c.workspace_id)::int AS campaignCreated,
       COUNT(DISTINCT p.workspace_id)::int AS paid
     FROM regs r
     LEFT JOIN channel ch ON ch.workspace_id = r.workspace_id
     LEFT JOIN campaign c ON c.workspace_id = r.workspace_id
     LEFT JOIN paid p ON p.workspace_id = r.workspace_id
     GROUP BY r.cohort_month
     ORDER BY r.cohort_month ASC`,
    [since]
  );
  return rows;
}

/**
 * Time from registration (users.created_at) to first successful campaign send.
 * Email: status = 'sent'. Zalo: tracking_metadata status = 'sent' (column status stays pending).
 * Do NOT filter by FUNNEL_DATA_SINCE — this KPI uses full user history.
 */
export async function getTimeToFirstSend() {
  const { rows } = await db.query(
    `WITH first_send AS (
       SELECT c.id_user AS user_id, MIN(m.sent_at) AS first_sent_at
       FROM (
         SELECT id_campaign, sent_at
         FROM email_messages
         WHERE status = 'sent' AND sent_at IS NOT NULL
         UNION ALL
         SELECT id_campaign, sent_at
         FROM zalo_messages
         WHERE COALESCE(tracking_metadata->>'status', '') = 'sent'
           AND sent_at IS NOT NULL
       ) m
       JOIN campaigns c ON c.id = m.id_campaign
       GROUP BY c.id_user
     ),
     eligible AS (
       SELECT u.id, u.created_at, f.first_sent_at
       FROM users u
       LEFT JOIN first_send f ON f.user_id = u.id
       WHERE u.role = 'user'
     ),
     timed AS (
       SELECT id, created_at, first_sent_at,
              EXTRACT(EPOCH FROM (first_sent_at - created_at)) / 60.0 AS minutes
       FROM eligible
       WHERE first_sent_at IS NOT NULL AND first_sent_at >= created_at
     )
     SELECT
       (SELECT COUNT(*)::int FROM eligible) AS total_users,
       (SELECT COUNT(*)::int FROM timed) AS sent_count,
       ROUND((SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY minutes) FROM timed)::numeric, 1) AS median_minutes,
       ROUND(
         (SELECT COUNT(*) FROM timed WHERE minutes <= 10)::numeric
         / NULLIF((SELECT COUNT(*) FROM timed), 0) * 100,
         1
       ) AS pct_under_10`
  );

  const row = rows[0] || {};
  const sentCount = Number(row.sent_count || 0);
  const totalUsers = Number(row.total_users || 0);
  const medianRaw = row.median_minutes;
  const pctRaw = row.pct_under_10;

  return {
    medianMinutes: medianRaw == null ? null : Number(medianRaw),
    pctUnder10: pctRaw == null ? null : Number(pctRaw),
    sentCount,
    totalUsers,
  };
}
