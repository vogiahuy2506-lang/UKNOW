/**
 * G3b mục 3 (D-16): giá + tính năng của gói trong prompt tư vấn trang chủ.
 *
 * Bản cũ in "VND/thang" bất kể `duration_days` (gói 365 ngày, gói dùng thử 10 ngày đều bị báo là giá theo tháng) và lấy 5 phần
 * tử `features` thô — có thể là mã nội bộ ("unified_inbox") hoặc đối tượng {vi,en} (in ra "[object Object]").
 */
import { describe, expect, it, jest } from '@jest/globals';

jest.unstable_mockModule('../ai/aiModelPolicy.service.js', () => ({
  resolveAllowedModel: jest.fn().mockResolvedValue('gemini-3.5-flash'),
}));
const {
  formatPlansForContext,
  formatPlanPeriodSuffix,
  formatPlanPriceInfo,
  planFeatureLabels,
} = await import('../heroConsultation.service.js');

/** Hàng `plans` đúng hình dạng pg trả: BIGINT (price, price_yearly) là chuỗi. */
const plan = (over = {}) => ({
  code: 'x', name: 'Gói X', price: '990000', price_yearly: null, duration_days: 30, features: [],
  monthly_email_limit: 1000, monthly_zalo_limit: 100, max_landing_pages: 1, ai_credits_per_period: 50,
  ...over,
});

describe('formatPlanPeriodSuffix — kỳ tính giá theo duration_days', () => {
  it.each([
    [30, '/tháng'],
    [365, '/năm'],
    [10, '/10 ngày'],
    [14, '/14 ngày'],
    [90, '/90 ngày'],
    [180, '/180 ngày'],
    ['365', '/năm'], // pg có thể trả chuỗi
    [null, '/tháng'], // billing đọc COALESCE(duration_days, 30)
    [undefined, '/tháng'],
    [0, '/tháng'],
    [-5, '/tháng'],
  ])('duration_days=%p → %s', (days, expected) => {
    expect(formatPlanPeriodSuffix(days)).toBe(expected);
  });
});

describe('formatPlanPriceInfo / formatPlansForContext — giá in đúng kỳ', () => {
  it('gói 365 ngày in "/năm", KHÔNG in "/tháng" (bản cũ báo "2.990.000 VND/tháng")', () => {
    const text = formatPlansForContext([plan({ name: 'Năm', price: '2990000', duration_days: 365 })]);
    expect(text).toContain('- Năm: 2.990.000 VND/năm.');
    expect(text).not.toMatch(/VND\/th[aá]ng/);
  });

  it('gói dùng thử 10 ngày in "/10 ngày"; gói 30 ngày và gói không khai duration_days in "/tháng"', () => {
    const text = formatPlansForContext([
      plan({ name: 'Thử', price: '0', duration_days: 10 }),
      plan({ name: 'Tháng', price: '990000', duration_days: 30 }),
      plan({ name: 'Chưa khai', price: '490000', duration_days: null }),
    ]);
    expect(text).toContain('- Thử: 0 VND/10 ngày.');
    expect(text).toContain('- Tháng: 990.000 VND/tháng.');
    expect(text).toContain('- Chưa khai: 490.000 VND/tháng.');
  });

  it('giá BIGINT dạng chuỗi được phân cách nghìn đúng (bản cũ in "990000" trần)', () => {
    expect(formatPlanPriceInfo(plan({ price: '1250000' }))).toBe('1.250.000 VND/tháng');
    expect(formatPlanPriceInfo(plan({ price: 99000 }))).toBe('99.000 VND/tháng');
  });

  it('gói tháng có giá năm: nêu thêm giá năm + quy ra tháng; gói 365 ngày có price_yearly thì KHÔNG nêu lại (đã là giá năm)', () => {
    expect(formatPlanPriceInfo(plan({ price: '990000', price_yearly: '9900000' })))
      .toBe('990.000 VND/tháng; hoặc 9.900.000 VND/năm nếu thanh toán cả năm (khoảng 825.000 VND/tháng)');
    expect(formatPlanPriceInfo(plan({ price: '9900000', duration_days: 365, price_yearly: '9900000' })))
      .toBe('9.900.000 VND/năm');
  });
});

