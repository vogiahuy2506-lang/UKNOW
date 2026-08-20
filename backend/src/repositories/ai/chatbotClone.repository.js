import db from '../../config/database.js';

/**
 * Repository for cloning chatbots.
 *
 * Hỗ trợ 2 nguồn dữ liệu:
 * - `cloneFromSource`: copy từ 1 chatbot đang tồn tại trong DB (share giữa user).
 *   Copy toàn bộ row custom_chatbots (trừ id/widget_key) + toàn bộ chunks + embedding JSONB.
 * - `cloneFromSnapshot`: copy từ snapshot JSON (marketplace purchase).
 *   Snapshot không có embedding nên chỉ copy chunk_text/source/chunk_index.
 */
class ChatbotCloneRepository {
  /**
   * Lấy đầy đủ row custom_chatbots + chunks (kèm embedding) để clone từ nguồn.
   * @param {import('pg').PoolClient} client
   * @param {number} sourceChatbotId
   */
  async _loadSource(client, sourceChatbotId) {
    const { rows: chatbotRows } = await client.query(
      `SELECT id, id_user, name, description, system_instruction, greeting_msg, welcome_message,
              avatar_url, theme_color, position, primary_color, background_color, text_color,
              accent_color, logo_url, show_avatar, border_radius, chat_height,
              suggested_questions, allow_attachments, temperature, max_tokens, ai_model
       FROM custom_chatbots
       WHERE id = $1 AND is_active = true`,
      [sourceChatbotId]
    );
    const source = chatbotRows[0];
    if (!source) return null;

    const { rows: chunks } = await client.query(
      `SELECT chunk_text, embedding, source, chunk_index
       FROM custom_chatbot_chunks
       WHERE chatbot_id = $1
       ORDER BY chunk_index`,
      [sourceChatbotId]
    );

    return { source, chunks };
  }

  /**
   * Insert 1 row custom_chatbots mới (không có widget_key) trong transaction hiện tại.
   * @param {import('pg').PoolClient} client
   * @param {number} targetUserId
   * @param {object} payload
   * @param {string} [origin] - 'shared' for cloned chatbots, undefined for self-created
   */
  async _insertClonedChatbot(client, targetUserId, payload, origin = null) {
    const { rows } = await client.query(
      `INSERT INTO custom_chatbots
         (id_user, name, description, system_instruction, greeting_msg, welcome_message,
          avatar_url, theme_color, position, primary_color, background_color, text_color,
          accent_color, logo_url, show_avatar, border_radius, chat_height,
          suggested_questions, widget_key, allow_attachments,
          temperature, max_tokens, ai_model, origin)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
       RETURNING *`,
      [
        targetUserId,
        payload.name,
        payload.description ?? null,
        payload.system_instruction ?? '',
        payload.greeting_msg ?? 'Xin chào! Tôi có thể giúp gì cho bạn?',
        payload.welcome_message ?? null,
        payload.avatar_url ?? null,
        payload.theme_color ?? '#6366F1',
        payload.position ?? 'bottom-right',
        payload.primary_color ?? '#6366F1',
        payload.background_color ?? '#FFFFFF',
        payload.text_color ?? '#1F2937',
        payload.accent_color ?? '#60A5FA',
        payload.logo_url ?? null,
        payload.show_avatar !== false,
        payload.border_radius ?? 16,
        payload.chat_height ?? '600px',
        payload.suggested_questions ?? [],
        null, // widget_key luôn null cho bản clone; route sẽ generate khi publish
        payload.allow_attachments ?? false,
        payload.temperature ?? 0.7,
        payload.max_tokens ?? 2048,
        payload.ai_model ?? 'gemini-2.5-flash',
        origin, // 'shared' for cloned chatbots, null for self-created
      ]
    );
    return rows[0];
  }

