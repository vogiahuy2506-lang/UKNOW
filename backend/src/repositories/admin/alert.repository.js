import db from '../../config/database.js';
import { stuckEinvoiceKindSql } from '../payment/einvoice.repository.js';

export async function listRules() {
  const { rows } = await db.query(
    `SELECT id, code, name, description, threshold_value AS "thresholdValue",
            window_minutes AS "windowMinutes", channel, severity, enabled,
            cooldown_minutes AS "cooldownMinutes", config,
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM alert_rules
     ORDER BY id ASC`
  );
  return rows;
}

export async function getRuleByCode(code) {
  const { rows } = await db.query(
    `SELECT id, code, name, description, threshold_value AS "thresholdValue",
            window_minutes AS "windowMinutes", channel, severity, enabled,
            cooldown_minutes AS "cooldownMinutes", config
     FROM alert_rules WHERE code = $1`,
    [code]
  );
  return rows[0] || null;
}

export async function updateRule(id, patch) {
  const fields = [];
  const values = [];
  let i = 1;
  const map = {
    enabled: 'enabled',
    thresholdValue: 'threshold_value',
    windowMinutes: 'window_minutes',
    cooldownMinutes: 'cooldown_minutes',
    channel: 'channel',
    severity: 'severity',
    config: 'config',
    name: 'name',
    description: 'description',
  };
  for (const [key, col] of Object.entries(map)) {
    if (patch[key] === undefined) continue;
    fields.push(`${col} = $${i++}`);
    values.push(key === 'config' ? JSON.stringify(patch[key]) : patch[key]);
  }
  if (!fields.length) return getRuleById(id);
  fields.push('updated_at = NOW()');
  values.push(id);
  const { rows } = await db.query(
    `UPDATE alert_rules SET ${fields.join(', ')}
     WHERE id = $${i}
     RETURNING id, code, name, description, threshold_value AS "thresholdValue",
               window_minutes AS "windowMinutes", channel, severity, enabled,
               cooldown_minutes AS "cooldownMinutes", config,
               created_at AS "createdAt", updated_at AS "updatedAt"`,
    values
  );
  return rows[0] || null;
}

