import { ZALO_SILENT_DROP_CATEGORY } from './zaloDispatchDelivery.util.js';

export const ZALO_SILENT_DROP_SIGNAL_CODE = 'zalo_silent_drop_high';

const DEFAULT_MIN_ATTEMPTS = 10;
const DEFAULT_MIN_RATE = 0.3;
const DEFAULT_CRITICAL_RATE = 0.5;
const DEFAULT_MAX_SIGNALS = 8;

const TERMINAL_ZALO_STATUSES = `'sent', 'failed', 'error', 'partial'`;

function toNumber(value) {
  return Number(value || 0);
}

function parsePositiveInt(raw, fallback) {
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseRate(raw, fallback) {
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed > 1 ? parsed / 100 : parsed;
}

/**
 * Ngưỡng PR3: cửa sổ 1 giờ, theo từng tài khoản Zalo.
 * Mặc định ≥10 lượt (sent/failed/partial) và ≥30% ZALO_SILENT_DROP.
 * Critical khi ≥50%. Env có thể ghi đè khi vận hành cần siết/nới.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ minAttempts: number, minRate: number, criticalRate: number, maxSignals: number }}
 */
export function resolveZaloSilentDropAlertThresholds(env = process.env) {
  return {
    minAttempts: parsePositiveInt(env.ZALO_SILENT_DROP_ALERT_MIN_ATTEMPTS, DEFAULT_MIN_ATTEMPTS),
    minRate: parseRate(env.ZALO_SILENT_DROP_ALERT_RATE, DEFAULT_MIN_RATE),
    criticalRate: parseRate(env.ZALO_SILENT_DROP_ALERT_CRITICAL_RATE, DEFAULT_CRITICAL_RATE),
    maxSignals: parsePositiveInt(env.ZALO_SILENT_DROP_ALERT_MAX_SIGNALS, DEFAULT_MAX_SIGNALS),
  };
}

/**
 * Gom nhóm lỗi delivery-monitor từ error_message (không đọc errorCategory DB).
 * Marker silent-drop phải đứng trước matcher mờ như "spam"/"limit".
 *
 * @param {unknown} message
 * @returns {string}
 */
export function classifyDeliveryMonitorFailure(message = '') {
  const text = String(message || '').toLowerCase();
  if (!text.trim()) return 'unknown';
  if (
    text.includes('zalo_send_not_delivered')
    || text.includes('zalo_silent_drop')
    || text.includes('không xác nhận phát tin')
  ) {
    return 'zalo_silent_drop';
  }
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
  if (text.includes('smtp') || text.includes('mail') || text.includes('email')) {
    return 'email_provider';
  }
  return 'other';
}

/**
 * Query 1 giờ gần nhất, nhóm theo account_id trên zalo_messages.
 * Lọc ngưỡng ở JS (`buildZaloSilentDropSignals`) để test không cần DB.
 * Dùng qua safeQuery: migration 135 + bootstrap bảo đảm cột; 42703 vẫn
 * được nuốt để overview không 500 nếu môi trường chưa kịp migrate.
 *
 * @param {{ userScoped?: boolean }} [options]
 * @returns {string}
 */
export function buildZaloSilentDropHourlySql({ userScoped = false } = {}) {
  const userJoin = userScoped ? 'JOIN campaigns c ON c.id = zm.id_campaign' : '';
  const userWhere = userScoped ? 'AND c.id_user = $1' : '';
  return `
    SELECT
      zm.account_id,
      MAX(NULLIF(BTRIM(COALESCE(zm.account_name, '')), '')) AS account_name,
      COUNT(*)::int AS attempts,
      COUNT(*) FILTER (
        WHERE zm.tracking_metadata->>'errorCategory' = '${ZALO_SILENT_DROP_CATEGORY}'
      )::int AS silent_drops
    FROM zalo_messages zm
    ${userJoin}
    WHERE zm.created_at >= NOW() - INTERVAL '1 hour'
      AND zm.account_id IS NOT NULL
      ${userWhere}
      AND (
        LOWER(COALESCE(zm.tracking_metadata->>'status', zm.status::text, ''))
          IN (${TERMINAL_ZALO_STATUSES})
        OR zm.tracking_metadata->>'errorCategory' = '${ZALO_SILENT_DROP_CATEGORY}'
      )
    GROUP BY zm.account_id
  `;
}

/**
 * @param {Array<{ account_id?: unknown, account_name?: unknown, attempts?: unknown, silent_drops?: unknown }>} rows
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {Array<{
 *   level: 'warning'|'critical',
 *   code: string,
 *   value: number,
 *   accountId: number,
 *   accountName: string|null,
 *   silentDrops: number,
 *   attempts: number,
 * }>}
 */
export function buildZaloSilentDropSignals(rows = [], env = process.env) {
  const { minAttempts, minRate, criticalRate, maxSignals } = resolveZaloSilentDropAlertThresholds(env);
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const attempts = toNumber(row.attempts);
      const silentDrops = toNumber(row.silent_drops);
      const rawId = row.account_id;
      const accountId = rawId == null || rawId === '' ? NaN : Number(rawId);
      const accountName = String(row.account_name || '').trim();
      return {
        accountId: Number.isFinite(accountId) && accountId > 0 ? accountId : null,
        accountName: accountName || (Number.isFinite(accountId) ? `#${accountId}` : null),
        attempts,
        silentDrops,
        rate: attempts > 0 ? silentDrops / attempts : 0,
      };
    })
    .filter((item) => item.accountId != null && item.attempts >= minAttempts && item.rate >= minRate)
    .sort((a, b) => b.rate - a.rate || b.silentDrops - a.silentDrops || a.accountId - b.accountId)
    .slice(0, maxSignals)
    .map((item) => ({
      level: item.rate >= criticalRate ? 'critical' : 'warning',
      code: ZALO_SILENT_DROP_SIGNAL_CODE,
      value: Math.round(item.rate * 1000) / 10,
      accountId: item.accountId,
      accountName: item.accountName,
      silentDrops: item.silentDrops,
      attempts: item.attempts,
    }));
}
