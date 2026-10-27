import db from '../../config/database.js';
import { firstSentAtSql } from '../stats/sendStats.repository.js';

/**
 * SQL cho thẻ "3 bước bắt đầu" ở trang chủ (PLAN_ONBOARDING_ZALO_VA_THE_3_BUOC_2026-10-27).
 */
class GettingStartedRepository {
  /**
   * Chủ workspace có ÍT NHẤT MỘT tài khoản kênh gửi đang DÙNG ĐƯỢC không — một câu SQL, ba bảng:
   * - Zalo: `status = 'connected'` VÀ `is_active` (đúng điều kiện màn Zalo hiện nhãn "Đã kết nối" và các luồng gửi dùng —
   *   zaloSetting.repository / zaloPersonal.repository). Production có đủ connected / needs_reauth / disconnected /
   *   logged_out: nick hết phiên KHÔNG tính là đã nối, khách phải quét lại.
   * - Email: `status = 'active'` (cùng điều kiện chọn tài khoản gửi: campaignEmailSender.repository).
   * - Telegram: `is_active`.
   *
   * WhatsApp CỐ Ý KHÔNG có ở đây: DB không có cột "đang kết nối" đáng tin cho Baileys. Trạng thái sống (`open`) chỉ nằm
   * trong bộ nhớ tiến trình (whatsappBaileys.service `sessions`); bảng `whatsapp_baileys_session_creds` chỉ có dòng
   * "phiên tồn tại" (creds mã hoá, không đọc được bằng SQL, không phân biệt đã quét QR hay chưa) và
   * `whatsapp_baileys_session_profile.me_id` chỉ được ghi khi lấy được tên hiển thị, còn nguyên khi rớt mạng. Đếm nhầm
   * một phiên chưa quét thành "đã nối" làm thẻ nói sai với đúng người cần được chỉ đường.
   *
   * @param {number|string} ownerId chủ workspace (không phải nhân viên)
   * @returns {Promise<boolean>}
   */
  async hasConnectedChannelAccount(ownerId) {
    const { rows } = await db.query(
      `SELECT (
          EXISTS (SELECT 1 FROM zalo_settings WHERE id_user = $1::bigint AND is_active = TRUE AND status = 'connected')
          OR EXISTS (SELECT 1 FROM email_settings WHERE id_user = $1::bigint AND status = 'active')
          OR EXISTS (SELECT 1 FROM telegram_accounts WHERE id_user = $1::bigint AND is_active = TRUE)
        ) AS connected`,
      [ownerId]
    );
    return rows[0]?.connected === true;
  }

  /**
   * Chủ đã từng gửi được ít nhất một tin chưa — dùng `firstSentAtSql` của sendStats (cùng định nghĩa "đã gửi" với mọi
   * số gửi tin: email ∈ EMAIL_SENT_STATUSES, Zalo hiệu lực 'sent', Telegram/WhatsApp 'sent', loại is_preview).
   * Không dùng `getChannelTotals` cửa sổ 3660 ngày: đo production 27/10/2026 chủ 1 (225.778 tin) mất 3,2 giây, chủ 39
   * 1,5 giây — chạy mỗi lần mở trang chủ; bản MIN theo index (workspace_owner_id, sent_at) này 0,7 / 0,2 giây.
   *
   * @param {number|string} ownerId chủ workspace
   * @returns {Promise<boolean>}
   */
  async hasSentMessage(ownerId) {
    const { rows } = await db.query(`SELECT ${firstSentAtSql('$1::bigint')} AS first_sent_at`, [ownerId]);
    return rows[0]?.first_sent_at != null;
  }
}

export default new GettingStartedRepository();
