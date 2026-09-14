import db from '../../config/database.js';

class ChatbotDigestRepository {
  /**
   * Lấy danh sách người dùng cần gửi digest
   * Điều kiện: status = 'active', chatbot_digest_frequency = $1,
   * có ít nhất một tin nhắn của khách (role = 'visitor') trong kỳ trên 3 nguồn
   *
   * @param {'weekly'|'monthly'} frequency
   * @param {{ startIso: string, endIso: string }} period
   * @param {object} [options={}]
   * @param {Array<number|string>|null} [options.onlyUserIds]
   * @param {object} [queryable=db]
   * @returns {Promise<Array<{ id: number, email: string, full_name: string, chatbot_digest_frequency: string }>>}
   */
  async listDigestRecipients(
    frequency,
    { startIso, endIso },
    { onlyUserIds = null } = {},
    queryable = db
  ) {
    const hasFilter = Array.isArray(onlyUserIds) && onlyUserIds.length > 0;
    const params = [frequency, startIso, endIso];
    let userFilterSql = '';

    if (hasFilter) {
      params.push(onlyUserIds.map(Number));
      userFilterSql = 'AND u.id = ANY($4::bigint[])';
    }

    const { rows } = await queryable.query(
      `SELECT u.id, u.email, u.full_name, u.chatbot_digest_frequency
       FROM users u
       WHERE u.status = 'active'
         AND u.chatbot_digest_frequency = $1
         ${userFilterSql}
         AND (
           EXISTS (
             SELECT 1 FROM webchat_messages wm
             WHERE wm.id_user = u.id AND wm.role = 'visitor' AND wm.created_at >= $2 AND wm.created_at < $3
           )
           OR EXISTS (
             SELECT 1 FROM zalo_personal_messages zm
             WHERE zm.id_user = u.id AND zm.role = 'visitor' AND zm.created_at >= $2 AND zm.created_at < $3
           )
           OR EXISTS (
             SELECT 1 FROM channel_messages cm
             WHERE cm.id_user = u.id AND cm.role = 'visitor' AND cm.created_at >= $2 AND cm.created_at < $3
           )
         )
       ORDER BY u.id ASC`,
      params
    );
    return rows;
  }

  /**
   * Ghi log gửi digest để đảm bảo idempotent (chỉ gửi 1 lần/kỳ cho mỗi user).
   * Dùng ON CONFLICT (id_user, period_key) DO NOTHING.
   * Trả về row nếu chèn mới thành công, null nếu đã tồn tại.
   *
   * @param {object} params
   * @param {number} params.idUser
   * @param {string} params.periodKey
   * @param {string} params.periodStart
   * @param {string} params.periodEnd
   * @param {object} params.stats
   * @param {object} [queryable=db]
   * @returns {Promise<object|null>}
   */
  async insertDigestLog(
    { idUser, periodKey, periodStart, periodEnd, stats },
    queryable = db
  ) {
    const { rows } = await queryable.query(
      `INSERT INTO chatbot_digest_log (id_user, period_key, period_start, period_end, stats, sent_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (id_user, period_key) DO NOTHING
       RETURNING *`,
      [idUser, periodKey, periodStart, periodEnd, JSON.stringify(stats || {})]
    );
    return rows[0] || null;
  }

  /**
   * Xóa dòng log vừa chèn nếu việc gửi email gặp lỗi (để cron lượt sau thử gửi lại)
   * @param {number} idUser
   * @param {string} periodKey
   * @param {object} [queryable=db]
   * @returns {Promise<void>}
   */
  async deleteDigestLog(idUser, periodKey, queryable = db) {
    await queryable.query(
      `DELETE FROM chatbot_digest_log WHERE id_user = $1 AND period_key = $2`,
      [idUser, periodKey]
    );
  }

