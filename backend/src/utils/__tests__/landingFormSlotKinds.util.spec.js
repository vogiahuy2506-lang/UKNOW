/**
 * PR-6 (PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11, QĐ3) — chỗ trống biểu mẫu CÓ LOẠI:
 * `<div data-founderai-form-slot="booking"></div>`; trần kỹ thuật MAX_FORMS_PER_LANDING; chốt sửa trang bằng AI so ĐA TẬP loại.
 */
import { describe, it, expect } from '@jest/globals';
import {
  FORM_SLOT_KINDS,
  DEFAULT_FORM_SLOT_KIND,
  MAX_FORMS_PER_LANDING,
  countFormSlots,
  hasMalformedFormSlot,
  listFormSlots,
  listFormSlotKinds,
  findInvalidFormSlotKinds,
  replaceFormSlotsWithEmbeds,
  buildFormEmbedSectionHtml,
} from '../landingHtmlInjection.util.js';
import {
  validateEditHtmlOutput,
  LANDING_FORM_PLACEHOLDER,
  listFormEmbedKeys,
  extractFormEmbedKeys,
} from '../landingEditGuard.util.js';

const slot = (kind) => (kind === undefined ? '<div data-founderai-form-slot></div>' : `<div data-founderai-form-slot="${kind}"></div>`);

describe('chỗ trống có loại — liệt kê loại theo thứ tự xuất hiện', () => {
  it('hằng số: 5 loại, mặc định consult, trần kỹ thuật 20', () => {
    expect(FORM_SLOT_KINDS).toEqual(['consult', 'booking', 'payment', 'survey', 'blank']);
    expect(DEFAULT_FORM_SLOT_KIND).toBe('consult');
    expect(MAX_FORMS_PER_LANDING).toBe(20);
  });

  it('chỗ trống TRẦN (không thuộc tính giá trị, hoặc ="") = consult — HTML cũ / nháp đang mở vẫn hợp lệ', () => {
    for (const html of [slot(), '<div data-founderai-form-slot=""></div>', "<div data-founderai-form-slot=''></div>", '<div class="x" data-founderai-form-slot></div>']) {
      expect(listFormSlotKinds(html)).toEqual(['consult']);
      expect(hasMalformedFormSlot(html)).toBe(false);
      expect(listFormSlots(html)[0].bare).toBe(true);
    }
  });

  it('từng loại hợp lệ; liệt kê đúng THỨ TỰ trong HTML', () => {
    const html = `<p>a</p>${slot('booking')}<p>b</p>${slot('payment')}${slot()}${slot('survey')}${slot('blank')}${slot('consult')}`;
    expect(listFormSlotKinds(html)).toEqual(['booking', 'payment', 'consult', 'survey', 'blank', 'consult']);
    expect(countFormSlots(html)).toBe(6);
    expect(hasMalformedFormSlot(html)).toBe(false);
    expect(listFormSlots(html).map((s) => s.bare)).toEqual([false, false, true, false, false, false]);
  });

  it('không phân biệt hoa/thường ở tên thuộc tính LẪN giá trị; chấp nhận nháy đơn, không nháy, khoảng trắng', () => {
    const html = [
      '<div DATA-FOUNDERAI-FORM-SLOT="Booking"></div>',
      "<div data-founderai-form-slot='payment'></div>",
      '<div data-founderai-form-slot=survey></div>',
      '<div data-founderai-form-slot=" blank "></div>',
      '<div class="my-8" data-founderai-form-slot = "booking" id="f"></div>',
    ].join('');
    expect(listFormSlotKinds(html)).toEqual(['booking', 'payment', 'survey', 'blank', 'booking']);
    expect(hasMalformedFormSlot(html)).toBe(false);
  });

  it('GIÁ TRỊ LẠ = sai dạng (không âm thầm coi là consult) và nêu đúng giá trị lạ', () => {
    const html = `${slot('booking')}${slot('contact')}${slot('Contact')}${slot('xyz')}`;
    expect(hasMalformedFormSlot(html)).toBe(true);
    expect(findInvalidFormSlotKinds(html)).toEqual(['contact', 'Contact', 'xyz']);
    expect(findInvalidFormSlotKinds(`${slot('booking')}${slot()}`)).toEqual([]);
  });

  it('nội dung con vẫn là sai dạng như trước (không đổi hành vi cũ)', () => {
    expect(hasMalformedFormSlot('<div data-founderai-form-slot="booking"><p>x</p></div>')).toBe(true);
  });

  it('selector CSS [data-founderai-form-slot="booking"] trong <style> không bị tính là chỗ trống hay sai dạng', () => {
    const html = `<style>[data-founderai-form-slot="booking"]{min-height:1px}</style>${slot('booking')}`;
    expect(listFormSlotKinds(html)).toEqual(['booking']);
    expect(hasMalformedFormSlot(html)).toBe(false);
  });

  it('thuộc tính bắt đầu bằng cùng tiền tố nhưng là thuộc tính khác (…-slot-x) không bị đọc nhầm làm loại', () => {
    expect(listFormSlotKinds('<div data-founderai-form-slot data-founderai-form-slot-note="payment"></div>')).toEqual(['consult']);
  });
});

