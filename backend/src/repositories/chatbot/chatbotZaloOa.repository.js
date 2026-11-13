import crypto from 'crypto';
import db from '../../config/database.js';

class ChatbotZaloOaRepository {
  /**
   * Danh sách Zalo OA của user kèm trạng thái bật/tắt trên chatbot chỉ định.
   * @param {number} userId
   * @param {number} chatbotId
   * @returns {Promise<Array<object>>}
   */
  async listOaAccountsForChatbot(userId, chatbotId) {
    const { rows } = await db.query(
      `SELECT 
         cc.id AS channel_connection_id,
         cc.zalo_oa_id,
         cc.zalo_oa_name,
         cc.zalo_oa_avatar,
         cc.display_name,
         cc.credentials->>'app_id' AS app_id,
         cc.credentials->>'expires_at' AS token_expires_at,
         COALESCE(czos.is_active, false) AS is_active_on_this_chatbot,
         other_active.chatbot_name AS active_on_other_chatbot_name,
         other_active.chatbot_id AS active_on_other_chatbot_id
       FROM channel_connections cc
       LEFT JOIN chatbot_zalo_oa_settings czos
         ON czos.id_channel_connection = cc.id AND czos.id_chatbot = $2
       LEFT JOIN LATERAL (
         SELECT cb.id AS chatbot_id, cb.name AS chatbot_name
         FROM chatbot_zalo_oa_settings other_czos
         JOIN custom_chatbots cb ON cb.id = other_czos.id_chatbot
         WHERE other_czos.id_channel_connection = cc.id
           AND other_czos.id_chatbot != $2
           AND other_czos.is_active = true
           AND cb.is_active = true
         LIMIT 1
       ) other_active ON true
       WHERE cc.id_user = $1 AND cc.channel = 'zalo_oa' AND cc.is_active = true
       ORDER BY cc.created_at DESC`,
      [userId, chatbotId]
    );

    return rows.map((r) => ({
      channel_connection_id: Number(r.channel_connection_id),
      zalo_oa_id: r.zalo_oa_id,
      name: r.zalo_oa_name || r.display_name || 'Zalo OA',
      avatar: r.zalo_oa_avatar,
      app_id: r.app_id,
      token_expires_at: r.token_expires_at,
      is_active: Boolean(r.is_active_on_this_chatbot),
      active_on_other_chatbot: r.active_on_other_chatbot_name
        ? { id: Number(r.active_on_other_chatbot_id), name: r.active_on_other_chatbot_name }
        : null,
    }));
  }

