/**
 * Hợp đồng giữa chữ hiển thị câu trả lời ở FRONTEND (`formatAnswerForDisplay` — màn bài nộp / modal chi tiết khách) và bản BACKEND
 * dùng khi xuất CSV (`formatAnswerForCsv`) — PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11, PR-8c.
 *
 * Cùng một bảng ca đi qua cả hai bản. Khác biệt DUY NHẤT được phép: rating hiện "4/5 ★" ở màn hình nhưng "4/5" trong file (CSV là chữ thuần).
 * Chữ Có / Không lấy từ chính `forms.answerValue.*` trong vi.js / en.js — đổi chữ ở giao diện mà quên bản backend là đỏ ở đây.
 */
import { describe, it, expect } from '@jest/globals';
import { formatAnswerForDisplay } from '../../../../frontend/src/features/forms/utils/formAnswerDisplay.util.js';
import viDictionary from '../../../../frontend/src/i18n/vi.js';
import enDictionary from '../../../../frontend/src/i18n/en.js';
import { formatAnswerForCsv } from '../formAnswerCsv.util.js';

const lookup = (dict, key) => key.split('.').reduce((node, part) => (node == null ? node : node[part]), dict);
const tFor = (dict) => (key) => {
  const value = lookup(dict, key);
  if (typeof value !== 'string') throw new Error(`Thiếu khoá dịch ${key}`);
  return value;
};

const CASES = [
  ['short_text', 'Xin chào'],
  ['long_text', 'Dòng 1\nDòng 2'],
  ['email', 'a@b.vn'],
  ['phone', '0901234567'],
  ['number', 12.5],
  ['number', 0],
  ['select', 'Gói A'],
  ['radio', 'Có thể'],
  ['checkbox', ['A', 'B']],
  ['checkbox', []],
  ['date', '2026-10-12'],
  ['time', '09:30'],
  ['rating', 1],
  ['rating', 4],
  ['rating', '5'],
  ['rating', 9],
  ['yes_no', 'yes'],
  ['yes_no', 'no'],
  ['yes_no', 'khac'],
  ['file', ['cv.pdf', 'anh.png']],
  ['short_text', null],
  ['short_text', undefined],
  ['short_text', { a: 1 }],
];

describe('formatAnswerForCsv ↔ formatAnswerForDisplay (frontend)', () => {
  it.each([['vi', viDictionary], ['en', enDictionary]])('%s: cùng kết quả trên toàn bộ bảng ca (trừ sao của rating)', (lang, dict) => {
    const t = tFor(dict);
    for (const [type, value] of CASES) {
      const display = formatAnswerForDisplay(type, value, t).replace(/ ★$/, '');
      expect({ type, value, csv: formatAnswerForCsv(type, value, lang) }).toEqual({ type, value, csv: display });
    }
  });

  it('chữ Có / Không / Yes / No của yes_no khớp khoá dịch của giao diện', () => {
    expect(formatAnswerForCsv('yes_no', 'yes', 'vi')).toBe(viDictionary.forms.answerValue.yes);
    expect(formatAnswerForCsv('yes_no', 'no', 'vi')).toBe(viDictionary.forms.answerValue.no);
    expect(formatAnswerForCsv('yes_no', 'yes', 'en')).toBe(enDictionary.forms.answerValue.yes);
    expect(formatAnswerForCsv('yes_no', 'no', 'en')).toBe(enDictionary.forms.answerValue.no);
  });

  it('rating là phần duy nhất khác: màn hình có sao, file thì không', () => {
    expect(formatAnswerForDisplay('rating', 4, tFor(viDictionary))).toBe('4/5 ★');
    expect(formatAnswerForCsv('rating', 4)).toBe('4/5');
  });
});
