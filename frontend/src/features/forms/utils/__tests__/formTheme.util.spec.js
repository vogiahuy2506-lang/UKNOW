import { describe, it, expect } from 'vitest';
import {
  getReadableTextColor,
  getContrastRatio,
  getThemeContrastWarnings,
  buildFormPageBackgroundStyle,
  resolveBackgroundOverlay,
} from '../formTheme.util';

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

/**
 * PR-8b (12/10/2026) — cảnh báo tương phản thấp + nền trang (màu + ảnh nền phủ lớp tối).
 */
describe('getThemeContrastWarnings (PR-8b)', () => {
  it('theme trống / mặc định -> không cảnh báo (kể cả cam mặc định chữ trắng đã ship từ trước)', () => {
    expect(getThemeContrastWarnings({})).toEqual([]);
    expect(getThemeContrastWarnings(null)).toEqual([]);
    expect(getThemeContrastWarnings({ textColor: '', buttonStyle: '', primaryColor: '' })).toEqual([]);
  });

  it('màu chữ nhạt trên thẻ trắng (< 4.5) -> cảnh báo "text" kèm tỉ lệ', () => {
    const warnings = getThemeContrastWarnings({ textColor: '#AAAAAA' });
    expect(warnings).toHaveLength(1);
    expect(warnings[0].id).toBe('text');
    expect(warnings[0].ratio).toBeCloseTo(getContrastRatio('#AAAAAA', '#FFFFFF'), 5);
    expect(warnings[0].ratio).toBeLessThan(4.5);
  });

  it('màu chữ đủ đậm (>= 4.5) -> không cảnh báo; đúng ngưỡng #767676 (4.54) không cảnh báo, #777777 (4.48) cảnh báo', () => {
    expect(getThemeContrastWarnings({ textColor: '#111827' })).toEqual([]);
    expect(getThemeContrastWarnings({ textColor: '#767676' })).toEqual([]);
    expect(getThemeContrastWarnings({ textColor: '#777777' }).map((w) => w.id)).toEqual(['text']);
  });

  it('ô nhập "nền xám nhạt": chữ khách gõ nằm trên nền xám nên ngưỡng khắt hơn — #767676 đủ trên trắng (4.54) nhưng thiếu trên xám nhạt', () => {
    expect(getThemeContrastWarnings({ textColor: '#767676', inputStyle: 'outline' })).toEqual([]);
    const warnings = getThemeContrastWarnings({ textColor: '#767676', inputStyle: 'filled' });
    expect(warnings.map((w) => w.id)).toEqual(['text']);
    expect(warnings[0].ratio).toBeCloseTo(getContrastRatio('#767676', '#F3F4F6'), 5);
    expect(getThemeContrastWarnings({ textColor: '#111827', inputStyle: 'filled' })).toEqual([]);
  });

  it('màu chữ chưa hợp lệ (đang gõ dở) -> bỏ qua, không cảnh báo', () => {
    expect(getThemeContrastWarnings({ textColor: '#AAA' })).toEqual([]);
    expect(getThemeContrastWarnings({ textColor: 'red' })).toEqual([]);
  });

  it('nút đặc: chỉ xét khi có màu chủ đạo riêng; chữ nút tự chọn nên thường đủ tương phản', () => {
    expect(getThemeContrastWarnings({ primaryColor: '#1D4ED8' })).toEqual([]);
    expect(getThemeContrastWarnings({ primaryColor: '#FFFF00' })).toEqual([]);
    // Vùng xám giữa (đo 4.22 với #111827/trắng) là chỗ DUY NHẤT nút đặc có thể thấp hơn 4.5.
    const warnings = getThemeContrastWarnings({ primaryColor: '#777777' });
    expect(warnings.map((w) => w.id)).toEqual(['button']);
    expect(warnings[0].ratio).toBeLessThan(4.5);
  });

  it('nút viền: chữ nút CHÍNH LÀ màu chủ đạo trên thẻ trắng — màu nhạt cảnh báo, màu đậm không', () => {
    expect(getThemeContrastWarnings({ buttonStyle: 'outline', primaryColor: '#FFFF00' }).map((w) => w.id)).toEqual(['button']);
    expect(getThemeContrastWarnings({ buttonStyle: 'outline', primaryColor: '#1D4ED8' })).toEqual([]);
  });

  it('nút viền không đặt màu chủ đạo: tính theo cam mặc định (#DF5C0E trên trắng = 3.7) -> cảnh báo', () => {
    const warnings = getThemeContrastWarnings({ buttonStyle: 'outline' });
    expect(warnings.map((w) => w.id)).toEqual(['button']);
    expect(warnings[0].ratio).toBeCloseTo(getContrastRatio('#DF5C0E', '#FFFFFF'), 5);
  });

  it('cả hai cảnh báo cùng lúc, theo thứ tự text rồi button', () => {
    const warnings = getThemeContrastWarnings({ textColor: '#CCCCCC', buttonStyle: 'outline', primaryColor: '#FFFF00' });
    expect(warnings.map((w) => w.id)).toEqual(['text', 'button']);
  });
});

