import { describe, it, expect } from 'vitest';
import {
  CUSTOMER_FIELDS,
  buildDetectedVariables,
  extractVariableKeys,
  getVariableSource,
  normalizeCustomKey,
} from '../templateVariables';
import { mapVariableToSemanticTarget } from '../../../campaigns/utils/templateVariableAutoMap';

describe('templateVariables', () => {
  it('mọi khoá gợi ý đều được bộ chạy tự ghép theo ngữ nghĩa (name/email/phone)', () => {
    expect(CUSTOMER_FIELDS.map((f) => [f.key, mapVariableToSemanticTarget(f.key)])).toEqual([
      ['ten_khach', 'name'],
      ['email_khach', 'email'],
      ['so_dien_thoai', 'phone'],
    ]);
  });

  it('extractVariableKeys: gộp tiêu đề + nội dung, duy nhất, giữ thứ tự, bắt cả khoá có dấu/khoảng trắng', () => {
    expect(extractVariableKeys('Chào {{ten_khach}}', '<p>{{ ten_khach }} {{Họ Tên}}</p>', null, '{{email_khach}}'))
      .toEqual(['ten_khach', 'Họ Tên', 'email_khach']);
    expect(extractVariableKeys('không có biến', undefined)).toEqual([]);
  });

  it('normalizeCustomKey: bỏ dấu, chữ thường, ký tự lạ thành "_"', () => {
    expect(normalizeCustomKey('Chức vụ')).toBe('chuc_vu');
    expect(normalizeCustomKey('  Đơn vị / Cơ quan ')).toBe('don_vi_co_quan');
    expect(normalizeCustomKey('!!!')).toBe('');
  });

  it('getVariableSource: khoá chuẩn -> nguồn khách; khoá lạ -> cột cùng tên', () => {
    expect(getVariableSource('ten_khach')).toBe('name');
    expect(getVariableSource('email')).toBe('email');
    expect(getVariableSource('donvi')).toBe('column');
  });

  it('buildDetectedVariables: tên từ gợi ý > tên đã khai báo > chính khoá, hình dạng {name, key}', () => {
    const out = buildDetectedVariables(['ten_khach', 'tenkhach', 'chuc_vu'], {
      declared: [{ name: 'Họ và tên khách', key: 'tenkhach' }],
      translate: (k) => `T(${k})`,
    });
    expect(out).toEqual([
      { name: 'T(emailTemplateEditor.suggestedCustomerName)', key: 'ten_khach' },
      { name: 'Họ và tên khách', key: 'tenkhach' },
      { name: 'chuc_vu', key: 'chuc_vu' },
    ]);
  });
});
