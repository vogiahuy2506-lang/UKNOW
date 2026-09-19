import { describe, expect, it } from '@jest/globals';
import { autoDeclareLandingCaptureFields } from '../landingCaptureFieldAutoDeclare.util.js';
import { auditLandingCaptureFields } from '../landingCaptureFieldAudit.util.js';
import { validateAdminLeadFormConfig, CUSTOM_FIELD_KEY_RE } from '../landingLeadFormConfig.util.js';

/**
 * PLAN_TU_KHAI_BAO_TRUONG_FORM_LANDING_2026-09-16.md — "thêm ô Chức vụ" phải ra đủ trường VÀ dữ
 * liệu phải được lưu, không bắt người dùng tự khai báo trước. Bẫy nặng nhất (mục 6.2): select/
 * radio thiếu options làm mất cả lead — nên nhiều ca ở đây khoá đúng "bỏ qua khi không chắc".
 */
const emptyConfig = () => ({ version: 1, fixedFields: { occupation: { visible: false }, interestArea: { visible: false } }, customFields: [] });

const wrapCapture = (innerFields) =>
  '<!DOCTYPE html><html><body>' +
  '<form data-founderai-capture>' +
  '<input type="text" name="name" /><input type="email" name="email" /><input type="tel" name="phone" />' +
  '<label><input type="checkbox" name="marketingConsent" /> Đồng ý</label>' +
  innerFields +
  '<button type="submit">Đăng ký</button>' +
  '</form>' +
  '</body></html>';

