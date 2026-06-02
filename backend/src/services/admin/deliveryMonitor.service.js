import db from '../../config/database.js';
import outboundMessageQueueService from '../queue/outboundMessageQueue.service.js';

const CHANNEL_LABELS = {
  email: 'Email',
  zalo: 'Zalo cá nhân',
  zalo_group: 'Zalo nhóm',
};

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
  const raw = [
    row.channel,
    row.event_channel,
    row.node_subtype,
    row.action_type,
    row.campaign_type,
  ].map((item) => String(item || '').toLowerCase());
  const joined = raw.join(' ');
  if (joined.includes('zalo_group')) return 'zalo_group';
  if (joined.includes('zalo')) return 'zalo';
  return 'email';
};

const classifyFailure = (message = '') => {
  const text = String(message || '').toLowerCase();
  if (!text.trim()) return 'unknown';
  if (text.includes('rate') || text.includes('limit') || text.includes('quota') || text.includes('too many')) {
    return 'rate_limit';
  }
  if (text.includes('block') || text.includes('ban') || text.includes('spam') || text.includes('restrict')) {
    return 'provider_block';
  }
  if (text.includes('timeout') || text.includes('etimedout') || text.includes('econnreset')) {
    return 'network_timeout';
  }
  if (text.includes('auth') || text.includes('login') || text.includes('session') || text.includes('cookie')) {
    return 'account_session';
  }
  if (text.includes('not found') || text.includes('unreachable') || text.includes('invalid') || text.includes('bounce')) {
    return 'recipient_invalid';
  }
  if (text.includes('smtp') || text.includes('sendgrid') || text.includes('mail')) {
    return 'email_provider';
  }
  return 'other';
};

const buildChannelMap = () => ({
  email: { channel: 'email', label: CHANNEL_LABELS.email, sent: 0, failed: 0, opened: 0, clicked: 0, successRate: 0 },
  zalo: { channel: 'zalo', label: CHANNEL_LABELS.zalo, sent: 0, failed: 0, opened: 0, clicked: 0, successRate: 0 },
  zalo_group: { channel: 'zalo_group', label: CHANNEL_LABELS.zalo_group, sent: 0, failed: 0, opened: 0, clicked: 0, successRate: 0 },
});

const normalizeChannelSummary = ({ sentRows, failedRows, openedClickedRows }) => {
  const channels = buildChannelMap();

  sentRows.forEach((row) => {
    const channel = inferChannel(row);
    channels[channel].sent += toNumber(row.count);
  });

  failedRows.forEach((row) => {
    const channel = inferChannel(row);
    channels[channel].failed += toNumber(row.count);
  });

  openedClickedRows.forEach((row) => {
    const channel = inferChannel(row);
    const type = String(row.event_type || '').toLowerCase();
    if (type.includes('opened')) channels[channel].opened += toNumber(row.count);
    if (type.includes('clicked')) channels[channel].clicked += toNumber(row.count);
  });

  return Object.values(channels).map((item) => {
    const attempts = item.sent + item.failed;
    return {
      ...item,
      attempts,
      successRate: attempts > 0 ? Math.round((item.sent / attempts) * 1000) / 10 : 0,
    };
  });
};

const buildSignals = ({ summary, queueMetrics, stalledRuns, unreachableCount, failureGroups }) => {
  const signals = [];
  const pendingQueue = toNumber(queueMetrics?.waiting) + toNumber(queueMetrics?.active) + toNumber(queueMetrics?.delayed);
  const failedRate = summary.attempts > 0 ? (summary.failed / summary.attempts) * 100 : 0;

  if (pendingQueue >= 100) {
    signals.push({
      level: 'warning',
      code: 'queue_backlog',
      value: pendingQueue,
    });
  }
  if (failedRate >= 15) {
    signals.push({
      level: 'critical',
      code: 'high_failure_rate',
      value: Math.round(failedRate * 10) / 10,
    });
  }
  if (stalledRuns > 0) {
    signals.push({
      level: 'warning',
      code: 'stalled_runs',
      value: stalledRuns,
    });
  }
  if (unreachableCount >= 50) {
    signals.push({
      level: 'warning',
      code: 'many_unreachable_zalo',
      value: unreachableCount,
    });
  }
  if (failureGroups.some((item) => item.category === 'provider_block' || item.category === 'rate_limit')) {
    signals.push({
      level: 'warning',
      code: 'provider_limit_detected',
      value: null,
    });
  }

  return signals;
};

