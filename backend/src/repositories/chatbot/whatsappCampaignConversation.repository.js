import db from '../../config/database.js';

/**
 * PLAN_WHATSAPP_DAY_DU_2026-09-29 PR-W4a — đọc hội thoại WhatsApp (Baileys) theo sessionKey cho chiến dịch.
 *
 * Hội thoại nằm ở bảng chung `channel_conversations` (channel='whatsapp_baileys'), `external_id` là chuỗi
 * GHÉP `baileys:<sessionKey>:<chatbotId>:<phone>` (whatsappBaileysInbox.service.js:212-217) — một khách
 * nhắn tới nhiều chatbot = nhiều dòng cùng phone → người gọi phải KHỬ TRÙNG theo phone.
 * WA không tự ghi `status` — cột mặc định 'active' (bootstrap.sql: `status VARCHAR(20) DEFAULT 'active'`).
 *
 * sessionKey chỉ gồm [A-Za-z0-9_-] (không có ':'); dùng `starts_with` thay `LIKE` vì '_' là ký tự đại diện của LIKE.
 */

const OPEN_STATUSES = ['active', 'open'];

/** Phần cuối của chuỗi ghép = phone. Trả '' khi không có. */
export function extractPhoneFromExternalId(externalId) {
  const parts = String(externalId ?? '').split(':');
  return (parts[parts.length - 1] || '').trim();
}

class WhatsAppCampaignConversationRepository {
  /**
   * Hội thoại đang mở của một phiên, mới nhất trước. KHÔNG khử trùng (người gọi làm).
   * @param {number} ownerUserId chủ workspace (id_user của hội thoại = chủ phiên)
   * @param {string} sessionKey
   * @returns {Promise<Array<{external_id: string, visitor_name: string|null}>>}
   */
  async listOpenWhatsAppConversationsForSession(ownerUserId, sessionKey) {
    const { rows } = await db.query(
      `SELECT external_id, visitor_name
       FROM channel_conversations
       WHERE id_user = $1
         AND channel = 'whatsapp_baileys'
         AND starts_with(external_id, $2)
         AND COALESCE(status, 'active') = ANY($3::text[])
       ORDER BY last_message_at DESC NULLS LAST, id DESC`,
      [ownerUserId, `baileys:${sessionKey}:`, OPEN_STATUSES]
    );
    return rows;
  }

  /**
   * Đếm số khách (khử trùng theo phone) đang có hội thoại mở, gom theo sessionKey — MỘT truy vấn.
   * @param {number} ownerUserId
   * @param {string[]} sessionKeys
   * @returns {Promise<Map<string, number>>}
   */
  async countOpenConversationsBySessionKeys(ownerUserId, sessionKeys) {
    if (!Array.isArray(sessionKeys) || sessionKeys.length === 0) return new Map();
    const { rows } = await db.query(
      `SELECT split_part(external_id, ':', 2) AS session_key,
              COUNT(DISTINCT substring(external_id from '[^:]*$'))::int AS open_count
       FROM channel_conversations
       WHERE id_user = $1
         AND channel = 'whatsapp_baileys'
         AND starts_with(external_id, 'baileys:')
         AND COALESCE(status, 'active') = ANY($2::text[])
         AND split_part(external_id, ':', 2) = ANY($3::text[])
       GROUP BY 1`,
      [ownerUserId, OPEN_STATUSES, sessionKeys]
    );
    return new Map(rows.map((r) => [r.session_key, r.open_count]));
  }
}

export default new WhatsAppCampaignConversationRepository();