  /**
   * Bật hoặc tắt Zalo OA cho một chatbot cụ thể.
   * @param {object} params
   * @param {number} params.userId
   * @param {number} params.chatbotId
   * @param {number} params.channelConnectionId
   * @param {boolean} params.isActive
   * @returns {Promise<object>}
   */
  async toggleAccountForChatbot({ userId, chatbotId, channelConnectionId, isActive }) {
    // 1. Kiểm tra quyền sở hữu Zalo OA connection
    const { rows: connRows } = await db.query(
      `SELECT * FROM channel_connections
       WHERE id = $1 AND id_user = $2 AND channel = 'zalo_oa' AND is_active = true`,
      [channelConnectionId, userId]
    );
    if (!connRows[0]) {
      const err = new Error('Không tìm thấy tài khoản Zalo OA hoặc bạn không có quyền truy cập');
      err.status = 404;
      throw err;
    }
    const connection = connRows[0];

    // 2. Nếu bật (isActive = true), tắt trên các chatbot khác (1 OA chỉ gán cho 1 bot active tại 1 thời điểm)
    if (isActive) {
      await db.query(
        `UPDATE chatbot_zalo_oa_settings
         SET is_active = false, updated_at = NOW()
         WHERE id_channel_connection = $1 AND id_chatbot != $2 AND is_active = true`,
        [channelConnectionId, chatbotId]
      );
      if (connection.zalo_oa_id) {
        await db.query(
          `UPDATE chatbot_channel_connections
           SET is_active = false, updated_at = NOW()
           WHERE channel_type = 'zalo_oa' AND external_channel_id = $1 AND id_chatbot != $2 AND is_active = true`,
          [connection.zalo_oa_id, chatbotId]
        );
      }
    }

    // 3. Upsert vào chatbot_zalo_oa_settings
    const { rows: settingRows } = await db.query(
      `INSERT INTO chatbot_zalo_oa_settings
         (id_chatbot, id_channel_connection, id_user, is_active, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (id_chatbot, id_channel_connection) DO UPDATE SET
         is_active = EXCLUDED.is_active,
         updated_at = NOW()
       RETURNING *`,
      [chatbotId, channelConnectionId, userId, Boolean(isActive)]
    );

    // 4. Đồng bộ vào chatbot_channel_connections để tương thích với pipeline webhook, debounce và unified inbox
    if (connection.zalo_oa_id) {
      if (isActive) {
        await db.query(
          `INSERT INTO chatbot_channel_connections
             (id_chatbot, channel_type, credentials, webhook_token, display_name,
              external_channel_id, settings, is_active, connected_at, updated_at)
           VALUES ($1, 'zalo_oa', $2, $3, $4, $5, '{}'::jsonb, true, NOW(), NOW())
           ON CONFLICT (id_chatbot, channel_type, external_channel_id) DO UPDATE SET
             credentials = EXCLUDED.credentials,
             display_name = EXCLUDED.display_name,
             is_active = true,
             updated_at = NOW()`,
          [
            chatbotId,
            connection.credentials || {},
            crypto.randomBytes(32).toString('hex'),
            connection.zalo_oa_name || connection.display_name || 'Zalo OA',
            connection.zalo_oa_id,
          ]
        );
      } else {
        await db.query(
          `UPDATE chatbot_channel_connections
           SET is_active = false, updated_at = NOW()
           WHERE id_chatbot = $1 AND channel_type = 'zalo_oa' AND external_channel_id = $2`,
          [chatbotId, connection.zalo_oa_id]
        );
      }
    }

    return {
      success: true,
      setting: settingRows[0],
      connection,
    };
  }

  /**
   * Tra cứu Chatbot đang Active tiếp nhận tin nhắn cho một Zalo OA (theo oa_id).
   * Dùng cho Webhook routing.
   * @param {string} oaId
   * @returns {Promise<{ chatbot: object, connection: object }|null>}
   */
  async findActiveChatbotForOa(oaId) {
    const { rows } = await db.query(
      `SELECT 
         cb.id AS chatbot_id,
         cb.name AS chatbot_name,
         cb.id_user,
         cb.is_active AS chatbot_is_active,
         cb.system_instruction,
         cb.ai_model,
         cc.id AS channel_connection_id,
         cc.zalo_oa_id,
         cc.credentials,
         cc.display_name,
         czos.settings AS oa_chatbot_settings
       FROM channel_connections cc
       JOIN chatbot_zalo_oa_settings czos
         ON czos.id_channel_connection = cc.id AND czos.is_active = true
       JOIN custom_chatbots cb
         ON cb.id = czos.id_chatbot AND cb.is_active = true
       WHERE cc.channel = 'zalo_oa'
         AND (cc.zalo_oa_id = $1 OR cc.external_channel_id = $1)
         AND cc.is_active = true
       ORDER BY czos.updated_at DESC
       LIMIT 1`,
      [String(oaId)]
    );

    if (!rows[0]) return null;

    const r = rows[0];
    return {
      chatbot: {
        id: Number(r.chatbot_id),
        name: r.chatbot_name,
        id_user: Number(r.id_user),
        is_active: r.chatbot_is_active,
        system_instruction: r.system_instruction,
        ai_model: r.ai_model,
      },
      connection: {
        id: Number(r.channel_connection_id),
        zalo_oa_id: r.zalo_oa_id,
        credentials: r.credentials,
        display_name: r.display_name,
        settings: r.oa_chatbot_settings,
      },
    };
  }
}

export default new ChatbotZaloOaRepository();

