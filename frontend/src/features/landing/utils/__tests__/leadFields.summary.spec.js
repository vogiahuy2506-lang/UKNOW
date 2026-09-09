import { describe, expect, it } from 'vitest';
import { renderCustomFieldsSummary } from '../leadFields.js';

/**
 * Cột "Thông tin thêm" ở /app/landing-leads. Backend lưu leads.custom_fields dạng snapshot
 * (buildTrustedCustomFieldsSnapshot): mỗi khoá là { type, labelVi, labelEn, value, displayVi,
 * displayEn }. Ngày 09/09 sếp thấy "cf_field_7t9k: [object Object]" vì hàm bọc snapshot thành
 * { value: <object> } rồi String() nó.
 */
describe('renderCustomFieldsSummary — snapshot backend', () => {
  const snapshot = {
    cf_sugg_01_text: { type: 'text', labelVi: 'Công ty', labelEn: 'Company', value: 'ACME', displayVi: 'ACME', displayEn: 'ACME' },
    cf_sugg_02_text: { type: 'text', labelVi: 'Quy mô nhân sự', labelEn: '', value: '', displayVi: '', displayEn: '' },
    cf_field_ej5i: { type: 'select', labelVi: 'phúc lợi', labelEn: '', value: 'opt_1', displayVi: 'Thưởng Tết', displayEn: 'Tet bonus' },
    cf_flag: { type: 'checkbox', labelVi: 'Nhận tin', labelEn: '', value: false, displayVi: 'Không', displayEn: 'No' },
  };

  it('in nhãn + giá trị hiển thị, không in [object Object], bỏ trường rỗng và checkbox không tick', () => {
    const out = renderCustomFieldsSummary(snapshot, [], 'vi');
    expect(out).toBe('Công ty: ACME · phúc lợi: Thưởng Tết');
    expect(out).not.toContain('[object Object]');
    expect(out).not.toContain('cf_');
  });

  it('toàn bộ rỗng → chuỗi rỗng để list hiện "Không có"', () => {
    expect(renderCustomFieldsSummary({ cf_a: { type: 'text', labelVi: 'A', value: '', displayVi: '' } })).toBe('');
  });

  it('dạng giá trị thuần vẫn tra nhãn từ definitions như cũ (hồi quy)', () => {
    const defs = [{ key: 'cf_size', type: 'select', labelVi: 'Quy mô', options: [{ value: 'opt_1', labelVi: 'Nhỏ' }] }];
    expect(renderCustomFieldsSummary({ cf_size: 'opt_1' }, defs, 'vi')).toBe('Quy mô: Nhỏ');
  });
});
