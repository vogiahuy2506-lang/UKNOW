import db from '../../config/database.js';

const clampWindowDays = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 7;
  return Math.min(parsed, 90);
};

const toNumber = (value) => Number(value || 0);

const safeQuery = async (sql, params = [], fallback = []) => {
  try {
    const result = await db.query(sql, params);
    return result.rows || fallback;
  } catch (error) {
    if (error?.code === '42P01' || error?.code === '42703') return fallback;
    throw error;
  }
};

const inferChannel = (row = {}) => {
  const raw = [row.channel, row.event_channel, row.node_subtype, row.action_type, row.campaign_type]
    .map((item) => String(item || '').toLowerCase());
  const joined = raw.join(' ');
  if (joined.includes('zalo_group')) return 'zalo_group';
  if (joined.includes('zalo')) return 'zalo';
  return 'email';
};

const classifyFailure = (message = '') => {
  const text = String(message || '').toLowerCase();
  if (!text.trim()) return 'unknown';
  if (text.includes('rate') || text.includes('limit') || text.includes('quota') || text.includes('too many')) return 'rate_limit';
  if (text.includes('block') || text.includes('ban') || text.includes('spam') || text.includes('restrict')) return 'provider_block';
  if (text.includes('timeout') || text.includes('etimedout') || text.includes('econnreset')) return 'network_timeout';
  if (text.includes('auth') || text.includes('login') || text.includes('session') || text.includes('cookie')) return 'account_session';
  if (text.includes('not found') || text.includes('unreachable') || text.includes('invalid') || text.includes('bounce')) return 'recipient_invalid';
  if (text.includes('smtp') || text.includes('sendgrid') || text.includes('mail')) return 'email_provider';
  return 'other';
};

