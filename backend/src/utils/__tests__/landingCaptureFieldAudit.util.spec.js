import { describe, expect, it } from '@jest/globals';
import {
  auditLandingCaptureFields,
  buildCaptureFieldAuditWarning,
  FIXED_CAPTURE_FIELD_NAMES,
} from '../landingCaptureFieldAudit.util.js';
import { LEAD_FORM_CONFIG_VERSION } from '../landingLeadFormConfig.util.js';

/**
 * Câu 3 sếp hỏi 14/09 ("dữ liệu điền vào form sẽ lưu về chỗ nào?") — đo thật trên
 * checkform.founderai.biz: 5/8 ô không lưu ở đâu, không báo gì. `auditLandingCaptureFields`
 * soi ĐÚNG form data-founderai-capture, đối chiếu với customFields đã khai báo.
 */
const declaredField = (key, overrides = {}) => ({
  key,
  type: 'text',
  labelVi: key,
  labelEn: null,
  placeholderVi: null,
  placeholderEn: null,
  required: false,
  options: [],
  ...overrides,
});

const leadFormWith = (customFields = []) => ({
  version: LEAD_FORM_CONFIG_VERSION,
  fixedFields: { occupation: { visible: true }, interestArea: { visible: true } },
  customFields,
});

const captureFormHtml = (fieldsHtml) => `<!DOCTYPE html><html><body>
  <form data-founderai-capture>
    <input type="text" name="name" />
    <input type="email" name="email" />
    <input type="tel" name="phone" />
    <label><input type="checkbox" name="marketingConsent" /> Đồng ý</label>
    ${fieldsHtml}
    <button type="submit">Gửi</button>
  </form>
</body></html>`;

describe('landingCaptureFieldAudit.util — auditLandingCaptureFields', () => {
  it('ô name="chuc_vu" KHÔNG khai báo → unknownNames nêu đúng "chuc_vu"', () => {
    const html = captureFormHtml('<input type="text" name="chuc_vu" />');
    const result = auditLandingCaptureFields(html, leadFormWith([]));
    expect(result.unknownNames).toEqual(['chuc_vu']);
    expect(result.declaredMissing).toEqual([]);
  });

  it('ô cf_abcd_12 ĐÃ khai báo → không có trong unknownNames', () => {
    const html = captureFormHtml('<input type="text" name="cf_abcd_12" />');
    const result = auditLandingCaptureFields(html, leadFormWith([declaredField('cf_abcd_12')]));
    expect(result.unknownNames).toEqual([]);
    expect(result.declaredMissing).toEqual([]);
  });

  it('ô cf_lung_tung CHƯA khai báo → cảnh báo nêu đúng tên đó (khai báo field khác không liên quan)', () => {
    const html = captureFormHtml('<input type="text" name="cf_lung_tung" />');
    const result = auditLandingCaptureFields(html, leadFormWith([declaredField('cf_khac_biet')]));
    expect(result.unknownNames).toEqual(['cf_lung_tung']);
    // Khoá đã khai báo nhưng HTML không có → cũng phải báo declaredMissing (2 vấn đề độc lập).
    expect(result.declaredMissing).toEqual(['cf_khac_biet']);
  });

  it('trang không có form data-founderai-capture → không cảnh báo', () => {
    const html = '<!DOCTYPE html><html><body><p>Không có form nào</p></body></html>';
    const result = auditLandingCaptureFields(html, leadFormWith([declaredField('cf_bat_ky')]));
    expect(result.unknownNames).toEqual([]);
    expect(result.declaredMissing).toEqual([]);
  });

  it('trang có form KHÁC (vd tìm kiếm) ngoài form capture → không soi form đó, không báo động giả', () => {
    const html = `<!DOCTYPE html><html><body>
      <form id="search-form"><input type="text" name="q" /><input type="text" name="unrelated_field" /></form>
      ${captureFormHtml('')}
    </body></html>`;
    const result = auditLandingCaptureFields(html, leadFormWith([]));
    expect(result.unknownNames).toEqual([]);
  });

  it('đã khai báo 2 trường nhưng HTML chỉ có 1 → declaredMissing nêu đúng khoá bị thiếu', () => {
    const html = captureFormHtml('<input type="text" name="cf_co_mat" />');
    const result = auditLandingCaptureFields(
      html,
      leadFormWith([declaredField('cf_co_mat'), declaredField('cf_bi_thieu')])
    );
    expect(result.unknownNames).toEqual([]);
    expect(result.declaredMissing).toEqual(['cf_bi_thieu']);
  });

  it('radio nhiều lựa chọn cùng name → đếm một lần, không nhân đôi trong unknownNames', () => {
    const html = captureFormHtml(`
      <label><input type="radio" name="khung_gio" value="sang" /> Sáng</label>
      <label><input type="radio" name="khung_gio" value="chieu" /> Chiều</label>
    `);
    const result = auditLandingCaptureFields(html, leadFormWith([]));
    expect(result.unknownNames).toEqual(['khung_gio']);
  });

  it('tên cố định (name/email/phone/marketingConsent/landingPageSlug/occupation/interestArea) không bị coi là lạ', () => {
    const html = captureFormHtml(`
      <input type="hidden" name="landingPageSlug" />
      <select name="occupation"><option value="x">x</option></select>
      <select name="interestArea"><option value="y">y</option></select>
    `);
    const result = auditLandingCaptureFields(html, leadFormWith([]));
    expect(result.unknownNames).toEqual([]);
    expect(FIXED_CAPTURE_FIELD_NAMES.has('interestArea')).toBe(true);
    expect(FIXED_CAPTURE_FIELD_NAMES.has('interest_area')).toBe(false);
  });

  it('leadFormConfigOrCustomConfig có thể là customConfig JSONB thô ({ leadForm: {...} })', () => {
    const html = captureFormHtml('<input type="text" name="cf_valid_key" />');
    const result = auditLandingCaptureFields(html, { leadForm: leadFormWith([declaredField('cf_valid_key')]) });
    expect(result.unknownNames).toEqual([]);
  });

  it('html/config rỗng hoặc null → không throw, trả mảng rỗng', () => {
    expect(auditLandingCaptureFields('', null)).toEqual({ unknownNames: [], declaredMissing: [] });
    expect(auditLandingCaptureFields(null, undefined)).toEqual({ unknownNames: [], declaredMissing: [] });
  });
});

describe('landingCaptureFieldAudit.util — buildCaptureFieldAuditWarning', () => {
  it('không có gì để báo → trả null', () => {
    expect(buildCaptureFieldAuditWarning({ unknownNames: [], declaredMissing: [] })).toBeNull();
    expect(buildCaptureFieldAuditWarning()).toBeNull();
  });

  it('chỉ có unknownNames → câu cảnh báo nêu đúng tên, không có câu declaredMissing', () => {
    const msg = buildCaptureFieldAuditWarning({ unknownNames: ['chuc_vu'], declaredMissing: [] });
    expect(msg).toContain('chuc_vu');
    expect(msg).toMatch(/SẼ KHÔNG được lưu/);
    expect(msg).not.toMatch(/đang thiếu/);
  });

  it('cả hai loại cùng có → gộp một chuỗi, không mất câu nào', () => {
    const msg = buildCaptureFieldAuditWarning({
      unknownNames: ['chuc_vu'],
      declaredMissing: ['cf_bi_thieu'],
    });
    expect(msg).toContain('chuc_vu');
    expect(msg).toContain('cf_bi_thieu');
    expect(msg).toMatch(/SẼ KHÔNG được lưu/);
    expect(msg).toMatch(/đang thiếu/);
  });
});