describe('landingCaptureFieldAutoDeclare.util — autoDeclareLandingCaptureFields', () => {
  it('name="chuc_vu" (text, có label[for]) → đổi tên thành cf_*, khai báo 1 trường text đúng nhãn', () => {
    const html = wrapCapture('<label for="f1">Chức vụ</label><input type="text" id="f1" name="chuc_vu" />');
    const result = autoDeclareLandingCaptureFields(html, emptyConfig());

    expect(result.newFields).toHaveLength(1);
    const field = result.newFields[0];
    expect(field.type).toBe('text');
    expect(field.labelVi).toBe('Chức vụ');
    expect(CUSTOM_FIELD_KEY_RE.test(field.key)).toBe(true);
    expect(result.html).not.toContain('name="chuc_vu"');
    expect(result.html).toContain(`name="${field.key}"`);
    expect(result.skipped).toEqual([]);
  });

  it('label lấy theo thứ tự label[for] → aria-label → placeholder → tên ô viết lại', () => {
    const byAriaLabel = autoDeclareLandingCaptureFields(
      wrapCapture('<input type="text" name="don_vi" aria-label="Đơn vị công tác" placeholder="Bỏ qua placeholder" />'),
      emptyConfig()
    );
    expect(byAriaLabel.newFields[0].labelVi).toBe('Đơn vị công tác');

    const byPlaceholder = autoDeclareLandingCaptureFields(
      wrapCapture('<input type="text" name="don_vi_2" placeholder="Nhập đơn vị" />'),
      emptyConfig()
    );
    expect(byPlaceholder.newFields[0].labelVi).toBe('Nhập đơn vị');

    const byHumanized = autoDeclareLandingCaptureFields(
      wrapCapture('<input type="text" name="don_vi_cong_tac" />'),
      emptyConfig()
    );
    expect(byHumanized.newFields[0].labelVi).toBe('Don vi cong tac');
  });

  it('name 1 ký tự không nhãn gợi ý → vẫn ra nhãn hợp lệ (≥2 ký tự), không throw', () => {
    const result = autoDeclareLandingCaptureFields(wrapCapture('<input type="text" name="a" />'), emptyConfig());
    expect(result.newFields).toHaveLength(1);
    expect(result.newFields[0].labelVi.length).toBeGreaterThanOrEqual(2);
    // Phải qua được validateAdminLeadFormConfig thật, không chỉ đoán.
    expect(() => validateAdminLeadFormConfig({ customFields: result.newFields })).not.toThrow();
  });

  it('<textarea name="cau_hoi"> → khai báo type textarea', () => {
    const result = autoDeclareLandingCaptureFields(
      wrapCapture('<label for="q">Câu hỏi</label><textarea id="q" name="cau_hoi"></textarea>'),
      emptyConfig()
    );
    expect(result.newFields).toHaveLength(1);
    expect(result.newFields[0].type).toBe('textarea');
  });

  it('<select name="phuong_an_hop"> có 2 option giá trị thật → khai báo select + đúng 2 lựa chọn', () => {
    const html = wrapCapture(
      '<label for="pah">Phương án họp</label>' +
      '<select id="pah" name="phuong_an_hop">' +
      '<option value="">— Chọn —</option>' +
      '<option value="online">Trực tuyến</option>' +
      '<option value="offline">Trực tiếp</option>' +
      '</select>'
    );
    const result = autoDeclareLandingCaptureFields(html, emptyConfig());
    expect(result.newFields).toHaveLength(1);
    const field = result.newFields[0];
    expect(field.type).toBe('select');
    expect(field.options).toEqual([
      { value: 'online', labelVi: 'Trực tuyến' },
      { value: 'offline', labelVi: 'Trực tiếp' },
    ]);
    expect(() => validateAdminLeadFormConfig({ customFields: result.newFields })).not.toThrow();
  });

  it('<select> chỉ có option rỗng ("— Chọn —") → KHÔNG khai báo, giữ nguyên name, có trong skipped', () => {
    const html = wrapCapture('<select name="phuong_an_rong"><option value="">— Chọn —</option></select>');
    const result = autoDeclareLandingCaptureFields(html, emptyConfig());
    expect(result.newFields).toEqual([]);
    expect(result.html).toContain('name="phuong_an_rong"');
    expect(result.skipped).toEqual([{ name: 'phuong_an_rong', reason: 'select_no_options' }]);
  });

  it('select có 2 option TRÙNG value → bỏ qua hẳn (không tin dữ liệu), giữ nguyên name', () => {
    const html = wrapCapture(
      '<select name="trung_gia_tri"><option value="a">Một</option><option value="a">Hai</option></select>'
    );
    const result = autoDeclareLandingCaptureFields(html, emptyConfig());
    expect(result.newFields).toEqual([]);
    expect(result.html).toContain('name="trung_gia_tri"');
  });

  it('2 radio cùng name="khung_gio_hen" → khai báo 1 trường radio 2 lựa chọn, đổi tên CẢ HAI input cùng lúc', () => {
    const html = wrapCapture(
      '<label><input type="radio" name="khung_gio_hen" value="sang" /> Buổi sáng</label>' +
      '<label><input type="radio" name="khung_gio_hen" value="chieu" /> Buổi chiều</label>'
    );
    const result = autoDeclareLandingCaptureFields(html, emptyConfig());
    expect(result.newFields).toHaveLength(1);
    const field = result.newFields[0];
    expect(field.type).toBe('radio');
    expect(field.options).toEqual([
      { value: 'sang', labelVi: 'Buổi sáng' },
      { value: 'chieu', labelVi: 'Buổi chiều' },
    ]);
    expect(result.html).not.toContain('name="khung_gio_hen"');
    // Cả hai input radio đều đổi, không chỉ input đầu.
    expect((result.html.match(new RegExp(`name="${field.key}"`, 'g')) || []).length).toBe(2);
  });

  it('ô đã khớp khoá đã khai báo → không đổi HTML, không thêm khai báo mới', () => {
    const config = {
      version: 1,
      fixedFields: { occupation: { visible: false }, interestArea: { visible: false } },
      customFields: [{ key: 'cf_da_khai_bao_ab12', type: 'text', labelVi: 'Đã khai báo', required: false, options: [] }],
    };
    const html = wrapCapture('<input type="text" name="cf_da_khai_bao_ab12" />');
    const result = autoDeclareLandingCaptureFields(html, config);
    expect(result.newFields).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(result.html).toBe(html);
  });

  it('input type=hidden/submit/button/reset/image/file trong form → bỏ qua, không coi là trường phụ', () => {
    const html = wrapCapture(
      '<input type="hidden" name="tracking_id" />' +
      '<input type="submit" name="go" value="Gửi" />' +
      '<input type="button" name="btn" value="Huỷ" />' +
      '<input type="reset" name="rst" />' +
      '<input type="image" name="img_btn" src="x.png" />' +
      '<input type="file" name="upload" />'
    );
    const result = autoDeclareLandingCaptureFields(html, emptyConfig());
    expect(result.newFields).toEqual([]);
    expect(result.skipped.map((s) => s.reason)).toEqual(Array(6).fill('ignored_type'));
    expect(result.html).toBe(html);
  });

  it('trang có form KHÁC (vd tìm kiếm) ngoài form capture → không đổi tên ô trong form đó', () => {
    const html =
      '<!DOCTYPE html><html><body>' +
      '<form id="search"><input type="text" name="q" /></form>' +
      wrapCapture('<input type="text" name="chuc_vu" />') +
      '</body></html>';
    const result = autoDeclareLandingCaptureFields(html, emptyConfig());
    expect(result.newFields).toHaveLength(1);
    expect(result.html).toContain('name="q"'); // form tìm kiếm không đụng tới
  });

  it('form KHÁC ngoài capture có ô TRÙNG TÊN với ô đang tự khai báo → chỉ đổi tên bên trong form capture, form kia giữ nguyên', () => {
    // Bẫy thật: nếu đổi tên bằng cách replace trên CẢ TRANG (không khoanh vùng đúng form capture),
    // ô "chuc_vu" của form tìm kiếm bên ngoài sẽ bị đổi tên lây dù không liên quan gì tới lead capture.
    const html =
      '<!DOCTYPE html><html><body>' +
      '<form id="search"><input type="text" name="chuc_vu" placeholder="Tìm theo chức vụ" /></form>' +
      wrapCapture('<label for="f1">Chức vụ</label><input type="text" id="f1" name="chuc_vu" />') +
      '</body></html>';
    const result = autoDeclareLandingCaptureFields(html, emptyConfig());
    expect(result.newFields).toHaveLength(1);
    const field = result.newFields[0];
    // Ô ngoài form capture vẫn còn tên cũ — chỉ đúng 1 chỗ bị đổi (bên trong form capture).
    expect(result.html).toContain('placeholder="Tìm theo chức vụ"');
    const searchFieldMatch = result.html.match(/<form id="search">([\s\S]*?)<\/form>/);
    expect(searchFieldMatch[1]).toContain('name="chuc_vu"');
    expect((result.html.match(new RegExp(`name="${field.key}"`, 'g')) || []).length).toBe(1);
  });

  it('25 ô lạ, chưa có trường nào đã khai báo → khai báo đúng 20 ô đầu, 5 ô còn lại vào skipped với lý do cap_exceeded', () => {
    const fields = Array.from({ length: 25 }, (_, i) => `<input type="text" name="field_${String(i).padStart(2, '0')}" />`).join('');
    const result = autoDeclareLandingCaptureFields(wrapCapture(fields), emptyConfig());
    expect(result.newFields).toHaveLength(20);
    const capSkipped = result.skipped.filter((s) => s.reason === 'cap_exceeded');
    expect(capSkipped).toHaveLength(5);
  });

  it('trang không có form data-founderai-capture → không đổi gì', () => {
    const html = '<!DOCTYPE html><html><body><p>Không có form</p></body></html>';
    const result = autoDeclareLandingCaptureFields(html, emptyConfig());
    expect(result).toEqual({ html, newFields: [], skipped: [] });
  });

  it('lưu HAI LẦN LIÊN TIẾP cho kết quả y hệt — lần lưu thứ hai không đổi tên/thêm khai báo nữa', () => {
    const html = wrapCapture('<label for="f1">Chức vụ</label><input type="text" id="f1" name="chuc_vu" />');
    const first = autoDeclareLandingCaptureFields(html, emptyConfig());
    expect(first.newFields).toHaveLength(1);

    const configAfterFirstSave = {
      version: 1,
      fixedFields: { occupation: { visible: false }, interestArea: { visible: false } },
      customFields: first.newFields,
    };
    const second = autoDeclareLandingCaptureFields(first.html, configAfterFirstSave);
    expect(second.newFields).toEqual([]);
    expect(second.skipped).toEqual([]);
    expect(second.html).toBe(first.html);
    // Sau lần lưu thứ hai audit không còn gì để cảnh báo.
    expect(auditLandingCaptureFields(second.html, configAfterFirstSave).unknownNames).toEqual([]);
  });

  it('label bọc ngoài ô: <label>Chức vụ <input name="chuc_vu"></label> → lấy chữ của label', () => {
    const html = wrapCapture('<label>Chức vụ <input type="text" name="chuc_vu" /></label>');
    const result = autoDeclareLandingCaptureFields(html, emptyConfig());
    expect(result.newFields).toHaveLength(1);
    expect(result.newFields[0].labelVi).toBe('Chức vụ');
  });

  it('label bọc ngoài có thẻ con: <label><span>Chức vụ</span> <input name="chuc_vu" /></label> → stripTags lấy đúng chữ', () => {
    const html = wrapCapture('<label class="form-item"><span>Chức vụ</span> <input type="text" name="chuc_vu" /></label>');
    const result = autoDeclareLandingCaptureFields(html, emptyConfig());
    expect(result.newFields).toHaveLength(1);
    expect(result.newFields[0].labelVi).toBe('Chức vụ');
  });

  it('label đứng ngay trước ô không có for: <label class="...">Chức vụ</label><input name="chuc_vu" placeholder="Ví dụ: Chuyên viên"> → lấy label, KHÔNG lấy placeholder', () => {
    const html = wrapCapture('<label class="font-bold text-sm">Chức vụ</label><input type="text" name="chuc_vu" placeholder="Ví dụ: Chuyên viên" />');
    const result = autoDeclareLandingCaptureFields(html, emptyConfig());
    expect(result.newFields).toHaveLength(1);
    expect(result.newFields[0].labelVi).toBe('Chức vụ');
  });

  it('hai ô liền nhau không có for: mỗi ô lấy đúng label của mình; ô sau không có label thì KHÔNG vơ nhầm nhãn ô trước', () => {
    // 2 ô liền nhau, mỗi ô một label đứng trước
    const htmlTwoWithLabels = wrapCapture(
      '<div><label>Chức vụ</label><input type="text" name="chuc_vu" /></div>' +
      '<div><label>Đơn vị công tác</label><input type="text" name="don_vi" /></div>'
    );
    const resTwo = autoDeclareLandingCaptureFields(htmlTwoWithLabels, emptyConfig());
    expect(resTwo.newFields).toHaveLength(2);
    expect(resTwo.newFields.find((f) => resTwo.html.includes(f.key) && f.labelVi === 'Chức vụ')).toBeDefined();
    expect(resTwo.newFields.find((f) => resTwo.html.includes(f.key) && f.labelVi === 'Đơn vị công tác')).toBeDefined();

    // Ô thứ 2 không có label: có ô khác xen giữa label ô 1 và ô 2 → ô 2 KHÔNG lấy nhãn ô 1, rơi về placeholder
    const htmlOneWithoutLabel = wrapCapture(
      '<div><label>Chức vụ</label><input type="text" name="chuc_vu" /></div>' +
      '<div><input type="text" name="don_vi" placeholder="Ví dụ: Sở Nội Vụ" /></div>'
    );
    const resOne = autoDeclareLandingCaptureFields(htmlOneWithoutLabel, emptyConfig());
    expect(resOne.newFields).toHaveLength(2);
    const f1 = resOne.newFields.find((f) => f.labelVi === 'Chức vụ');
    const f2 = resOne.newFields.find((f) => f.labelVi === 'Ví dụ: Sở Nội Vụ');
    expect(f1).toBeDefined();
    expect(f2).toBeDefined();
    expect(resOne.newFields.map((f) => f.labelVi)).not.toEqual(['Chức vụ', 'Chức vụ']);
  });

  it('<label>Khung giờ hẹn</label> + 2 radio cùng name → lấy nhãn nhóm Khung giờ hẹn, không vơ nhãn option', () => {
    const html = wrapCapture(
      '<label class="group-title">Khung giờ hẹn</label>' +
      '<label><input type="radio" name="khung_gio_hen" value="sang" /> Buổi sáng</label>' +
      '<label><input type="radio" name="khung_gio_hen" value="chieu" /> Buổi chiều</label>'
    );
    const result = autoDeclareLandingCaptureFields(html, emptyConfig());
    expect(result.newFields).toHaveLength(1);
    expect(result.newFields[0].labelVi).toBe('Khung giờ hẹn');
    expect(result.newFields[0].options).toEqual([
      { value: 'sang', labelVi: 'Buổi sáng' },
      { value: 'chieu', labelVi: 'Buổi chiều' },
    ]);
  });
});

