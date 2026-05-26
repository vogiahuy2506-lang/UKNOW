import db from '../../config/database.js';

class SubAssistantRepository {
  async findAllByUser(userId) {
    const { rows } = await db.query(
      `SELECT sa.*,
              (SELECT COUNT(*) FROM knowledge_bases WHERE id_sub_assistant = sa.id) AS kb_count,
              (SELECT COUNT(*) FROM chatbot_settings WHERE id_sub_assistant = sa.id AND is_enabled = true) AS active_channels
       FROM sub_assistants sa
       WHERE sa.id_user = $1
       ORDER BY sa.created_at DESC`,
      [userId]
    );
    return rows;
  }

  async findById(id, userId) {
    const { rows } = await db.query(
      `SELECT * FROM sub_assistants WHERE id = $1 AND id_user = $2`,
      [id, userId]
    );
    return rows[0] || null;
  }

  async create(userId, { name, description, avatar_url, greeting_msg, settings }) {
    const { rows } = await db.query(
      `INSERT INTO sub_assistants (id_user, name, description, avatar_url, greeting_msg, settings)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [userId, name, description || null, avatar_url || null,
       greeting_msg || 'Xin chào! Tôi có thể giúp gì cho bạn?',
       JSON.stringify(settings || {})]
    );
    return rows[0];
  }

  async update(id, userId, { name, description, avatar_url, greeting_msg, is_active, settings }) {
    const { rows } = await db.query(
      `UPDATE sub_assistants SET
         name = COALESCE($3, name),
         description = COALESCE($4, description),
         avatar_url = $5,
         greeting_msg = COALESCE($6, greeting_msg),
         is_active = COALESCE($7, is_active),
         settings = COALESCE($8, settings),
         updated_at = NOW()
       WHERE id = $1 AND id_user = $2
       RETURNING *`,
      [id, userId, name, description, avatar_url,
       greeting_msg, is_active, settings ? JSON.stringify(settings) : null]
    );
    return rows[0];
  }

  async delete(id, userId) {
    const { rows } = await db.query(
      `DELETE FROM sub_assistants WHERE id = $1 AND id_user = $2 RETURNING id`,
      [id, userId]
    );
    return rows[0]?.id || null;
  }
}

export default new SubAssistantRepository();
