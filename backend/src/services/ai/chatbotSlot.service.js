import chatbotRepository from '../../repositories/ai/chatbot.repository.js';
import { resolveEffectiveCeiling } from '../payment/topupLock.service.js';
import { isAdminRole } from '../../utils/roleScope.util.js';

/**
 * "Còn suất chatbot không?" — MỘT hàm duy nhất cho mọi đường làm tăng số chatbot của một chủ:
 * cổng tạo (chatbot.controller.js createCustomChatbot), clone khi chia sẻ (chatbotShare.service.js, cả nhánh chia sẻ
 * ngay lẫn nhánh claim khi đăng ký) và mua chatbot trên Marketplace (marketplacePurchase.service.js).
 *
 * Trước 30/09/2026 clone + Marketplace đi qua RESOURCE_LIMIT_MAP.chatbots của userResourceLimit.util.js: mục đó đọc
 * cột `users.max_chatbots` (không tồn tại → trần luôn null = không giới hạn), đếm cả chatbot xoá mềm và không cộng slot
 * mua thêm — nên trần chatbot của gói không chặn được hai đường đó. Mục ấy đã gỡ; nguồn sự thật của trần/đếm là:
 *   - đếm: chatbotRepository.countActiveChatbotsByUser (chỉ `is_active = true`, xoá mềm không tính);
 *   - trần: resolveEffectiveCeiling(userId, 'chatbots') = `plans.max_chatbots` (NULL/-1 = không giới hạn, 0 = không
 *     được tạo, không có gói = 0) + slot mua thêm còn hạn.
 * profileUsage.service.js (đồng hồ trang Thanh toán) dùng đúng hai hàm này nên số khách thấy khớp số cổng chặn.
 */

export const CHATBOT_LIMIT_EXCEEDED_CODE = 'CHATBOT_LIMIT_EXCEEDED';

/**
 * Lỗi "hết suất chatbot" — hình dạng giữ nguyên như cổng tạo từng trả: HTTP 403, `code`, `used`, `limit`,
 * `upgradeRequired`, thông điệp "Bạn đã đạt giới hạn N chatbot của gói dịch vụ hiện tại.".
 *
 * @param {{ used: number, limit: number }} input
 */
export function createChatbotLimitExceededError({ used, limit }) {
  const err = new Error(`Bạn đã đạt giới hạn ${limit} chatbot của gói dịch vụ hiện tại.`);
  err.status = 403;
  err.statusCode = 403;
  err.code = CHATBOT_LIMIT_EXCEEDED_CODE;
  err.used = used;
  err.limit = limit;
  err.upgradeRequired = true;
  return err;
}

/**
 * Khoá tư vấn theo (chủ, 'chatbots') — CÙNG khoá với `enforceResourceLimitTx` (userResourceLimit.util.js) để hai lượt
 * clone/mua song song của cùng một chủ xếp hàng: lượt sau chỉ đếm sau khi lượt trước commit, nên không cùng lọt qua
 * "còn 1 suất". Khoá tự nhả khi transaction kết thúc.
 */
async function acquireChatbotSlotLock(client, userId) {
  await client.query(
    `SELECT pg_advisory_xact_lock(hashtext($1::text), hashtext($2))`,
    [`user:${userId}`, 'chatbots']
  );
}

/**
 * Ném CHATBOT_LIMIT_EXCEEDED nếu chủ `userId` không còn suất chatbot. Im lặng khi còn suất hoặc không giới hạn.
 *
 * - `client`: truyền client của transaction đang chạy (đã BEGIN) khi clone/mua — hàm lấy khoá tư vấn rồi đếm + đọc trần
 *   qua CHÍNH client đó. Không truyền thì đọc trực tiếp qua pool, không khoá (cổng tạo — vốn không nằm trong transaction).
 * - `roleCode`: vai của người thực hiện; super admin (`isAdminRole`) bỏ qua trần như mọi tài nguyên khác, kể cả khi
 *   chưa có gói.
 *
 * @param {number|string} userId chủ sẽ sở hữu chatbot mới (workspace owner / người nhận / người mua)
 * @param {{ client?: import('pg').PoolClient, roleCode?: string|null }} [options]
 * @returns {Promise<void>}
 */
export async function assertChatbotSlotAvailable(userId, { client, roleCode } = {}) {
  if (isAdminRole(roleCode)) return;

  if (client) await acquireChatbotSlotLock(client, userId);

  const limit = await resolveEffectiveCeiling(userId, 'chatbots', client);
  if (!Number.isFinite(limit)) return; // Infinity = không giới hạn

  const used = await chatbotRepository.countActiveChatbotsByUser(userId, client);
  if (used >= limit) {
    throw createChatbotLimitExceededError({ used, limit });
  }
}
