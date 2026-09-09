import { describe, expect, it } from 'vitest';
import {
  customFieldOptionValues,
  fixedFieldOptionValues,
  htmlHasFieldName,
  htmlHasFieldOptions,
} from '../leadFormHtmlChecks.js';

/**
 * Sự cố 09/09 trên slug-test: AI thêm select đúng name nhưng value là NHÃN
 * (`<option value="Lựa chọn 1">`) thay vì mã `opt_a` → backend từ chối mọi lead
 * ("lươngthưởng không hợp lệ"). Kiểm mức 1 (name) không bắt được — cần mức 2 (mã option).
 */
const OPTS = ['opt_a', 'opt_1', 'opt_2'];

const select = (name, values, extra = '') =>
  `<select name="${name}" required${extra}><option value="" disabled selected>Chọn…</option>` +
  values.map((v) => `<option value="${v}">${v}</option>`).join('') +
  '</select>';

describe('htmlHasFieldName', () => {
  it('name="<khoá>" có mặt → true; thiếu → false; khoá rỗng → true (không có gì để kiểm)', () => {
    expect(htmlHasFieldName('<input name="cf_x_aaaa" />', 'cf_x_aaaa')).toBe(true);
    expect(htmlHasFieldName("<input name='cf_x_aaaa' />", 'cf_x_aaaa')).toBe(true);
    expect(htmlHasFieldName('<input name="cf_x_aaaa_more" />', 'cf_x_aaaa')).toBe(false);
    expect(htmlHasFieldName('', '')).toBe(true);
  });
});

describe('htmlHasFieldOptions', () => {
  it('select đủ mã đã lưu → true', () => {
    expect(htmlHasFieldOptions(select('cf_field_g2e9', OPTS), 'cf_field_g2e9', OPTS)).toBe(true);
  });

  it('ca production 09/09: select đúng name nhưng value là nhãn, chỉ 1 option → false', () => {
    const html =
      '<select name="cf_field_g2e9" required><option value="" disabled selected>Chọn một lựa chọn...</option>' +
      '<option value="Lựa chọn 1">Lựa chọn 1</option></select>';
    expect(htmlHasFieldOptions(html, 'cf_field_g2e9', OPTS)).toBe(false);
  });

  it('thiếu 1 trong các mã → false', () => {
    expect(htmlHasFieldOptions(select('cf_field_g2e9', ['opt_a', 'opt_1']), 'cf_field_g2e9', OPTS)).toBe(false);
  });

  it('trang có 2 form (hero + footer) cùng name: một select đúng, một sai → false (mọi khối phải đúng)', () => {
    const html = select('cf_field_g2e9', OPTS) + '<footer>' + select('cf_field_g2e9', ['Lựa chọn 1']) + '</footer>';
    expect(htmlHasFieldOptions(html, 'cf_field_g2e9', OPTS)).toBe(false);
    const both = select('cf_field_g2e9', OPTS) + select('cf_field_g2e9', OPTS);
    expect(htmlHasFieldOptions(both, 'cf_field_g2e9', OPTS)).toBe(true);
  });

  it('select khác name có đủ mã trùng nhau KHÔNG cứu được select đang kiểm (kiểm theo đúng khối)', () => {
    const html = select('cf_other_bbbb', OPTS) + select('cf_field_g2e9', ['Lựa chọn 1']);
    expect(htmlHasFieldOptions(html, 'cf_field_g2e9', OPTS)).toBe(false);
  });

  it('radio đủ value → true; thiếu → false; chấp nhận radio cho field kiểu select và ngược lại', () => {
    const radios = OPTS.map((v) => `<label><input type="radio" name="cf_r_aaaa" value="${v}" /> ${v}</label>`).join('');
    expect(htmlHasFieldOptions(radios, 'cf_r_aaaa', OPTS)).toBe(true);
    const missing = OPTS.slice(0, 2).map((v) => `<input type="radio" name="cf_r_aaaa" value="${v}">`).join('');
    expect(htmlHasFieldOptions(missing, 'cf_r_aaaa', OPTS)).toBe(false);
  });

  it('name nằm trên input text (AI sinh sai loại ô) → false', () => {
    expect(htmlHasFieldOptions('<input type="text" name="cf_field_g2e9" />', 'cf_field_g2e9', OPTS)).toBe(false);
  });

  it('mã có & được AI thoát thành &amp; → vẫn true (trình duyệt giải mã khi gửi)', () => {
    const values = ['ChatGPT & Prompt Engineering', 'AI cho Giáo dục'];
    const html =
      '<select name="interestArea"><option value="">x</option>' +
      '<option value="ChatGPT &amp; Prompt Engineering">a</option><option value="AI cho Giáo dục">b</option></select>';
    expect(htmlHasFieldOptions(html, 'interestArea', values)).toBe(true);
  });

  it('không có mã nào để kiểm (text/textarea/checkbox) → true', () => {
    expect(htmlHasFieldOptions('<input name="cf_t_aaaa" />', 'cf_t_aaaa', [])).toBe(true);
    expect(htmlHasFieldOptions('', 'cf_t_aaaa', undefined)).toBe(true);
  });

  it('mã chứa ký tự regex (dấu chấm, ngoặc) không làm hỏng kiểm tra', () => {
    const values = ['1.5 (a)', 'b+'];
    expect(htmlHasFieldOptions(select('cf_x_aaaa', values), 'cf_x_aaaa', values)).toBe(true);
  });
});

describe('customFieldOptionValues / fixedFieldOptionValues', () => {
  it('select/radio → mảng value đã trim, bỏ rỗng; kiểu khác → []', () => {
    const field = { type: 'select', options: [{ value: ' opt_a ' }, { value: '' }, { value: 'opt_1' }] };
    expect(customFieldOptionValues(field)).toEqual(['opt_a', 'opt_1']);
    expect(customFieldOptionValues({ ...field, type: 'radio' })).toEqual(['opt_a', 'opt_1']);
    expect(customFieldOptionValues({ ...field, type: 'text' })).toEqual([]);
    expect(customFieldOptionValues(null)).toEqual([]);
  });

  it('occupation/interestArea → đúng danh sách value của founder-landing-options (value === nhãn tiếng Việt)', () => {
    expect(fixedFieldOptionValues('occupation')).toContain('Sinh viên / Học sinh');
    expect(fixedFieldOptionValues('occupation')).toContain('Khác');
    expect(fixedFieldOptionValues('interestArea')).toContain('ChatGPT & Prompt Engineering');
    expect(fixedFieldOptionValues('unknown')).toEqual([]);
  });
});
