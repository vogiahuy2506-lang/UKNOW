import { describe, it, expect } from '@jest/globals';
import {
  neutralizeAppFormLinks,
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

/**
 * C2 mở rộng — người bán dán IFRAME biểu mẫu thay vì khối `<section>`: màn "Chia sẻ biểu mẫu" cho copy
 * `<iframe src="${origin}/f/${publicKey}?embed=1" …></iframe>`, landing cũ có `<iframe src="/embed/lead-form?slug=…">`.
 * Bản clone vẫn đẩy lead về người bán nếu để nguyên → đổi thành chỗ trống; iframe khác giữ nguyên từng byte.
 */
describe('replaceFormEmbedsWithSlots — iframe biểu mẫu của người bán', () => {
  const YOUTUBE = '<iframe width="560" height="315" src="https://www.youtube.com/embed/dQw4w9WgXcQ" title="Video" allowfullscreen></iframe>';
  const MAP = '<iframe src="https://www.google.com/maps/embed?pb=!1m18!1m12" loading="lazy"></iframe>';

  it.each([
    ['tuyệt đối, ?embed=1 (đúng mã ShareModal)', '<iframe src="https://founderai.biz/f/ABC_def-123?embed=1" style="width:100%;border:0;min-height:480px" title="Đăng ký"></iframe>'],
    ['tương đối, nháy đơn', "<iframe src='/f/KEY99?embed=1' style='width:100%'></iframe>"],
    ['tuyệt đối trên tên miền riêng của người bán', '<iframe src="https://khoahoc.nguoiban.vn/f/KEY99?embed=1&theme=dark"></iframe>'],
    ['cùng giao thức //host', '<iframe src="//founderai.biz/f/KEY99"></iframe>'],
    ['không có query', '<iframe src="https://founderai.biz/f/KEY99"></iframe>'],
    ['có fragment', '<iframe src="/f/KEY99#top"></iframe>'],
    ['thuộc tính src đứng sau, nhiều thuộc tính, xuống dòng', '<iframe\n  class="form"\n  title="Đăng ký"\n  src="https://founderai.biz/f/KEY99?embed=1"\n  loading="lazy"\n></iframe>'],
    ['không nháy', '<iframe src=/f/KEY99?embed=1 width=100%></iframe>'],
    ['viết hoa thẻ và thuộc tính', '<IFRAME SRC="https://founderai.biz/f/KEY99?embed=1"></IFRAME>'],
    ['khoảng trắng quanh dấu =', '<iframe src = "https://founderai.biz/f/KEY99?embed=1"></iframe>'],
    ['có nội dung bên trong (fallback)', '<iframe src="/f/KEY99?embed=1">Trình duyệt không hỗ trợ iframe</iframe>'],
    ['form lead cũ /embed/lead-form?slug=', '<iframe src="/embed/lead-form?slug=landing-cu" style="width:100%"></iframe>'],
    ['form lead cũ, tuyệt đối, nháy đơn', "<iframe src='https://founderai.biz/embed/lead-form?slug=x'></iframe>"],
    ['form lead cũ, không query', '<iframe src="/embed/lead-form"></iframe>'],
  ])('%s -> đúng MỘT chỗ trống, phần trang quanh nó giữ nguyên', (_label, iframe) => {
    const out = replaceFormEmbedsWithSlots(`<h1>Trên</h1>${iframe}<p>Dưới</p>`);
    expect(out).toBe(`<h1>Trên</h1>${SLOT}<p>Dưới</p>`);
    expect(countFormSlots(out)).toBe(1);
  });

  it('iframe tự đóng / không có thẻ đóng -> chỉ thẻ mở thành chỗ trống, KHÔNG nuốt phần trang phía sau', () => {
    expect(replaceFormEmbedsWithSlots('<p>a</p><iframe src="/f/KEY99?embed=1" /><p>b</p>')).toBe(`<p>a</p>${SLOT}<p>b</p>`);
    expect(replaceFormEmbedsWithSlots('<p>a</p><iframe src="/f/KEY99?embed=1"><p>b</p>')).toBe(`<p>a</p>${SLOT}<p>b</p>`);
    // iframe không đóng đứng TRƯỚC một iframe khác có đóng: không ăn qua iframe kế.
    expect(replaceFormEmbedsWithSlots(`<iframe src="/f/KEY99"><p>giữa</p>${YOUTUBE}`)).toBe(`${SLOT}<p>giữa</p>${YOUTUBE}`);
  });

  it('iframe KHÁC (YouTube, bản đồ, src rỗng/thiếu, đường dẫn chỉ chứa /f/ ở query) giữ nguyên từng byte', () => {
    const others = [
      YOUTUBE,
      MAP,
      '<iframe src="https://player.vimeo.com/video/123"></iframe>',
      '<iframe title="trống"></iframe>',
      '<iframe src=""></iframe>',
      '<iframe src="https://example.com/page?u=/f/ABC"></iframe>',
      '<iframe src="https://example.com/form/f/ABC"></iframe>',
      '<iframe data-src="/f/KEY99?embed=1" src="https://www.youtube.com/embed/x"></iframe>',
      '<iframe src="/files/KEY99"></iframe>',
      '<iframe src="/f/"></iframe>',
    ];
    for (const iframe of others) {
      const html = `<main>\r\n\t${iframe} \r\n</main>`;
      expect(replaceFormEmbedsWithSlots(html)).toBe(html);
    }
  });

  it('trộn: khối section + iframe /f/ + iframe lead cũ + YouTube + bản đồ -> 3 chỗ trống, hai iframe khác nguyên vẹn, đúng thứ tự', () => {
    const html = [
      '<h1>Đầu</h1>',
      block('SECT'),
      YOUTUBE,
      '<iframe src="https://founderai.biz/f/IFR?embed=1"></iframe>',
      '<p>Giữa</p>',
      MAP,
      '<iframe src="/embed/lead-form?slug=cu"></iframe>',
    ].join('\n');

    const out = replaceFormEmbedsWithSlots(html);

    expect(out).toBe(['<h1>Đầu</h1>', SLOT, YOUTUBE, SLOT, '<p>Giữa</p>', MAP, SLOT].join('\n'));
    expect(countFormSlots(out)).toBe(3);
    expect(listFormEmbedKeys(out)).toEqual([]);
    expect(out).not.toContain('/f/');
    expect(out).not.toContain('lead-form');
  });

  it('thẻ <a href=".../f/..."> KHÔNG bị đụng bởi hàm này (landing chủ tự lưu giữ link của chính họ; lúc CLONE dùng neutralizeAppFormLinks)', () => {
    const html = '<a href="https://founderai.biz/f/KEY99" class="btn">Đăng ký ngay</a><noscript><a href="/f/KEY99">Mở</a></noscript>';
    expect(replaceFormEmbedsWithSlots(html)).toBe(html);
  });

  it('idempotent và không đổi tổng số: chạy lần hai không đổi gì', () => {
    const html = `${block('SECT')}<iframe src="/f/IFR?embed=1"></iframe>${YOUTUBE}`;
    const once = replaceFormEmbedsWithSlots(html);
    expect(once).toBe(`${SLOT}${SLOT}${YOUTUBE}`);
    expect(replaceFormEmbedsWithSlots(once)).toBe(once);
  });
});

/**
 * PLAN_GOM_MUC_NHE_2026-10-20 3e — landing MUA từ Marketplace: liên kết `<a href=".../f/<key>">` của người bán (tương đối hoặc host của ứng dụng)
 * đổi thành `href="#"`, giữ chữ hiển thị; host ngoài giữ nguyên. Chỉ lúc clone — landing chủ tự lưu không đi qua hàm này.
 */
describe('neutralizeAppFormLinks', () => {
  const APP = { appHosts: ['founderai.biz', 'app.test.local:5174'] };

  it('đường dẫn tương đối /f/<key> và host của ứng dụng → href="#", giữ nguyên chữ và các thuộc tính khác', () => {
    const html = [
      '<a href="/f/KEY99" class="btn">Đăng ký ngay</a>',
      '<a class="x" href=\'https://founderai.biz/f/KEY99?embed=1\' id="y">Mở biểu mẫu</a>',
      '<a href=//app.test.local:5174/f/KEY99/>Cùng giao thức</a>',
      '<A HREF="HTTPS://FOUNDERAI.BIZ/F/KEY99">Hoa</A>',
    ].join('\n');
    const out = neutralizeAppFormLinks(html, APP);
    expect(out).toBe([
      '<a href="#" class="btn">Đăng ký ngay</a>',
      '<a class="x" href=\'#\' id="y">Mở biểu mẫu</a>',
      '<a href="#">Cùng giao thức</a>',
      '<A href="#">Hoa</A>',
    ].join('\n'));
    expect(out).not.toContain('KEY99');
  });

  it('host NGOÀI ứng dụng (kể cả tên miền riêng của người khác) giữ nguyên từng byte; liên kết khác không đụng', () => {
    const html = [
      '<a href="https://nguoi-khac.com/f/KEY99">Ngoài</a>',
      '<a href="https://founderai.biz.evil.com/f/KEY99">Gần giống</a>',
      '<a href="https://founderai.biz/gioi-thieu">Trang khác</a>',
      '<a href="https://founderai.biz/ff/KEY99">Đường dẫn gần giống</a>',
      '<a href="#dang-ky">Neo</a>',
      '<a data-href="/f/KEY99" href="/lien-he">Thuộc tính data-href</a>',
      '<abbr title="/f/KEY99">x</abbr>',
    ].join('\n');
    expect(neutralizeAppFormLinks(html, APP)).toBe(html);
  });

  it('không có <a> / không có /f/ → trả NGUYÊN chuỗi; không phải chuỗi → chuỗi rỗng', () => {
    expect(neutralizeAppFormLinks('<p>Không link</p>', APP)).toBe('<p>Không link</p>');
    expect(neutralizeAppFormLinks('<a href="/lien-he">x</a>', APP)).toBe('<a href="/lien-he">x</a>');
    expect(neutralizeAppFormLinks(undefined, APP)).toBe('');
  });

  it('mặc định đọc host ứng dụng từ FRONTEND_URL / FRONTEND_URLS', () => {
    const saved = { fe: process.env.FRONTEND_URL, many: process.env.FRONTEND_URLS };
    process.env.FRONTEND_URL = 'https://app.founder.test';
    process.env.FRONTEND_URLS = 'https://second.founder.test, https://third.founder.test:8443';
    try {
      const html = '<a href="https://app.founder.test/f/A1">1</a><a href="https://second.founder.test/f/A1">2</a><a href="https://third.founder.test:8443/f/A1">3</a><a href="https://other.test/f/A1">4</a>';
      expect(neutralizeAppFormLinks(html)).toBe('<a href="#">1</a><a href="#">2</a><a href="#">3</a><a href="https://other.test/f/A1">4</a>');
    } finally {
      if (saved.fe === undefined) delete process.env.FRONTEND_URL; else process.env.FRONTEND_URL = saved.fe;
      if (saved.many === undefined) delete process.env.FRONTEND_URLS; else process.env.FRONTEND_URLS = saved.many;
    }
  });

  it('ghép với replaceFormEmbedsWithSlots: khối nhúng → chỗ trống, link người bán → "#"', () => {
    const html = `${block('SELLERKEY1')}<a href="/f/SELLERKEY1">Bấm đây</a>`;
    const out = neutralizeAppFormLinks(replaceFormEmbedsWithSlots(html), APP);
    expect(out).toBe(`${SLOT}<a href="#">Bấm đây</a>`);
  });
});
