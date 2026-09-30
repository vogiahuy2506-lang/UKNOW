import db from '../../config/database.js';
import { runDeferredReasonSql, runDeferredUntilLatestSql } from '../../utils/runDeferMetadataSql.util.js';
import { runCountersReliableSql } from '../../utils/runDisplay.util.js';

/**
 * PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-6 — SQL của trang "Giám sát gửi tin" phía ADMIN, phần KHÔNG phải đếm tin:
 * lượt chạy (đang chạy / mới nhất / lỗi trong kỳ), tên chủ tài khoản, số cảnh báo đang mở, số "Zalo chặn người lạ".
 * Số tin (đã gửi / chưa gửi được / lý do / khách gửi nhiều) lấy ở module services/stats/sendStats.service.js — nơi này
 * KHÔNG được đếm tin từ bộ đếm campaign_runs, customer_journey hay nhật ký node campaign_executions.
 *
 * Phạm vi (`scope`, đã chuẩn hoá bởi sendStats.normalizeScope): `{ ownerId }` một chủ, hoặc `{ ownerId: null,
 * excludeOwnerIds }` toàn hệ thống trừ các chủ đó. Chủ của một lượt chạy = `COALESCE(c.workspace_owner_id, c.id_user)` —
 * CÙNG quy tắc với trang Giám sát của người dùng (repositories/user/userDeliveryMonitor.repository.js), nên lọc admin theo
 * một chủ ra đúng tập lượt chạy mà chủ đó thấy. Không dùng safeQuery ở các hàm mới: cột / bảng sai phải nổ ra (500) chứ
 * không thành số 0 im lặng.
 *
 * Cột `campaign_runs.started_at / completed_at / created_at` là `timestamp` KHÔNG múi giờ chứa giờ VN trên production:
 * mọi mốc trả ra ngoài phải đi qua `::timestamptz`; mốc "chờ tới khi nào" trả dạng chuỗi ISO UTC dựng ở SQL.
 */