describe('thay từng chỗ trống theo thứ tự', () => {
  it('chỗ trống thứ i → phần tử thứ i; một lượt (khối chèn có chữ data-founderai-form-slot không bị thay lần hai)', () => {
    const html = `A${slot('booking')}B${slot()}C${slot('payment')}D`;
    const out = replaceFormSlotsWithEmbeds(html, ['<1>', '<2 data-founderai-form-slot></2>', '<3>']);
    expect(out).toBe('A<1>B<2 data-founderai-form-slot></2>C<3>D');
  });

  it('phần tử thiếu / null → giữ nguyên chỗ trống đó', () => {
    const html = `${slot('booking')}|${slot('survey')}`;
    expect(replaceFormSlotsWithEmbeds(html, ['X'])).toBe(`X|${slot('survey')}`);
    expect(replaceFormSlotsWithEmbeds(html, [null, 'Y'])).toBe(`${slot('booking')}|Y`);
  });
});

describe('liệt kê khoá khối nhúng (giữ thứ tự và trùng lặp)', () => {
  const embed = (key) => buildFormEmbedSectionHtml({ publicKey: key, origin: 'https://app.example' });
  it('listFormEmbedKeys giữ thứ tự + trùng lặp; extractFormEmbedKeys vẫn là Set', () => {
    const html = `${embed('KEY_A')}<p/>${embed('KEY_B')}${embed('KEY_A')}`;
    expect(listFormEmbedKeys(html)).toEqual(['KEY_A', 'KEY_B', 'KEY_A']);
    expect([...extractFormEmbedKeys(html)]).toEqual(['KEY_A', 'KEY_B']);
  });
  it('khối nhúng thật không chứa chữ chỗ trống → countFormSlots = 0', () => {
    expect(countFormSlots(embed('KEY_A'))).toBe(0);
  });
});

const baseHtml = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8"/>
  <script src="https://cdn.tailwindcss.com"></script>
  <title>Landing Page Demo</title>
</head>
<body class="bg-gray-50 text-gray-900">
  <header class="py-6 px-4"><h1 class="text-2xl font-bold">Tiêu đề</h1></header>
  <main class="py-10">
    <section class="max-w-4xl mx-auto"><p>Nội dung chính của trang landing marketing.</p></section>
    <!-- UKNOW_LP_FORM -->
  </main>
