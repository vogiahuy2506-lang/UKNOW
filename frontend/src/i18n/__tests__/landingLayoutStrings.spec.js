import { describe, it, expect } from 'vitest';
import vi from '../vi.js';
import en from '../en.js';

/**
 * PLAN_LANDING_TU_KIEM_HIEN_THI_TU_SUA, PR-3 mục 12.3.7 — chuỗi của vòng tự kiểm hiển thị landing.
 * Nguyên tắc 1 của plan: người dùng KHÔNG BAO GIỜ thấy class / pixel / CSS / selector; số đo là kênh
 * máy ↔ AI. Test này khoá điều đó ở chính từ điển (cả lệnh "Trình bày lại" — nó hiện lại trong tin
 * xác nhận), và khoá cả hai ngôn ngữ có đủ khoá, cùng tham số.
 */
const KEYS = {
  landingPageCard: {
    layoutChecking: [],
    layoutOk: [],
    layoutStillCovered: ['count', 'section'],
    layoutStillCoveredPlain: ['count'],
    layoutStillClipped: ['count'],
    layoutStillOffscreen: ['count'],
    relayoutSection: [],
    relayoutInstruction: ['section'],
    relayoutInstructionPlain: [],
    undo: [],
    undone: [],
  },
  aiChatbot: {
    layoutAutoFixed: ['summary'],
    layoutAutoFixedPlain: [],
    editedSummary: ['summary'],
  },
};

const placeholdersOf = (text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
const TECHNICAL = /\b(?:px|pixel|class|css|tailwind|html|selector|absolute|nth-of-type|div|span)\b|toạ độ|tọa độ|\d\s*px|-\d/i;

describe.each([['vi', vi], ['en', en]])('chuỗi vòng tự kiểm hiển thị (%s)', (_locale, dict) => {
  for (const [namespace, keys] of Object.entries(KEYS)) {
    for (const [key, params] of Object.entries(keys)) {
      it(`${namespace}.${key}: có, đúng tham số ${JSON.stringify(params)}, không chữ kỹ thuật`, () => {
        const value = dict[namespace][key];
        expect(typeof value).toBe('string');
        expect(value.trim()).not.toBe('');
        expect(placeholdersOf(value)).toEqual([...params].sort());
        expect(value).not.toMatch(TECHNICAL);
      });
    }
  }

  it('describeFindingsForUser dùng đúng các khoá đã khai báo ở landingPageCard', () => {
    // 4 khoá mà describeFindingsForUser(findings, t) gọi (PR-1 mục 8b) — thiếu khoá nào là người dùng thấy chuỗi khoá trần
    for (const key of ['layoutStillCovered', 'layoutStillCoveredPlain', 'layoutStillClipped', 'layoutStillOffscreen']) {
      expect(dict.landingPageCard[key]).toBeTruthy();
    }
  });
});

describe('vi và en có cùng bộ khoá mới', () => {
  it('mỗi khoá mới có ở cả hai ngôn ngữ', () => {
    for (const [namespace, keys] of Object.entries(KEYS)) {
      for (const key of Object.keys(keys)) {
        expect(Boolean(vi[namespace][key])).toBe(Boolean(en[namespace][key]));
      }
    }
  });
});
