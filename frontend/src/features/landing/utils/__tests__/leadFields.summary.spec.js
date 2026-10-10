import { describe, expect, it } from 'vitest';
import {
  formatLeadExtraEntries,
  getLeadExtraEntries,
  renderCustomFieldsSummary,
  renderLeadExtraInfo,
} from '../leadFields.js';

/**
 * Nghiệm thu 09/09 (test-slug): lead có Nghề nghiệp "Freelancer" lưu đúng nhưng cột "Thông tin
 * thêm" ghi "Không có" — cột chỉ gom cf_*, không cột nào hiển thị occupation/interestArea.
 */
describe('renderLeadExtraInfo — Nghề nghiệp + Lĩnh vực đứng trước trường thêm', () => {
  it('có occupation + interestArea + cf_* → ba phần, thứ tự cố định', () => {
    const row = {
      occupation: 'Freelancer',
      interestArea: 'AI cho Giáo dục',
      customFields: {
        cf_sugg_01_text: { type: 'text', labelVi: 'Công ty', labelEn: 'Company', value: 'ACME', displayVi: 'ACME', displayEn: 'ACME' },
      },
    };
    expect(renderLeadExtraInfo(row, [], 'vi')).toBe('Nghề nghiệp: Freelancer · Lĩnh vực: AI cho Giáo dục · Công ty: ACME');
    // Nhãn cf_* theo locale là việc của renderCustomFieldsSummary (hiện giữ labelVi) — chỉ chốt
    // hai tiền tố mới đổi theo locale, không ghim nhãn trường thêm.
    expect(renderLeadExtraInfo(row, [], 'en')).toMatch(/^Occupation: Freelancer · Interest: AI cho Giáo dục · /);
  });

  it('chỉ có occupation, không cf_* → một phần; rỗng hết → chuỗi rỗng (trang hiện "Không có")', () => {
    expect(renderLeadExtraInfo({ occupation: 'Freelancer', customFields: {} }, [], 'vi')).toBe('Nghề nghiệp: Freelancer');
    expect(renderLeadExtraInfo({ occupation: '', interestArea: '  ', customFields: {} }, [], 'vi')).toBe('');
    expect(renderLeadExtraInfo(null, [], 'vi')).toBe('');
  });

  it('nhận cả khoá snake_case interest_area từ dòng chưa map', () => {
    expect(renderLeadExtraInfo({ interest_area: 'Tất cả các chủ đề AI' }, [], 'vi')).toBe('Lĩnh vực: Tất cả các chủ đề AI');
  });
});

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

/**
 * Modal chi tiết khách (10/10/2026) hiện từng trường; ô bảng hiện chuỗi tóm tắt. Hai nơi dùng
 * CHUNG getLeadExtraEntries nên không được lệch nhau.
 */
describe('getLeadExtraEntries — nguồn chung cho ô bảng và modal chi tiết', () => {
  const row = {
    occupation: 'Kế toán',
    interestArea: 'AI cho Giáo dục',
    customFields: {
      cf_company: { type: 'text', labelVi: 'Công ty', value: 'ACME', displayVi: 'ACME' },
      cf_empty: { type: 'text', labelVi: 'Quy mô', value: '', displayVi: '' },
      cf_size: 'opt_1',
    },
  };
  const defs = [{ key: 'cf_size', type: 'select', labelVi: 'Cỡ', options: [{ value: 'opt_1', labelVi: 'Nhỏ' }] }];

  it('trả từng trường theo thứ tự cố định: Nghề nghiệp, Lĩnh vực, rồi cf_*; bỏ trường rỗng', () => {
    expect(getLeadExtraEntries(row, defs, 'vi')).toEqual([
      { key: 'occupation', label: 'Nghề nghiệp', value: 'Kế toán' },
      { key: 'interestArea', label: 'Lĩnh vực', value: 'AI cho Giáo dục' },
      { key: 'cf_company', label: 'Công ty', value: 'ACME' },
      { key: 'cf_size', label: 'Cỡ', value: 'Nhỏ' },
    ]);
  });

  it('chuỗi tóm tắt của ô bảng đúng bằng ghép các trường — không thể lệch với modal', () => {
    expect(renderLeadExtraInfo(row, defs, 'vi')).toBe(formatLeadExtraEntries(getLeadExtraEntries(row, defs, 'vi')));
    expect(renderLeadExtraInfo(row, defs, 'vi')).toBe('Nghề nghiệp: Kế toán · Lĩnh vực: AI cho Giáo dục · Công ty: ACME · Cỡ: Nhỏ');
  });

  it('dòng rỗng / null → danh sách rỗng', () => {
    expect(getLeadExtraEntries(null)).toEqual([]);
    expect(getLeadExtraEntries({ customFields: {} })).toEqual([]);
  });
});
