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
}

export default new CampaignChannelMessageStatsRepository();
