/**
 * PR-7a — chốt sửa landing bằng AI khi `AI_LANDING_FORM_MODE=form`: AI được THÊM chỗ trống biểu mẫu có loại
 * ("thêm form đặt lịch") nhưng không được BỚT hay ĐỔI LOẠI chỗ trống cũ. Cờ tắt (`allowAddFormSlots` mặc định false) = so ĐA TẬP như PR-6.
 */
import { describe, it, expect } from '@jest/globals';
import { validateEditHtmlOutput } from '../landingEditGuard.util.js';
import { MAX_AI_FORM_SLOTS_PER_TURN, MAX_FORMS_PER_LANDING } from '../landingHtmlInjection.util.js';

const slot = (kind) => (kind === 'bare' ? '<div data-founderai-form-slot></div>' : `<div data-founderai-form-slot="${kind}"></div>`);
const PAD = '<p>Nội dung trang dài đủ để các chốt về độ dài không kêu: '.concat('x'.repeat(300), '</p>');
const page = (kinds, extra = '') =>
  `<!DOCTYPE html><html><head><script src="https://cdn.tailwindcss.com"></script></head><body>${PAD}${kinds.map((k) => `<section>${slot(k)}</section>`).join('')}${extra}</body></html>`;

const ok = (oldKinds, newKinds, options = {}) =>
  validateEditHtmlOutput({ currentHtml: page(oldKinds), newHtml: page(newKinds, options.extra), strategy: 'patch', allowAddFormSlots: true });
const bad = (oldKinds, newKinds, options = {}) => {
  let thrown = null;
  try {
    ok(oldKinds, newKinds, options);
  } catch (error) {
    thrown = error;
  }
  expect(thrown).not.toBeNull();
  expect(thrown.status).toBe(422);
  expect(thrown.message).toMatch(/chỗ trống chờ Biểu mẫu/);
};

describe('allowAddFormSlots = true (cờ AI_LANDING_FORM_MODE=form)', () => {
  it('giữ nguyên chỗ trống → qua', () => {
    expect(ok(['booking', 'payment'], ['booking', 'payment'])).toBe(true);
    expect(ok([], [])).toBe(true);
  });

  it('THÊM chỗ trống có loại → qua (trang chưa có chỗ nào, hoặc đã có)', () => {
    expect(ok([], ['booking'])).toBe(true);
    expect(ok(['booking'], ['booking', 'payment'])).toBe(true);
    expect(ok(['bare'], ['survey', 'bare'])).toBe(true);
  });

  it('thêm đúng trần mỗi lượt qua; vượt trần mỗi lượt → 422', () => {
    expect(MAX_AI_FORM_SLOTS_PER_TURN).toBe(3);
    expect(ok(['booking'], ['booking', 'payment', 'survey', 'blank'])).toBe(true);
    bad(['booking'], ['booking', 'payment', 'survey', 'blank', 'payment']);
  });

  it('BỚT chỗ trống cũ → 422', () => {
    bad(['booking'], []);
    bad(['booking', 'payment'], ['booking']);
  });

  it('ĐỔI LOẠI chỗ trống cũ → 422 dù số lượng không giảm', () => {
    bad(['booking'], ['bare']);
    bad(['booking', 'payment'], ['bare', 'bare']);
    bad(['booking'], ['survey', 'payment']);
    bad(['booking', 'booking'], ['booking', 'payment']);
  });

  it('chỗ trống thêm có loại LẠ hoặc sai dạng (nội dung con) → 422', () => {
    bad([], ['contact']);
    bad(['booking'], ['booking', 'contact']);
    expect(() => validateEditHtmlOutput({
      currentHtml: page([]),
      newHtml: `${page([])}<div data-founderai-form-slot="payment"><p>x</p></div>`,
      strategy: 'patch',
      allowAddFormSlots: true,
    })).toThrow(/chỗ trống chờ Biểu mẫu/);
  });

  it('thêm chỗ trống KÈM <form> tự viết → 422 (trang chưa có chỗ nào cũng vậy); chưa thêm gì mà thêm <form> khi đã có chỗ trống → 422', () => {
    bad([], ['booking'], { extra: '<form action="#"><input name="x"></form>' });
    bad(['booking'], ['booking', 'payment'], { extra: '<form></form>' });
    bad(['booking'], ['booking'], { extra: '<form></form>' });
  });

  it('tổng chỗ trống + khối nhúng vượt trần kỹ thuật cả trang → 422', () => {
    const many = Array.from({ length: MAX_FORMS_PER_LANDING - 1 }, () => 'blank');
    expect(ok(many, [...many, 'blank'])).toBe(true); // đúng 20
    bad(many, [...many, 'blank', 'blank']); // 21
  });
});

describe('allowAddFormSlots mặc định false — hành vi PR-6 giữ nguyên', () => {
  const run = (oldKinds, newKinds) => validateEditHtmlOutput({ currentHtml: page(oldKinds), newHtml: page(newKinds), strategy: 'patch' });

  it('trang đã có chỗ trống mà số lượng / loại đổi → 422 (kể cả chỉ thêm)', () => {
    expect(() => run(['booking'], ['booking', 'payment'])).toThrow(/chỗ trống chờ Biểu mẫu/);
    expect(() => run(['booking', 'payment'], ['bare', 'bare'])).toThrow(/chỗ trống chờ Biểu mẫu/);
    expect(() => run(['booking'], [])).toThrow(/chỗ trống chờ Biểu mẫu/);
  });

  it('giữ nguyên → qua; trang chưa có chỗ trống nào thì không bị chốt này canh (như trước)', () => {
    expect(run(['booking', 'payment'], ['payment', 'booking'])).toBe(true);
    expect(run([], ['booking'])).toBe(true);
  });
});
