/**
 * aiOffTopicReply.util.js
 *
 * Phát hiện khi AI reply là "template off-topic" — tức câu trả lời KHÔNG
 * liên quan đến customer message, thường là do:
 *   1. System_instruction trong DB ép AI dùng template cứng cho intent cụ thể
 *      (vd "khi nhận bill → trả lời 'Đang chờ ghi chú thanh toán...'")
 *   2. Knowledge Base (RAG) trả về câu trả lời không match câu hỏi
 *   3. AI hallucinate / bị lặp pattern
 *
 * Triệu chứng production (WhatsApp Baileys 14/09/2026):
 *   Khách: "hello em là ai", "rảnh ko", "em làm dc gì", "hiii", "em tôi đẹp trai kk"
 *   Bot: "Đang chờ ghi chú thanh toán này. Bạn có thể phải chờ một lúc.
 *         Tìm hiểu thêm."
 *   → Bot trả lời về "chờ thanh toán" trong khi khách chỉ chào hỏi.
 *
 * Cách phát hiện:
 *   - Reply chứa các trigger phrase "off-topic template" (ghi chú thanh toán,
 *     bill, đơn hàng, Tìm hiểu thêm, ...) NHƯNG customer text KHÔNG chứa
 *     keyword liên quan → off-topic.
 *   - Keyword overlap giữa reply và customer text quá thấp (< 1 keyword chung)
 *     VÀ reply ngắn (< 200 chars) — template ngắn không match câu dài.
 *
 * Khi phát hiện off-topic:
 *   - Log warning để admin điều chỉnh KB / system_instruction
 *   - Trả về câu fallback tự nhiên cho khách (giới thiệu + hỏi cần hỗ trợ gì)
 *
 * Không thay đổi gì khi reply match customer text bình thường.
 */

// Các trigger phrase xuất hiện trong template "off-topic" mà AI hay nhắc lại.
// Lower-case để so sánh không phân biệt hoa/thường. Từ khoá được chọn
// đủ đặc trưng để KHÔNG false-positive trên các context hợp lệ
// (vd khách hỏi về bill/đơn hàng).
const OFFTOPIC_TRIGGER_PHRASES = [
  'ghi chú thanh toán',
  'ghi nhận thanh toán',
  'đang chờ ghi chú',
  'đang chờ thanh toán',
  'chờ một lúc',
  'tìm hiểu thêm', // câu kết thúc template phổ biến
];

// Keyword mà customer CẦN chứa ÍT NHẤT 1 để AI được phép trả lời về
// thanh toán/bill. Nếu customer không chứa keyword nào trong nhóm này
// mà AI lại nhắc "ghi chú thanh toán" → off-topic.
const PAYMENT_KEYWORDS = [
  'thanh toán', 'ghi chú', 'bill', 'hóa đơn', 'chuyển khoản',
  'ck ', 'ck.', 'gửi tiền', 'đơn hàng', 'order', 'payment',
];

// Câu chào / câu hỏi xã giao — khi customer gửi những câu này và AI
// trả lời template không liên quan → off-topic 100%.
const SOCIAL_GREETING_RE = /^(hi|hi+|hello|hey|ê|shop ơi|cho (mình|anh|em|tôi) hỏi|rảnh|rảnh không|ránh|hiii+)[\s?!.]*$/i;
const SIMPLE_SOCIAL_RE = /^(hỏi|gọi|nhắn|hỏi chút|hỏi xíu|nhanh)[\s?!.]*$/i;

/**
 * Tách keyword đơn giản từ text: lowercase, bỏ dấu tiếng Việt, split word.
 * @param {string} text
 * @returns {string[]}
 */
function tokenize(text) {
  if (!text || typeof text !== 'string') return [];
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining diacritics
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2);
}

/**
 * Đếm keyword chung giữa 2 tập token (Jaccard-lite overlap).
 * @param {string[]} a
 * @param {string[]} b
 * @returns {number}
 */
function overlapCount(a, b) {
  if (!a.length || !b.length) return 0;
  const setB = new Set(b);
  let count = 0;
  for (const t of a) if (setB.has(t)) count += 1;
  return count;
}

/**
 * @param {string} text
 * @returns {boolean}
 */
function containsAny(text, needles) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return needles.some((n) => lower.includes(n));
}

/**
 * Phát hiện AI reply có phải off-topic template so với customer message.
 *
 * @param {Object} params
 * @param {string} params.customerMessage - tin nhắn gốc từ khách
 * @param {string} params.aiReply - câu trả lời AI vừa generate
 * @returns {{isOffTopic: boolean, reason: string|null}}
 */
