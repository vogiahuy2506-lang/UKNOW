import { describe, expect, it } from 'vitest';
import { buildAddCustomFieldInstruction, buildAddFixedFieldInstruction } from '../leadFormFieldInstructions.js';

/**
 * Sự cố 09/09 (slug-test): câu lệnh cũ chỉ liệt kê NHÃN ("với các lựa chọn: Lựa chọn 1, …")
 * nên AI ghi `<option value="Lựa chọn 1">` → backend đối chiếu mã opt_a từ chối mọi lead.
 * Câu lệnh phải chứa khối markup đúng mã và dặn THAY ô cũ nếu trang đã có.
 */
describe('buildAddCustomFieldInstruction', () => {
  const selectField = {
    key: 'cf_field_g2e9',
    type: 'select',
    labelVi: 'lươngthưởng',
    required: true,
    options: [
      { value: 'opt_a', labelVi: 'Lựa chọn 1' },
      { value: 'opt_1', labelVi: 'Lựa chọn 2' },
      { value: 'opt_2', labelVi: 'Lựa chọn 3' },
    ],
  };

  it('select → chứa markup <option value="<mã>"><nhãn></option> cho TỪNG lựa chọn, có required, có ô trống đầu', () => {
    const s = buildAddCustomFieldInstruction(selectField);
    expect(s).toContain('name="cf_field_g2e9"');
    expect(s).toContain('<select name="cf_field_g2e9" required>');
    expect(s).toContain('<option value="">lươngthưởng</option>');
    expect(s).toContain('<option value="opt_a">Lựa chọn 1</option>');
    expect(s).toContain('<option value="opt_1">Lựa chọn 2</option>');
    expect(s).toContain('<option value="opt_2">Lựa chọn 3</option>');
    expect(s).toContain('bắt buộc điền');
  });

  it('select → dặn COPY Y NGUYÊN value và THAY ô cũ nếu form đã có (sửa được trang đã sinh sai)', () => {
    const s = buildAddCustomFieldInstruction(selectField);
    expect(s).toMatch(/COPY Y NGUYÊN/);
    expect(s).toMatch(/ĐÃ có ô name="cf_field_g2e9" thì THAY/);
    expect(s).toMatch(/không tạo ô thứ 2/);
  });

  it('select không required → thẻ select không có required', () => {
    const s = buildAddCustomFieldInstruction({ ...selectField, required: false });
    expect(s).toContain('<select name="cf_field_g2e9">');
    expect(s).not.toContain('bắt buộc điền');
  });

  it('radio → mỗi lựa chọn một <input type="radio" name value>', () => {
    const s = buildAddCustomFieldInstruction({ ...selectField, type: 'radio', required: false });
    expect(s).toContain('<input type="radio" name="cf_field_g2e9" value="opt_a" /> Lựa chọn 1');
    expect(s).toContain('<input type="radio" name="cf_field_g2e9" value="opt_2" /> Lựa chọn 3');
    expect(s).not.toContain('<select');
  });

  it('text/textarea/checkbox → không có khối option, vẫn có name và nhãn', () => {
    const s = buildAddCustomFieldInstruction({ key: 'cf_sugg_01_text', type: 'text', labelVi: 'Tên công ty', options: [] });
    expect(s).toContain('name="cf_sugg_01_text"');
    expect(s).toContain('nhãn "Tên công ty"');
    expect(s).not.toContain('<option');
    expect(s).not.toMatch(/COPY Y NGUYÊN/);
  });

  it('nhãn có ký tự HTML (&, <, ") được thoát trong markup; option rỗng bị bỏ', () => {
    const s = buildAddCustomFieldInstruction({
      key: 'cf_x_aaaa',
      type: 'select',
      labelVi: 'A & B',
      options: [{ value: 'v1', labelVi: '<1> "x"' }, { value: '', labelVi: 'rỗng' }],
    });
    expect(s).toContain('<option value="">A &amp; B</option>');
    expect(s).toContain('<option value="v1">&lt;1&gt; &quot;x&quot;</option>');
    expect(s).not.toContain('rỗng');
  });
});

describe('buildAddFixedFieldInstruction', () => {
  it('occupation → select name="occupation" với ĐÚNG value của founder_OCCUPATION_OPTIONS (value === nhãn)', () => {
    const s = buildAddFixedFieldInstruction('occupation');
    expect(s).toContain('<select name="occupation" required>');
    expect(s).toContain('<option value="Sinh viên / Học sinh">Sinh viên / Học sinh</option>');
    expect(s).toContain('<option value="Khác">Khác</option>');
    expect(s).toMatch(/COPY Y NGUYÊN/);
  });

  it('interestArea → value chứa & được thoát thành &amp; (trình duyệt giải mã lại khi gửi)', () => {
    const s = buildAddFixedFieldInstruction('interestArea');
    expect(s).toContain('<select name="interestArea" required>');
    expect(s).toContain('<option value="ChatGPT &amp; Prompt Engineering">ChatGPT &amp; Prompt Engineering</option>');
  });
});
