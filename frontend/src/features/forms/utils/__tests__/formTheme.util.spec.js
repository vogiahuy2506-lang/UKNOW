import { describe, it, expect } from 'vitest';
import { getReadableTextColor, getContrastRatio } from '../formTheme.util';

/**
 * PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md, PR-4b — số đo tham khảo lấy từ review 15/09 (đo
 * bằng node, WCAG contrast ratio, chọn tỉ lệ cao hơn giữa #FFFFFF và #111827).
 */
describe('getReadableTextColor', () => {
  it('#FFFF00 (vàng) -> #111827 (tối) — 16.52 so 1.07', () => {
    expect(getReadableTextColor('#FFFF00')).toBe('#111827');
  });

  it('#1D4ED8 (xanh dương) -> #FFFFFF (trắng) — 6.70 so 2.65', () => {
    expect(getReadableTextColor('#1D4ED8')).toBe('#FFFFFF');
  });

  it('#16A34A (xanh lá) -> #111827 (tối) — 5.38 so 3.30', () => {
    expect(getReadableTextColor('#16A34A')).toBe('#111827');
  });

  it('#DF5C0E (cam mặc định primary-600) -> #111827 — CHỈ đúng khi hàm được gọi trực tiếp; caller (FormRenderer) không được gọi hàm này khi theme không có primaryColor', () => {
    // Đo review 15/09: 4.79 so 3.70 -> tối. Test này xác nhận hàm THUẦN đúng theo công thức,
    // KHÔNG xác nhận hành vi caller (đã kiểm riêng ở FormRenderer.spec.jsx: theme {} vẫn giữ
    // chữ trắng vì component không gọi hàm này khi thiếu primaryColor).
    expect(getReadableTextColor('#DF5C0E')).toBe('#111827');
  });

  it('hex không hợp lệ -> #FFFFFF (an toàn, không throw)', () => {
    expect(getReadableTextColor('not-a-color')).toBe('#FFFFFF');
    expect(getReadableTextColor('')).toBe('#FFFFFF');
    expect(getReadableTextColor(null)).toBe('#FFFFFF');
    expect(getReadableTextColor(undefined)).toBe('#FFFFFF');
    expect(getReadableTextColor('#fff')).toBe('#FFFFFF'); // thiếu 3 ký tự, không khớp #RRGGBB
  });

  it('đen tuyệt đối #000000 -> #FFFFFF; trắng tuyệt đối #FFFFFF -> #111827', () => {
    expect(getReadableTextColor('#000000')).toBe('#FFFFFF');
    expect(getReadableTextColor('#FFFFFF')).toBe('#111827');
  });

  it('chữ hoa/thường trong hex đều nhận (case-insensitive theo regex #[0-9a-fA-F]{6})', () => {
    expect(getReadableTextColor('#ffff00')).toBe('#111827');
  });
});

describe('getContrastRatio', () => {
  it('cùng một màu -> tỉ lệ 1', () => {
    expect(getContrastRatio('#DF5C0E', '#DF5C0E')).toBeCloseTo(1, 5);
  });

  it('đen và trắng -> tỉ lệ tối đa 21', () => {
    expect(getContrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
  });

  it('không phụ thuộc thứ tự tham số (đối xứng)', () => {
    const a = getContrastRatio('#1D4ED8', '#FFFFFF');
    const b = getContrastRatio('#FFFFFF', '#1D4ED8');
    expect(a).toBeCloseTo(b, 10);
  });
});
