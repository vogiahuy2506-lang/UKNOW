import { describe, it, expect } from 'vitest';
import {
  looksLikeHtmlDocument,
  splitHtmlPaste,
  buildLandingPasteMarker,
  slugifyLandingTitle,
} from '../landingPaste.js';

describe('looksLikeHtmlDocument (Việc 2.1)', () => {
  it('nhận diện trang HTML đầy đủ có doctype', () => {
    const html = '<!doctype html><html><head><title>Test</title></head><body><h1>Hi</h1></body></html>';
    expect(looksLikeHtmlDocument(html)).toBe(true);
  });

  it('nhận diện fragment có <html> không kèm doctype', () => {
    const html = '<html><body><div>Xin chào</div></body></html>';
    expect(looksLikeHtmlDocument(html)).toBe(true);
  });

  it('trang thật có <!doctype html> nhưng chữ hiển thị chiếm > 20% độ dài vẫn phải nhận đúng — ' +
    'ngưỡng 80% KHÔNG áp cho nhánh doctype/<html> (nếu áp sẽ loại nhầm landing page thật)', () => {
    const html = '<!doctype html><html><head><title>Trang khách dán</title></head>'
      + '<body><h1>Chào</h1><p>Nội dung</p></body></html>';
    // Xác nhận fixture này THẬT SỰ dưới 80% thẻ, để bài test còn giá trị.
    const tagCharCount = (html.match(/<[^>]*>/g) || []).join('').length;
    expect(tagCharCount / html.length).toBeLessThan(0.8);
    expect(looksLikeHtmlDocument(html)).toBe(true);
  });

  it('nhận diện fragment có <body> kèm ≥ 3 thẻ mở, không có <html>/doctype', () => {
    const html = '<body><div><span></span></div><div><span></span></div></body>';
    expect(looksLikeHtmlDocument(html)).toBe(true);
  });

  it('có <body> kèm ≥ 3 thẻ mở nhưng chữ thường chiếm quá nhiều (< 80% là thẻ) → false', () => {
    const html = '<body><header>Menu</header><main>Nội dung</main><footer>Footer</footer></body>';
    expect(looksLikeHtmlDocument(html)).toBe(false);
  });

  it('KHÔNG bắt câu hỏi bình thường lỡ nhắc tới thẻ HTML', () => {
    const text = 'Sửa cho tôi cái nút <button>Mua ngay</button> to hơn và đổi màu nhé';
    expect(looksLikeHtmlDocument(text)).toBe(false);
  });

  it('KHÔNG bắt fragment không có <body>/<html>/doctype (chỉ vài <div>)', () => {
    const text = '<div><p>Xin chào</p></div> đây là nội dung landing của tôi, sửa giúp tôi với';
    expect(looksLikeHtmlDocument(text)).toBe(false);
  });

  it('chuỗi rỗng → false', () => {
    expect(looksLikeHtmlDocument('')).toBe(false);
    expect(looksLikeHtmlDocument('   ')).toBe(false);
  });
});

describe('splitHtmlPaste (Việc 2.1)', () => {
  it('tách đúng HTML khi dán thuần, không có chữ thêm', () => {
    const html = '<!doctype html><html><body>Nội dung</body></html>';
    const { html: extractedHtml, instruction } = splitHtmlPaste(html);
    expect(extractedHtml).toBe(html);
    expect(instruction).toBe('');
  });

  it('tách phần chữ hướng dẫn thêm sau HTML', () => {
    const html = '<!doctype html><html><body>Nội dung</body></html>';
    const text = `${html}\ndùng trang này, đổi màu nút sang xanh`;
    const result = splitHtmlPaste(text);
    expect(result.html).toBe(html);
    expect(result.instruction).toBe('dùng trang này, đổi màu nút sang xanh');
  });
});

describe('buildLandingPasteMarker', () => {
  it('khớp đúng chuỗi backend lưu (ai.controller.js#landingFromHtml)', () => {
    expect(buildLandingPasteMarker('Trang Test', 66)).toBe('[Dán HTML có sẵn: "Trang Test", 66 ký tự]');
  });
});

describe('slugifyLandingTitle (Việc 2.2)', () => {
  it('bỏ dấu, chữ thường, nối bằng "-"', () => {
    expect(slugifyLandingTitle('Khóa Học Marketing Online')).toBe('khoa-hoc-marketing-online');
  });

  it('bỏ ký tự đặc biệt, không để dư dấu "-" ở đầu/cuối', () => {
    expect(slugifyLandingTitle('  !!Ưu đãi 50%!!  ')).toBe('uu-dai-50');
  });
});