export function detectOffTopicReply({ customerMessage, aiReply }) {
  if (!customerMessage || !aiReply) {
    return { isOffTopic: false, reason: null };
  }

  const customerLower = customerMessage.toLowerCase();
  const replyLower = aiReply.toLowerCase();

  // Check 1: reply chứa trigger phrase "off-topic" VÀ customer không hỏi
  // về payment/bill/order → off-topic chắc chắn.
  const hasOfftopicTrigger = OFFTOPIC_TRIGGER_PHRASES.some((p) =>
    replyLower.includes(p)
  );
  if (hasOfftopicTrigger) {
    const customerMentionsPayment = containsAny(customerMessage, PAYMENT_KEYWORDS);
    if (!customerMentionsPayment) {
      return {
        isOffTopic: true,
        reason: `AI reply chứa trigger phrase "off-topic" mà customer không hỏi về payment/bill. ` +
                `Customer: "${customerMessage.slice(0, 60)}..." → AI: "${aiReply.slice(0, 80)}..."`,
      };
    }
  }

  // Check 2: customer gửi câu xã giao / câu hỏi ngắn VÀ AI reply ngắn
  // mà overlap token thấp → off-topic.
  const isSocialGreeting =
    SOCIAL_GREETING_RE.test(customerMessage.trim()) ||
    SIMPLE_SOCIAL_RE.test(customerMessage.trim()) ||
    customerMessage.trim().length <= 12;
  if (isSocialGreeting && aiReply.length < 250) {
    const customerTokens = tokenize(customerMessage);
    const replyTokens = tokenize(aiReply);
    // Bỏ qua check overlap nếu customer không có token nào (vd "hi",
    // "ê" — too short để overlap reliably). Khi đó chỉ Check 1 mới
    // quyết định off-topic. Nếu Check 1 đã pass (không có trigger phrase)
    // thì reply không off-topic theo Check 2.
    if (customerTokens.length === 0) {
      return { isOffTopic: false, reason: null };
    }
    const overlap = overlapCount(customerTokens, replyTokens);
    if (overlap === 0) {
      return {
        isOffTopic: true,
        reason: `Customer gửi câu xã giao ngắn, AI reply không có keyword chung nào. ` +
                `Customer tokens=${customerTokens.join(',')} | Reply tokens=${replyTokens.slice(0, 6).join(',')}...`,
      };
    }
  }

  return { isOffTopic: false, reason: null };
}

/**
 * Trả về câu fallback tự nhiên khi AI reply bị off-topic. Dùng tên assistant
 * từ settings nếu có, fallback "trợ lý ảo".
 *
 * Fallback ưu tiên phản hồi tự nhiên, KHÔNG gắn cứng format
 * "Bạn vừa nhắn X — ..." vì:
 *   - Tin nhắn có thể rất dài (spam/link) → hiển thị xấu
 *   - Câu hỏi ngắn "hi" thì KHÔNG cần nhắc lại
 *   - AI nên self-identify một cách tự nhiên, không theo khuôn mẫu
 *
 * @param {Object} [opts]
 * @param {string} [opts.assistantName]
 * @param {string} [opts.customerMessage]
 * @returns {string}
 */
export function buildOffTopicFallback({ assistantName, customerMessage } = {}) {
  const name = assistantName || 'trợ lý ảo';

  // Phát hiện greeting ngắn để chọn lời chào phù hợp
  const trimmed = (customerMessage || '').trim().toLowerCase();
  const isGreeting =
    /^(hi|hello|hey|helo|hiii+|yo|ê|chào|chao|alo|ơi|kìa|zô|vo|hay|sale|sales|mình|mjh)/i.test(trimmed) &&
    trimmed.length <= 40;

  if (isGreeting) {
    // Greeting: chào lịch sự, giới thiệu ngắn gọn, mời hỏi tiếp
    return `Chào bạn! Mình là ${name}. Rất vui được hỗ trợ bạn. Bạn cần mình giúp gì nè?`;
  }

  // Câu hỏi chung: trả lời ngắn gọn, xưng tên tự nhiên
  // KHÔNG nhắc lại câu hỏi gốc — để cuộc trò chuyện tự nhiên
  return `Xin chào! Mình là ${name}. Mình có thể giúp bạn về sản phẩm, dịch vụ hoặc bất kỳ câu hỏi nào khác. Bạn cứ hỏi thoải mái nhé!`;
}

export default {
  detectOffTopicReply,
  buildOffTopicFallback,
};
