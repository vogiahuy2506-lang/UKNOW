/**
 * SQL cho bộ ước tính thời gian chiến dịch (campaignEstimate.service.js) — phần "chiến dịch KHÁC của cùng chủ
 * workspace đang chiếm tài khoản gửi" và "tài khoản email từng bị máy chủ email chặn". Chỉ ĐỌC.
 */
import db from '../../config/database.js';

class CampaignEstimateRepository {
  /**
   * Chiến dịch khác của chủ workspace mà có lượt chạy `running`, hoặc đang `active` với ít nhất một lịch bật.
   * Trả kèm lịch bật và node (chỉ cột cần để suy ra tài khoản gửi). Giới hạn 50 chiến dịch.
   *
   * @param {{ ownerUserId: number, excludeCampaignId: number }} input
   * @returns {Promise<{ campaigns: Array<{id: number, campaign_name: string, is_running: boolean}>, schedules: Array<object>, nodes: Array<object> }>}
   */
  async findOtherCampaignsInUse({ ownerUserId, excludeCampaignId }) {
    const { rows: campaigns } = await db.query(
      `SELECT c.id, c.campaign_name,
              EXISTS (SELECT 1 FROM campaign_runs r WHERE r.id_campaign = c.id AND r.status = 'running') AS is_running
         FROM campaigns c
        WHERE COALESCE(c.workspace_owner_id, c.id_user) = $1
          AND c.id <> $2
          AND (
            EXISTS (SELECT 1 FROM campaign_runs r WHERE r.id_campaign = c.id AND r.status = 'running')
            OR (c.status = 'active'
                AND EXISTS (SELECT 1 FROM campaign_schedules s WHERE s.id_campaign = c.id AND s.enabled = true))
          )
        ORDER BY c.id DESC
        LIMIT 50`,
      [ownerUserId, excludeCampaignId]
    );
    if (campaigns.length === 0) return { campaigns, schedules: [], nodes: [] };
    const ids = campaigns.map((row) => row.id);
    const [{ rows: schedules }, { rows: nodes }] = await Promise.all([
      db.query(
        `SELECT id, id_campaign, schedule_type, cron_expression, enabled, last_run_at, created_at
           FROM campaign_schedules
          WHERE id_campaign = ANY($1::bigint[]) AND enabled = true`,
        [ids]
      ),
      db.query(
        `SELECT id_campaign, id, node_type, node_subtype, config
           FROM campaign_nodes
          WHERE id_campaign = ANY($1::bigint[])
          ORDER BY id_campaign, execution_order, id`,
        [ids]
      ),
    ]);
    return { campaigns, schedules, nodes };
  }

  /**
   * Số lượt chạy (trong cửa sổ `since`) bị máy chủ email từ chối vì gửi quá nhiều, theo từng tài khoản email.
   * Engine ghi `run_metadata.emailRateLimitSettingId` (có thể là số hoặc chuỗi) → so bằng TEXT. Một câu SQL cho mọi
   * tài khoản; giới hạn theo chủ workspace + `started_at >= since` để không quét cả bảng.
   *
   * @param {{ ownerUserId: number, settingIds: Array<number|string>, since: Date }} input
   * @returns {Promise<Array<{ settingId: string, events: number, lastAt: Date|null }>>}
   */
  async countEmailRateLimitEvents({ ownerUserId, settingIds, since }) {
    const ids = (Array.isArray(settingIds) ? settingIds : []).map((id) => String(id)).filter(Boolean);
    if (ids.length === 0) return [];
    const { rows } = await db.query(
      `SELECT r.run_metadata->>'emailRateLimitSettingId' AS setting_id,
              COUNT(*)::int AS events,
              MAX(CASE WHEN r.run_metadata->>'emailRateLimitAt' ~ '^\\d{4}-\\d{2}-\\d{2}T'
                       THEN (r.run_metadata->>'emailRateLimitAt')::timestamptz
                       ELSE r.started_at END) AS last_at
         FROM campaign_runs r
         JOIN campaigns c ON c.id = r.id_campaign
        WHERE COALESCE(c.workspace_owner_id, c.id_user) = $1
          AND r.started_at >= $3
          AND r.run_metadata->>'emailRateLimitSettingId' = ANY($2::text[])
        GROUP BY 1`,
      [ownerUserId, ids, since]
    );
    return rows.map((row) => ({ settingId: String(row.setting_id), events: Number(row.events) || 0, lastAt: row.last_at || null }));
  }
}

export default new CampaignEstimateRepository();
