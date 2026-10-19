import db from '../../config/database.js';

/**
 * Kiểm "chatbot / trợ lý phụ này có thuộc chủ không gian này không" cho các kênh gắn chatbot vào tài khoản
 * (Telegram, WhatsApp Baileys). Trước đây các kênh này chỉ kiểm tài khoản/phiên có thuộc chủ, KHÔNG kiểm chatbot —
 * tài khoản A gắn được chatbot của B (và đọc `system_instruction` của B qua dòng settings).
 * Mẫu có sẵn: `chatbotZaloAccount.repository.js` `assertOwnedConfiguration`.
 */
export const CHATBOT_NOT_FOUND_MESSAGE = 'Không tìm thấy chatbot trong không gian làm việc';
export const SUB_ASSISTANT_NOT_FOUND_MESSAGE = 'Không tìm thấy trợ lý phụ trong không gian làm việc';

function notFound(message) {
  const error = new Error(message);
  error.status = 404;
  return error;
}

class ChatbotOwnershipRepository {
  /**
   * @param {number} userId chủ không gian
   * @param {number|string|null|undefined} chatbotId bỏ trống/null = không có gì để kiểm
   * @param {{ requireActive?: boolean }} [options] `requireActive`: chatbot phải đang `is_active` — dùng khi BẬT;
   *   TẮT thì chỉ cần đúng chủ (vẫn tắt được chatbot đã ngưng).
   * @throws lỗi `status=404` nếu chatbot không tồn tại hoặc thuộc chủ khác.
   */
  async assertOwnedChatbot(userId, chatbotId, { requireActive = false } = {}) {
    if (chatbotId == null || chatbotId === '') return;
    const { rows } = await db.query(
      `SELECT 1 FROM custom_chatbots
       WHERE id = $1::bigint AND id_user = $2::bigint
         AND ($3::boolean = false OR is_active = true)`,
      [chatbotId, userId, Boolean(requireActive)]
    );
    if (!rows[0]) throw notFound(CHATBOT_NOT_FOUND_MESSAGE);
  }

  /**
   * @param {number} userId chủ không gian
   * @param {number|string|null|undefined} subAssistantId bỏ trống/null = không có gì để kiểm
   * @throws lỗi `status=404` nếu trợ lý phụ không tồn tại hoặc thuộc chủ khác.
   */
  async assertOwnedSubAssistant(userId, subAssistantId) {
    if (subAssistantId == null || subAssistantId === '') return;
    const { rows } = await db.query(
      `SELECT 1 FROM sub_assistants WHERE id = $1::bigint AND id_user = $2::bigint`,
      [subAssistantId, userId]
    );
    if (!rows[0]) throw notFound(SUB_ASSISTANT_NOT_FOUND_MESSAGE);
  }
}

export default new ChatbotOwnershipRepository();