  /**
   * Copy tất cả chunks từ mảng nguồn sang chatbot mới.
   * Nếu `includeEmbedding` thì copy luôn cột embedding (dùng cho clone trực tiếp).
   * @param {import('pg').PoolClient} client
   * @param {number} targetChatbotId
   * @param {number} targetUserId
   * @param {Array} chunks
   * @param {boolean} includeEmbedding
   */
  async _insertClonedChunks(client, targetChatbotId, targetUserId, chunks, includeEmbedding) {
    if (!Array.isArray(chunks) || chunks.length === 0) return 0;
    let inserted = 0;
    for (const chunk of chunks) {
      if (!chunk || typeof chunk.chunk_text !== 'string') continue;
      if (includeEmbedding && chunk.embedding != null) {
        await client.query(
          `INSERT INTO custom_chatbot_chunks
             (chatbot_id, user_id, chunk_text, embedding, source, chunk_index)
           VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
          [
            targetChatbotId,
            targetUserId,
            chunk.chunk_text,
            JSON.stringify(chunk.embedding),
            chunk.source ?? null,
            Number.isFinite(chunk.chunk_index) ? chunk.chunk_index : null,
          ]
        );
      } else {
        await client.query(
          `INSERT INTO custom_chatbot_chunks
             (chatbot_id, user_id, chunk_text, source, chunk_index)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            targetChatbotId,
            targetUserId,
            chunk.chunk_text,
            chunk.source ?? null,
            Number.isFinite(chunk.chunk_index) ? chunk.chunk_index : null,
          ]
        );
      }
      inserted += 1;
    }
    return inserted;
  }

  /**
   * Clone trực tiếp từ 1 chatbot đang tồn tại sang user khác.
   * Copy toàn bộ metadata + chunks + embedding JSONB.
   *
   * @param {import('pg').PoolClient} client - transaction client (đã BEGIN).
   * @param {{ sourceChatbotId: number, targetUserId: number, nameSuffix?: string }} input
   * @returns {Promise<{ id: number, name: string, type: 'chatbot' } | null>}
   */
  async cloneFromSource(client, { sourceChatbotId, targetUserId, nameSuffix = ' (Copy)' }) {
    const loaded = await this._loadSource(client, sourceChatbotId);
    if (!loaded) return null;
    const { source, chunks } = loaded;

    const newChatbot = await this._insertClonedChatbot(client, targetUserId, {
      ...source,
      name: `${source.name}${nameSuffix}`,
    }, 'shared'); // Mark as shared origin

    await this._insertClonedChunks(client, newChatbot.id, targetUserId, chunks, true);

    return { id: newChatbot.id, name: newChatbot.name, type: 'chatbot' };
  }

  /**
   * Clone từ snapshot JSON (dùng cho marketplace purchase).
   * Snapshot không có embedding nên chỉ copy chunk_text/source/chunk_index.
   *
   * @param {import('pg').PoolClient} client - transaction client (đã BEGIN).
   * @param {number} targetUserId
   * @param {object} snapshot
   * @returns {Promise<{ id: number, type: 'chatbot' }>}
   */
  async cloneFromSnapshot(client, targetUserId, snapshot) {
    const data = snapshot || {};

    const newChatbot = await this._insertClonedChatbot(client, targetUserId, {
      name: data.chatbotName || 'Imported Chatbot',
      description: data.chatbotDescription ?? null,
      system_instruction: data.systemInstruction ?? '',
      greeting_msg: data.greetingMsg ?? 'Xin chào! Tôi có thể giúp gì cho bạn?',
      welcome_message: data.welcomeMessage ?? null,
      avatar_url: data.avatarUrl ?? null,
      theme_color: data.themeColor,
      position: data.position,
      primary_color: data.primaryColor,
      background_color: data.backgroundColor,
      text_color: data.textColor,
      accent_color: data.accentColor,
      logo_url: data.logoUrl ?? null,
      show_avatar: data.showAvatar,
      border_radius: data.borderRadius,
      chat_height: data.chatHeight,
      suggested_questions: data.suggestedQuestions ?? [],
      allow_attachments: data.allowAttachments ?? false,
    }, 'marketplace_purchased'); // Mark as marketplace origin

    if (data.includeKnowledgeBase) {
      const chunks = Array.isArray(data.chunks) ? data.chunks : [];
      await this._insertClonedChunks(client, newChatbot.id, targetUserId, chunks, false);
    }

    return { id: newChatbot.id, type: 'chatbot' };
  }
}

export default new ChatbotCloneRepository();
