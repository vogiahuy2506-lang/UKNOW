import db from '../../config/database.js';
import { VN_TZ, customerSql } from '../../services/admin/customerDefinitions.js';
import { paidOrderSql } from '../../services/admin/revenueDefinitions.js';
import { firstSentAtSql } from '../stats/sendStats.repository.js';

/**
 * Phễu kích hoạt của admin (PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-9) — dựng từ bảng `users`, KHÔNG dựa vào sự kiện
 * audit `USER_REGISTERED`: sự kiện đó ghi `id_user` NULL (người dùng thật nằm ở entity_id) nên bước "Đăng ký" ra 1 và
 * cohort toàn 0 (production 30/09: 39/39 dòng NULL, 317 tài khoản mới trong 60 ngày), và đăng ký bằng Google không ghi gì.
 *
 * Tập đầu vào: KHÁCH (customerDefinitions.js — không admin, nhân viên thuần, tài khoản nội bộ, đã xoá) đăng ký từ
 * `since`. Bốn bước, MỖI BƯỚC LÀ TẬP CON CỦA BƯỚC TRƯỚC (đếm cộng dồn trên cùng một tập người, không phải bốn tập độc lập):
 *   1 registered        khách đăng ký trong cửa sổ.
 *   2 channelConnected  có ít nhất một tài khoản kênh (Zalo / Email / Telegram / WhatsApp), HOẶC đã gửi được tin — người
 *                       đã gửi được tin chắc chắn từng nối kênh, kể cả khi sau đó đã gỡ tài khoản đi.
 *   3 firstSend         đã có ít nhất một tin GỬI ĐƯỢC (không phải gửi thử) — định nghĩa "đã gửi" của sendStats.
 *   4 paid              đã từng trả tiền: có đơn đã trả (success, amount > 0), bất kể còn gói hay không.
 * Người trả tiền mà chưa gửi tin nào không lọt bước 4 (không phải tập con của bước 3) — hiện riêng ở `paidWithoutSend`
 * để không giấu bớt dữ liệu.
 */

const FIRST_SEND_TARGET_MINUTES = 10;

/** Cửa sổ mặc định: 12 tháng dương lịch gần nhất (tháng này + 11 tháng trước), tính theo giờ VN. */
const DEFAULT_SINCE_SQL = `(date_trunc('month', NOW() AT TIME ZONE $1) - INTERVAL '11 months')::date`;

/**
 * CTE dùng chung: `cust` (mỗi khách trong cửa sổ + cờ từng bước). `$1` = múi giờ, `$2` = ngày bắt đầu (hoặc NULL = mặc định).
 * Kênh: chủ có ít nhất một dòng ở bốn bảng tài khoản kênh (các bảng này xoá cứng khi gỡ tài khoản).
 */
function customerFlagsCte() {
  return `
    WITH ch AS (
      SELECT id_user AS owner_id FROM zalo_settings
      UNION SELECT id_user FROM email_settings
      UNION SELECT id_user FROM telegram_accounts
      UNION SELECT split_part(session_key, '-', 1)::bigint FROM whatsapp_baileys_session_creds
       WHERE split_part(session_key, '-', 1) ~ '^[0-9]{1,15}$'
    ),
    pd AS (
      SELECT DISTINCT o.user_id AS owner_id FROM orders o WHERE ${paidOrderSql('o')} AND o.user_id IS NOT NULL
    ),
    cust AS (
      SELECT u.id,
             u.created_at,
             to_char(date_trunc('month', u.created_at AT TIME ZONE $1), 'YYYY-MM') AS cohort_key,
             to_char(date_trunc('month', u.created_at AT TIME ZONE $1), 'MM/YYYY') AS cohort,
             ${firstSentAtSql('u.id')} AS first_sent_at,
             (ch.owner_id IS NOT NULL) AS has_channel_account,
             (pd.owner_id IS NOT NULL) AS has_paid
        FROM users u
        LEFT JOIN ch ON ch.owner_id = u.id
        LEFT JOIN pd ON pd.owner_id = u.id
       WHERE ${customerSql('u')}
         AND (u.created_at AT TIME ZONE $1)::date >= COALESCE($2::date, ${DEFAULT_SINCE_SQL})
    ),
    step AS (
      SELECT cust.*,
             (has_channel_account OR first_sent_at IS NOT NULL) AS s2,
             (first_sent_at IS NOT NULL) AS s3
        FROM cust
    )`;
}

