import db from '../../config/database.js';

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
    const synced = Number(row.result?.synced ?? row.result?.totalSynced ?? -1);
    const isNoop = row.status === 'noop' || synced === 0;
    if (!isNoop) break;
    consecutive += 1;
  }
  return { consecutive, enough: true };
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
