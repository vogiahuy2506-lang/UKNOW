import db from '../../config/database.js';
import chatbotShareRepository from '../../repositories/ai/chatbotShare.repository.js';
import chatbotRepository from '../../repositories/ai/chatbot.repository.js';
import chatbotCloneRepository from '../../repositories/ai/chatbotClone.repository.js';
import { sendSystemEmail } from '../../utils/systemEmail.util.js';
import { buildChatbotSharedEmail } from '../../utils/systemEmailShare.util.js';
import { assertChatbotSlotAvailable, CHATBOT_LIMIT_EXCEEDED_CODE } from './chatbotSlot.service.js';

/**
 * PR-3: Chia sẻ chatbot với email.
 *
 * Hai nhánh (giống landing page / campaign share):
 *   - Email đã có user → UPSERT share active (id_recipient = user.id).
 *     KHÔNG clone ngay — để auth.controller hoặc caller tự quyết định lúc nào clone.
 *     (Hiện tại, để giữ tương thích với code cũ, vẫn clone ngay khi nhánh active.)
 *   - Email NGOÀI hệ thống → share pending (id_recipient=NULL). Server gửi mail mời đăng ký.
 *     Khi user đăng ký, auth.controller tự claim và clone cho họ.
 *
 * Resource limit: clone tốn 1 suất chatbot trong gói của NGƯỜI NHẬN → kiểm ở cả nhánh active
 * (clone ngay) và nhánh claim (khi đăng ký) bằng assertChatbotSlotAvailable (chatbotSlot.service.js), trong
 * CÙNG transaction với lần clone.
 */
class ChatbotShareService {
  /**
   * Share chatbot với email — hỗ trợ cả email đã có user (active) và email ngoài (pending).
   *
   * @returns {Promise<{
   *   success: true,
   *   share: object,
   *   recipient: { id: number, name: string, email: string } | null,
   *   isExistingUser: boolean,
   *   clonedChatbot: { id: number, name: string } | null,
   *   notificationSent: boolean,
   * }>}
   */
  async shareChatbot({ chatbotId, ownerId, recipientEmail }) {
    const normalizedEmail = String(recipientEmail || '').trim().toLowerCase();

    // Lấy thông tin chatbot (cho email + check owner + cho mail).
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

    const client = await db.getClient();
    let result;
    let clonedChatbot = null;
    try {
      await client.query('BEGIN');
      result = await chatbotShareRepository.findOrCreatePendingByEmail(client, {
        idChatbot: chatbotId,
        ownerId,
        recipientEmail: normalizedEmail,
      });
      if (!result) {
        throw Object.assign(new Error('Chatbot không thuộc quyền sở hữu của bạn'), { status: 404 });
      }

      // Tự share với chính mình là vô nghĩa.
      if (result.recipient && Number(result.recipient.id) === Number(ownerId)) {
        throw Object.assign(new Error('Bạn không thể chia sẻ chatbot với chính mình'), { status: 400 });
      }

      // Nhánh active: clone ngay (giữ nguyên hành vi cũ để không phá callers hiện tại).
      if (result.isExistingUser) {
        await assertChatbotSlotAvailable(result.recipient.id, {
          client,
          roleCode: result.recipient.role,
        });
        const cloned = await chatbotCloneRepository.cloneFromSource(client, {
          sourceChatbotId: chatbotId,
          targetUserId: result.recipient.id,
        });
        if (!cloned) {
          throw new Error('Không thể sao chép chatbot');
        }
        clonedChatbot = { id: cloned.id, name: cloned.name };
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      // Người NHẬN hết suất chatbot → lỗi 400 câu chữ hướng về người nhận (người chia sẻ là người đọc thông báo).
      if (err.code === CHATBOT_LIMIT_EXCEEDED_CODE) {
        const wrapped = new Error(`Người nhận đã đạt giới hạn ${err.limit} chatbot của gói dịch vụ hiện tại.`);
        wrapped.status = 400;
        wrapped.code = CHATBOT_LIMIT_EXCEEDED_CODE;
        wrapped.used = err.used;
        wrapped.limit = err.limit;
        throw wrapped;
      }
      throw err;
    } finally {
      client.release();
    }

    // Fire-and-forget notification.
    let notificationSent = false;
    try {
      const sender = await this._resolveSenderName(ownerId);
      await this._sendShareNotification({
        isExistingUser: result.isExistingUser,
        chatbotId,
        chatbotName: sourceChatbot.name,
        recipientEmail: normalizedEmail,
        recipient: result.recipient,
        senderName: sender,
        clonedChatbot,
      });
      notificationSent = true;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `[ChatbotShareService] Failed to send share notification to ${normalizedEmail}:`,
        err?.message || err
      );
    }

    return {
      success: true,
      share: result.share,
      recipient: result.recipient
        ? {
            id: result.recipient.id,
            name: result.recipient.full_name || result.recipient.username,
            email: result.recipient.email,
          }
        : null,
      isExistingUser: result.isExistingUser,
      clonedChatbot,
      notificationSent,
    };
  }

