import { describe, expect, it } from '@jest/globals';
import { ensureLandingDocumentShell, inspectCaptureForm, validateEditHtmlOutput } from '../landingEditGuard.util.js';

/**
 * PR-8 (rà soát AI 03/10, plan đợt 4) — chốt thêm ở landingEditGuard.util.js:
 *   B-12: ô đồng ý marketingConsent (và name/email/phone) của form bắt lead;
 *   B-14: chốt "teo dưới 60%" không áp cho bản vá (xoá mục hợp lệ trên trang dài), bản vá có sàn riêng 25%;
 *   B-16: trang AI sinh có viewport và </html>;
 * Tách khỏi landingEditGuard.util.spec.js để file đó không đụng độ với PR khác.
 */

const FORM = (extra = {}) =>
  '<form data-founderai-capture>' +
  '<input type="text" name="name" /><input type="email" name="email" /><input type="tel" name="phone" />' +
  (extra.consent === undefined
    ? '<label><input type="checkbox" name="marketingConsent" /> Đồng ý nhận tin</label>'
    : extra.consent) +
  '<button type="submit">Đăng ký</button></form>';

const page = (form, body = '') =>
  `<!DOCTYPE html><html lang="vi"><head><script src="https://cdn.tailwindcss.com"></script></head><body><h1>Khoá học</h1>${body}${form}</body></html>`;

describe('B-12 — inspectCaptureForm', () => {
  it('đọc tên các ô trong form capture, bỏ qua ô nằm ngoài form', () => {
    const html = page(FORM(), '<input name="email2"/>');
    const info = inspectCaptureForm(html);
    expect(info.found).toBe(true);
    expect([...info.names].sort()).toEqual(['email', 'marketingConsent', 'name', 'phone']);
    expect(info.consentChecked).toBe(false);
    expect(info.consentNotCheckbox).toBe(false);
  });

  it('không có form capture → found=false, không có tên nào', () => {
    const info = inspectCaptureForm('<form><input name="email"/></form>');
    expect(info).toMatchObject({ found: false, consentChecked: false });
    expect(info.names.size).toBe(0);
  });

  it('nhận ra tick sẵn (checked, checked="", checked="false") và ô không phải checkbox', () => {
    for (const attr of ['checked', 'checked=""', 'checked="false"', "CHECKED='checked'"]) {
      const html = page(FORM({ consent: `<input type="checkbox" name="marketingConsent" ${attr} />` }));
      expect(inspectCaptureForm(html).consentChecked).toBe(true);
    }
    for (const tag of [
      '<input type="hidden" name="marketingConsent" value="true" />',
      '<input name="marketingConsent" value="on" />',
      '<input type="text" name="marketingConsent" />',
      '<select name="marketingConsent"><option>có</option></select>',
    ]) {
      expect(inspectCaptureForm(page(FORM({ consent: tag }))).consentNotCheckbox).toBe(true);
    }
  });
});

