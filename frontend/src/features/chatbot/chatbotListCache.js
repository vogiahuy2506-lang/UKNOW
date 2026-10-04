/**
 * Bộ nhớ đệm danh sách chatbot của màn Studio (S-14, 04/10/2026).
 *
 * Bản cũ ghi MỘT khoá chung `uknow_chatbots` cho cả trình duyệt, lưu nguyên các dòng bot (gồm cả
 * `system_instruction` — hướng dẫn nội bộ của chủ shop), không bao giờ xoá khi đăng xuất. Máy dùng chung:
 * người sau thấy bot của người trước khi API danh sách lỗi.
 *
 * Nay:
 *  - khoá gắn id user + id chủ không gian (nhân viên đổi công ty thì sang khoá khác),
 *  - KHÔNG lưu `system_instruction` (và các trường nặng không cần để vẽ cột trái),
 *  - xoá toàn bộ khi đăng xuất (authStore.logout → clearChatbotListCache), kể cả khoá cũ không hậu tố.
 *
 * Chỉ dùng làm dự phòng hiển thị khi API danh sách lỗi; mọi thao tác storage bọc try/catch (chế độ riêng tư,
 * storage bị chặn).
 */

export const CHATBOT_LIST_CACHE_PREFIX = 'uknow_chatbots';

/** Trường KHÔNG được ghi xuống storage. */
const OMITTED_FIELDS = ['system_instruction', '_offlineCache'];

function getStorage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

/**
 * @param {{ userId?: string|number|null, ownerId?: string|number|null }} scope
 * @returns {string|null} null khi chưa biết user (không đệm gì)
 */
export function chatbotListCacheKey({ userId, ownerId } = {}) {
  if (userId == null || userId === '') return null;
  const owner = ownerId == null || ownerId === '' ? userId : ownerId;
  return `${CHATBOT_LIST_CACHE_PREFIX}:u${userId}:o${owner}`;
}

/** Bỏ các trường nhạy cảm trước khi ghi. */
export function sanitizeChatbotsForCache(bots) {
  return (Array.isArray(bots) ? bots : []).map((bot) => {
    const copy = { ...bot };
    OMITTED_FIELDS.forEach((field) => delete copy[field]);
    return copy;
  });
}

export function saveCachedChatbots(key, bots) {
  const storage = getStorage();
  if (!storage || !key) return;
  try {
    storage.setItem(key, JSON.stringify(sanitizeChatbotsForCache(bots)));
  } catch {
    // storage đầy / bị chặn: bỏ qua, đệm chỉ là dự phòng
  }
}

/**
 * Đọc bản đệm. Mỗi dòng gắn `_offlineCache: true` để màn hình biết dòng này THIẾU trường (không có
 * system_instruction) và không cho lưu đè lên bot thật.
 */
export function loadCachedChatbots(key) {
  const storage = getStorage();
  if (!storage || !key) return [];
  try {
    const parsed = JSON.parse(storage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed.map((bot) => ({ ...bot, _offlineCache: true })) : [];
  } catch {
    return [];
  }
}

/** Đăng xuất: xoá mọi khoá đệm danh sách chatbot (mọi user/không gian, cả khoá cũ không hậu tố). */
export function clearChatbotListCache() {
  const storage = getStorage();
  if (!storage) return;
  try {
    const keys = [];
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key && key.startsWith(CHATBOT_LIST_CACHE_PREFIX)) keys.push(key);
    }
    keys.forEach((key) => storage.removeItem(key));
  } catch {
    // ignore
  }
}