describe('buildFormPageBackgroundStyle / resolveBackgroundOverlay (PR-8b)', () => {
  const IMG = 'https://founderai.biz/lp-assets/uploads/7/forms/nen.jpg';

  it('chỉ có màu nền -> đúng như trước PR-8b: { backgroundColor }', () => {
    expect(buildFormPageBackgroundStyle({ backgroundColor: '#F8FAFC' })).toEqual({ backgroundColor: '#F8FAFC' });
  });

  it('không có màu lẫn ảnh -> undefined (không thêm thuộc tính style nào)', () => {
    expect(buildFormPageBackgroundStyle({})).toBeUndefined();
    expect(buildFormPageBackgroundStyle(undefined)).toBeUndefined();
    expect(buildFormPageBackgroundStyle({ primaryColor: '#112233' })).toBeUndefined();
  });

  it('nhúng landing (embedMode) -> không tô gì, kể cả có ảnh nền', () => {
    expect(buildFormPageBackgroundStyle({ backgroundColor: '#F8FAFC', backgroundImageUrl: IMG }, { embedMode: true })).toBeUndefined();
  });

  it('có ảnh nền -> lớp tối (gradient) chồng lên ảnh, phủ kín và căn giữa; màu nền vẫn giữ làm nền dự phòng', () => {
    const style = buildFormPageBackgroundStyle({ backgroundColor: '#F8FAFC', backgroundImageUrl: IMG, backgroundImageOverlay: 40 });
    expect(style.backgroundColor).toBe('#F8FAFC');
    expect(style.backgroundImage).toBe(`linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.4)), url("${IMG}")`);
    expect(style.backgroundSize).toBe('cover');
    expect(style.backgroundPosition).toBe('center');
    expect(style.backgroundRepeat).toBe('no-repeat');
  });

  it('độ tối 0 -> chỉ ảnh, không gradient; thiếu độ tối -> mặc định 30%', () => {
    expect(buildFormPageBackgroundStyle({ backgroundImageUrl: IMG, backgroundImageOverlay: 0 }).backgroundImage).toBe(`url("${IMG}")`);
    expect(buildFormPageBackgroundStyle({ backgroundImageUrl: IMG }).backgroundImage).toContain('rgba(0, 0, 0, 0.3)');
  });

  it('URL ảnh không an toàn (javascript:, có dấu ngoặc/nháy/khoảng trắng) -> bỏ ảnh, không rò vào CSS', () => {
    for (const bad of ['javascript:alert(1)', 'data:image/png;base64,AAAA', 'https://x.test/a").png', 'https://x.test/a b.png', "https://x.test/a'b.png", '//x.test/a.png', '']) {
      expect(buildFormPageBackgroundStyle({ backgroundImageUrl: bad })).toBeUndefined();
    }
  });

  it('resolveBackgroundOverlay: kẹp 0..80, làm tròn, lạ -> mặc định 30', () => {
    expect(resolveBackgroundOverlay(0)).toBe(0);
    expect(resolveBackgroundOverlay(80)).toBe(80);
    expect(resolveBackgroundOverlay(95)).toBe(80);
    expect(resolveBackgroundOverlay(-5)).toBe(0);
    expect(resolveBackgroundOverlay(42.6)).toBe(43);
    expect(resolveBackgroundOverlay('55')).toBe(55);
    for (const bad of ['', 'abc', null, undefined, NaN, Infinity, {}, []]) {
      expect(resolveBackgroundOverlay(bad)).toBe(30);
    }
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