/**
 * Số theo từng cohort (tháng đăng ký VN) và tổng.
 * @returns {Promise<{ since: string, cohorts: Array<{ cohortKey: string, cohort: string, registered: number, channelConnected: number, firstSend: number, paid: number, paidWithoutSend: number }> }>}
 */
export async function getFunnelCohorts({ since = null } = {}) {
  const { rows } = await db.query(
    `${customerFlagsCte()}
     SELECT cohort_key AS "cohortKey",
            cohort,
            COUNT(*) AS registered,
            COUNT(*) FILTER (WHERE s2) AS "channelConnected",
            COUNT(*) FILTER (WHERE s2 AND s3) AS "firstSend",
            COUNT(*) FILTER (WHERE s2 AND s3 AND has_paid) AS paid,
            COUNT(*) FILTER (WHERE has_paid AND NOT s3) AS "paidWithoutSend"
       FROM step
      GROUP BY cohort_key, cohort
      ORDER BY cohort_key ASC`,
    [VN_TZ, since]
  );
  const { rows: sinceRows } = await db.query(
    `SELECT to_char(COALESCE($2::date, ${DEFAULT_SINCE_SQL}), 'YYYY-MM-DD') AS since`,
    [VN_TZ, since]
  );
  return {
    since: sinceRows[0]?.since,
    cohorts: rows.map((r) => ({
      cohortKey: r.cohortKey,
      cohort: r.cohort,
      registered: Number(r.registered),
      channelConnected: Number(r.channelConnected),
      firstSend: Number(r.firstSend),
      paid: Number(r.paid),
      paidWithoutSend: Number(r.paidWithoutSend),
    })),
  };
}

/**
 * Thời gian từ đăng ký tới tin đầu tiên gửi được, tính trên TOÀN BỘ khách trong cửa sổ (kể cả người chưa gửi — bản cũ
 * chỉ tính trên người đã gửi nên bỏ sót đúng nhóm đáng lo nhất):
 *   sentCount        khách đã gửi được tin.
 *   medianMinutes    trung vị phút từ đăng ký tới tin đầu (chỉ người đã gửi; NULL nếu chưa ai gửi).
 *   pctUnder10       % người đã gửi có tin đầu trong ≤ 10 phút.
 *   notSentAfter7d   trong số khách đăng ký từ ≥ 7 ngày: số người CHƯA gửi được tin nào trong 7 ngày đầu (kể cả chưa từng gửi).
 */
export async function getTimeToFirstSend({ since = null } = {}) {
  const { rows } = await db.query(
    `${customerFlagsCte()}
     SELECT COUNT(*) AS total,
            COUNT(first_sent_at) AS sent,
            ROUND((percentile_cont(0.5) WITHIN GROUP (
              ORDER BY GREATEST(0, EXTRACT(EPOCH FROM (first_sent_at - created_at)) / 60.0)
            ) FILTER (WHERE first_sent_at IS NOT NULL))::numeric, 1) AS median_minutes,
            COUNT(*) FILTER (
              WHERE first_sent_at IS NOT NULL
                AND GREATEST(0, EXTRACT(EPOCH FROM (first_sent_at - created_at)) / 60.0) <= ${FIRST_SEND_TARGET_MINUTES}
            ) AS under_target,
            COUNT(*) FILTER (WHERE created_at <= NOW() - INTERVAL '7 days') AS eligible_7d,
            COUNT(*) FILTER (
              WHERE created_at <= NOW() - INTERVAL '7 days'
                AND (first_sent_at IS NULL OR first_sent_at > created_at + INTERVAL '7 days')
            ) AS not_sent_7d
       FROM step`,
    [VN_TZ, since]
  );
  const row = rows[0] || {};
  const sent = Number(row.sent || 0);
  const eligible = Number(row.eligible_7d || 0);
  return {
    totalCustomers: Number(row.total || 0),
    sentCount: sent,
    medianMinutes: row.median_minutes == null ? null : Number(row.median_minutes),
    pctUnder10: sent > 0 ? Math.round((Number(row.under_target || 0) / sent) * 1000) / 10 : null,
    eligibleAfter7d: eligible,
    notSentAfter7d: Number(row.not_sent_7d || 0),
    pctNotSentAfter7d: eligible > 0 ? Math.round((Number(row.not_sent_7d || 0) / eligible) * 1000) / 10 : null,
  };
}
