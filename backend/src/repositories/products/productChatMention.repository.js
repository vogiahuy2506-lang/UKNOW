import db from '../../config/database.js';

const MESSAGE_TABLES = {
  web: 'webchat_messages',
  channel: 'channel_messages',
  zalo_personal: 'zalo_personal_messages',
};

class ProductChatMentionRepository {
  async getCursor(source, queryable = db) {
    const { rows } = await queryable.query(
      `SELECT last_message_id FROM product_mention_scan_cursors WHERE source = $1 LIMIT 1`,
      [source]
    );
    if (!rows[0]) return null;
    return Number(rows[0].last_message_id) || 0;
  }

  async setCursor(source, lastMessageId, queryable = db) {
    await queryable.query(
      `INSERT INTO product_mention_scan_cursors (source, last_message_id, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (source) DO UPDATE
       SET last_message_id = EXCLUDED.last_message_id, updated_at = NOW()`,
      [source, lastMessageId]
    );
  }

  /** Id tin role='visitor' đầu tiên có created_at >= since; null nếu không có. Chỉ đọc. */
  async firstVisitorMessageIdSince(source, since, queryable = db) {
    const table = MESSAGE_TABLES[source];
    if (!table) return null;
    const { rows } = await queryable.query(
      `SELECT MIN(id) AS first_id FROM ${table} WHERE role = 'visitor' AND created_at >= $1`,
      [since]
    );
    return rows[0]?.first_id != null ? Number(rows[0].first_id) : null;
  }

  async getMaxMessageId(source, queryable = db) {
    const table = MESSAGE_TABLES[source];
    if (!table) return 0;
    const { rows } = await queryable.query(`SELECT COALESCE(MAX(id), 0) AS max_id FROM ${table}`);
    return Number(rows[0]?.max_id) || 0;
  }

  /**
   * Ghi nhiều dòng nhắc sản phẩm; chạy lại không nhân đôi (UNIQUE source+message_id+product_id).
   * @param {Array<{workspaceOwnerId:number, productId:number, source:string, messageId:number, conversationKey:string, createdAt:Date|string}>} rows
   * @returns {Promise<number>} số dòng mới ghi
   */
  async insertMentions(rows, queryable = db) {
    if (!rows || rows.length === 0) return 0;
    const params = [];
    const tuples = rows.map((r, i) => {
      const o = i * 6;
      params.push(r.workspaceOwnerId, r.productId, r.source, r.messageId, r.conversationKey, r.createdAt);
      return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6})`;
    });
    const result = await queryable.query(
      `INSERT INTO product_chat_mentions
         (workspace_owner_id, product_id, source, message_id, conversation_key, created_at)
       VALUES ${tuples.join(', ')}
       ON CONFLICT (source, message_id, product_id) DO NOTHING`,
      params
    );
    return result.rowCount || 0;
  }

  /**
   * Số hội thoại / tin khách nhắc từng sản phẩm của một workspace trong [startAt, endExclusive).
   * @returns {Promise<Array<{productId:number, chatConversations:number, chatMessages:number}>>}
   */
  async aggregateChatMentionsByProduct({ workspaceOwnerId, startAt, endExclusive }, queryable = db) {
    const { rows } = await queryable.query(
      `SELECT product_id,
              COUNT(DISTINCT conversation_key)::int AS chat_conversations,
              COUNT(*)::int AS chat_messages
       FROM product_chat_mentions
       WHERE workspace_owner_id = $1 AND created_at >= $2 AND created_at < $3
       GROUP BY product_id`,
      [workspaceOwnerId, startAt, endExclusive]
    );
    return rows.map((r) => ({
      productId: Number(r.product_id),
      chatConversations: r.chat_conversations,
      chatMessages: r.chat_messages,
    }));
  }
}

const productChatMentionRepository = new ProductChatMentionRepository();
export const aggregateChatMentionsByProduct = (args) =>
  productChatMentionRepository.aggregateChatMentionsByProduct(args);
export default productChatMentionRepository;
