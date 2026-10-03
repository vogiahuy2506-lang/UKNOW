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
  buildHeroSystemPrompt,
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

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Gói GIỮ CHỖ ("Gói Tùy chọn" / "Liên hệ") và gói ngắn ngày (dùng thử). Dữ liệu dựng theo HÌNH DẠNG THẬT của hàng `plans` trên
// production (đọc 03/10/2026): price là NUMERIC → pg trả CHUỖI '0.00'; gói giữ chỗ có is_custom=false, giá 0, MỌI hạn mức NULL.
// Bản trước in "Gói Tùy chọn: 0 VND/tháng. Hạn mức: email không giới hạn; …" → bot báo khách có gói 0đ không giới hạn.

const NULL_LIMITS = {
  daily_email_limit: null, monthly_email_limit: null, daily_zalo_limit: null, monthly_zalo_limit: null,
  max_landing_pages: null, ai_credits_per_period: null, ai_tokens_per_period: null, max_chatbots: null, messages_per_period: null,
};
const PROD_CUSTOM = {
  id: 18, code: 'custom', name: 'Gói Tùy chọn', description: null, is_custom: false, is_active: true,
  price: '0.00', price_yearly: null, duration_days: 30, features: [], ...NULL_LIMITS,
};
const PROD_CONTACT = { ...PROD_CUSTOM, id: 19, code: 'contact', name: 'Liên hệ' };
const PROD_TRIAL = {
  id: 1, code: 'trial', name: 'Dùng thử', is_custom: false, is_active: true, price: '0.00', price_yearly: null,
  duration_days: 14, features: [], ...NULL_LIMITS,
  monthly_email_limit: 300, monthly_zalo_limit: 50, max_landing_pages: 1, ai_credits_per_period: 30,
};
const PROD_MONTHLY = {
  id: 3, code: 'starter', name: 'Starter', is_custom: false, is_active: true, price: '990000.00', price_yearly: null,
  duration_days: 30, features: [], ...NULL_LIMITS, monthly_email_limit: 5000, monthly_zalo_limit: 1000, max_landing_pages: 5, ai_credits_per_period: 300,
};
const planLine = (text, name) => text.split('\n\n').find((l) => l.startsWith(`- ${name}:`));

