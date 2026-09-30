import db from '../../config/database.js';
import { aiCreditConsumptionRowSql } from '../../constants/aiCreditUsage.js';
import { runDeferredUntilLatestSql } from '../../utils/runDeferMetadataSql.util.js';

/**
 * SQL của khối "Hoạt động nhóm" (PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-7). Số tin đã gửi KHÔNG nằm ở đây — chúng
 * đi qua module đếm dùng chung services/stats/sendStats.service.js; file này chỉ chứa phần còn lại: danh sách người,
 * chiến dịch đang chạy, lượt AI theo người, thời điểm hoạt động gần nhất. Điều phối và ghép dòng ở
 * services/user/teamOverview.service.js.
 *
 * Mọi truy vấn khoá theo CHỦ (`ownerId`): nhân viên có thể làm cho nhiều chủ (production 30/09: user 162 thuộc chủ 1 và
 * chủ 12) hoặc có không gian riêng, nên không được cộng thứ gì ngoài không gian của chủ đang xem.
 */

const VN_TZ = 'Asia/Ho_Chi_Minh';

// Tên tài nguyên trên sổ usage_logs (cùng giá trị AI_CREDIT_RESOURCE của aiCreditMeter.service.js — không import:
// repository không phụ thuộc service).
const AI_CREDIT_RESOURCE = 'ai_credit';

// Lượt chạy đang "chờ tới giờ" = mốc hoãn muộn nhất còn ở tương lai (biểu thức dùng chung với các màn khác).
const RUN_DEFERRED_UNTIL_SQL = runDeferredUntilLatestSql('cr');

const toId = (value) => (value == null ? null : Number(value));

/**
 * Nhân viên ĐÃ CHẤP NHẬN của chủ (kể cả đang bị khoá — số cũ của họ vẫn thuộc về công ty). `employeeId` lọc một người.
 *
 * @returns {Promise<Array<{ id: number, username: string, fullName: string|null, avatarUrl: string|null, status: string,
 *   memberStatus: string, periodAiCreditLimit: number|null }>>}
 */
export async function findTeamMembers(ownerId, { employeeId = null } = {}) {
  const params = [ownerId];
  let employeeFilter = '';
  if (employeeId != null) {
    params.push(employeeId);
    employeeFilter = ` AND um.employee_id = $${params.length}`;
  }
  const { rows } = await db.query(
    `SELECT u.id,
            u.username,
            u.full_name            AS "fullName",
            u.avatar_url           AS "avatarUrl",
            u.status,
            um.status              AS "memberStatus",
            um.period_ai_credit_limit AS "periodAiCreditLimit"
     FROM user_members um
     JOIN users u ON u.id = um.employee_id
     WHERE um.owner_id = $1 AND um.accepted_at IS NOT NULL${employeeFilter}
     ORDER BY u.username`,
    params
  );
  // `id` giữ NGUYÊN kiểu pg trả (BIGINT → chuỗi) như API này vẫn trả từ trước — service tự đổi sang số khi tra bảng.
  return rows.map((row) => ({
    ...row,
    periodAiCreditLimit: row.periodAiCreditLimit == null ? null : Number(row.periodAiCreditLimit),
  }));
}

