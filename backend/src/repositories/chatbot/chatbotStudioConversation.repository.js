import db from '../../config/database.js';

class ChatbotStudioConversationRepository {
  async createOrGetConversation({ userId, chatbotId, sessionId }) {
    // Check if conversation exists
    const existing = await db.query(
      `SELECT * FROM chatbot_studio_conversations 
       WHERE id_user = $1 AND id_chatbot = $2 AND session_id = $3`,
      [userId, chatbotId, sessionId]
    );
    
    if (existing.rows[0]) {
      return existing.rows[0];
    }
    
    // Create new conversation
    const result = await db.query(
      `INSERT INTO chatbot_studio_conversations (id_user, id_chatbot, session_id, title, last_message_at)
       VALUES ($1, $2, $3, 'Cuộc trò chuyện mới', NOW())
       RETURNING *`,
      [userId, chatbotId, sessionId]
    );
    
    return result.rows[0];
  }

  async getConversationsByUser(userId, chatbotId, { limit = 20, offset = 0, status = 'active' } = {}) {
    let query = `
       SELECT c.*, m.content as last_message, m.role as last_message_role
       FROM chatbot_studio_conversations c
       LEFT JOIN LATERAL (
         SELECT content, role FROM chatbot_studio_messages
         WHERE id_conversation = c.id
         ORDER BY created_at DESC LIMIT 1
       ) m ON true
       WHERE c.id_user = $1 AND c.status = $2
    `;
    const params = [userId, status];
    
    if (chatbotId) {
      query += ` AND c.id_chatbot = $3`;
      params.push(chatbotId);
    }
    
    query += `
       ORDER BY c.last_message_at DESC NULLS LAST
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    params.push(limit, offset);
    
    const result = await db.query(query, params);
    
    const countQuery = chatbotId
      ? `SELECT COUNT(*) FROM chatbot_studio_conversations WHERE id_user = $1 AND status = $2 AND id_chatbot = $3`
      : `SELECT COUNT(*) FROM chatbot_studio_conversations WHERE id_user = $1 AND status = $2`;
    const countParams = chatbotId ? [userId, status, chatbotId] : [userId, status];
    const countResult = await db.query(countQuery, countParams);
    
    return {
      items: result.rows,
      total: parseInt(countResult.rows[0].count, 10),
    };
  }

  async getConversationById(userId, conversationId) {
    const result = await db.query(
      `SELECT * FROM chatbot_studio_conversations WHERE id = $1 AND id_user = $2`,
      [conversationId, userId]
    );
    return result.rows[0] || null;
  }

  async updateConversation(conversationId, { title, status, lastMessageAt, incrementMessageCount = false }) {
    const updates = [];
    const values = [];
    let paramIndex = 1;
    
    if (title !== undefined) {
      updates.push(`title = $${paramIndex++}`);
      values.push(title);
    }
    if (status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(status);
    }
    if (lastMessageAt !== undefined) {
      updates.push(`last_message_at = $${paramIndex++}`);
      values.push(lastMessageAt);
    }
    if (incrementMessageCount) {
      updates.push(`message_count = message_count + 1`);
    }
    updates.push(`updated_at = NOW()`);
    
    values.push(conversationId);
    
    const result = await db.query(
      `UPDATE chatbot_studio_conversations SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );
    return result.rows[0];
  }

  async deleteConversation(userId, conversationId) {
    const result = await db.query(
      `DELETE FROM chatbot_studio_conversations WHERE id = $1 AND id_user = $2 RETURNING id`,
      [conversationId, userId]
    );
    return result.rows[0]?.id;
  }

  async getMessagesByConversation(conversationId, { limit = 50, offset = 0 } = {}) {
    const result = await db.query(
      `SELECT * FROM chatbot_studio_messages 
       WHERE id_conversation = $1 
       ORDER BY created_at ASC 
       LIMIT $2 OFFSET $3`,
      [conversationId, limit, offset]
    );
    return result.rows;
  }

  async createMessage({ conversationId, role, content, messageType = 'text', aiModel, aiTokensUsed, aiLatencyMs, attachments = [], metadata = {} }) {
    const result = await db.query(
      `INSERT INTO chatbot_studio_messages 
       (id_conversation, role, content, message_type, ai_model, ai_tokens_used, ai_latency_ms, attachments, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [conversationId, role, content, messageType, aiModel, aiTokensUsed, aiLatencyMs, JSON.stringify(attachments), JSON.stringify(metadata)]
    );
    return result.rows[0];
  }

  async deleteMessagesByConversation(conversationId) {
    await db.query(
      `DELETE FROM chatbot_studio_messages WHERE id_conversation = $1`,
      [conversationId]
    );
  }
}

export default new ChatbotStudioConversationRepository();