describe('gói giữ chỗ "Gói Tùy chọn" / "Liên hệ" — KHÔNG in giá 0 và KHÔNG in hạn mức', () => {
  it('"Gói Tùy chọn" (code custom, is_custom=false, giá "0.00", mọi hạn mức NULL): chỉ dẫn tự chọn + xem bảng giá', () => {
    const text = formatPlansForContext([PROD_CUSTOM]);

    expect(text).toBe('- Gói Tùy chọn: tự chọn số lượng email, tin Zalo, lượt AI… theo nhu cầu; giá tính theo lựa chọn, xem tại founderai.biz/pricing.');
    expect(text).not.toMatch(/0 VND/);
    expect(text).not.toMatch(/không giới hạn/);
    expect(text).not.toMatch(/Hạn mức/);
  });

  it('"Liên hệ" (code contact): liên hệ để được báo giá, hướng tới phần liên hệ; không giá, không hạn mức', () => {
    const text = formatPlansForContext([PROD_CONTACT]);

    expect(text).toBe('- Liên hệ: liên hệ để được báo giá (xem phần THÔNG TIN LIÊN HỆ HỖ TRỢ).');
    expect(text).not.toMatch(/0 VND|không giới hạn|Hạn mức/);
  });

  it('formatPlanPriceInfo cũng không in giá 0 cho gói giữ chỗ', () => {
    expect(formatPlanPriceInfo(PROD_CUSTOM)).toBe('giá tính theo lựa chọn, xem tại founderai.biz/pricing');
    expect(formatPlanPriceInfo(PROD_CONTACT)).toBe('liên hệ để được báo giá (xem phần THÔNG TIN LIÊN HỆ HỖ TRỢ)');
    expect(formatPlanPriceInfo(PROD_CUSTOM)).not.toMatch(/\bVND\b/);
  });

  it('mã viết hoa/khoảng trắng vẫn là gói giữ chỗ (cùng luật isPlaceholderPlan)', () => {
    const text = formatPlansForContext([{ ...PROD_CUSTOM, code: ' Custom ' }]);
    expect(text).not.toMatch(/0 VND|không giới hạn/);
  });

  it('gói custom THẬT của khách (is_custom=true, dù code "custom") KHÔNG phải gói giữ chỗ: vẫn in giá + hạn mức như gói thường', () => {
    const real = { ...PROD_CUSTOM, is_custom: true, price: '1500000.00', monthly_email_limit: 8000 };
    const text = formatPlansForContext([real]);
    expect(text).toContain('1.500.000 VND/tháng');
    expect(text).toContain('8.000 email/tháng');
  });

  it('gói thường có giá 0 + hạn mức NULL (không phải giữ chỗ) vẫn in như trước — luật chỉ áp cho code custom/contact', () => {
    const text = formatPlansForContext([{ ...PROD_CUSTOM, code: 'free', name: 'Free' }]);
    expect(text).toContain('0 VND/tháng');
    expect(text).toContain('email không giới hạn');
  });

  it('prompt THẬT dựng từ dữ liệu production: phần "CÁC GÓI DỊCH VỤ" không có "0 VND" / "không giới hạn" cho hai gói giữ chỗ', () => {
    const prompt = buildHeroSystemPrompt({
      plansText: formatPlansForContext([PROD_TRIAL, PROD_MONTHLY, PROD_CUSTOM, PROD_CONTACT]),
      coursesText: '',
      message: 'Gói nào hợp với shop mình?',
    });
    const section = prompt.slice(prompt.indexOf('CÁC GÓI DỊCH VỤ:'), prompt.indexOf('CÁC KHÓA HỌC:'));

    for (const name of ['Gói Tùy chọn', 'Liên hệ']) {
      const line = planLine(section.replace('CÁC GÓI DỊCH VỤ:\n', ''), name);
      expect(line).toBeDefined();
      expect(line).not.toMatch(/0 VND/);
      expect(line).not.toMatch(/không giới hạn/);
    }
    // Gói thật vẫn đủ giá + hạn mức.
    expect(section).toContain('- Starter: 990.000 VND/tháng. Hạn mức: 5.000 email/tháng; 1.000 tin Zalo/tháng; 5 landing page; 300 lượt AI mỗi kỳ.');
  });
});

describe('gói ngắn hơn 30 ngày — hạn mức "trong N ngày", không phải "/tháng"', () => {
  it('"Dùng thử" 14 ngày, email 300: "300 email trong 14 ngày"; giá "0 VND/14 ngày"', () => {
    const text = formatPlansForContext([PROD_TRIAL]);

    expect(text).toBe('- Dùng thử: 0 VND/14 ngày. Hạn mức: 300 email trong 14 ngày; 50 tin Zalo trong 14 ngày; 1 landing page; 30 lượt AI trong 14 ngày.');
    expect(text).not.toMatch(/email\/tháng|Zalo\/tháng|mỗi kỳ/);
  });

  it('ranh giới: 29 ngày là gói ngắn; đúng 30 ngày, 90 ngày, 365 ngày, NULL giữ "/tháng"', () => {
    const limits = (days) => formatPlansForContext([{ ...PROD_MONTHLY, duration_days: days }]);
    expect(limits(29)).toContain('5.000 email trong 29 ngày');
    expect(limits(30)).toContain('5.000 email/tháng');
    expect(limits(90)).toContain('5.000 email/tháng');
    expect(limits(365)).toContain('5.000 email/tháng');
    expect(limits(null)).toContain('5.000 email/tháng');
    expect(limits('14')).toContain('5.000 email trong 14 ngày'); // chuỗi từ pg
  });

  it('hạn mức KHÔNG giới hạn / số landing page không gắn thời hạn dù gói ngắn', () => {
    const text = formatPlansForContext([{ ...PROD_TRIAL, name: 'Thử X', monthly_email_limit: null, max_landing_pages: 2 }]);
    expect(text).toContain('email không giới hạn');
    expect(text).toContain('2 landing page;');
    expect(text).not.toMatch(/2 landing page trong/);
  });
});
