/**
 * Trần độ dài chữ khách gõ vào "AI sinh / sửa landing" (B-2, rà soát AI 03/10).
 *
 * `prompt` (sinh) và `instruction` (sửa) được dán NGUYÊN VĂN vào prompt Gemini; giới hạn duy nhất trước đây là thân
 * request 5 MB (`app.js`) → một lượt trả 1 credit có thể đưa ~1 triệu token vào model. `title` và `userSummary` đi vào
 * lịch sử phiên chat (rồi vào prompt của các lượt chat sau). Chặn Ở CONTROLLER, TRƯỚC khi gọi Gemini / đọc tệp / trừ
 * credit — lượt bị chặn không tốn gì.
 *
 * Số liệu: 400 tiếng Việt ≈ 8.000 ký tự cho mô tả trang (một bản brief dài), nửa đó cho yêu cầu sửa. `userSummary` là
 * chuỗi do FRONTEND ghép từ thẻ "Thiết kế landing" (mỗi câu trả lời + mô tả sản phẩm khác tối đa 2.000 ký tự + tên
 * 160 + ô trường tuỳ chỉnh tối đa 500 do landingBrief.service chốt) → tối đa ~3.400 ký tự; trần 2.000 theo gợi ý ban
 * đầu sẽ chặn nhầm khách điền đủ mô tả sản phẩm, nên đặt 4.000.
 */
import { normalizeAssistantLocale } from './assistantLocale.util.js';

export const LANDING_AI_PROMPT_MAX_CHARS = 8000;
export const LANDING_AI_INSTRUCTION_MAX_CHARS = 4000;
export const LANDING_AI_TITLE_MAX_CHARS = 200;
export const LANDING_AI_USER_SUMMARY_MAX_CHARS = 4000;

const FIELD_RULES = Object.freeze({
  prompt: {
    max: LANDING_AI_PROMPT_MAX_CHARS,
    code: 'LANDING_PROMPT_TOO_LONG',
    labelVi: 'Mô tả trang',
    labelEn: 'The page description',
    hintVi: ' Nội dung dài hãy lưu thành tệp rồi đính kèm.',
    hintEn: ' Attach long content as a file instead.',
  },
  instruction: {
    max: LANDING_AI_INSTRUCTION_MAX_CHARS,
    code: 'LANDING_INSTRUCTION_TOO_LONG',
    labelVi: 'Yêu cầu chỉnh sửa',
    labelEn: 'The edit request',
    hintVi: ' Hãy chia nhỏ thành nhiều lượt sửa.',
    hintEn: ' Split it into several smaller edits.',
  },
  title: {
    max: LANDING_AI_TITLE_MAX_CHARS,
    code: 'LANDING_TITLE_TOO_LONG',
    labelVi: 'Tiêu đề trang',
    labelEn: 'The page title',
    hintVi: '',
    hintEn: '',
  },
  userSummary: {
    max: LANDING_AI_USER_SUMMARY_MAX_CHARS,
    code: 'LANDING_SUMMARY_TOO_LONG',
    labelVi: 'Phần tóm tắt lựa chọn',
    labelEn: 'The selection summary',
    hintVi: ' Hãy rút gọn mô tả sản phẩm.',
    hintEn: ' Please shorten the product description.',
  },
});

// Thứ tự báo lỗi khi nhiều trường cùng quá dài: trường khách gõ chính trước.
const CHECK_ORDER = ['prompt', 'instruction', 'title', 'userSummary'];

const formatNumber = (n, locale) => Number(n).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN');

/**
 * @param {{ prompt?: unknown, instruction?: unknown, title?: unknown, userSummary?: unknown }} fields
 *   chỉ kiểm các khoá CÓ MẶT (khác undefined/null) — endpoint không dùng trường nào thì đừng truyền.
 * @param {string} [locale] 'vi' | 'en' — ngôn ngữ câu báo
 * @returns {null | { field: string, code: string, limit: number, length: number, message: string }}
 */
export function findLandingAiInputTooLong(fields = {}, locale = 'vi') {
  const lang = normalizeAssistantLocale(locale, 'vi');
  for (const field of CHECK_ORDER) {
    const raw = fields?.[field];
    if (raw == null) continue;
    const rule = FIELD_RULES[field];
    const length = String(raw).trim().length;
    if (length <= rule.max) continue;
    const message = lang === 'en'
      ? `${rule.labelEn} is too long (${formatNumber(length, lang)} characters, maximum ${formatNumber(rule.max, lang)}). Please shorten it and try again - no AI credit was used.${rule.hintEn}`
      : `${rule.labelVi} quá dài (${formatNumber(length, lang)} ký tự, tối đa ${formatNumber(rule.max, lang)}). Bạn hãy rút gọn rồi thử lại - lượt này chưa tốn credit AI.${rule.hintVi}`;
    return { field, code: rule.code, limit: rule.max, length, message };
  }
  return null;
}