describe('B-12 — validateEditHtmlOutput giữ ô của form bắt lead', () => {
  const current = page(FORM());
  const check = (next, cur = current) => validateEditHtmlOutput({ currentHtml: cur, newHtml: next, finishReason: 'STOP' });

  it('giữ nguyên form → hợp lệ', () => {
    expect(check(page(FORM(), '<p>thêm đoạn</p>'))).toBe(true);
  });

  it('AI xoá ô đồng ý → 422 LANDING_CAPTURE_FIELD_LOST, câu tiếng Việt nói rõ ô đồng ý', () => {
    const next = page(FORM({ consent: '' }));
    expect(() => check(next)).toThrow(
      expect.objectContaining({
        status: 422,
        code: 'LANDING_CAPTURE_FIELD_LOST',
        message: expect.stringMatching(/ô đồng ý nhận thông tin/),
      })
    );
  });

  it.each(['name', 'email', 'phone'])('AI xoá ô %s khỏi form → 422 LANDING_CAPTURE_FIELD_LOST', (field) => {
    const next = current.replace(new RegExp(`<input[^>]*name="${field}"[^>]*/>`), '');
    expect(next).not.toBe(current);
    expect(() => check(next)).toThrow(expect.objectContaining({ status: 422, code: 'LANDING_CAPTURE_FIELD_LOST' }));
  });

  it('AI dời ô đồng ý RA NGOÀI form → coi như mất (ô ngoài form không được gửi cùng form)', () => {
    const next = page(FORM({ consent: '' }), '<label><input type="checkbox" name="marketingConsent" /> ĐK</label>');
    expect(() => check(next)).toThrow(expect.objectContaining({ code: 'LANDING_CAPTURE_FIELD_LOST' }));
  });

  it('AI tick sẵn ô đồng ý → 422 LANDING_CONSENT_PRECHECKED', () => {
    const next = page(FORM({ consent: '<input type="checkbox" name="marketingConsent" checked />' }));
    expect(() => check(next)).toThrow(
      expect.objectContaining({ status: 422, code: 'LANDING_CONSENT_PRECHECKED', message: expect.stringMatching(/tick sẵn/) })
    );
  });

  it('AI đổi ô đồng ý thành ô ẩn → 422 LANDING_CONSENT_NOT_CHECKBOX', () => {
    const next = page(FORM({ consent: '<input type="hidden" name="marketingConsent" value="true" />' }));
    expect(() => check(next)).toThrow(expect.objectContaining({ code: 'LANDING_CONSENT_NOT_CHECKBOX' }));
  });

  it('trang đời cũ ĐÃ tick sẵn và AI giữ nguyên → không bị chặn (không đụng thứ khách đã có)', () => {
    const legacy = page(FORM({ consent: '<input type="checkbox" name="marketingConsent" checked />' }));
    expect(check(legacy, legacy)).toBe(true);
  });

  it('trang đời cũ KHÔNG có ô đồng ý: sửa tiếp không bị đòi thêm ô đó', () => {
    const legacy = page(FORM({ consent: '' }));
    expect(check(page(FORM({ consent: '' }), '<p>x</p>'), legacy)).toBe(true);
  });

  it('bản cũ không có form capture (chỉ iframe/khối nhúng) → chốt này bỏ qua', () => {
    const cur = '<!DOCTYPE html><html><body><h1>A</h1><iframe src="/embed/lead-form?slug=a"></iframe></body></html>';
    const next = '<!DOCTYPE html><html><body><h1>A</h1><p>b</p><iframe src="/embed/lead-form?slug=a"></iframe></body></html>';
    expect(check(next, cur)).toBe(true);
  });
});

describe('B-16 — ensureLandingDocumentShell: viewport + </html> cho trang AI sinh', () => {
  const VP = '<meta name="viewport" content="width=device-width, initial-scale=1"/>';
  const full = `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"/>${VP}<title>T</title></head><body><p>x</p></body></html>`;

  it('trang đủ viewport và </html> → trả nguyên văn, không vá gì', () => {
    expect(ensureLandingDocumentShell(full)).toEqual({ html: full, fixed: [] });
  });

  it('nhận viewport viết hoa / nháy đơn / thuộc tính khác thứ tự', () => {
    for (const meta of [
      '<META NAME="Viewport" CONTENT="width=device-width">',
      "<meta name='viewport' content='width=device-width'>",
      '<meta content="width=device-width" name="viewport"/>',
    ]) {
      const html = full.replace(VP, meta);
      expect(ensureLandingDocumentShell(html).fixed).toEqual([]);
    }
  });

  it('thiếu viewport → thêm ngay sau <head> (kể cả <head> có thuộc tính / viết hoa)', () => {
    const noVp = full.replace(VP, '');
    const out = ensureLandingDocumentShell(noVp);
    expect(out.fixed).toEqual(['viewport']);
    expect(out.html).toBe(noVp.replace('<head>', `<head>${VP}`));
    const upper = noVp.replace('<head>', '<HEAD profile="x">');
    expect(ensureLandingDocumentShell(upper).html).toContain(`<HEAD profile="x">${VP}`);
  });

  it('viewport chỉ nằm trong chú thích thì KHÔNG tính → vẫn thêm', () => {
    const html = full.replace(VP, `<!-- ${VP} -->`);
    expect(ensureLandingDocumentShell(html).fixed).toEqual(['viewport']);
  });

  it('chưa có <head> nhưng có <html> → bọc <head> mới; không có cả hai → 422', () => {
    const noHead = '<!DOCTYPE html><html lang="vi"><body><p>x</p></body></html>';
    const out = ensureLandingDocumentShell(noHead);
    expect(out.html).toBe(`<!DOCTYPE html><html lang="vi"><head>${VP}</head><body><p>x</p></body></html>`);
    expect(() => ensureLandingDocumentShell('<!DOCTYPE html><body><p>x</p></body></html>')).toThrow(
      expect.objectContaining({ status: 422, message: expect.stringMatching(/cấu trúc HTML bất thường/) })
    );
  });

  it('thiếu </html> nhưng còn </body> → thêm </html>; thiếu cả hai → 422 "bị cắt dở"', () => {
    const noClose = full.replace('</html>', '');
    const out = ensureLandingDocumentShell(noClose);
    expect(out.fixed).toEqual(['htmlClose']);
    expect(out.html.endsWith('</body>\n</html>')).toBe(true);
    const cut = full.replace('</body></html>', '<p>đang viết dở');
    expect(() => ensureLandingDocumentShell(cut)).toThrow(
      expect.objectContaining({ status: 422, message: expect.stringMatching(/cắt dở/) })
    );
  });

  it('thiếu cả hai điều kiện → vá cả hai, báo cả hai', () => {
    const out = ensureLandingDocumentShell(full.replace(VP, '').replace('</html>', ''));
    expect(out.fixed).toEqual(['viewport', 'htmlClose']);
  });
});

