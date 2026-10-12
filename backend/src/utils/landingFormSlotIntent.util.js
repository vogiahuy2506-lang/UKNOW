/**
 * Ý định của người dùng → LOẠI chỗ trống biểu mẫu AI nên đặt (PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11, PR-7a).
 *
 * Khi `AI_LANDING_FORM_MODE=form`, AI landing không viết `<form>` mà đặt 1–3 chỗ trống CÓ LOẠI:
 * `<div data-founderai-form-slot="booking"></div>`; backend tạo biểu mẫu đúng loại lúc lưu. Chọn loại nào do MODEL quyết theo chữ của
 * người dùng, nên cần một bảng luật DUY NHẤT để (a) dựng đoạn prompt dạy model, (b) làm "đáp án mong đợi" của bộ câu thử bằng model giả
 * (`inferExpectedFormSlotKinds`, thuần, không gọi Gemini) — hai bên đọc cùng một bảng nên prompt và đáp án không thể lệch nhau.
 *
 * Bảng chỉ là LỜI KHUYÊN cho model + đáp án cho test; không phải chốt chặn. Chốt chặn thật: loại ngoài FORM_SLOT_KINDS bị từ chối
 * (landingHtmlInjection.util.js) và nháp biểu mẫu đi qua bộ chuẩn hoá thật lúc lưu (landingFormDrafts.util.js).
 */
import { MAX_AI_FORM_SLOTS_PER_TURN } from './landingHtmlInjection.util.js';

/**
 * Cụm từ (đã chữ thường, NFC) báo hiệu từng loại. `consult` là loại MẶC ĐỊNH nên `phrases` của nó chỉ là dấu hiệu TƯỜNG MINH (người
 * dùng nói rõ muốn form tư vấn/liên hệ) để phân biệt "landing spa có form tư vấn và đặt lịch" (tư vấn + đặt lịch) với "landing đặt lịch
 * khám" (chỉ đặt lịch).
 */
export const FORM_SLOT_INTENT_RULES = Object.freeze({
  booking: Object.freeze({
    phrases: Object.freeze([
      'đặt lịch tư vấn', 'đặt lịch khám', 'đặt lịch hẹn', 'đặt lịch', 'đặt hẹn', 'hẹn lịch', 'lịch hẹn', 'lịch khám', 'lịch tư vấn',
      'hẹn khám', 'đặt khám', 'book an appointment', 'appointment', 'booking',
    ]),
  }),
  payment: Object.freeze({
    phrases: Object.freeze([
      'thu tiền', 'thu phí', 'đặt cọc', 'thu cọc', 'cọc', 'giữ chỗ', 'thanh toán', 'đặt mua', 'đặt hàng', 'mua',
      'bán khoá học', 'bán khóa học', 'bán sản phẩm', 'deposit', 'payment', 'checkout', 'purchase', 'buy',
    ]),
  }),
  survey: Object.freeze({
    phrases: Object.freeze(['khảo sát', 'lấy ý kiến', 'góp ý', 'đánh giá', 'survey', 'feedback', 'questionnaire']),
  }),
  consult: Object.freeze({
    phrases: Object.freeze(['tư vấn', 'liên hệ', 'để lại thông tin', 'nhận thông tin', 'contact us', 'consultation']),
  }),
});

/** Thứ tự kết quả: tư vấn trước, rồi đặt lịch, thu tiền, khảo sát. */
const CANONICAL_ORDER = Object.freeze(['consult', 'booking', 'payment', 'survey']);

const LETTER_CLASS = '\\p{L}\\p{M}\\p{N}';

const escapeRegExp = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Regex khớp MỘT trong các cụm, không dính giữa chữ ("mua" không khớp trong "mùa"/"mưa"); cụm dài thử trước. */
function buildPhraseRegex(phrases) {
  const alternatives = [...phrases]
    .sort((a, b) => b.length - a.length)
    .map((p) => escapeRegExp(p.normalize('NFC')))
    .join('|');
  return new RegExp(`(?<![${LETTER_CLASS}])(?:${alternatives})(?![${LETTER_CLASS}])`, 'giu');
}

const RULE_REGEX = Object.freeze(
  Object.fromEntries(Object.keys(FORM_SLOT_INTENT_RULES).map((kind) => [kind, buildPhraseRegex(FORM_SLOT_INTENT_RULES[kind].phrases)]))
);

/**
 * Loại chỗ trống MONG ĐỢI cho một câu yêu cầu landing — hàm THUẦN, làm "kịch bản" kiểm prompt bằng model giả (không gọi Gemini):
 * test cho model giả trả HTML có đúng các loại này rồi đối chiếu đường sinh / nháp / lưu.
 *
 * Quy tắc (khớp đoạn prompt `buildFormSlotKindGuide`): đặt lịch / hẹn / khám / lịch tư vấn → booking; thu tiền / cọc / giữ chỗ / thanh
 * toán / mua → payment; khảo sát / góp ý / đánh giá → survey; còn lại → consult. Cụm của booking được GỠ khỏi câu trước khi xét dấu hiệu
 * consult (để "lịch tư vấn" không bị tính thêm là biểu mẫu tư vấn). Không khớp gì → ['consult'].
 *
 * @param {string} text
 * @returns {Array<'consult'|'booking'|'payment'|'survey'>} không trùng, theo thứ tự consult → booking → payment → survey, tối đa
 *   MAX_AI_FORM_SLOTS_PER_TURN phần tử
 */
export function inferExpectedFormSlotKinds(text) {
  let rest = String(text ?? '').normalize('NFC').toLowerCase();
  const found = new Set();
  for (const kind of ['booking', 'payment', 'survey']) {
    rest = rest.replace(RULE_REGEX[kind], () => {
      found.add(kind);
      return ' ';
    });
  }
  rest.replace(RULE_REGEX.consult, () => {
    found.add('consult');
    return ' ';
  });
  if (found.size === 0) found.add('consult');
  return CANONICAL_ORDER.filter((kind) => found.has(kind)).slice(0, MAX_AI_FORM_SLOTS_PER_TURN);
}

const quoted = (kind) => FORM_SLOT_INTENT_RULES[kind].phrases.map((p) => `"${p}"`).join(', ');

/**
 * Đoạn prompt (nhiều dòng) dạy model chọn LOẠI chỗ trống — dùng chung cho prompt SINH và prompt SỬA, dựng từ cùng bảng với
 * `inferExpectedFormSlotKinds`. Không chứa dấu backtick (prompt nằm trong template literal) và không nhắc `data-founderai-capture`.
 *
 * @returns {string}
 */
export function buildFormSlotKindGuide() {
  return [
    `   - booking (khách tự chọn ngày giờ hẹn): khi yêu cầu nói tới đặt lịch / đặt hẹn / đặt lịch khám / lịch tư vấn, ví dụ ${quoted('booking')}.`,
    `   - payment (thu tiền / đặt cọc / giữ chỗ): khi yêu cầu nói tới thu tiền / đặt cọc / giữ chỗ / thanh toán / mua, ví dụ ${quoted('payment')}.`,
    `   - survey (khảo sát): khi yêu cầu nói tới khảo sát / góp ý / đánh giá / lấy ý kiến, ví dụ ${quoted('survey')}.`,
    '   - consult (đăng ký / để lại thông tin để được tư vấn): mọi trường hợp còn lại (liên hệ, đăng ký tham dự, ứng tuyển, nhận thông tin...). Với consult CHỈ viết thẻ TRẦN <div data-founderai-form-slot></div> (không có giá trị thuộc tính).',
  ].join('\n');
}