export async function getRuleById(id) {
  const { rows } = await db.query(
    `SELECT id, code, name, description, threshold_value AS "thresholdValue",
            window_minutes AS "windowMinutes", channel, severity, enabled,
            cooldown_minutes AS "cooldownMinutes", config,
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM alert_rules WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

export async function lastEventForRule(ruleId) {
  const { rows } = await db.query(
    `SELECT id, fired_at AS "firedAt", measured_value AS "measuredValue",
            message, resolved, notified
     FROM alert_events
     WHERE rule_id = $1
     ORDER BY fired_at DESC
     LIMIT 1`,
    [ruleId]
  );
  return rows[0] || null;
}

export async function insertEvent({ ruleId, measuredValue, message, payload = {}, notified = false }) {
  const { rows } = await db.query(
    `INSERT INTO alert_events (rule_id, measured_value, message, payload, notified)
     VALUES ($1, $2, $3, $4::jsonb, $5)
     RETURNING id, rule_id AS "ruleId", fired_at AS "firedAt",
               measured_value AS "measuredValue", message, resolved, notified`,
    [ruleId, measuredValue, message, JSON.stringify(payload || {}), notified]
  );
  return rows[0];
}

export async function listEvents({ limit = 50, offset = 0, unresolvedOnly = false } = {}) {
  const params = [limit, offset];
  const where = unresolvedOnly ? 'WHERE e.resolved = FALSE' : '';
  const { rows } = await db.query(
    `SELECT e.id, e.rule_id AS "ruleId", r.code AS "ruleCode", r.name AS "ruleName",
            r.severity, e.fired_at AS "firedAt", e.measured_value AS "measuredValue",
            e.message, e.payload, e.resolved, e.resolved_at AS "resolvedAt",
            e.resolved_by AS "resolvedBy", e.notified
     FROM alert_events e
     JOIN alert_rules r ON r.id = e.rule_id
     ${where}
     ORDER BY e.fired_at DESC
     LIMIT $1 OFFSET $2`,
    params
  );
  return rows;
}

export async function resolveEvent(eventId, resolvedBy) {
  const { rows } = await db.query(
    `UPDATE alert_events
     SET resolved = TRUE, resolved_at = NOW(), resolved_by = $2
     WHERE id = $1
     RETURNING id, resolved, resolved_at AS "resolvedAt", resolved_by AS "resolvedBy"`,
    [eventId, resolvedBy]
  );
  return rows[0] || null;
}

/** Metric helpers for evaluators */
export async function metricCampaignFailRate(windowMinutes, minRecipients = 20) {
  const { rows } = await db.query(
    `SELECT
       COALESCE(SUM(total_recipients), 0)::int AS total,
       COALESCE(SUM(failed_sends), 0)::int AS failed
     FROM campaign_runs
     WHERE started_at >= NOW() - ($1 || ' minutes')::interval
       AND COALESCE(total_recipients, 0) > 0`,
    [String(windowMinutes)]
  );
  const total = Number(rows[0]?.total || 0);
  const failed = Number(rows[0]?.failed || 0);
  if (total < minRecipients) return { rate: 0, total, failed, skipped: true };
  return { rate: failed / total, total, failed, skipped: false };
}

export async function metricCampaignRunFailures(windowMinutes) {
  const { rows } = await db.query(
    `SELECT
       count(*) FILTER (WHERE status = 'failed')::int AS failed,
       count(DISTINCT id_campaign) FILTER (WHERE status = 'failed')::int AS campaigns
     FROM campaign_runs
     WHERE started_at >= NOW() - ($1 || ' minutes')::interval`,
    [String(windowMinutes)]
  );
  const failed = Number(rows[0]?.failed || 0);
  const campaigns = Number(rows[0]?.campaigns || 0);
  return { failed, campaigns };
}

export async function metricCampaignRepeatedFailures(days = 3) {
  const { rows } = await db.query(
    `SELECT
       id_campaign,
       COUNT(DISTINCT DATE(started_at AT TIME ZONE 'Asia/Ho_Chi_Minh'))::int AS failed_days,
       COUNT(*)::int AS failed_runs
     FROM campaign_runs
     WHERE started_at >= NOW() - ($1 || ' days')::interval
       AND id_campaign NOT IN (
         SELECT DISTINCT id_campaign
         FROM campaign_runs
         WHERE started_at >= NOW() - ($1 || ' days')::interval
           AND status = 'completed'
       )
       AND status = 'failed'
     GROUP BY id_campaign
     HAVING COUNT(DISTINCT DATE(started_at AT TIME ZONE 'Asia/Ho_Chi_Minh')) >= $2`,
    [String(days), Number(days)]
  );
  return rows.map((r) => ({
    campaignId: r.id_campaign,
    failedDays: Number(r.failed_days),
    failedRuns: Number(r.failed_runs),
  }));
}

export async function metricStalledRuns(hours = 6) {
  const { rows } = await db.query(
    `SELECT
       cr.id,
       cr.id_campaign,
       cr.started_at,
       cr.total_recipients,
       cr.successful_sends,
       cr.failed_sends,
       c.campaign_name AS campaign_name,
       MAX(GREATEST(ce.created_at, ce.updated_at)) AS last_execution_at
     FROM campaign_runs cr
     LEFT JOIN campaigns c ON c.id = cr.id_campaign
     LEFT JOIN campaign_executions ce ON ce.id_run = cr.id
     WHERE cr.status = 'running'
       AND cr.started_at <= NOW() - ($1 || ' hours')::interval
     GROUP BY cr.id, cr.id_campaign, cr.started_at, cr.total_recipients, cr.successful_sends, cr.failed_sends, c.campaign_name
     HAVING MAX(GREATEST(ce.created_at, ce.updated_at)) IS NULL
         OR MAX(GREATEST(ce.created_at, ce.updated_at)) <= NOW() - ($1 || ' hours')::interval`,
    [String(hours)]
  );
  return rows.map((r) => ({
    runId: r.id,
    campaignId: r.id_campaign,
    campaignName: r.campaign_name || '',
    startedAt: r.started_at,
    lastExecutionAt: r.last_execution_at,
    totalRecipients: Number(r.total_recipients || 0),
    successfulSends: Number(r.successful_sends || 0),
    failedSends: Number(r.failed_sends || 0),
  }));
}

export async function metricZaloInboundCount(windowMinutes) {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS cnt
     FROM zalo_personal_messages
     WHERE created_at >= NOW() - ($1 || ' minutes')::interval
       AND COALESCE(role, 'visitor') = 'visitor'`,
    [String(windowMinutes)]
  );
  return Number(rows[0]?.cnt || 0);
}

export async function metricConsecutiveCronNoops(jobCode, limit = 3) {
  const { rows } = await db.query(
    `SELECT status, result
     FROM cron_job_runs
     WHERE job_code = $1
     ORDER BY started_at DESC
     LIMIT $2`,
    [jobCode, limit]
  );
  if (rows.length < limit) return { consecutive: 0, enough: false };
  let consecutive = 0;
  for (const row of rows) {
    // 'noop' = chính thức không có gì để làm (status='noop' do cron set).
    // Cũng coi như noop khi run kết thúc failure.
    // KHÔNG coi synced=0 + status='success' là noop — đó là kết quả bình thường
    // (cron chạy xong, không có tin mới là chuyện thường).
    const isNoop = row.status === 'noop' || row.status === 'failure';
    if (!isNoop) break;
    consecutive += 1;
  }
  return { consecutive, enough: true };
}