</body>
</html>`;

describe('chốt sửa trang bằng AI — so ĐA TẬP loại chỗ trống (đường vá lẫn viết lại)', () => {
  const withBlocks = (...blocks) => baseHtml.replace(LANDING_FORM_PLACEHOLDER, blocks.join(''));
  const recolor = (html) =>
    html.replace('class="text-2xl font-bold">Tiêu đề', 'class="text-3xl font-extrabold text-blue-600">Tiêu đề mới cập nhật');
  const run = (current, next, strategy) => validateEditHtmlOutput({ currentHtml: current, newHtml: next, strategy });

  for (const strategy of ['patch', 'full']) {
    describe(`strategy=${strategy}`, () => {
      it('3 chỗ trống (consult/booking/payment), chỉ đổi màu → hợp lệ', () => {
        const current = withBlocks(slot(), slot('booking'), slot('payment'));
        expect(run(current, recolor(current), strategy)).toBe(true);
      });

      it('ĐỔI LOẠI cùng số lượng (booking → trần/consult) → 422 (số lượng như cũ nên chốt cũ lọt)', () => {
        const current = withBlocks(slot('consult'), slot('booking'));
        const next = current.replace(slot('booking'), slot());
        expect(countFormSlots(next)).toBe(countFormSlots(current)); // chốt chỉ so số lượng sẽ cho qua
        expect(() => run(current, next, strategy)).toThrow(/chỗ trống chờ Biểu mẫu/i);
      });

      it('booking+payment → consult+consult cùng số lượng → 422', () => {
        const current = withBlocks(slot('booking'), slot('payment'));
        const next = withBlocks(slot(), slot('consult'));
        expect(() => run(current, next, strategy)).toThrow(/chỗ trống chờ Biểu mẫu/i);
      });

      it('đổi chỗ vị trí các chỗ trống (cùng đa tập loại) → hợp lệ (không canh thứ tự)', () => {
        const current = withBlocks(slot('booking'), slot('payment'));
        const next = withBlocks(slot('payment'), slot('booking'));
        expect(run(current, next, strategy)).toBe(true);
      });

      it('chỗ trống trần ↔ consult tường minh là cùng một loại → hợp lệ', () => {
        const current = withBlocks(slot(), slot('booking'));
        const next = withBlocks(slot('consult'), slot('booking'));
        expect(run(current, next, strategy)).toBe(true);
      });

      it('bỏ bớt 1 trong 3 chỗ trống → 422; thêm 1 chỗ trống mới → 422', () => {
        const current = withBlocks(slot(), slot('booking'), slot('payment'));
        expect(() => run(current, withBlocks(slot(), slot('booking')), strategy)).toThrow(/chỗ trống chờ Biểu mẫu/i);
        expect(() => run(current, withBlocks(slot(), slot('booking'), slot('payment'), slot('survey')), strategy)).toThrow(
          /chỗ trống chờ Biểu mẫu/i
        );
      });

      it('thêm <form> tự viết khi trang đang có chỗ trống có loại → 422', () => {
        const current = withBlocks(slot('booking'), slot('payment'));
        const next = current.replace('</main>', '<form data-x><input name="email"/></form></main>');
        expect(() => run(current, next, strategy)).toThrow(/chỗ trống chờ Biểu mẫu/i);
      });

      it('AI viết giá trị loại lạ vào chỗ trống → 422', () => {
        const current = withBlocks(slot('booking'));
        const next = current.replace(slot('booking'), slot('dat-lich'));
        expect(() => run(current, next, strategy)).toThrow(/chỗ trống chờ Biểu mẫu/i);
      });

      it('3 khối nhúng đã lưu, chỉ đổi màu → hợp lệ; mất 1 khối → 422; mất 1 lần nhúng của cùng khoá → 422', () => {
        const embed = (key) => buildFormEmbedSectionHtml({ publicKey: key, origin: 'https://app.example' });
        const current = withBlocks(embed('KEY_ONE'), embed('KEY_TWO'), embed('KEY_THREE'));
        expect(run(current, recolor(current), strategy)).toBe(true);
        expect(() => run(current, current.replace(embed('KEY_TWO'), ''), strategy)).toThrow(/mất biểu mẫu nhúng/i);

        const dup = withBlocks(embed('KEY_ONE'), embed('KEY_ONE'));
        expect(() => run(dup, dup.replace(embed('KEY_ONE'), ''), strategy)).toThrow(/mất biểu mẫu nhúng/i);
      });
    });
  }
});
