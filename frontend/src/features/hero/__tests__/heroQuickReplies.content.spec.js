/**
 * Chip "câu hỏi nhanh" của khung chat trang chủ (heroPage.heroConsultation.quickReplies, vi + en).
 *
 * Bản cũ ghi cứng câu trả lời về GIÁ / GÓI / TÍNH NĂNG và hiện nguyên văn không qua AI: giá "Starter 990K / Pro 2.490K / 3 gói"
 * (thật: Dùng thử 14 ngày, Starter 299.000, Basic 599.000, Pro 1.299.000, Enterprise 9.999.000), "dùng thử 7 ngày", "A/B testing",
 * "CRM nâng cao", "support 24/7", "tự động phân loại khách hàng", "Zalo chỉ có từ gói Pro". Nay chip hỏi sự kiện KHÔNG có `response`
 * (bấm = gửi câu hỏi qua đường chat AI, BE dùng prompt đã kiểm + giá từ bảng plans); chỉ chip minh hoạ chiến dịch còn câu ghi sẵn.
 */
import { describe, it, expect } from 'vitest';
import vi from '../../../i18n/vi';
import en from '../../../i18n/en';

const LOCALES = [['vi', vi], ['en', en]];
const chipsOf = (dict) => dict.heroPage.heroConsultation.quickReplies;

// Cụm sai đã gặp trên bản cũ + cụm mô tả node KHÔNG có ở trình tạo chiến dịch (registry nói rõ: không có node wait/delay/condition
// riêng; không có bước "kiểm tra đã mở → rẽ nhánh"; không có module CRM).
const FORBIDDEN = [
  /990\s?K/i,
  /2\.490\s?K/i,
  /\$\s?39\b|\$\s?99\b/,
  /\b7[- ]?(ngày|day)/i,
  /A\s*\/\s*B/i,
  /\bCRM\b/,
  /24\s*\/\s*7/,
  /500 (email|emails)/i,
  /2000\+? (email|emails)/i,
  /(tự động )?phân loại khách hàng/i,
  /automatic customer (segmentation|classification)/i,
  /gói Pro trở lên|Pro plan and above/i,
  /Kiểm tra đã mở|Check if opened/i,
  /Lọc điều kiện|Filter by condition/i,
  /Chờ 24 giờ|Wait 24 hours/i,
  /Gửi Email nhắc|Send reminder email/i,
];

describe.each(LOCALES)('quickReplies (%s)', (_name, dict) => {
  const chips = chipsOf(dict);

  it('có đủ 9 chip, id không trùng', () => {
    expect(chips.map((c) => c.id)).toEqual(['pricing', 'start', 'landing', 'email', 'zalo', 'trial', 'compare', 'support', 'campaign_demo']);
  });

  it('chip hỏi sự kiện (pricing, start, landing, email, zalo, trial, compare, support) KHÔNG có response ghi cứng', () => {
    const factChips = chips.filter((c) => c.id !== 'campaign_demo');
    expect(factChips).toHaveLength(8);
    for (const chip of factChips) {
      expect(chip.response, `chip ${chip.id}`).toBeUndefined();
      expect(chip.isAction, `chip ${chip.id}`).toBeUndefined();
      expect(typeof chip.text).toBe('string');
      expect(chip.text.length).toBeGreaterThan(3);
    }
  });

  it('chỉ chip campaign_demo còn câu ghi sẵn + isAction mở bản mô phỏng', () => {
    const demo = chips.find((c) => c.id === 'campaign_demo');
    expect(typeof demo.response).toBe('string');
    expect(demo.response.length).toBeGreaterThan(100);
    expect(demo.isAction).toBe('open_campaign_demo');
  });

  it('toàn bộ chip (text + response) không còn giá/gói/tính năng sai và không mô tả node không có thật', () => {
    const blob = JSON.stringify(chips);
    for (const re of FORBIDDEN) expect(blob, String(re)).not.toMatch(re);
  });

  it('chip minh hoạ chỉ nêu node có thật: kích hoạt thủ công, đọc danh sách, gửi email nhiều bước, lưu khách, kết thúc', () => {
    const demo = chips.find((c) => c.id === 'campaign_demo').response;
    const vnOrEn = (a, b) => new RegExp(`${a}|${b}`, 'i');
    expect(demo).toMatch(vnOrEn('Kích hoạt thủ công', 'Manual Trigger'));
    expect(demo).toMatch(vnOrEn('Google Sheet', 'Google Sheet'));
    expect(demo).toMatch(vnOrEn('Gửi Email', 'Send Email'));
    expect(demo).toMatch(vnOrEn('Lưu khách', 'Save customer'));
    expect(demo).toMatch(vnOrEn('Kết thúc', 'End'));
    // Nói rõ bản mô phỏng chỉ là ví dụ (bản mô phỏng có số liệu mẫu).
    expect(demo).toMatch(vnOrEn('là ví dụ', 'are examples'));
  });
});