  /**
   * Claim + clone tất cả share pending cho 1 user (gọi từ auth.controller trong transaction register).
   * Trả về danh sách share đã clone (để ghi audit).
   *
   * @returns {Promise<Array<{
   *   shareId: number,
   *   chatbotId: number,
   *   clonedChatbotId: number | null,
   *   error: string | null,
   * }>>}
   */
  async claimPendingAndClone(client, { userId, email, roleCode }) {
    const claimedRows = await chatbotShareRepository.claimPendingByUserId(client, { userId, email });
    const results = [];
    for (const row of claimedRows) {
      try {
        // assertChatbotSlotAvailable có thể throw CHATBOT_LIMIT_EXCEEDED — cô lập từng share.
        await assertChatbotSlotAvailable(userId, { client, roleCode });
        const cloned = await chatbotCloneRepository.cloneFromSource(client, {
          sourceChatbotId: row.id_chatbot,
          targetUserId: userId,
        });
        results.push({
          shareId: row.id,
          chatbotId: row.id_chatbot,
          clonedChatbotId: cloned?.id ?? null,
          error: cloned ? null : 'clone returned null',
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(
          `[ChatbotShareService] Failed to clone chatbot ${row.id_chatbot} for user ${userId}:`,
          err?.message || err
        );
        results.push({
          shareId: row.id,
          chatbotId: row.id_chatbot,
          clonedChatbotId: null,
          error: err?.message || 'unknown',
        });
      }
    }
    return results;
  }

  async _resolveSenderName(ownerId) {
    try {
      const { rows } = await db.query(
        `SELECT COALESCE(full_name, username) AS name FROM users WHERE id = $1 LIMIT 1`,
        [ownerId]
      );
      return rows[0]?.name || null;
    } catch {
      return null;
    }
  }

  async _sendShareNotification({
    isExistingUser,
    chatbotId,
    chatbotName,
    recipientEmail,
    recipient,
    senderName,
    clonedChatbot,
  }) {
    const { subject, html } = buildChatbotSharedEmail({
      senderName: senderName || 'Một người dùng Founder AI',
      chatbotName: chatbotName || 'Chatbot',
      recipientName: recipient?.name || null,
      isExistingUser,
      clonedChatbotName: clonedChatbot?.name || null,
    });
    await sendSystemEmail({ to: recipientEmail, subject, html });
  }

  /**
   * Lấy danh sách share của 1 chatbot (cho owner).
   */
  async getChatbotShares(chatbotId, ownerId) {
    const owned = await chatbotRepository.findChatbotById(chatbotId);
    if (!owned || owned.id_user !== ownerId) {
      const err = new Error('Chatbot không tồn tại hoặc không thuộc quyền sở hữu của bạn');
      err.status = 404;
      throw err;
    }
    const rows = await chatbotShareRepository.findByChatbot(chatbotId, ownerId);
    return rows.map((row) => ({
      id: row.id,
      recipient: row.id_recipient
        ? {
            id: row.id_recipient,
            name: row.recipient_name,
            email: row.recipient_user_email,
          }
        : null,
      recipientEmail: row.recipient_email,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * Revoke 1 share (xóa row).
   */
  async revokeShare({ chatbotId, ownerId, recipientId }) {
    const deleted = await chatbotShareRepository.delete(chatbotId, ownerId, recipientId);
    if (!deleted) {
      const err = new Error('Không tìm thấy chia sẻ để xóa');
      err.status = 404;
      throw err;
    }
    return { success: true };
  }
}

export default new ChatbotShareService();