/** Hồ sơ chủ tài khoản — dòng "Bạn" của bảng. */
export async function findOwnerProfile(ownerId) {
  const { rows } = await db.query(
    `SELECT id, username, full_name AS "fullName", avatar_url AS "avatarUrl", status
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [ownerId]
  );
  return rows[0] || null;
}

/**
 * Số CHIẾN DỊCH đang chạy theo người tạo: chiến dịch trong không gian của chủ có ít nhất một lượt `status = 'running'`.
 * KHÔNG dùng `campaigns.status = 'active'` — đó là "đang bật" (production 30/09: 123 chiến dịch active nhưng chỉ 3 có
 * lượt running). `waiting` = trong số đó, chiến dịch mà MỌI lượt đang chạy đều đang chờ tới giờ (RUN_DEFERRED_UNTIL_SQL);
 * chỉ cần một lượt đang gửi thật là chiến dịch tính là đang chạy chứ không phải đang chờ.
 *
 * Người tạo = `COALESCE(created_by, id_user)` — CÙNG quy tắc engine ghi `actor_user_id` của email/Zalo
 * (campaignEmailSender: `campaign.created_by || campaign.id_user`), nên cột "chiến dịch đang chạy" và cột "tin đã gửi"
 * của một người nói về cùng tập chiến dịch. (Điểm lệch còn lại: Telegram/WhatsApp ghi actor = người bấm chạy lượt, không
 * phải người tạo chiến dịch — campaignChannelRunner.service.js; chưa sửa, xem teamOverview.service.js.)
 *
 * @returns {Promise<Array<{ actorId: number, running: number, waiting: number }>>}
 */
export async function findRunningCampaignsByCreator(ownerId) {
  const { rows } = await db.query(
    `SELECT x.actor_id,
            COUNT(*)::int                                AS running,
            COUNT(*) FILTER (WHERE x.all_waiting)::int   AS waiting
     FROM (
       SELECT c.id,
              COALESCE(c.created_by, c.id_user) AS actor_id,
              bool_and(COALESCE(${RUN_DEFERRED_UNTIL_SQL} > NOW(), FALSE)) AS all_waiting
       FROM campaigns c
       JOIN campaign_runs cr ON cr.id_campaign = c.id AND cr.status = 'running'
       WHERE COALESCE(c.workspace_owner_id, c.id_user) = $1
       GROUP BY c.id, COALESCE(c.created_by, c.id_user)
     ) x
     GROUP BY x.actor_id`,
    [ownerId]
  );
  return rows.map((row) => ({
    actorId: toId(row.actor_id),
    running: Number(row.running),
    waiting: Number(row.waiting),
  }));
}

/**
 * Lượt AI đã dùng theo người thực hiện trong KỲ của chủ: `usage_logs` `ai_credit`, `id_user = chủ` (ví của chủ — lượt
 * nhân viên dùng ở không gian riêng của họ nằm ở ví khác), `[cycleStart, cycleEnd)` — đúng khung mà cổng chặn hạn mức
 * nhân viên so (aiCreditMeter.service.js), loại dòng bán Marketplace. `actorId: null` = dòng chưa ghi người thực hiện.
 *
 * @returns {Promise<Array<{ actorId: number|null, used: number }>>}
 */
export async function findAiCreditUsedByActor(ownerId, cycleStart, cycleEnd) {
  const { rows } = await db.query(
    `SELECT ul.actor_user_id AS actor_id,
            COALESCE(SUM(ul.delta), 0)::int AS used
     FROM usage_logs ul
     WHERE ul.id_user = $1
       AND ul.resource_type = '${AI_CREDIT_RESOURCE}'
       AND ul.created_at >= $2
       AND ul.created_at < $3
       AND ${aiCreditConsumptionRowSql('ul')}
     GROUP BY ul.actor_user_id`,
    [ownerId, cycleStart, cycleEnd]
  );
  return rows.map((row) => ({ actorId: toId(row.actor_id), used: Number(row.used) }));
}

/**
 * Hoạt động gần nhất của từng người TRONG không gian của chủ — thời điểm lớn nhất trong 4 nguồn:
 *   - tin gửi (email / Zalo: `sent_at`; Telegram-WhatsApp: `COALESCE(sent_at, created_at)`) theo `actor_user_id`;
 *   - nhật ký thao tác của không gian (`audit_logs`: tạo/sửa mẫu, chiến dịch, landing, chatbot, trả lời hộp thư…);
 *   - lượt AI trong ví của chủ (loại dòng bán Marketplace; với chủ còn gồm dòng chưa ghi người thực hiện — cùng quy tắc
 *     cột lượt AI của dòng "Bạn").
 * KHÔNG dùng lần đăng nhập: `users.last_login_at` không đổi khi làm mới token và không gắn với không gian nào (nhân viên
 * đăng nhập một lần cho cả hai chủ) — đưa vào là hiện hoạt động của không gian khác.
 *
 * email_messages / zalo_messages.sent_at là `timestamp` KHÔNG múi giờ chứa GIỜ VN (khác `timestamptz` của bảng adapter,
 * audit_logs, usage_logs) — `AT TIME ZONE` đổi sang mốc thời gian đúng trước khi so sánh. Bỏ bước này thì mốc lệch 7 giờ
 * (lượt sau 17:00 giờ VN hiện sang ngày hôm sau). Ba bảng tin có index (workspace_owner_id, actor_user_id, sent_at)
 * nên MAX theo người không quét cả lịch sử.
 *
 * @param {number} ownerId
 * @param {number[]} actorIds
 * @param {{ query: Function }} [queryable] mặc định pool; test truyền client đã `SET TIME ZONE` khác giờ VN để chứng minh
 *   kết quả không dựa vào múi giờ của phiên
 * @returns {Promise<Array<{ actorId: number, lastActiveAt: Date|null }>>}
 */
export async function findLastActivityByActor(ownerId, actorIds, queryable = db) {
  if (!Array.isArray(actorIds) || actorIds.length === 0) return [];
  const { rows } = await queryable.query(
    `SELECT a.actor_id,
            GREATEST(
              (SELECT MAX(m.sent_at) FROM email_messages m
                WHERE m.workspace_owner_id = $1 AND m.actor_user_id = a.actor_id) AT TIME ZONE '${VN_TZ}',
              (SELECT MAX(m.sent_at) FROM zalo_messages m
                WHERE m.workspace_owner_id = $1 AND m.actor_user_id = a.actor_id) AT TIME ZONE '${VN_TZ}',
              (SELECT MAX(COALESCE(m.sent_at, m.created_at)) FROM campaign_channel_messages m
                WHERE m.workspace_owner_id = $1 AND m.actor_user_id = a.actor_id),
              (SELECT MAX(al.created_at) FROM audit_logs al
                WHERE al.owner_id = $1 AND al.id_user = a.actor_id AND al.category = 'workspace'),
              (SELECT MAX(ul.created_at) FROM usage_logs ul
                WHERE ul.id_user = $1
                  AND ul.resource_type = '${AI_CREDIT_RESOURCE}'
                  AND (ul.actor_user_id = a.actor_id OR (ul.actor_user_id IS NULL AND a.actor_id = $1))
                  AND ${aiCreditConsumptionRowSql('ul')})
            ) AS last_active_at
     FROM unnest($2::bigint[]) AS a(actor_id)`,
    [ownerId, actorIds]
  );
  return rows.map((row) => ({ actorId: Number(row.actor_id), lastActiveAt: row.last_active_at ?? null }));
}