/**
 * Latest reconcile run rescued count (webhook gap detector).
 * @param {string} [jobCode]
 * @returns {Promise<{ rescued: number, found: boolean, result: object|null }>}
 */
export async function metricLatestCronRescued(jobCode = 'payos_order_reconcile') {
  const { rows } = await db.query(
    `SELECT status, result
     FROM cron_job_runs
     WHERE job_code = $1
     ORDER BY started_at DESC
     LIMIT 1`,
    [jobCode]
  );
  if (!rows.length) return { rescued: 0, found: false, result: null };
  const rescued = Number(rows[0].result?.rescued ?? 0);
  return { rescued, found: true, result: rows[0].result || {} };
}

/**
 * Latest einvoice series check result (series remaining count & year mismatch).
 *
 * CHỈ đọc run đã kết thúc (`finished_at IS NOT NULL`). `recordRun` chèn dòng
 * `status='running'` với `result='{}'` ngay khi job bắt đầu; nếu đọc phải dòng đó
 * thì `cLai` = null trong khi không có lỗi nào, và evaluator bắn cảnh báo critical
 * giả "Không đọc được số lượng hoá đơn còn lại". Đã xảy ra thật: 14 lần từ
 * 17/08–31/08/2026, mỗi ngày lúc 03:10:0x, do cron kiểm dải số và evaluator
 * (chạy mỗi 5 phút, tức đúng phút 10) cùng nổ lúc 03:10:00 trong khi job mất
 * ~150–350ms mới ghi xong.
 *
 * @param {string} [jobCode]
 * @returns {Promise<{ cLai: number|null, yearMismatch: boolean, notFound: boolean, found: boolean, result: object|null }>}
 */
export async function metricLatestEinvoiceSeries(jobCode = 'einvoice_series_check') {
  const { rows } = await db.query(
    `SELECT status, result, error_message
     FROM cron_job_runs
     WHERE job_code = $1
       AND finished_at IS NOT NULL
     ORDER BY started_at DESC
     LIMIT 1`,
    [jobCode]
  );
  if (!rows.length) return { cLai: null, yearMismatch: false, notFound: false, error: null, found: false, result: null };
  const res = rows[0].result || {};
  const cLai = res.cLai != null ? Number(res.cLai) : null;
  const yearMismatch = Boolean(res.yearMismatch);
  const notFound = Boolean(res.notFound);
  const error = res.error
    ? String(res.error)
    : (rows[0].status === 'failure' ? (rows[0].error_message || 'Cron job failed') : null);
  return { cLai, yearMismatch, notFound, error, found: true, result: res };
}

/**
 * Hoá đơn điện tử đã thu tiền nhưng chưa phát hành được, chia 2 nhóm:
 *
 * - `dead`: cron retry KHÔNG BAO GIỜ nhặt lại. Gồm `cqt_rejected` (không nằm trong
 *   mệnh đề claim) và `failed` với mã lỗi ngoài `RETRYABLE_MATBAO_ERROR_CODES`
 *   (matbaoInvoice.service.js:450 bỏ qua rồi `continue`). Không giới hạn tuổi:
 *   nghĩa vụ xuất hoá đơn không hết hạn theo thời gian.
 * - `stalled`: về lý thuyết cron nhặt được nhưng nằm im quá lâu — dấu hiệu worker
 *   tắt, hết lease, hoặc backoff chồng chất.
 *
 * Danh sách mã retry được giữ ở einvoice.repository.js; truyền vào để tránh import
 * chéo giữa hai repository.
 */
export async function metricStuckEinvoices(staleHours) {
  const { rows } = await db.query(
    `WITH classified AS (
       SELECT
         e.id,
         e.status,
         e.error_code,
         o.order_code,
         ${stuckEinvoiceKindSql('$1')} AS kind
       FROM einvoices e
       JOIN orders o ON o.id = e.order_id
       WHERE e.status IN ('pending', 'processing', 'failed', 'cqt_rejected')
     ),
     flagged AS (
       SELECT * FROM classified WHERE kind IS NOT NULL
     )
     SELECT
       (SELECT COUNT(*)::int FROM flagged WHERE kind = 'dead')    AS dead_count,
       (SELECT COUNT(*)::int FROM flagged WHERE kind = 'stalled') AS stalled_count,
       (SELECT COALESCE(json_agg(s), '[]'::json) FROM (
          SELECT order_code AS "orderCode", status, error_code AS "errorCode", kind
          FROM flagged
          ORDER BY kind ASC, id ASC
          LIMIT 5
        ) s) AS samples`,
    [String(staleHours)]
  );
  const r = rows[0] || {};
  const deadCount = Number(r.dead_count || 0);
  const stalledCount = Number(r.stalled_count || 0);
  return {
    deadCount,
    stalledCount,
    total: deadCount + stalledCount,
    samples: Array.isArray(r.samples) ? r.samples : [],
  };
}

