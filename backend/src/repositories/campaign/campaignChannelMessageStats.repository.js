import db from '../../config/database.js';
import deliveryMonitorRepository from '../admin/deliveryMonitor.repository.js';

/**
 * PLAN_WHATSAPP_DOT3, W7b — đếm `campaign_channel_messages` (kênh adapter: Telegram/WhatsApp) cho
 * các màn báo cáo/giám sát. Các màn này trước đây chỉ đọc email_messages/zalo_messages/
 * customer_journey nên tin Telegram/WhatsApp không hiện ở "đã gửi" dù vẫn bị trừ hạn mức.
 *
 * Quy tắc chung (khớp phép đếm hạn mức ở sendQuota.repository.js): CHỈ `sent`/`failed`, LUÔN loại
 * `is_preview` (gửi nhanh/xem thử đếm riêng, như zalo_messages.is_preview ở các màn này).
 * Cột giờ của bảng là TIMESTAMPTZ nên so sánh thẳng với NOW(), không cần AT TIME ZONE.
 */
class CampaignChannelMessageStatsRepository {
  /**
   * Đếm theo kênh + trạng thái trong cửa sổ `windowDays` ngày gần nhất.
   *
   * @param {object} input
   * @param {number|null} [input.ownerUserId] chủ chiến dịch (campaigns.id_user); null = toàn hệ thống (admin)
   * @param {number} input.windowDays
   * @returns {Promise<Array<{channel: string, status: string, count: number}>>}
   */
  async countByChannelStatus({ ownerUserId = null, windowDays }) {
    const params = [windowDays];
    let join = '';
    let ownerClause = '';
    if (ownerUserId != null) {
      params.push(ownerUserId);
      join = 'JOIN campaigns c ON c.id = ccm.id_campaign';
      ownerClause = 'AND c.id_user = $2';
    }
    return deliveryMonitorRepository.safeQuery(
      `SELECT ccm.channel, ccm.status, COUNT(*)::int AS count
       FROM campaign_channel_messages ccm
       ${join}
       WHERE ccm.created_at >= NOW() - ($1::int * INTERVAL '1 day')
         AND ccm.status IN ('sent', 'failed')
         AND NOT ccm.is_preview
         -- P2: lần thử transient ĐÃ được thử lại không phải "tin lỗi" (người nhận có thể vẫn nhận được ở lần sau).
         AND ccm.error_category IS DISTINCT FROM 'transient_retry'
         ${ownerClause}
       GROUP BY ccm.channel, ccm.status`,
      params
    );
  }

  /**
   * Số tin `sent` theo giờ (cùng định dạng bucket với timeline customer_journey).
   *
   * @param {object} input
   * @param {number|null} [input.ownerUserId]
   * @param {number} input.windowDays
   * @returns {Promise<Array<{bucket: string, channel: string, count: number}>>}
   */
  async hourlySentByChannel({ ownerUserId = null, windowDays }) {
    const params = [windowDays];
    let join = '';
    let ownerClause = '';
    if (ownerUserId != null) {
      params.push(ownerUserId);
      join = 'JOIN campaigns c ON c.id = ccm.id_campaign';
      ownerClause = 'AND c.id_user = $2';
    }
    return deliveryMonitorRepository.safeQuery(
      `SELECT to_char(date_trunc('hour', ccm.sent_at), 'YYYY-MM-DD HH24:00') AS bucket,
              ccm.channel, COUNT(*)::int AS count
       FROM campaign_channel_messages ccm
       ${join}
       WHERE ccm.sent_at >= NOW() - ($1::int * INTERVAL '1 day')
         AND ccm.status = 'sent'
         AND NOT ccm.is_preview
         ${ownerClause}
       GROUP BY date_trunc('hour', ccm.sent_at), ccm.channel
       ORDER BY date_trunc('hour', ccm.sent_at) ASC`,
      params
    );
  }

