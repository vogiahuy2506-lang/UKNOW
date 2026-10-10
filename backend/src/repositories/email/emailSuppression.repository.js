import db from '../../config/database.js';

/**
 * Danh sách cấm gửi email theo (workspace, email) — PLAN_RA_SOAT_DOT3 PR-Q1 việc 1.
 * Bảng `email_suppressions` (migration 295). Mọi hàm ghi nhận `queryable` tùy chọn để chạy chung transaction của caller.
 */
class EmailSuppressionRepository {
  /**
   * Ghi (hoặc nâng cấp) một dòng cấm gửi. Đã có dòng thì giữ nguyên, trừ khi dòng mới là hard_bounce
   * (lý do mạnh hơn huỷ đăng ký) thì ghi đè lý do.
   *
   * @param {{workspaceOwnerId: number, emailLower: string, reason: 'unsubscribe'|'hard_bounce', source?: string|null}} input
   * @param {{query: Function}} [queryable]
   * @returns {Promise<void>}
   */
  async upsert({ workspaceOwnerId, emailLower, reason, source = null }, queryable = db) {
    await (queryable || db).query(
      `INSERT INTO email_suppressions (workspace_owner_id, email_lower, reason, source)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (workspace_owner_id, email_lower)
       DO UPDATE SET reason = CASE WHEN EXCLUDED.reason = 'hard_bounce' THEN 'hard_bounce' ELSE email_suppressions.reason END,
                     source = CASE WHEN EXCLUDED.reason = 'hard_bounce' THEN EXCLUDED.source ELSE email_suppressions.source END`,
      [workspaceOwnerId, emailLower, reason, source]
    );
  }

  /**
   * Ghi dòng cấm gửi cho người nhận của một thư theo tracking_token. Workspace lấy từ
   * email_messages.workspace_owner_id, thiếu (dòng cũ) thì lấy từ chiến dịch. Không có thư / thiếu địa chỉ
   * / không xác định được workspace thì không ghi gì và trả false.
   *
   * @param {string} token
   * @param {{reason: 'unsubscribe'|'hard_bounce', source?: string|null}} input
   * @param {{query: Function}} [queryable]
   * @returns {Promise<boolean>} true nếu có ghi/cập nhật một dòng
   */
  async upsertByTrackingToken(token, { reason, source = null }, queryable = db) {
    const result = await (queryable || db).query(
      `INSERT INTO email_suppressions (workspace_owner_id, email_lower, reason, source)
       SELECT COALESCE(m.workspace_owner_id, cp.workspace_owner_id, cp.id_user),
              LOWER(BTRIM(m.recipient_email)), $2, $3
         FROM email_messages m
         LEFT JOIN campaigns cp ON cp.id = m.id_campaign
        WHERE m.tracking_token = $1
          AND m.recipient_email IS NOT NULL AND BTRIM(m.recipient_email) <> ''
          AND COALESCE(m.workspace_owner_id, cp.workspace_owner_id, cp.id_user) IS NOT NULL
       ON CONFLICT (workspace_owner_id, email_lower)
       DO UPDATE SET reason = CASE WHEN EXCLUDED.reason = 'hard_bounce' THEN 'hard_bounce' ELSE email_suppressions.reason END,
                     source = CASE WHEN EXCLUDED.reason = 'hard_bounce' THEN EXCLUDED.source ELSE email_suppressions.source END`,
      [token, reason, source]
    );
    return (result.rowCount || 0) > 0;
  }

  /**
   * Lý do cấm gửi của một email trong workspace, hoặc null nếu không bị cấm.
   *
   * @param {number} workspaceOwnerId
   * @param {string} emailLower
   * @returns {Promise<'unsubscribe'|'hard_bounce'|null>}
   */
  async findReason(workspaceOwnerId, emailLower) {
    const result = await db.query(
      'SELECT reason FROM email_suppressions WHERE workspace_owner_id = $1 AND email_lower = $2 LIMIT 1',
      [workspaceOwnerId, emailLower]
    );
    return result.rows[0]?.reason || null;
  }
}

export default new EmailSuppressionRepository();
