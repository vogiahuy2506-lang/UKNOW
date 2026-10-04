import { describe, expect, it } from '@jest/globals';
import { inspectCaptureForm, validateEditHtmlOutput } from '../landingEditGuard.util.js';

/**
 * PR-8 (rà soát AI 03/10, plan đợt 4) — chốt thêm ở landingEditGuard.util.js:
 *   B-12: ô đồng ý marketingConsent (và name/email/phone) của form bắt lead;
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