  /**
   * P2 — lỗi TỪNG người nhận của một lượt chạy (kênh adapter), cùng hình dạng dòng với phần Zalo/Email của
   * `getRunFailures` (userDeliveryMonitor.service.js). Người gọi PHẢI đã xác thực quyền sở hữu run.
   *
   * Chỉ tính lỗi CUỐI CÙNG của mỗi người/bước: bỏ lần thử transient đã được thử lại (`transient_retry`, xem
   * campaignChannelRunner.service.js — bảng không có cột meta nên nhãn nằm ở error_category) và bỏ người/bước
   * ĐÃ gửi được ở một dòng `sent` khác cùng run (lỗi rate_limit/auth từng dừng node rồi resume gửi thành công).
   *
   * @param {{runId: number}} input
   * @returns {Promise<Array<{channel: string, recipient: string, recipient_display: string|null, error_category: string|null, error_message: string|null, count: number, last_at: Date, ledger_reason: string|null, ledger_step: number|null}>>}
   */
  async listRunFailures({ runId }) {
    return deliveryMonitorRepository.safeQuery(
      `SELECT
         ccm.channel,
         ccm.recipient_key AS recipient,
         MAX(ccm.recipient_display) AS recipient_display,
         ccm.error_category,
         LEFT(ccm.error_message, 300) AS error_message,
         COUNT(*)::int AS count,
         MAX(COALESCE(ccm.sent_at, ccm.created_at)) AS last_at,
         crrs.meta->>'lastFailureReason' AS ledger_reason,
         crrs.last_completed_step AS ledger_step
       FROM campaign_channel_messages ccm
       LEFT JOIN campaign_run_recipient_steps crrs
         ON crrs.id_run = ccm.id_run
        AND LOWER(TRIM(crrs.recipient_key)) = LOWER(TRIM(ccm.recipient_key))
        AND crrs.channel = ccm.channel
       WHERE ccm.id_run = $1
         AND ccm.status = 'failed'
         AND NOT ccm.is_preview
         AND ccm.error_category IS DISTINCT FROM 'transient_retry'
         AND NOT EXISTS (
           SELECT 1 FROM campaign_channel_messages sent_row
           WHERE sent_row.id_run = ccm.id_run
             AND sent_row.id_node IS NOT DISTINCT FROM ccm.id_node
             AND sent_row.channel = ccm.channel
             AND sent_row.recipient_key = ccm.recipient_key
             AND sent_row.step_index = ccm.step_index
             AND sent_row.status = 'sent'
         )
       GROUP BY ccm.channel, ccm.recipient_key, ccm.error_category, LEFT(ccm.error_message, 300),
                crrs.meta->>'lastFailureReason', crrs.last_completed_step
       ORDER BY COUNT(*) DESC
       LIMIT 200`,
      [runId]
    );
  }

  /**
   * "Đã gửi hôm nay / tháng này" (mốc theo giờ VN) của một chủ tài khoản cho các kênh adapter đếm
   * vào hạn mức đang xét. Khoá theo `workspace_owner_id` như phép đếm hạn mức.
   *
   * @param {number} ownerUserId
   * @param {string[]} channels danh sách `channel` cần cộng (rỗng → 0)
   * @returns {Promise<{today: number, month: number}>}
   */
  async countSentTodayAndMonth(ownerUserId, channels) {
    if (!Array.isArray(channels) || channels.length === 0) return { today: 0, month: 0 };
    const { rows } = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE ccm.sent_at >= (CURRENT_DATE::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh'))::int AS today,
         COUNT(*)::int AS month
       FROM campaign_channel_messages ccm
       WHERE ccm.workspace_owner_id = $1
         AND ccm.channel = ANY($2::text[])
         AND ccm.status = 'sent'
         AND NOT ccm.is_preview
         AND ccm.sent_at >= (date_trunc('month', CURRENT_DATE)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')`,
      [ownerUserId, channels]
    );
    return { today: Number(rows[0]?.today || 0), month: Number(rows[0]?.month || 0) };
  }
}

export default new CampaignChannelMessageStatsRepository();