export async function getUserDeliveryMonitorOverview({ userId, windowDays: rawWindowDays } = {}) {
  const windowDays = clampWindowDays(rawWindowDays);
  const params = [windowDays, userId];

  const params48h = [2, userId];

  const [
    runStatusRows,
    sentRows,
    executionFailureRows,
    emailFailureRows,
    zaloFailureRows,
    openedClickedRows,
    timelineRows,
    topRunRows,
    recentErrorRows,
    hardBounceRows,
    zaloDisconnectedRows,
    pendingRetryRows,
    zaloSkipRows,
    sentRows48h,
    execFail48h,
    emailFail48h,
    zaloFail48h,
  ] = await Promise.all([
    safeQuery(
      `SELECT cr.status, COUNT(*)::int AS count
       FROM campaign_runs cr
       JOIN campaigns c ON c.id = cr.id_campaign
       WHERE cr.started_at >= NOW() - ($1::int * INTERVAL '1 day')
         AND c.id_user = $2
       GROUP BY cr.status`,
      params
    ),
    safeQuery(
      `SELECT
         CASE
           WHEN cj.event_type = 'email_sent' THEN 'email'
           WHEN cj.event_channel = 'zalo_group' OR c.campaign_type = 'zalo_group' THEN 'zalo_group'
           ELSE 'zalo'
         END AS channel,
         COUNT(*)::int AS count
       FROM customer_journey cj
       JOIN campaigns c ON c.id = cj.id_campaign
       JOIN campaign_runs cr ON cr.id = cj.id_run
       WHERE cr.started_at >= NOW() - ($1::int * INTERVAL '1 day')
         AND cj.event_type IN ('email_sent', 'zalo_sent')
         AND c.id_user = $2
       GROUP BY channel`,
      params
    ),
    safeQuery(
      `SELECT
         COALESCE(ce.node_subtype, ce.action_type, c.campaign_type::text, 'email') AS channel,
         COUNT(*)::int AS count
       FROM campaign_executions ce
       JOIN campaign_runs cr ON cr.id = ce.id_run
       JOIN campaigns c ON c.id = ce.id_campaign
       WHERE cr.started_at >= NOW() - ($1::int * INTERVAL '1 day')
         AND LOWER(COALESCE(ce.status::text, '')) IN ('failed', 'error', 'failure')
         AND c.id_user = $2
       GROUP BY channel`,
      params
    ),
    safeQuery(
      `SELECT 'email' AS channel, COUNT(*)::int AS count
       FROM email_messages em
       JOIN campaign_runs cr ON cr.id = em.id_campaign_run
       JOIN campaigns c ON c.id = cr.id_campaign
       WHERE cr.started_at >= NOW() - ($1::int * INTERVAL '1 day')
         AND LOWER(COALESCE(em.status::text, '')) IN ('failed', 'bounced', 'error')
         AND c.id_user = $2`,
      params
    ),
    safeQuery(
      `SELECT COALESCE(zm.channel, 'zalo') AS channel, COUNT(*)::int AS count
       FROM zalo_messages zm
       JOIN campaign_runs cr ON cr.id = zm.id_campaign_run
       JOIN campaigns c ON c.id = cr.id_campaign
       WHERE cr.started_at >= NOW() - ($1::int * INTERVAL '1 day')
         AND LOWER(COALESCE(zm.status::text, '')) IN ('failed', 'error')
         AND c.id_user = $2
       GROUP BY COALESCE(zm.channel, 'zalo')`,
      params
    ),
    safeQuery(
      `SELECT
         cj.event_type,
         CASE
           WHEN cj.event_type LIKE 'email_%' THEN 'email'
           WHEN cj.event_channel = 'zalo_group' OR c.campaign_type = 'zalo_group' THEN 'zalo_group'
           ELSE 'zalo'
         END AS channel,
         COUNT(*)::int AS count
       FROM customer_journey cj
       JOIN campaigns c ON c.id = cj.id_campaign
       JOIN campaign_runs cr ON cr.id = cj.id_run
       WHERE cr.started_at >= NOW() - ($1::int * INTERVAL '1 day')
         AND cj.event_type IN ('email_opened', 'email_clicked', 'zalo_clicked')
         AND c.id_user = $2
       GROUP BY cj.event_type, channel`,
      params
    ),
    safeQuery(
      `SELECT
         to_char(date_trunc('hour', cj.event_at), 'YYYY-MM-DD HH24:00') AS bucket,
         COUNT(*) FILTER (WHERE cj.event_type = 'email_sent')::int AS email,
         COUNT(*) FILTER (WHERE cj.event_type = 'zalo_sent' AND COALESCE(cj.event_channel,'') <> 'zalo_group')::int AS zalo,
         COUNT(*) FILTER (WHERE cj.event_type = 'zalo_sent' AND cj.event_channel = 'zalo_group')::int AS zalo_group
       FROM customer_journey cj
       JOIN campaigns c ON c.id = cj.id_campaign
       WHERE cj.event_at >= NOW() - ($1::int * INTERVAL '1 day')
         AND cj.event_type IN ('email_sent', 'zalo_sent')
         AND c.id_user = $2
       GROUP BY date_trunc('hour', cj.event_at)
       ORDER BY date_trunc('hour', cj.event_at) ASC`,
      params
    ),
    safeQuery(
      `SELECT
         cr.id, cr.run_name, cr.status,
         cr.started_at::timestamptz AS started_at,
         cr.completed_at::timestamptz AS completed_at,
         cr.total_recipients, cr.successful_sends, cr.failed_sends, cr.error_message,
         c.campaign_name, c.campaign_type,
         EXTRACT(EPOCH FROM (COALESCE(cr.completed_at, NOW()) - cr.started_at))::float AS duration_seconds
       FROM campaign_runs cr
       JOIN campaigns c ON c.id = cr.id_campaign
       WHERE cr.started_at >= NOW() - ($1::int * INTERVAL '1 day')
         AND c.id_user = $2
       ORDER BY cr.started_at DESC
       LIMIT 20`,
      params
    ),
    safeQuery(
      `SELECT
         ce.id, ce.id_run, ce.node_name, ce.node_subtype, ce.action_type,
         ce.error_message, ce.updated_at::timestamptz AS updated_at,
         c.campaign_name, c.campaign_type
       FROM campaign_executions ce
       JOIN campaigns c ON c.id = ce.id_campaign
       WHERE ce.updated_at >= NOW() - ($1::int * INTERVAL '1 day')
         AND ce.error_message IS NOT NULL
         AND LOWER(COALESCE(ce.status::text, '')) IN ('failed', 'error', 'failure')
         AND c.id_user = $2
       ORDER BY ce.updated_at DESC
       LIMIT 15`,
      params
    ),
    safeQuery(
      `SELECT COUNT(*)::int AS count FROM customers WHERE id_user = $1 AND email_hard_bounced = true`,
      [userId],
      [{ count: 0 }]
    ),
    safeQuery(
      `SELECT COUNT(*)::int AS count FROM zalo_accounts WHERE id_user = $1 AND is_active = true AND status = 'disconnected'`,
      [userId],
      [{ count: 0 }]
    ),
    safeQuery(
      `SELECT COUNT(*)::int AS count
       FROM campaign_run_recipient_steps crrs
       JOIN campaign_runs cr ON cr.id = crrs.id_campaign_run
       JOIN campaigns c ON c.id = cr.id_campaign
       WHERE c.id_user = $1
         AND crrs.meta ? 'retryCount'
         AND TRIM(COALESCE(crrs.meta->>'retryCount','')) ~ '^[0-9]+$'
         AND (crrs.meta->>'retryCount')::int > 0`,
      [userId],
      [{ count: 0 }]
    ),
    safeQuery(
      `SELECT COUNT(*)::int AS count
       FROM campaign_run_recipient_steps crrs
       JOIN campaign_runs cr ON cr.id = crrs.id_campaign_run
       JOIN campaigns c ON c.id = cr.id_campaign
       WHERE c.id_user = $2
         AND crrs.meta ? 'zaloAbandonReason'
         AND crrs.updated_at >= NOW() - ($1::int * INTERVAL '1 day')`,
      params,
      [{ count: 0 }]
    ),
    safeQuery(
      `SELECT
         CASE
           WHEN cj.event_type = 'email_sent' THEN 'email'
           WHEN cj.event_channel = 'zalo_group' OR c.campaign_type = 'zalo_group' THEN 'zalo_group'
           ELSE 'zalo'
         END AS channel,
         COUNT(*)::int AS count
       FROM customer_journey cj
       JOIN campaigns c ON c.id = cj.id_campaign
       JOIN campaign_runs cr ON cr.id = cj.id_run
       WHERE cr.started_at >= NOW() - ($1::int * INTERVAL '1 day')
         AND cj.event_type IN ('email_sent', 'zalo_sent')
         AND c.id_user = $2
       GROUP BY channel`,
      params48h
    ),
    safeQuery(
      `SELECT
         COALESCE(ce.node_subtype, ce.action_type, c.campaign_type::text, 'email') AS channel,
         COUNT(*)::int AS count
       FROM campaign_executions ce
       JOIN campaign_runs cr ON cr.id = ce.id_run
       JOIN campaigns c ON c.id = ce.id_campaign
       WHERE cr.started_at >= NOW() - ($1::int * INTERVAL '1 day')
         AND LOWER(COALESCE(ce.status::text, '')) IN ('failed', 'error', 'failure')
         AND c.id_user = $2
       GROUP BY channel`,
      params48h
    ),
    safeQuery(
      `SELECT 'email' AS channel, COUNT(*)::int AS count
       FROM email_messages em
       JOIN campaign_runs cr ON cr.id = em.id_campaign_run
       JOIN campaigns c ON c.id = cr.id_campaign
       WHERE cr.started_at >= NOW() - ($1::int * INTERVAL '1 day')
         AND LOWER(COALESCE(em.status::text, '')) IN ('failed', 'bounced', 'error')
         AND c.id_user = $2`,
      params48h
    ),
    safeQuery(
      `SELECT COALESCE(zm.channel, 'zalo') AS channel, COUNT(*)::int AS count
       FROM zalo_messages zm
       JOIN campaign_runs cr ON cr.id = zm.id_campaign_run
       JOIN campaigns c ON c.id = cr.id_campaign
       WHERE cr.started_at >= NOW() - ($1::int * INTERVAL '1 day')
         AND LOWER(COALESCE(zm.status::text, '')) IN ('failed', 'error')
         AND c.id_user = $2
       GROUP BY COALESCE(zm.channel, 'zalo')`,
      params48h
    ),
  ]);

  const CHANNEL_LABELS = { email: 'Email', zalo: 'Zalo cá nhân', zalo_group: 'Zalo nhóm' };
  const buildChannels = (sRows, execFRows, emailFRows, zaloFRows, ocRows = []) => {
    const map = {
      email: { channel: 'email', label: CHANNEL_LABELS.email, sent: 0, failed: 0, opened: 0, clicked: 0 },
      zalo: { channel: 'zalo', label: CHANNEL_LABELS.zalo, sent: 0, failed: 0, opened: 0, clicked: 0 },
      zalo_group: { channel: 'zalo_group', label: CHANNEL_LABELS.zalo_group, sent: 0, failed: 0, opened: 0, clicked: 0 },
    };
    sRows.forEach((row) => { map[inferChannel(row)].sent += toNumber(row.count); });
    [...execFRows, ...emailFRows, ...zaloFRows].forEach((row) => {
      map[inferChannel(row)].failed += toNumber(row.count);
    });
    ocRows.forEach((row) => {
      const ch = map[inferChannel(row)];
      const type = String(row.event_type || '').toLowerCase();
      if (type.includes('opened')) ch.opened += toNumber(row.count);
      if (type.includes('clicked')) ch.clicked += toNumber(row.count);
    });
    return Object.values(map).map((item) => {
      const attempts = item.sent + item.failed;
      return { ...item, attempts, successRate: attempts > 0 ? Math.round((item.sent / attempts) * 1000) / 10 : 0 };
    });
  };
  const channels = buildChannels(sentRows, executionFailureRows, emailFailureRows, zaloFailureRows, openedClickedRows);
  const channelsRecent = buildChannels(sentRows48h, execFail48h, emailFail48h, zaloFail48h);

  const runStatus = runStatusRows.reduce((acc, row) => {
    acc[String(row.status || 'unknown')] = toNumber(row.count);
    return acc;
  }, {});

  const summary = channels.reduce(
    (acc, item) => { acc.sent += item.sent; acc.failed += item.failed; acc.opened += item.opened; acc.clicked += item.clicked; return acc; },
    { sent: 0, failed: 0, opened: 0, clicked: 0,
      totalRuns: Object.values(runStatus).reduce((s, v) => s + toNumber(v), 0),
      runningRuns: toNumber(runStatus.running),
      completedRuns: toNumber(runStatus.completed),
      failedRuns: toNumber(runStatus.failed) }
  );
  summary.attempts = summary.sent + summary.failed;
  summary.successRate = summary.attempts > 0 ? Math.round((summary.sent / summary.attempts) * 1000) / 10 : 0;

  const topRuns = topRunRows.map((row) => {
    const attempts = toNumber(row.successful_sends) + toNumber(row.failed_sends);
    const durationSeconds = Math.max(0, toNumber(row.duration_seconds));
    const minutes = Math.max(durationSeconds / 60, 1 / 60);
    return {
      id: row.id, runName: row.run_name, campaignName: row.campaign_name, campaignType: row.campaign_type,
      status: row.status, startedAt: row.started_at, completedAt: row.completed_at,
      totalRecipients: toNumber(row.total_recipients), successfulSends: toNumber(row.successful_sends),
      failedSends: toNumber(row.failed_sends), durationSeconds,
      throughputPerMinute: Math.round((toNumber(row.successful_sends) / minutes) * 10) / 10,
      failureRate: attempts > 0 ? Math.round((toNumber(row.failed_sends) / attempts) * 1000) / 10 : 0,
      errorMessage: row.error_message,
    };
  });

  const recentErrors = recentErrorRows.map((row) => ({
    id: row.id, runId: row.id_run, campaignName: row.campaign_name,
    channel: inferChannel(row), nodeName: row.node_name, nodeSubtype: row.node_subtype,
    category: classifyFailure(row.error_message),
    errorMessage: String(row.error_message || '').slice(0, 500), updatedAt: row.updated_at,
  }));

  const quietStart = Number.parseInt(process.env.ZALO_OUTBOUND_QUIET_HOURS_START ?? '23', 10);
  const quietEnd = Number.parseInt(process.env.ZALO_OUTBOUND_QUIET_HOURS_END ?? '6', 10);
  const nowVN = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const currentHourVN = nowVN.getUTCHours();
  const inQuietHours = quietStart > quietEnd
    ? currentHourVN >= quietStart || currentHourVN < quietEnd
    : currentHourVN >= quietStart && currentHourVN < quietEnd;

  return {
    generatedAt: new Date().toISOString(),
    windowDays,
    summary,
    channels,
    channelsRecent,
    timeline: timelineRows.map((row) => ({
      bucket: row.bucket,
      email: toNumber(row.email),
      zalo: toNumber(row.zalo),
      zaloGroup: toNumber(row.zalo_group),
      total: toNumber(row.email) + toNumber(row.zalo) + toNumber(row.zalo_group),
    })),
    topRuns,
    recentErrors,
    health: {
      hardBounceCount: toNumber(hardBounceRows[0]?.count),
      zaloDisconnectedCount: toNumber(zaloDisconnectedRows[0]?.count),
      pendingRetryCount: toNumber(pendingRetryRows[0]?.count),
      zaloSkipCount: toNumber(zaloSkipRows[0]?.count),
      zaloQuietHours: { inQuietHours, start: quietStart, end: quietEnd, currentHourVN },
    },
  };
}