  /**
   * Thống kê toàn diện hoạt động chatbot đa kênh cho 1 user trong khoảng thời gian [startIso, endIso)
   *
   * Quy ước đếm tin:
   * - Web: khách role='visitor', AI role IN ('assistant','bot'), người role='agent'
   * - Zalo cá nhân: khách role='visitor', AI metadata->>'source'='ai_auto_reply', người role='agent'
   * - Kênh: khách role='visitor', AI role='bot', người role='agent'
   *
   * @param {number} idUser
   * @param {{ startIso: string, endIso: string }} period
   * @param {object} [queryable=db]
   * @returns {Promise<object>}
   */
  async getDigestStats(idUser, { startIso, endIso }, queryable = db) {
    // 1. Thống kê theo nguồn Web
    const webPromise = queryable.query(
      `SELECT
         COUNT(DISTINCT m.id_conversation)::int AS conversations,
         COUNT(CASE WHEN m.role = 'visitor' THEN 1 END)::int AS visitor_messages,
         COUNT(CASE WHEN m.role IN ('assistant', 'bot') THEN 1 END)::int AS ai_replies,
         COUNT(CASE WHEN m.role = 'agent' THEN 1 END)::int AS human_replies
       FROM webchat_messages m
       WHERE m.id_user = $1 AND m.created_at >= $2 AND m.created_at < $3`,
      [idUser, startIso, endIso]
    );

    // 2. Thống kê Zalo cá nhân
    const zaloPromise = queryable.query(
      `SELECT
         COUNT(DISTINCT m.id_conversation)::int AS conversations,
         COUNT(CASE WHEN m.role = 'visitor' THEN 1 END)::int AS visitor_messages,
         COUNT(CASE WHEN m.metadata->>'source' = 'ai_auto_reply' THEN 1 END)::int AS ai_replies,
         COUNT(CASE WHEN m.role = 'agent' THEN 1 END)::int AS human_replies
       FROM zalo_personal_messages m
       WHERE m.id_user = $1 AND m.created_at >= $2 AND m.created_at < $3`,
      [idUser, startIso, endIso]
    );

    // 3. Thống kê theo từng channel
    const channelPromise = queryable.query(
      `SELECT
         COALESCE(cc.channel, c.channel, 'channel') AS channel,
         COUNT(DISTINCT m.id_conversation)::int AS conversations,
         COUNT(CASE WHEN m.role = 'visitor' THEN 1 END)::int AS visitor_messages,
         COUNT(CASE WHEN m.role = 'bot' THEN 1 END)::int AS ai_replies,
         COUNT(CASE WHEN m.role = 'agent' THEN 1 END)::int AS human_replies
       FROM channel_messages m
       JOIN channel_conversations c ON c.id = m.id_conversation
       LEFT JOIN channel_connections cc ON cc.id = c.id_channel
       WHERE m.id_user = $1 AND m.created_at >= $2 AND m.created_at < $3
       GROUP BY COALESCE(cc.channel, c.channel, 'channel')`,
      [idUser, startIso, endIso]
    );

    // 4. Top 5 hội thoại có nhiều tin khách nhất trong kỳ
    const topConvPromise = queryable.query(
      `WITH top_convs AS (
         SELECT
           'web' AS source,
           'web' AS conversation_type,
           m.id_conversation AS id,
           c.visitor_name,
           'web' AS channel,
           COUNT(*)::int AS visitor_messages
         FROM webchat_messages m
         JOIN webchat_conversations c ON c.id = m.id_conversation
         WHERE m.id_user = $1 AND m.role = 'visitor' AND m.created_at >= $2 AND m.created_at < $3
         GROUP BY m.id_conversation, c.visitor_name

         UNION ALL

         SELECT
           'zalo_personal' AS source,
           'zalo_personal' AS conversation_type,
           m.id_conversation AS id,
           c.visitor_name,
           'zalo_personal' AS channel,
           COUNT(*)::int AS visitor_messages
         FROM zalo_personal_messages m
         JOIN zalo_personal_conversations c ON c.id = m.id_conversation
         WHERE m.id_user = $1 AND m.role = 'visitor' AND m.created_at >= $2 AND m.created_at < $3
         GROUP BY m.id_conversation, c.visitor_name

         UNION ALL

         SELECT
           'channel' AS source,
           'channel' AS conversation_type,
           m.id_conversation AS id,
           c.visitor_name,
           COALESCE(cc.channel, c.channel, 'channel') AS channel,
           COUNT(*)::int AS visitor_messages
         FROM channel_messages m
         JOIN channel_conversations c ON c.id = m.id_conversation
         LEFT JOIN channel_connections cc ON cc.id = c.id_channel
         WHERE m.id_user = $1 AND m.role = 'visitor' AND m.created_at >= $2 AND m.created_at < $3
         GROUP BY m.id_conversation, c.visitor_name, COALESCE(cc.channel, c.channel, 'channel')
       )
       SELECT * FROM top_convs
       ORDER BY visitor_messages DESC, id DESC
       LIMIT 5`,
      [idUser, startIso, endIso]
    );

    // 5. Hội thoại AI tạm dừng quá 24h (stalePaused) từ zalo_personal + channel
    const stalePausedPromise = queryable.query(
      `SELECT (
         (SELECT COUNT(*)::int FROM zalo_personal_conversations
          WHERE id_user = $1 AND ai_paused = true AND ai_paused_at IS NOT NULL
            AND ai_paused_at <= NOW() - interval '24 hours')
         +
         (SELECT COUNT(*)::int FROM channel_conversations
          WHERE id_user = $1 AND ai_paused = true AND ai_paused_at IS NOT NULL
            AND ai_paused_at <= NOW() - interval '24 hours')
       ) AS count`,
      [idUser]
    );

    // 6. Số liên hệ khách để lại trong kỳ và số chưa xử lý (contactsLeft, contactsOpen)
    const contactsPromise = queryable.query(
      `SELECT
         COUNT(CASE WHEN first_seen_at >= $2 AND first_seen_at < $3 THEN 1 END)::int AS contacts_left,
         COUNT(CASE WHEN handled_at IS NULL THEN 1 END)::int AS contacts_open
       FROM chatbot_contact_alerts
       WHERE id_user = $1`,
      [idUser, startIso, endIso]
    );

    const [webRes, zaloRes, channelRes, topConvRes, stalePausedRes, contactsRes] =
      await Promise.all([
        webPromise,
        zaloPromise,
        channelPromise,
        topConvPromise,
        stalePausedPromise,
        contactsPromise,
      ]);

    const webRow = webRes.rows[0] || {
      conversations: 0,
      visitor_messages: 0,
      ai_replies: 0,
      human_replies: 0,
    };
    const zaloRow = zaloRes.rows[0] || {
      conversations: 0,
      visitor_messages: 0,
      ai_replies: 0,
      human_replies: 0,
    };

    const byChannel = [];
    if (webRow.conversations > 0 || webRow.visitor_messages > 0 || webRow.ai_replies > 0 || webRow.human_replies > 0) {
      byChannel.push({
        channel: 'web',
        channelLabel: 'Website',
        conversations: webRow.conversations,
        visitorMessages: webRow.visitor_messages,
        aiReplies: webRow.ai_replies,
        humanReplies: webRow.human_replies,
      });
    }

    if (zaloRow.conversations > 0 || zaloRow.visitor_messages > 0 || zaloRow.ai_replies > 0 || zaloRow.human_replies > 0) {
      byChannel.push({
        channel: 'zalo_personal',
        channelLabel: 'Zalo cá nhân',
        conversations: zaloRow.conversations,
        visitorMessages: zaloRow.visitor_messages,
        aiReplies: zaloRow.ai_replies,
        humanReplies: zaloRow.human_replies,
      });
    }

    const channelLabelMap = {
      zalo_oa: 'Zalo OA',
      facebook: 'Facebook',
      whatsapp: 'WhatsApp',
      whatsapp_baileys: 'WhatsApp',
      channel: 'Kênh khác',
    };

    let channelConversations = 0;
    let channelVisitorMessages = 0;
    let channelAiReplies = 0;
    let channelHumanReplies = 0;

    for (const row of channelRes.rows) {
      channelConversations += row.conversations;
      channelVisitorMessages += row.visitor_messages;
      channelAiReplies += row.ai_replies;
      channelHumanReplies += row.human_replies;

      byChannel.push({
        channel: row.channel,
        channelLabel: channelLabelMap[row.channel] || row.channel,
        conversations: row.conversations,
        visitorMessages: row.visitor_messages,
        aiReplies: row.ai_replies,
        humanReplies: row.human_replies,
      });
    }

    const totalConversations = webRow.conversations + zaloRow.conversations + channelConversations;
    const totalVisitorMessages = webRow.visitor_messages + zaloRow.visitor_messages + channelVisitorMessages;
    const totalAiReplies = webRow.ai_replies + zaloRow.ai_replies + channelAiReplies;
    const totalHumanReplies = webRow.human_replies + zaloRow.human_replies + channelHumanReplies;

    const topConversations = topConvRes.rows.map((row) => ({
      source: row.source,
      conversationType: row.conversation_type,
      conversationId: row.id,
      visitorName: row.visitor_name || 'Khách',
      channel: row.channel,
      visitorMessages: row.visitor_messages,
    }));

    const stalePaused = stalePausedRes.rows[0]?.count || 0;
    const contactsLeft = contactsRes.rows[0]?.contacts_left || 0;
    const contactsOpen = contactsRes.rows[0]?.contacts_open || 0;

    return {
      conversations: totalConversations,
      visitorMessages: totalVisitorMessages,
      aiReplies: totalAiReplies,
      humanReplies: totalHumanReplies,
      byChannel,
      topConversations,
      stalePaused,
      contactsLeft,
      contactsOpen,
    };
  }

  /**
   * Lấy tần suất gửi thư tổng hợp của chủ tài khoản
   * @param {number} userId
   * @param {object} [queryable=db]
   * @returns {Promise<string>} 'none' | 'weekly' | 'monthly'
   */
  async getOwnerDigestFrequency(userId, queryable = db) {
    const { rows } = await queryable.query(
      `SELECT chatbot_digest_frequency FROM users WHERE id = $1`,
      [userId]
    );
    return rows[0]?.chatbot_digest_frequency || 'weekly';
  }

  /**
   * Cập nhật tần suất gửi thư tổng hợp
   * @param {number} userId
   * @param {'none'|'weekly'|'monthly'} frequency
   * @param {object} [queryable=db]
   * @returns {Promise<string>}
   */
  async setOwnerDigestFrequency(userId, frequency, queryable = db) {
    const valid = ['none', 'weekly', 'monthly'];
    const val = valid.includes(frequency) ? frequency : 'weekly';
    const { rows } = await queryable.query(
      `UPDATE users
       SET chatbot_digest_frequency = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING chatbot_digest_frequency`,
      [userId, val]
    );
    return rows[0]?.chatbot_digest_frequency || val;
  }
}

export default new ChatbotDigestRepository();