export async function metricAiTokenSpike() {
  const { rows } = await db.query(
    `WITH today AS (
       SELECT COALESCE(SUM(delta), 0)::numeric AS tokens
       FROM usage_logs
       WHERE resource_type = 'ai_token'
         AND created_at >= date_trunc('day', NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')
             AT TIME ZONE 'Asia/Ho_Chi_Minh'
     ),
     prev7 AS (
       SELECT COALESCE(AVG(day_total), 0)::numeric AS avg_tokens
       FROM (
         SELECT DATE(created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AS d,
                SUM(delta)::numeric AS day_total
         FROM usage_logs
         WHERE resource_type = 'ai_token'
           AND created_at >= (date_trunc('day', NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')
                 AT TIME ZONE 'Asia/Ho_Chi_Minh') - INTERVAL '7 days'
           AND created_at < date_trunc('day', NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')
                 AT TIME ZONE 'Asia/Ho_Chi_Minh'
         GROUP BY 1
       ) t
     )
     SELECT today.tokens AS "todayTokens", prev7.avg_tokens AS "avgPrev7"
     FROM today, prev7`
  );
  const todayTokens = Number(rows[0]?.todayTokens || 0);
  const avgPrev7 = Number(rows[0]?.avgPrev7 || 0);
  return { todayTokens, avgPrev7, ratio: avgPrev7 > 0 ? todayTokens / avgPrev7 : 0 };
}

/**
 * Tài khoản Zalo mất kết nối lâu hơn `minutes` NHƯNG chưa quá `maxAgeMinutes`.
 *
 * Cận trên là bắt buộc: không có nó thì tài khoản khách bỏ dùng từ nhiều tháng
 * trước sẽ làm quy tắc bắn mỗi lần đánh giá, mãi mãi. Cảnh báo phải báo "vừa có
 * thứ hỏng", không phải "vẫn còn thứ chưa ai sửa".
 *
 * @param {number} minutes ngưỡng dưới — mất kết nối ít nhất bấy nhiêu phút
 * @param {number} maxAgeMinutes cận trên — bỏ qua thứ hỏng lâu hơn mốc này
 */
export async function metricZaloDisconnected(minutes, maxAgeMinutes) {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS cnt
     FROM zalo_settings
     WHERE COALESCE(status, '') <> 'connected'
       AND COALESCE(status, '') <> 'needs_reauth'
       AND updated_at <= NOW() - ($1 || ' minutes')::interval
       AND updated_at >= NOW() - ($2 || ' minutes')::interval`,
    [String(minutes), String(maxAgeMinutes)]
  );
  return Number(rows[0]?.cnt || 0);
}

/**
 * Đơn pending lâu hơn `hours` NHƯNG được tạo trong vòng `maxAgeHours`.
 * Xem ghi chú ở `metricZaloDisconnected` về lý do phải có cận trên.
 */
export async function metricStalePendingOrders(hours, maxAgeHours) {
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS cnt
     FROM orders
     WHERE status = 'pending'
       AND created_at <= NOW() - ($1 || ' hours')::interval
       AND created_at >= NOW() - ($2 || ' hours')::interval`,
    [String(hours), String(maxAgeHours)]
  );
  return Number(rows[0]?.cnt || 0);
}

export async function metricLoginFailFlood(windowMinutes, threshold) {
  const { rows } = await db.query(
    `SELECT ip_address AS ip, COUNT(*)::int AS fails
     FROM login_history
     WHERE login_status = 'failed'
       AND created_at >= NOW() - ($1 || ' minutes')::interval
       AND ip_address IS NOT NULL
     GROUP BY ip_address
     HAVING COUNT(*) >= $2
     ORDER BY fails DESC
     LIMIT 5`,
    [String(windowMinutes), threshold]
  );
  return rows;
}

export async function listAdminAlertEmails() {
  const envList = String(process.env.ADMIN_ALERT_EMAILS || process.env.ADMIN_ALERT_EMAIL || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (envList.length) return envList;

  const { rows } = await db.query(
    `SELECT email FROM users
     WHERE role = 'admin' AND status = 'active' AND email IS NOT NULL
     ORDER BY id ASC
     LIMIT 10`
  );
  return rows.map((r) => r.email).filter(Boolean);
}