// Mốc "chờ tới" MUỘN NHẤT trong bốn khoá defer (cùng biểu thức đếm của Hoạt động nhóm), trả chuỗi ISO UTC. Lượt chạy
// bị coi là đang chờ khi mốc này còn ở tương lai — đúng điều bộ điều phối làm (campaignRun.service.js
// _exitIfRunDeferredUntilFuture: còn BẤT KỲ khoá defer nào ở tương lai thì thoát sớm, không chiếm slot).
const DEFERRED_UNTIL_ISO_SQL = `to_char((${runDeferredUntilLatestSql('cr')}) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

const RUN_OWNER_SQL = 'COALESCE(c.workspace_owner_id, c.id_user)';

/**
 * Điều kiện phạm vi chủ cho câu truy vấn lượt chạy; đẩy tham số vào `params`.
 *
 * @param {{ ownerId: number|null, excludeOwnerIds: number[] }} scope
 * @param {Array<unknown>} params
 * @param {string} ownerSql biểu thức chủ (mặc định chủ của lượt chạy)
 * @returns {string}
 */
function ownerScopeSql(scope, params, ownerSql = RUN_OWNER_SQL) {
  if (scope.ownerId != null) {
    params.push(scope.ownerId);
    return `${ownerSql} = $${params.length}`;
  }
  if (scope.excludeOwnerIds.length > 0) {
    params.push(scope.excludeOwnerIds);
    return `NOT COALESCE(${ownerSql} = ANY($${params.length}::bigint[]), FALSE)`;
  }
  return 'TRUE';
}

class DeliveryMonitorRepository {
  async safeQuery(sql, params = [], fallback = []) {
    try {
      const result = await db.query(sql, params);
      return result.rows || fallback;
    } catch (error) {
      // 42P01: undefined_table, 42703: undefined_column, 42704: undefined_object
      // 22P02: invalid_text_representation (for enum issues)
      const safeCodes = ['42P01', '42703', '42704', '22P02', '42P10'];
      if (safeCodes.includes(error?.code)) return fallback;
      throw error;
    }
  }

  /**
   * MỌI lượt `running` trong phạm vi (không giới hạn theo ngày bắt đầu — lượt liên tục sống lâu vẫn phải được đếm), kèm
   * mốc / lý do chờ để phân "đang chờ" / "đang gửi".
   *
   * @param {{ scope: { ownerId: number|null, excludeOwnerIds: number[] } }} input
   * @returns {Promise<Array<{
   *   id: string, campaign_name: string, owner_id: string,
   *   deferred_until: string|null, deferred_reason: string|null, email_rate_limit_at: string|null
   * }>>}
   */
  async listRunningRuns({ scope }) {
    const params = [];
    const scopeSql = ownerScopeSql(scope, params);
    const { rows } = await db.query(
      `SELECT cr.id,
              c.campaign_name,
              ${RUN_OWNER_SQL} AS owner_id,
              ${DEFERRED_UNTIL_ISO_SQL} AS deferred_until,
              ${runDeferredReasonSql('cr')} AS deferred_reason,
              cr.run_metadata->>'emailRateLimitAt' AS email_rate_limit_at
       FROM campaign_runs cr
       JOIN campaigns c ON c.id = cr.id_campaign
       WHERE cr.status = 'running'
         AND ${scopeSql}`,
      params
    );
    return rows;
  }

  /**
   * `limit` lượt chạy MỚI NHẤT toàn hệ thống trong phạm vi (không theo cửa sổ thời gian), kèm chủ và mốc / lý do chờ.
   * Số tin của từng lượt KHÔNG lấy ở đây (không đọc bộ đếm campaign_runs) mà từ sendStats.getRunTotals.
   *
   * @param {{ scope: { ownerId: number|null, excludeOwnerIds: number[] }, limit: number }} input
   * @returns {Promise<Array<{
   *   id: string, id_campaign: string, campaign_name: string, campaign_type: string, status: string,
   *   started_at: Date, total_recipients: number, counters_reliable: boolean, owner_id: string,
   *   deferred_until: string|null, deferred_reason: string|null, email_rate_limit_at: string|null
   * }>>}
   */
  async listRecentRuns({ scope, limit }) {
    const params = [];
    const scopeSql = ownerScopeSql(scope, params);
    params.push(limit);
    const { rows } = await db.query(
      `SELECT cr.id,
              cr.id_campaign,
              c.campaign_name,
              c.campaign_type,
              cr.status,
              cr.started_at::timestamptz AS started_at,
              cr.total_recipients,
              ${runCountersReliableSql('cr')} AS counters_reliable,
              ${RUN_OWNER_SQL} AS owner_id,
              ${DEFERRED_UNTIL_ISO_SQL} AS deferred_until,
              ${runDeferredReasonSql('cr')} AS deferred_reason,
              cr.run_metadata->>'emailRateLimitAt' AS email_rate_limit_at
       FROM campaign_runs cr
       JOIN campaigns c ON c.id = cr.id_campaign
       WHERE ${scopeSql}
       ORDER BY cr.started_at DESC, cr.id DESC
       LIMIT $${params.length}`,
      params
    );
    return rows;
  }

  /**
   * Số lượt chạy KẾT THÚC BẰNG LỖI (`status = 'failed'`) trong cửa sổ theo ngày VN — thời điểm là lúc lượt kết thúc
   * (`completed_at`, thiếu thì `started_at`). Lượt đang chờ không bao giờ là `failed` nên không vào đây.
   *
   * @param {{ scope: object, window: { fromDate: string, toDate: string } }} input
   * @returns {Promise<number>}
   */
  async countFailedRuns({ scope, window }) {
    const params = [window.fromDate, window.toDate];
    const scopeSql = ownerScopeSql(scope, params);
    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS count
       FROM campaign_runs cr
       JOIN campaigns c ON c.id = cr.id_campaign
       WHERE cr.status = 'failed'
         AND COALESCE(cr.completed_at, cr.started_at) >= $1::date
         AND COALESCE(cr.completed_at, cr.started_at) < ($2::date + 1)
         AND ${scopeSql}`,
      params
    );
    return Number(rows[0]?.count || 0);
  }

  /**
   * Số LUẬT cảnh báo đang mở (còn sự kiện chưa xử lý) — không phải số sự kiện: một luật bắn lặp nhiều lần vẫn là một.
   *
   * @returns {Promise<number>}
   */
  async countOpenAlertRules() {
    const { rows } = await db.query(
      `SELECT COUNT(DISTINCT rule_id)::int AS count
       FROM alert_events
       WHERE resolved = FALSE`
    );
    return Number(rows[0]?.count || 0);
  }

  /**
   * Số điện thoại bị Zalo chặn nhắn người lạ (`stranger_blocked`) được đánh dấu trong cửa sổ — dấu hiệu tài khoản sắp bị
   * khoá. Chủ = `id_user` của bảng số không liên hệ được.
   *
   * @param {{ scope: object, window: { fromDate: string, toDate: string } }} input
   * @returns {Promise<number>}
   */
  async countStrangerBlocked({ scope, window }) {
    const params = [window.fromDate, window.toDate];
    const scopeSql = ownerScopeSql(scope, params, 'zup.id_user');
    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS count
       FROM zalo_unreachable_phones zup
       WHERE zup.reason = 'stranger_blocked'
         AND zup.updated_at >= $1::date
         AND zup.updated_at < ($2::date + 1)
         AND ${scopeSql}`,
      params
    );
    return Number(rows[0]?.count || 0);
  }

  /**
   * Tên hiển thị của các chủ tài khoản (bảng xếp hạng khách, cột "Chủ" của bảng lượt chạy).
   *
   * @param {number[]} ownerIds
   * @returns {Promise<Array<{ id: string, username: string, full_name: string|null }>>}
   */
  async findOwners(ownerIds) {
    if (!ownerIds.length) return [];
    const { rows } = await db.query(
      `SELECT id, username, full_name
       FROM users
       WHERE id = ANY($1::bigint[])`,
      [ownerIds]
    );
    return rows;
  }
}

export default new DeliveryMonitorRepository();
