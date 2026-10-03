/**
 * SQL cho bộ ước tính thời gian chiến dịch (campaignEstimate.service.js) — phần "chiến dịch KHÁC của cùng chủ
 * workspace đang chiếm tài khoản gửi". Chỉ ĐỌC.
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
}

export default new CampaignEstimateRepository();