/**
 * HTML thật của `checkform` (đo 19/09: 5 ô phụ — 2 text, 1 select, 1 radio 2 lựa chọn, 1 textarea)
 * Không có thuộc tính `for` trên các thẻ label, có placeholder trên text/textarea.
 * Xác nhận cả 5 ô được khai báo đúng nhãn thật (không rơi xuống placeholder/tên ô viết lại),
 * khoá sinh từ nhãn thật (không xấu vĩnh viễn), và audit sạch sau khi lưu.
 */
describe('landingCaptureFieldAutoDeclare.util — HTML thật của checkform (5 ô phụ)', () => {
  const checkformCaptureHtml = wrapCapture(
    '<div>' +
    '  <label class="block text-sm font-semibold text-slate-700 mb-1.5">Chức vụ</label>' +
    '  <input type="text" name="chuc_vu" placeholder="Ví dụ: Chuyên viên, Trưởng phòng" />' +
    '</div>' +
    '<div>' +
    '  <label class="block text-sm font-semibold text-slate-700 mb-1.5">Đơn vị công tác</label>' +
    '  <input type="text" name="don_vi" placeholder="Ví dụ: Sở Nội Vụ, UBND Huyện" />' +
    '</div>' +
    '<div>' +
    '  <label class="block text-sm font-semibold text-slate-700 mb-1.5">Phương án họp mong muốn</label>' +
    '  <select name="phuong_an_hop">' +
    '    <option value="online">Họp trực tuyến</option>' +
    '    <option value="truc_tiep">Gọi điện thoại trực tiếp</option>' +
    '  </select>' +
    '</div>' +
    '<div>' +
    '  <label class="block text-sm font-semibold text-slate-700 mb-2">Chọn khung giờ hẹn trực quan</label>' +
    '  <label><input type="radio" name="khung_gio_hen" value="sang_10_12" checked /> Buổi sáng</label>' +
    '  <label><input type="radio" name="khung_gio_hen" value="chieu_16_17" /> Buổi chiều</label>' +
    '</div>' +
    '<div>' +
    '  <label class="block text-sm font-semibold text-slate-700 mb-1.5">Câu hỏi đặt ra cho ThS. Ngô Hữu Thống</label>' +
    '  <textarea name="cau_hoi" placeholder="Nêu rõ vấn đề hoặc quy trình hành chính bạn đang muốn ứng dụng AI để giải quyết..."></textarea>' +
    '</div>'
  );

  it('sau một lần lưu: 5 trường được khai báo đúng nhãn thật (không rơi vào placeholder/tên ô), khoá sinh từ nhãn đúng, audit không còn cảnh báo', () => {
    const result = autoDeclareLandingCaptureFields(checkformCaptureHtml, emptyConfig());
    expect(result.newFields).toHaveLength(5);
    expect(result.skipped).toEqual([]);

    const types = result.newFields.map((f) => f.type).sort();
    expect(types).toEqual(['radio', 'select', 'text', 'text', 'textarea']);

    const labels = result.newFields.map((f) => f.labelVi);
    expect(labels).toEqual(expect.arrayContaining([
      'Chức vụ',
      'Đơn vị công tác',
      'Phương án họp mong muốn',
      'Chọn khung giờ hẹn trực quan',
      'Câu hỏi đặt ra cho ThS. Ngô Hữu Thống',
    ]));

    // KHÔNG rơi xuống placeholder hay tên ô viết lại
    expect(labels).not.toEqual(expect.arrayContaining([
      expect.stringMatching(/Ví dụ:/i),
      'Phuong an hop',
      'Khung gio hen',
    ]));

    // Khoá sinh từ nhãn thật (không sinh từ placeholder)
    const keys = result.newFields.map((f) => f.key);
    expect(keys.some((k) => k.startsWith('cf_chuc_vu_'))).toBe(true);
    expect(keys.some((k) => k.startsWith('cf_on_vi_cong_tac_'))).toBe(true);
    expect(keys.some((k) => k.startsWith('cf_phuong_an_hop_'))).toBe(true);
    expect(keys.some((k) => k.startsWith('cf_chon_khung_gio_hen_'))).toBe(true);
    expect(keys.some((k) => k.startsWith('cf_cau_hoi_at_ra_'))).toBe(true);

    const savedConfig = {
      version: 1,
      fixedFields: { occupation: { visible: false }, interestArea: { visible: false } },
      customFields: result.newFields,
    };
    const auditAfter = auditLandingCaptureFields(result.html, savedConfig);
    expect(auditAfter.unknownNames).toEqual([]);
    expect(auditAfter.declaredMissing).toEqual([]);

    // Mọi khoá mới đều hợp lệ qua validator thật, không chỉ đoán hình dạng.
    expect(() => validateAdminLeadFormConfig({ customFields: result.newFields })).not.toThrow();
  });
});