export async function getDeliveryMonitorOverview({ windowDays: rawWindowDays } = {}) {
  const windowDays = clampWindowDays(rawWindowDays);
  const params = [windowDays];

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
    failureRows,
    unreachableRows,
    hardBounceRows,
    zaloDisconnectedRows,
    pendingRetryRows,
    zaloSkipRows,
  ] = await Promise.all([
    safeQuery(
      `SELECT status, COUNT(*)::int AS count
       FROM campaign_runs
       WHERE started_at >= NOW() - ($1::int * INTERVAL '1 day')
       GROUP BY status`,
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
       LEFT JOIN campaigns c ON c.id = cj.id_campaign
       WHERE cj.event_at >= NOW() - ($1::int * INTERVAL '1 day')
         AND cj.event_type IN ('email_sent', 'zalo_sent')
       GROUP BY channel`,
      params
    ),
    safeQuery(
      `SELECT
         COALESCE(ce.node_subtype, ce.action_type, c.campaign_type, 'email') AS channel,
         COUNT(*)::int AS count
       FROM campaign_executions ce
       LEFT JOIN campaigns c ON c.id = ce.id_campaign
       WHERE ce.updated_at >= NOW() - ($1::int * INTERVAL '1 day')
         AND LOWER(COALESCE(ce.status::text, '')) IN ('failed', 'error', 'failure')
       GROUP BY channel`,
      params
    ),
    safeQuery(
      `SELECT 'email' AS channel, COUNT(*)::int AS count
       FROM email_messages
       WHERE created_at >= NOW() - ($1::int * INTERVAL '1 day')
         AND LOWER(COALESCE(status::text, '')) IN ('failed', 'bounced', 'error')`,
      params
    ),
    safeQuery(
      `SELECT COALESCE(channel, 'zalo') AS channel, COUNT(*)::int AS count
       FROM zalo_messages
       WHERE created_at >= NOW() - ($1::int * INTERVAL '1 day')
         AND LOWER(COALESCE(status::text, '')) IN ('failed', 'error')
       GROUP BY COALESCE(channel, 'zalo')`,
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
       LEFT JOIN campaigns c ON c.id = cj.id_campaign
       WHERE cj.event_at >= NOW() - ($1::int * INTERVAL '1 day')
         AND cj.event_type IN ('email_opened', 'email_clicked', 'zalo_clicked')
       GROUP BY cj.event_type, channel`,
      params
    ),
    safeQuery(
      `SELECT
         to_char(date_trunc('hour', cj.event_at), 'YYYY-MM-DD HH24:00') AS bucket,
         COUNT(*) FILTER (WHERE cj.event_type = 'email_sent')::int AS email,
         COUNT(*) FILTER (WHERE cj.event_type = 'zalo_sent' AND COALESCE(cj.event_channel, '') <> 'zalo_group')::int AS zalo,
         COUNT(*) FILTER (WHERE cj.event_type = 'zalo_sent' AND cj.event_channel = 'zalo_group')::int AS zalo_group
       FROM customer_journey cj
       WHERE cj.event_at >= NOW() - ($1::int * INTERVAL '1 day')
         AND cj.event_type IN ('email_sent', 'zalo_sent')
       GROUP BY date_trunc('hour', cj.event_at)
       ORDER BY date_trunc('hour', cj.event_at) ASC`,
      params
    ),
    safeQuery(
      `SELECT
         cr.id,
         cr.run_name,
         cr.status,
         cr.started_at::timestamptz AS started_at,
         cr.completed_at::timestamptz AS completed_at,
         cr.total_recipients,
         cr.successful_sends,
         cr.failed_sends,
         cr.error_message,
         c.campaign_name,
         c.campaign_type,
         EXTRACT(EPOCH FROM (COALESCE(cr.completed_at, NOW()) - cr.started_at))::float AS duration_seconds
       FROM campaign_runs cr
       JOIN campaigns c ON c.id = cr.id_campaign
       WHERE cr.started_at >= NOW() - ($1::int * INTERVAL '1 day')
       ORDER BY (cr.failed_sends::float / GREATEST(cr.successful_sends + cr.failed_sends, 1)) DESC,
                duration_seconds DESC
       LIMIT 10`,
      params
    ),
    safeQuery(
      `SELECT
         ce.id,
         ce.id_run,
         ce.node_name,
         ce.node_subtype,
         ce.action_type,
         ce.error_message,
         ce.updated_at::timestamptz AS updated_at,
         c.campaign_name,
         c.campaign_type
       FROM campaign_executions ce
       LEFT JOIN campaigns c ON c.id = ce.id_campaign
       WHERE ce.updated_at >= NOW() - ($1::int * INTERVAL '1 day')
         AND ce.error_message IS NOT NULL
         AND LOWER(COALESCE(ce.status::text, '')) IN ('failed', 'error', 'failure')
       ORDER BY ce.updated_at DESC
       LIMIT 20`,
      params
    ),
    safeQuery(
      `SELECT
         COALESCE(NULLIF(ce.error_message, ''), 'Unknown error') AS error_message,
         COALESCE(ce.node_subtype, ce.action_type, c.campaign_type, 'unknown') AS channel,
         COUNT(*)::int AS count,
         MAX(ce.updated_at)::timestamptz AS last_seen_at
       FROM campaign_executions ce
       LEFT JOIN campaigns c ON c.id = ce.id_campaign
       WHERE ce.updated_at >= NOW() - ($1::int * INTERVAL '1 day')
         AND ce.error_message IS NOT NULL
         AND LOWER(COALESCE(ce.status::text, '')) IN ('failed', 'error', 'failure')
       GROUP BY COALESCE(NULLIF(ce.error_message, ''), 'Unknown error'), channel
       ORDER BY COUNT(*) DESC, MAX(ce.updated_at) DESC
       LIMIT 12`,
      params
    ),
    safeQuery(
      `SELECT COUNT(*)::int AS count
       FROM zalo_unreachable_phones
       WHERE updated_at >= NOW() - ($1::int * INTERVAL '1 day')`,
      params,
      [{ count: 0 }]
    ),
    safeQuery(
      `SELECT COUNT(*)::int AS count FROM customers WHERE email_hard_bounced = true`,
      [],
      [{ count: 0 }]
    ),
    safeQuery(
      `SELECT COUNT(*)::int AS count FROM zalo_accounts WHERE is_active = true AND status = 'disconnected'`,
      [],
      [{ count: 0 }]
    ),
    safeQuery(
      `SELECT COUNT(*)::int AS count
       FROM campaign_run_recipient_steps
       WHERE meta ? 'retryCount'
         AND TRIM(COALESCE(meta->>'retryCount','')) ~ '^[0-9]+$'
         AND (meta->>'retryCount')::int > 0`,
      [],
      [{ count: 0 }]
    ),
    safeQuery(
      `SELECT COUNT(*)::int AS count
       FROM campaign_run_recipient_steps
       WHERE meta ? 'zaloAbandonReason'
         AND updated_at >= NOW() - ($1::int * INTERVAL '1 day')`,
      params,
      [{ count: 0 }]
    ),
  ]);

  const queueMetrics = await outboundMessageQueueService.getQueueMetrics();
  const redisStats = await outboundMessageQueueService.getRedisStats();

  const quietStart = Number.parseInt(process.env.ZALO_OUTBOUND_QUIET_HOURS_START ?? '23', 10);
  const quietEnd = Number.parseInt(process.env.ZALO_OUTBOUND_QUIET_HOURS_END ?? '6', 10);
  const nowVN = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const currentHourVN = nowVN.getUTCHours();
  const inQuietHours = quietStart > quietEnd
    ? currentHourVN >= quietStart || currentHourVN < quietEnd
    : currentHourVN >= quietStart && currentHourVN < quietEnd;
  const failedRows = [...executionFailureRows, ...emailFailureRows, ...zaloFailureRows];
  const channels = normalizeChannelSummary({ sentRows, failedRows, openedClickedRows });

  const runStatus = runStatusRows.reduce((acc, row) => {
    acc[String(row.status || 'unknown')] = toNumber(row.count);
    return acc;
  }, {});

  const summary = channels.reduce(
    (acc, item) => {
      acc.sent += item.sent;
      acc.failed += item.failed;
      acc.opened += item.opened;
      acc.clicked += item.clicked;
      return acc;
    },
    {
      sent: 0,
      failed: 0,
      opened: 0,
      clicked: 0,
      totalRuns: Object.values(runStatus).reduce((sum, value) => sum + toNumber(value), 0),
      runningRuns: toNumber(runStatus.running),
      completedRuns: toNumber(runStatus.completed),
      failedRuns: toNumber(runStatus.failed),
      stoppedRuns: toNumber(runStatus.stopped),
    }
  );
  summary.attempts = summary.sent + summary.failed;
  summary.successRate = summary.attempts > 0 ? Math.round((summary.sent / summary.attempts) * 1000) / 10 : 0;

  const topRuns = topRunRows.map((row) => {
    const attempts = toNumber(row.successful_sends) + toNumber(row.failed_sends);
    const durationSeconds = Math.max(0, toNumber(row.duration_seconds));
    const minutes = Math.max(durationSeconds / 60, 1 / 60);
    return {
      id: row.id,
      runName: row.run_name,
      campaignName: row.campaign_name,
      campaignType: row.campaign_type,
      status: row.status,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      totalRecipients: toNumber(row.total_recipients),
      successfulSends: toNumber(row.successful_sends),
      failedSends: toNumber(row.failed_sends),
      durationSeconds,
      throughputPerMinute: Math.round((toNumber(row.successful_sends) / minutes) * 10) / 10,
      failureRate: attempts > 0 ? Math.round((toNumber(row.failed_sends) / attempts) * 1000) / 10 : 0,
      errorMessage: row.error_message,
    };
  });

  const failureGroups = failureRows.map((row) => ({
    message: String(row.error_message || 'Unknown error').slice(0, 240),
    category: classifyFailure(row.error_message),
    channel: inferChannel(row),
    count: toNumber(row.count),
    lastSeenAt: row.last_seen_at,
  }));

  const recentErrors = recentErrorRows.map((row) => ({
    id: row.id,
    runId: row.id_run,
    campaignName: row.campaign_name,
    channel: inferChannel(row),
    nodeName: row.node_name,
    nodeSubtype: row.node_subtype,
    category: classifyFailure(row.error_message),
    errorMessage: String(row.error_message || '').slice(0, 500),
    updatedAt: row.updated_at,
  }));

  const stalledRuns = topRuns.filter(
    (row) => row.status === 'running' && row.durationSeconds >= 60 * 60
  ).length;
  const unreachableCount = toNumber(unreachableRows[0]?.count);
  const hardBounceCount = toNumber(hardBounceRows[0]?.count);
  const zaloDisconnectedCount = toNumber(zaloDisconnectedRows[0]?.count);
  const pendingRetryCount = toNumber(pendingRetryRows[0]?.count);
  const zaloSkipCount = toNumber(zaloSkipRows[0]?.count);

  return {
    generatedAt: new Date().toISOString(),
    windowDays,
    summary,
    channels,
    timeline: timelineRows.map((row) => ({
      bucket: row.bucket,
      email: toNumber(row.email),
      zalo: toNumber(row.zalo),
      zaloGroup: toNumber(row.zalo_group),
      total: toNumber(row.email) + toNumber(row.zalo) + toNumber(row.zalo_group),
    })),
    topRuns,
    failureGroups,
    recentErrors,
    queue: queueMetrics || { available: false },
    redis: redisStats || { available: false },
    signals: buildSignals({ summary, queueMetrics, stalledRuns, unreachableCount, failureGroups }),
    health: {
      hardBounceCount,
      zaloDisconnectedCount,
      pendingRetryCount,
      zaloSkipCount,
      zaloQuietHours: { inQuietHours, start: quietStart, end: quietEnd, currentHourVN },
    },
  };
}