describe('planFeatureLabels — mã tính năng thô thành nhãn, hoặc bỏ', () => {
  it('mã nội bộ có nhãn → nhãn tiếng Việt; mã không có nhãn → BỎ (không in "unified_inbox" thô)', () => {
    expect(planFeatureLabels(['unified_inbox', 'multi_language'])).toEqual(['Hộp thư hợp nhất cho các kênh chat', 'Đa ngôn ngữ']);
    expect(planFeatureLabels(['ma_noi_bo_la', 'beta_tinh_nang_x', 'Hỗ trợ qua email'])).toEqual(['Hỗ trợ qua email']);
  });

  it('chuỗi marketing admin nhập giữ nguyên; {vi,en} lấy vi (không in "[object Object]"); chuỗi JSON {vi,en} cũng vậy', () => {
    expect(planFeatureLabels([
      '3 Landing Page',
      { vi: 'Hỗ trợ ưu tiên', en: 'Priority support' },
      '{"vi":"Báo cáo chi tiết","en":"Detailed reports"}',
      { en: 'Only English' },
    ])).toEqual(['3 Landing Page', 'Hỗ trợ ưu tiên', 'Báo cáo chi tiết', 'Only English']);
  });

  it('features dạng chuỗi JSON mảng / object cờ / null / rác đều không ném lỗi', () => {
    expect(planFeatureLabels('["unified_inbox","Hỗ trợ 24/7"]')).toEqual(['Hộp thư hợp nhất cho các kênh chat', 'Hỗ trợ 24/7']);
    expect(planFeatureLabels({ unified_inbox: true, multi_language: false })).toEqual(['Hộp thư hợp nhất cho các kênh chat']);
    expect(planFeatureLabels(null)).toEqual([]);
    expect(planFeatureLabels(undefined)).toEqual([]);
    expect(planFeatureLabels('không phải JSON')).toEqual(['không phải JSON']);
    expect(planFeatureLabels(42)).toEqual([]);
  });

  it('bỏ trùng, bỏ rỗng, cắt dài và giới hạn số phần tử', () => {
    expect(planFeatureLabels(['A', 'A', '  ', '', null, 'B'])).toEqual(['A', 'B']);
    expect(planFeatureLabels(['x'.repeat(300)])[0]).toHaveLength(120);
    expect(planFeatureLabels(Array.from({ length: 20 }, (_, i) => `Tính năng ${i}`))).toHaveLength(8);
  });
});

describe('formatPlansForContext — một dòng cho mỗi gói', () => {
  it('giá + hạn mức + tính năng; không còn "VND/thang", "Tinh nang", "[object Object]", mã snake_case thô', () => {
    const text = formatPlansForContext([
      plan({ name: 'Pro', features: ['unified_inbox', { vi: 'Hỗ trợ ưu tiên', en: 'Priority' }, 'ma_noi_bo'] }),
    ]);
    expect(text).toBe(
      '- Pro: 990.000 VND/tháng. Hạn mức: 1.000 email/tháng; 100 tin Zalo/tháng; 1 landing page; 50 lượt AI mỗi kỳ. '
      + 'Tính năng: Hộp thư hợp nhất cho các kênh chat, Hỗ trợ ưu tiên.'
    );
    expect(text).not.toMatch(/VND\/thang|Tinh nang|\[object Object\]|unified_inbox|ma_noi_bo/);
  });

  it('gói không có tính năng thì không in dòng "không có thông tin"; các gói cách nhau một dòng trống', () => {
    const text = formatPlansForContext([plan({ name: 'A', features: [] }), plan({ name: 'B', features: null })]);
    expect(text.split('\n\n')).toHaveLength(2);
    expect(text).not.toMatch(/Khong co|Tính năng:/);
  });
});
