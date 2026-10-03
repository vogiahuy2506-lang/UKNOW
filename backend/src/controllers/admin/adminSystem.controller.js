import * as systemMonitorService from '../../services/admin/systemMonitor.service.js';
import db from '../../config/database.js';
import { getShadowMismatchMetrics } from '../../services/quota/sendQuotaReservation.service.js';

const handleError = (res, err) => {
  res.status(err.status || 500).json({ success: false, message: err.message || 'Lỗi server' });
};

export async function overview(_req, res) {
  try {
    const data = await systemMonitorService.getSystemOverview();
    res.json({ success: true, data });
  } catch (err) {
    handleError(res, err);
  }
}

export async function logs(req, res) {
  try {
    const data = await systemMonitorService.getSystemLogs(req.query.service, req.query.tail);
    res.json({ success: true, data });
  } catch (err) {
    handleError(res, err);
  }
}

/**
 * Số liệu đối chiếu chế độ shadow của hạn mức gửi.
 *
 * Vì sao cần endpoint này: bộ đếm nằm trong bộ nhớ tiến trình và mốc lệch chỉ được ghi bằng
 * `console.warn`. Trước đây muốn đọc phải `docker logs | grep`, và cách đó đã hỏng hai lần —
 * `console.warn` ra stderr nên thiếu `2>&1` là grep không bao giờ khớp, còn container thì
 * được tạo mới mỗi lần deploy nên log cũ biến mất. Cả hai lần đều trả "0" trông như bằng
 * chứng tốt, trong khi thật ra là phép đo rỗng.
 *
 * `processStartedAt` là phần bắt buộc đọc kèm: `total` chỉ có nghĩa khi biết nó đếm từ lúc nào.
 * Một `mismatches: 0` trên `total: 0` không nói lên điều gì cả.
 */
async function readPersistedShadow() {
  try {
    // vn_day::text bắt buộc: pg DATE -> JSON lùi 1 ngày (Date +07 -> ISO UTC hôm trước).
    const sinceSql = "(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 14";
    const [daily, recent, summary] = await Promise.all([
      db.query(
        `SELECT vn_day::text AS vn_day, channel, total, both_allowed, both_denied,
                legacy_allow_atomic_deny, legacy_deny_atomic_allow, atomic_candidate_error
           FROM send_quota_shadow_daily
          WHERE vn_day >= ${sinceSql}
          ORDER BY vn_day DESC, channel`,
      ),
      db.query(
        `SELECT id, created_at, vn_day::text AS vn_day, channel, user_id, ctx_billing_user_id,
                atomic_billing_user_id, legacy_allowed, atomic_allowed, legacy_detail,
                atomic_diag, atomic_error, source_type
           FROM send_quota_shadow_mismatches
          ORDER BY created_at DESC, id DESC
          LIMIT 50`,
      ),
      db.query(
        `SELECT COALESCE(SUM(total), 0)::int AS total,
                COALESCE(SUM(both_allowed), 0)::int AS both_allowed,
                COALESCE(SUM(both_denied), 0)::int AS both_denied,
                COALESCE(SUM(legacy_allow_atomic_deny), 0)::int AS legacy_allow_atomic_deny,
                COALESCE(SUM(legacy_deny_atomic_allow), 0)::int AS legacy_deny_atomic_allow,
                COALESCE(SUM(atomic_candidate_error), 0)::int AS atomic_candidate_error
           FROM send_quota_shadow_daily
          WHERE vn_day >= ${sinceSql}`,
      ),
    ]);
    return {
      daily: daily.rows,
      recentMismatches: recent.rows,
      summary14d: summary.rows[0] ?? null,
    };
  } catch (err) {
    return { error: err?.message || 'Lỗi đọc dấu vết shadow' };
  }
}

export async function sendQuotaShadow(_req, res) {
  try {
    const persisted = await readPersistedShadow();
    const uptimeSeconds = Math.floor(process.uptime());
    res.json({
      success: true,
      data: {
        mode: process.env.SEND_QUOTA_RESERVATION_MODE || 'off',
        sources:
          process.env.SEND_QUOTA_RESERVATION_SOURCES
          || process.env.SEND_QUOTA_RESERVATION_ALLOWLIST
          || null,
        metrics: getShadowMismatchMetrics(),
        persisted,
        processStartedAt: new Date(Date.now() - uptimeSeconds * 1000).toISOString(),
        uptimeSeconds,
      },
    });
  } catch (err) {
    handleError(res, err);
  }
}

/**
 * Chẩn đoán IP: server đang thấy người gọi là ai. `reqIp` phải là IP công cộng của chính người
 * gọi (không phải dải Cloudflare). Không ghi log, không lưu DB.
 */
export function requestIp(req, res) {
  res.json({
    success: true,
    data: {
      reqIp: req.ip,
      remoteAddress: req.socket?.remoteAddress ?? null,
      xForwardedFor: req.headers['x-forwarded-for'] ?? null,
      cfConnectingIp: req.headers['cf-connecting-ip'] ?? null,
    },
  });
}
