/**
 * channelDisconnectAlert.repository.js — SQL cho cron "báo chủ tài khoản khi kênh mất kết nối" (P3 bước 3-4)
 * và metric cảnh báo admin (alert.repository.js dùng lại cùng bảng).
 *
 * Bảng `channel_disconnect_alerts` (migration 266) giữ MỐC BẮT ĐẦU mất kết nối + lần báo cuối cho
 * cả ba kênh. Lý do dùng bảng riêng thay vì cột trên từng bảng tài khoản: trạng thái Telegram
 * (listening) và WhatsApp (open) chỉ nằm trong RAM — không có cột thời điểm "bắt đầu mất" nào để
 * đọc; ghi vào ba bảng tài khoản khác nhau (zalo_settings nóng, telegram_accounts, và WhatsApp không
 * có bảng tài khoản) thì xâm lấn hơn nhiều một bảng nhỏ độc lập.
 *
 * Mọi mốc thời gian nhận từ tham số (`now`), KHÔNG dùng NOW() — để test đóng băng được đồng hồ.
 */
import db from '../../config/database.js';

class ChannelDisconnectAlertRepository {
  /**
   * Zalo cá nhân đang bật. `down` = không connected VÀ đã có ít nhất một lần khôi phục thất bại hoặc
   * đã needs_reauth. Không tính "disconnected" trơn (người dùng tự đăng xuất / chưa kịp khôi phục) —
   * nếu không, ai bấm đăng xuất cũng bị email.
   */
  async listZaloSnapshot() {
    const { rows } = await db.query(
      `SELECT zs.id::text AS account_ref,
              zs.id_user,
              COALESCE(NULLIF(zs.display_name, ''), NULLIF(zs.zalo_name, ''), 'Zalo') AS label,
              (COALESCE(zs.status, '') <> 'connected'
                AND (COALESCE(zs.status, '') = 'needs_reauth' OR COALESCE(zs.restore_fail_count, 0) > 0)
              ) AS down,
              zs.updated_at AS since_hint
       FROM zalo_settings zs
       WHERE zs.is_active = TRUE`
    );
    return rows;
  }

  /** Telegram đang bật (is_active). Trạng thái nghe tin do service đọc từ session manager. */
  async listTelegramAccounts() {
    const { rows } = await db.query(
      `SELECT ta.telegram_user_id::text AS account_ref,
              ta.id_user,
              COALESCE(NULLIF(ta.username, ''), NULLIF(ta.first_name, ''), NULLIF(ta.phone, ''), 'Telegram') AS label,
              COALESCE(ta.last_activity_at, ta.updated_at) AS since_hint
       FROM telegram_accounts ta
       WHERE ta.is_active = TRUE`
    );
    return rows;
  }

  /**
   * Phiên WhatsApp còn creds. `updated_at` của creds được Baileys ghi liên tục lúc còn sống nên gần
   * đúng "lần cuối còn sống" — làm mốc khởi điểm cho phiên đã chết từ trước (bị loại nếu > 7 ngày).
   */
  async listWhatsappSessions() {
    const { rows } = await db.query(
      `SELECT session_key, updated_at AS since_hint FROM whatsapp_baileys_session_creds`
    );
    return rows;
  }

  async listStatesByChannel(channel) {
    const { rows } = await db.query(
      `SELECT account_ref, disconnected_since, last_alerted_at
       FROM channel_disconnect_alerts WHERE channel = $1`,
      [channel]
    );
    return rows;
  }

  /**
   * Ghi trạng thái hiện tại của một kênh. `entries` = [{ accountRef, idUser, label, disconnectedSince|null }].
   * Không đụng `last_alerted_at` (giữ cooldown 24h qua các lần rớt/nối lại). Xoá dòng của tài khoản
   * không còn trong `entries` (đã xoá / tắt).
   */
  async syncChannel(channel, entries, now) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      for (const e of entries) {
        await client.query(
          `INSERT INTO channel_disconnect_alerts
             (channel, account_ref, id_user, account_label, disconnected_since, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (channel, account_ref) DO UPDATE
             SET id_user = EXCLUDED.id_user,
                 account_label = EXCLUDED.account_label,
                 disconnected_since = EXCLUDED.disconnected_since,
                 updated_at = EXCLUDED.updated_at`,
          [channel, e.accountRef, e.idUser, e.label, e.disconnectedSince, now]
        );
      }
      await client.query(
        `DELETE FROM channel_disconnect_alerts
         WHERE channel = $1 AND NOT (account_ref = ANY($2::text[]))`,
        [channel, entries.map((e) => e.accountRef)]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Mọi tài khoản đang mất kết nối + thông tin chủ (chỉ chủ còn hoạt động). PR-6: KHÔNG còn lọc chủ có email — chuông trong app không cần
   * email; dispatcher tự bỏ phần email với chủ không có địa chỉ.
   */
  async listDisconnectedWithOwner() {
    const { rows } = await db.query(
      `SELECT a.channel, a.account_ref, a.id_user, a.account_label,
              a.disconnected_since, a.last_alerted_at,
              u.email, u.full_name
       FROM channel_disconnect_alerts a
       JOIN users u ON u.id = a.id_user
       WHERE a.disconnected_since IS NOT NULL
         AND u.status = 'active'
       ORDER BY a.id_user, a.channel, a.account_ref`
    );
    return rows;
  }

  async markAlerted(items, now) {
    for (const it of items) {
      await db.query(
        `UPDATE channel_disconnect_alerts SET last_alerted_at = $3
         WHERE channel = $1 AND account_ref = $2`,
        [it.channel, it.account_ref, now]
      );
    }
  }
}

export default new ChannelDisconnectAlertRepository();
