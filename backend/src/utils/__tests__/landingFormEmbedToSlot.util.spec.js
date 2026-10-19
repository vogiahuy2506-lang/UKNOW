import { describe, it, expect } from '@jest/globals';
import {
  replaceFormEmbedsWithSlots,
  buildFormEmbedSectionHtml,
  countFormSlots,
  hasMalformedFormSlot,
  MAX_FORMS_PER_LANDING,
} from '../landingHtmlInjection.util.js';
import { listFormEmbedKeys } from '../landingEditGuard.util.js';

/**
 * PLAN_VA_CO_LAP_DU_LIEU_TENANT_DOT2 PR-C (C2) — landing mua từ Marketplace: mọi khối nhúng biểu mẫu của người bán đổi thành
 * chỗ trống `<div data-founderai-form-slot></div>` (lúc người mua lưu trang, chỗ trống thành biểu mẫu CỦA NGƯỜI MUA).
 */
const SLOT = '<div data-founderai-form-slot></div>';
const block = (key) => buildFormEmbedSectionHtml({ publicKey: key, origin: 'https://founderai.biz' });

describe('replaceFormEmbedsWithSlots', () => {
  it('một khối nhúng -> một chỗ trống, không còn khoá / script / liên kết noscript của người bán', () => {
    const html = `<h1>Tiêu đề</h1>\n${block('SELLERKEY1')}\n<p>Cuối trang</p>`;
    const out = replaceFormEmbedsWithSlots(html);
    expect(out).toBe(`<h1>Tiêu đề</h1>\n${SLOT}\n<p>Cuối trang</p>`);
    expect(out).not.toContain('data-founderai-form=');
    expect(out).not.toContain('SELLERKEY1');
    expect(out).not.toContain('form-embed.js');
  });

  it('nhiều khối (kể cả cùng một khoá nhúng hai lần) -> số chỗ trống = số khối, thứ tự giữ nguyên', () => {
    const html = `<a>1</a>${block('KEYA')}<b>2</b>${block('KEYB')}<c>3</c>${block('KEYA')}<d>4</d>`;
    const out = replaceFormEmbedsWithSlots(html);
    expect(out).toBe(`<a>1</a>${SLOT}<b>2</b>${SLOT}<c>3</c>${SLOT}<d>4</d>`);
    expect(listFormEmbedKeys(out)).toEqual([]);
    expect(countFormSlots(out)).toBe(3);
    expect(hasMalformedFormSlot(out)).toBe(false);
  });

  it('tổng chỗ trống + khối nhúng KHÔNG đổi -> không vượt trần MAX_FORMS_PER_LANDING', () => {
    const html = Array.from({ length: MAX_FORMS_PER_LANDING }, (_, i) => block(`K${i}`)).join('\n');
    expect(listFormEmbedKeys(html)).toHaveLength(MAX_FORMS_PER_LANDING);
    const out = replaceFormEmbedsWithSlots(html);
    expect(countFormSlots(out) + listFormEmbedKeys(out).length).toBe(MAX_FORMS_PER_LANDING);
  });

  it('khối nằm giữa nội dung lồng trong thẻ khác -> chỉ khối bị thay, phần còn lại nguyên vẹn', () => {
    const html = `<div class="wrap"><section id="hero"><h2>Hero</h2></section>${block('MID')}<section id="faq"><p>FAQ</p></section></div>`;
    const out = replaceFormEmbedsWithSlots(html);
    expect(out).toBe(`<div class="wrap"><section id="hero"><h2>Hero</h2></section>${SLOT}<section id="faq"><p>FAQ</p></section></div>`);
  });

  it('biến thể thuộc tính: nháy đơn, khoảng trắng quanh "=", thứ tự thuộc tính, viết hoa tên thuộc tính', () => {
    const variants = [
      `<section class="x" data-founderai-form-section id="y">\n  <div data-founderai-form='SQ'></div>\n</section>`,
      `<section data-founderai-form-section>\n  <div class="f" data-founderai-form = "SPACED" id="z"></div>\n</section>`,
      `<section id="a" data-founderai-form-section="">\n  <div id="b" class="c" data-founderai-form="ORDER"></div>\n  <noscript><a href="https://o/f/ORDER">Mở</a></noscript>\n</section>`,
      `<SECTION DATA-FOUNDERAI-FORM-SECTION>\n  <DIV DATA-FOUNDERAI-FORM="UPPER"></DIV>\n</SECTION>`,
      `<section\n  data-founderai-form-section\n>\n  <div\n    data-founderai-form='MULTI'\n  ></div>\n</section>`,
    ];
    for (const variant of variants) {
      const out = replaceFormEmbedsWithSlots(`<p>a</p>${variant}<p>b</p>`);
      expect(out).toBe(`<p>a</p>${SLOT}<p>b</p>`);
    }
  });

  it('phần tử nhúng rỗng đứng riêng (không bọc section) -> một chỗ trống', () => {
    const out = replaceFormEmbedsWithSlots('<main><div data-founderai-form="LONE"></div></main>');
    expect(out).toBe(`<main>${SLOT}</main>`);
  });

  it('khoá còn sót trên thẻ có nội dung con -> gỡ thuộc tính, không còn khoá người bán, giữ nguyên nội dung con', () => {
    const out = replaceFormEmbedsWithSlots('<div class="k" data-founderai-form="LEFT" id="i"><p>nội dung</p></div>');
    expect(out).toBe('<div class="k" id="i"><p>nội dung</p></div>');
    expect(listFormEmbedKeys(out)).toEqual([]);
  });

  it('bộ chọn CSS [data-founderai-form="x"] trong <style> không bị đụng', () => {
    const html = '<style>[data-founderai-form="x"]{display:block}</style><p>hi</p>';
    // listFormEmbedKeys cũng đếm chuỗi này nhưng nó không nằm trong thẻ HTML -> hàm không sửa CSS.
    expect(replaceFormEmbedsWithSlots(html)).toBe(html);
  });

  it('không có khối nào -> trả về NGUYÊN VẸN từng byte (kể cả CRLF, tab, khoảng trắng cuối)', () => {
    const html = '<!DOCTYPE html>\r\n<html>\t<body> \r\n<section data-founderai-form-section></section>\r\n<div data-founderai-form-slot></div>  \r\n</body></html>\r\n';
    expect(replaceFormEmbedsWithSlots(html)).toBe(html);
    expect(replaceFormEmbedsWithSlots('')).toBe('');
    expect(replaceFormEmbedsWithSlots(undefined)).toBe('');
    expect(replaceFormEmbedsWithSlots(null)).toBe('');
  });

  it('chỗ trống có sẵn của bản gốc giữ nguyên; chạy lần hai (idempotent) không đổi gì thêm', () => {
    const html = `${SLOT}<p>x</p>${block('KEYZ')}`;
    const once = replaceFormEmbedsWithSlots(html);
    expect(once).toBe(`${SLOT}<p>x</p>${SLOT}`);
    expect(replaceFormEmbedsWithSlots(once)).toBe(once);
  });
});
