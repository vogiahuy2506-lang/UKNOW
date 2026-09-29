import db from '../../config/database.js';

/**
 * PLAN_TG_WA_DAY_DU_2026-09-29 P4 — cấu hình gửi THEO TÀI KHOẢN cho kênh adapter (migration 267):
 * trần gửi/ngày (`user_daily_send_limit`, NULL = không giới hạn) + ghi đè giãn cách (`outbound_delay_min/max_ms`,
 * NULL = theo env).
 *   - Telegram: cột trên `telegram_accounts` (khoá = id tài khoản, kèm chủ để không chạm tài khoản người khác).
 *   - WhatsApp: bảng nhỏ `whatsapp_account_settings` (khoá = session_key "<userId>-<shortKey>"); KHÔNG có dòng
 *     = mặc định (mọi cột NULL).
 * Quyền sở hữu tài khoản do tầng service kiểm; ở đây Telegram vẫn lọc `id_user` (an toàn thêm một lớp).
 */

const EMPTY_SETTINGS = Object.freeze({
  userDailySendLimit: null,
  delayMinMs: null,
  delayMaxMs: null,
});

function toNullableInt(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapRow(row) {
  if (!row) return { ...EMPTY_SETTINGS };
  return {
    userDailySendLimit: toNullableInt(row.user_daily_send_limit),
    delayMinMs: toNullableInt(row.outbound_delay_min_ms),
    delayMaxMs: toNullableInt(row.outbound_delay_max_ms),
  };
}

class ChannelAccountSettingsRepository {
  /**
   * @param {'telegram'|'whatsapp'} channel
   * @param {string|number} accountRef Telegram: `telegram_accounts.id`; WhatsApp: session_key
   * @param {number|string} ownerUserId chủ workspace
   * @returns {Promise<{userDailySendLimit: number|null, delayMinMs: number|null, delayMaxMs: number|null}|null>}
   *   null CHỈ khi Telegram không có tài khoản đó của chủ; WhatsApp chưa có dòng trả mặc định.
   */
  async getSendSettings(channel, accountRef, ownerUserId) {
    if (channel === 'telegram') {
      const id = Number.parseInt(accountRef, 10);
      if (!Number.isInteger(id) || id <= 0) return null;
      const { rows } = await db.query(
        `SELECT user_daily_send_limit, outbound_delay_min_ms, outbound_delay_max_ms
         FROM telegram_accounts
         WHERE id = $1 AND id_user = $2`,
        [id, ownerUserId]
      );
      return rows[0] ? mapRow(rows[0]) : null;
    }
    if (channel === 'whatsapp') {
      const { rows } = await db.query(
        `SELECT user_daily_send_limit, outbound_delay_min_ms, outbound_delay_max_ms
         FROM whatsapp_account_settings
         WHERE session_key = $1 AND id_user = $2`,
        [String(accountRef), ownerUserId]
      );
      return mapRow(rows[0]);
    }
    throw new Error(`channelAccountSettings: kênh không hợp lệ '${channel}'`);
  }

  /**
   * Cập nhật CHỈ các trường có mặt trong `patch` (vắng = giữ nguyên; `null` = xoá/về mặc định).
   *
   * @param {'telegram'|'whatsapp'} channel
   * @param {string|number} accountRef
   * @param {number|string} ownerUserId
   * @param {{userDailySendLimit?: number|null, delayMinMs?: number|null, delayMaxMs?: number|null}} patch
   * @returns {Promise<object|null>} cấu hình sau cập nhật; null nếu Telegram không có tài khoản của chủ
   */
  async updateSendSettings(channel, accountRef, ownerUserId, patch = {}) {
    const has = (key) => Object.prototype.hasOwnProperty.call(patch, key);
    if (channel === 'telegram') {
      const id = Number.parseInt(accountRef, 10);
      if (!Number.isInteger(id) || id <= 0) return null;
      const sets = [];
      const params = [id, ownerUserId];
      if (has('userDailySendLimit')) { params.push(patch.userDailySendLimit); sets.push(`user_daily_send_limit = $${params.length}`); }
      if (has('delayMinMs')) { params.push(patch.delayMinMs); sets.push(`outbound_delay_min_ms = $${params.length}`); }
      if (has('delayMaxMs')) { params.push(patch.delayMaxMs); sets.push(`outbound_delay_max_ms = $${params.length}`); }
      if (sets.length === 0) return this.getSendSettings(channel, id, ownerUserId);
      const { rows } = await db.query(
        `UPDATE telegram_accounts
         SET ${sets.join(', ')}, updated_at = NOW()
         WHERE id = $1 AND id_user = $2
         RETURNING user_daily_send_limit, outbound_delay_min_ms, outbound_delay_max_ms`,
        params
      );
      return rows[0] ? mapRow(rows[0]) : null;
    }
    if (channel === 'whatsapp') {
      const current = (await this.getSendSettings(channel, accountRef, ownerUserId)) || { ...EMPTY_SETTINGS };
      const next = {
        userDailySendLimit: has('userDailySendLimit') ? patch.userDailySendLimit : current.userDailySendLimit,
        delayMinMs: has('delayMinMs') ? patch.delayMinMs : current.delayMinMs,
        delayMaxMs: has('delayMaxMs') ? patch.delayMaxMs : current.delayMaxMs,
      };
      const { rows } = await db.query(
        `INSERT INTO whatsapp_account_settings
           (session_key, id_user, user_daily_send_limit, outbound_delay_min_ms, outbound_delay_max_ms, updated_at)
         VALUES ($1, $2, $3, $4, $5, now())
         ON CONFLICT (session_key) DO UPDATE
           SET user_daily_send_limit = EXCLUDED.user_daily_send_limit,
               outbound_delay_min_ms = EXCLUDED.outbound_delay_min_ms,
               outbound_delay_max_ms = EXCLUDED.outbound_delay_max_ms,
               updated_at = now()
           WHERE whatsapp_account_settings.id_user = EXCLUDED.id_user
         RETURNING user_daily_send_limit, outbound_delay_min_ms, outbound_delay_max_ms`,
        [String(accountRef), ownerUserId, next.userDailySendLimit, next.delayMinMs, next.delayMaxMs]
      );
      return rows[0] ? mapRow(rows[0]) : null;
    }
    throw new Error(`channelAccountSettings: kênh không hợp lệ '${channel}'`);
  }
}

export default new ChannelAccountSettingsRepository();