describe('B-14 — chốt "teo dưới 60%": áp cho viết lại cả trang; bản vá có sàn riêng 25%', () => {
  // Trang dài: phần "Giá" + "FAQ" chiếm quá 40% độ dài.
  const long = (n) => `<section><h2>Mục</h2><p>${'nội dung '.repeat(n)}</p></section>`;
  const current = page(FORM(), long(10) + long(300) + long(300));
  const shrunk = page(FORM(), long(10) + long(300)); // còn ~54%: < 60% nhưng > 25%
  const nearlyEmpty = page(FORM(), long(10)); // còn ~9%
  const run = (newHtml, strategy) =>
    validateEditHtmlOutput({ currentHtml: current, newHtml, finishReason: 'STOP', ...(strategy ? { strategy } : {}) });

  it('mặc định (không biết chiến lược) và mọi chiến lược viết lại cả trang → vẫn 422 khi teo dưới 60%', () => {
    expect(shrunk.length).toBeLessThan(0.6 * current.length);
    expect(shrunk.length).toBeGreaterThan(0.25 * current.length);
    for (const strategy of [undefined, 'full', 'patch_fallback_full', 'patch_full_html']) {
      expect(() => run(shrunk, strategy)).toThrow(expect.objectContaining({ status: 422, message: expect.stringMatching(/viết lại toàn bộ trang/) }));
    }
  });

  it('chiến lược patch (bản vá xoá mục theo yêu cầu) → hợp lệ dù trang ngắn đi quá 40%', () => {
    expect(run(shrunk, 'patch')).toBe(true);
  });

  it('chiến lược patch mất > 75% độ dài → 422 LANDING_PATCH_DELETES_TOO_MUCH (sàn riêng của bản vá)', () => {
    expect(nearlyEmpty.length).toBeLessThan(0.25 * current.length);
    expect(() => run(nearlyEmpty, 'patch')).toThrow(
      expect.objectContaining({ status: 422, code: 'LANDING_PATCH_DELETES_TOO_MUCH', message: expect.stringMatching(/xoá gần hết nội dung/) })
    );
  });

  it('ranh giới sàn: còn ĐÚNG 25% → qua; thiếu 1 ký tự → 422', () => {
    const sized = (len) => {
      const base = page(FORM(), '<p></p>');
      return base.replace('<p></p>', `<p>${'a'.repeat(len - base.length)}</p>`);
    };
    const cur = sized(4000);
    expect(cur).toHaveLength(4000);
    const check = (next) => validateEditHtmlOutput({ currentHtml: cur, newHtml: next, finishReason: 'STOP', strategy: 'patch' });
    expect(sized(1000)).toHaveLength(1000);
    expect(check(sized(1000))).toBe(true);
    expect(() => check(sized(999))).toThrow(expect.objectContaining({ code: 'LANDING_PATCH_DELETES_TOO_MUCH' }));
  });

  it('các chốt khác vẫn chạy ở chiến lược patch (mất form → 422)', () => {
    const noForm = page('', long(10) + long(300));
    expect(() =>
      validateEditHtmlOutput({ currentHtml: current, newHtml: noForm, finishReason: 'STOP', strategy: 'patch' })
    ).toThrow(expect.objectContaining({ status: 422 }));
  });
});
