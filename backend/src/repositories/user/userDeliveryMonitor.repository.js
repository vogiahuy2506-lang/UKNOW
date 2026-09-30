import db from '../../config/database.js';
import { runDeferredReasonSql, runDeferredUntilSql } from '../../utils/runDeferMetadataSql.util.js';
import { runCountersReliableSql } from '../../utils/runDisplay.util.js';

/**
 * PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-4b — SQL của trang "Giám sát gửi tin" phía người dùng, phần KHÔNG phải đếm
 * tin: danh sách lượt chạy, lượt đang chạy, kiểm quyền sở hữu lượt. Số tin (đã gửi / chưa gửi được) lấy ở module
 * services/stats/sendStats.service.js — nơi này KHÔNG được đếm tin từ bộ đếm campaign_runs hay nhật ký node.
 *
 * Phạm vi chủ: `COALESCE(c.workspace_owner_id, c.id_user) = chủ` (cùng phạm vi công ty với danh sách chiến dịch;
 * chiến dịch do nhân viên tạo vẫn thuộc chủ). Không dùng safeQuery: cột/bảng sai phải nổ ra (500) chứ không thành số 0
 * im lặng (audit C-26).
 *
 * Cột `campaign_runs.started_at / created_at` là `timestamp` KHÔNG múi giờ chứa giờ VN trên production (đo 30/09):
 * node-pg đọc thô sẽ hiểu theo múi giờ của tiến trình (UTC) nên lượt bắt đầu sau 17:00 hiện sang ngày hôm sau
 * (audit C-35). Mọi mốc trả ra ngoài phải đi qua `::timestamptz` (phiên DB đặt Asia/Ho_Chi_Minh).
 */

class UserDeliveryMonitorRepository {
  /**
   * `limit` lượt chạy mới nhất của chủ, kèm mốc/lý do chờ. `deferred_*` là giá trị THÔ trong run_metadata; người
   * gọi tự kiểm mốc còn ở tương lai và trạng thái `running`.
   *
   * @param {{ ownerId: number, limit: number }} input
   * @returns {Promise<Array<{
   *   id: string, id_campaign: string, campaign_name: string, campaign_type: string, status: string,
   *   started_at: Date, total_recipients: number, counters_reliable: boolean,
   *   deferred_until: string|null, deferred_reason: string|null, email_rate_limit_at: string|null
   * }>>}
   */
  async listRecentRuns({ ownerId, limit }) {
    const { rows } = await db.query(
      `SELECT cr.id,
              cr.id_campaign,
              c.campaign_name,
              c.campaign_type,
              cr.status,
              cr.started_at::timestamptz AS started_at,
              cr.total_recipients,
              ${runCountersReliableSql('cr')} AS counters_reliable,
              ${runDeferredUntilSql('cr')} AS deferred_until,
              ${runDeferredReasonSql('cr')} AS deferred_reason,
              cr.run_metadata->>'emailRateLimitAt' AS email_rate_limit_at
       FROM campaign_runs cr
       JOIN campaigns c ON c.id = cr.id_campaign
       WHERE COALESCE(c.workspace_owner_id, c.id_user) = $1
       ORDER BY cr.started_at DESC, cr.id DESC
       LIMIT $2`,
      [ownerId, limit]
    );
    return rows;
  }

  /**
   * MỌI lượt `running` của chủ (không chỉ 10 lượt mới nhất — lượt liên tục sống lâu vẫn phải được đếm), kèm mốc/lý do
   * chờ thô để phân "đang chờ" / "đang gửi".
   *
   * @param {{ ownerId: number }} input
   * @returns {Promise<Array<{
   *   id: string, campaign_name: string,
   *   deferred_until: string|null, deferred_reason: string|null, email_rate_limit_at: string|null
   * }>>}
   */
  async listRunningRuns({ ownerId }) {
    const { rows } = await db.query(
      `SELECT cr.id,
              c.campaign_name,
              ${runDeferredUntilSql('cr')} AS deferred_until,
              ${runDeferredReasonSql('cr')} AS deferred_reason,
              cr.run_metadata->>'emailRateLimitAt' AS email_rate_limit_at
       FROM campaign_runs cr
       JOIN campaigns c ON c.id = cr.id_campaign
       WHERE COALESCE(c.workspace_owner_id, c.id_user) = $1
         AND cr.status = 'running'`,
      [ownerId]
    );
    return rows;
  }

  /**
   * Lượt chạy CỦA chủ này (null nếu không có hoặc của người khác) + bản kiểm toán người nhận của lượt.
   *
   * @param {{ ownerId: number, runId: number }} input
   * @returns {Promise<{ id: string, recipient_audit: object|null }|null>}
   */
  async findOwnedRun({ ownerId, runId }) {
    const { rows } = await db.query(
      `SELECT cr.id, cr.run_metadata->'recipientAudit' AS recipient_audit
       FROM campaign_runs cr
       JOIN campaigns c ON c.id = cr.id_campaign
       WHERE cr.id = $1
         AND COALESCE(c.workspace_owner_id, c.id_user) = $2`,
      [runId, ownerId]
    );
    return rows[0] || null;
  }
}

export default new UserDeliveryMonitorRepository();
