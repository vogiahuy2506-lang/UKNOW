import db from '../../config/database.js';
import chatbotRepository from '../../repositories/ai/chatbot.repository.js';
import chatbotCloneRepository from '../../repositories/ai/chatbotClone.repository.js';
import { enforceResourceLimitTx } from '../../utils/userResourceLimit.util.js';

class ChatbotShareService {
  constructor() {
    this._resourceKey = 'chatbots';
  }

  /**
   * Chia sẻ chatbot cho người dùng khác bằng cách clone toàn bộ (config + knowledge + embedding)
   * sang user nhận. Người nhận trở thành owner của bản clone, hoàn toàn độc lập với bản gốc.
   *
   * @param {{
   *   chatbotId: number,
   *   ownerId: number,
   *   recipientEmail: string,
   * }} input
   * @returns {Promise<{ success: true, clonedChatbot: { id: number, name: string }, recipient: object }>}
   */
  async shareChatbot({ chatbotId, ownerId, recipientEmail }) {
    if (!recipientEmail || typeof recipientEmail !== 'string') {
      const err = new Error('Email người nhận không hợp lệ');
      err.status = 400;
      throw err;
    }

    // 1. Verify source chatbot thuộc owner
    const sourceChatbot = await chatbotRepository.findChatbotById(chatbotId);
    if (!sourceChatbot) {
      const err = new Error('Chatbot không tồn tại');
      err.status = 404;
      throw err;
    }
    if (sourceChatbot.id_user !== ownerId) {
      const err = new Error('Bạn không có quyền chia sẻ chatbot này');
      err.status = 403;
      throw err;
    }

    // 2. Tìm user nhận theo email
    const { rows: recipientRows } = await db.query(
      `SELECT id, full_name, username, email FROM users WHERE email = $1 LIMIT 1`,
      [recipientEmail.trim().toLowerCase()]
    );
    const recipient = recipientRows[0];
    if (!recipient) {
      const err = new Error('Không tìm thấy người dùng với email này');
      err.status = 404;
      throw err;
    }
    if (recipient.id === ownerId) {
      const err = new Error('Bạn không thể chia sẻ chatbot với chính mình');
      err.status = 400;
      throw err;
    }

    // 3. Transaction: check giới hạn + clone
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      await enforceResourceLimitTx(client, {
        userId: recipient.id,
        resourceKey: this._resourceKey,
      });

      const cloned = await chatbotCloneRepository.cloneFromSource(client, {
        sourceChatbotId: chatbotId,
        targetUserId: recipient.id,
      });

      if (!cloned) {
        throw new Error('Không thể sao chép chatbot');
      }

      await client.query('COMMIT');

      return {
        success: true,
        clonedChatbot: { id: cloned.id, name: cloned.name },
        recipient: {
          id: recipient.id,
          name: recipient.full_name || recipient.username,
          email: recipient.email,
        },
      };
    } catch (err) {
      await client.query('ROLLBACK');
      // Chuẩn hoá mã lỗi giới hạn để frontend dễ xử lý
      if (err.code === 'RESOURCE_LIMIT_EXCEEDED' && err.resource === this._resourceKey) {
        const wrapped = new Error(err.message);
        wrapped.status = err.statusCode || 400;
        wrapped.code = 'CHATBOT_LIMIT_EXCEEDED';
        throw wrapped;
      }
      throw err;
    } finally {
      client.release();
    }
  }
}

export default new ChatbotShareService();
