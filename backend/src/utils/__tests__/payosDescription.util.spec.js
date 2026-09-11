import { describe, it, expect } from '@jest/globals';
import {
  PAYOS_DESCRIPTION_MAX_LENGTH,
  buildPayosDescription,
  stripVietnameseDiacritics,
  truncateOnWordBoundary,
} from '../payosDescription.util.js';

/**
 * Nội dung chuyển khoản là thứ DUY NHẤT kế toán thấy trong tin nhắn ngân hàng để nhận ra giao
 * dịch thuộc Founder AI (câu hỏi từ phía vận hành 11/09/2026).
 *
 * Bản cũ dùng `\`FounderAI ${plan.name}\`.substring(0, 25)`, hỏng hai kiểu:
 *   - xén giữa chữ: "FounderAI Gói Doanh nghiệ"
 *   - giữ nguyên dấu, để ngân hàng tự bỏ — mỗi nhà băng bỏ một kiểu
 */
describe('stripVietnameseDiacritics', () => {
  it('bỏ dấu nhưng GIỮ NGUYÊN hoa/thường (khác normalizeTextForMatch trong helpers.js)', () => {
    expect(stripVietnameseDiacritics('Gói Tùy Chọn')).toBe('Goi Tuy Chon');
    expect(stripVietnameseDiacritics('PROFESSIONAL')).toBe('PROFESSIONAL');
  });

  it('xử được đ/Đ — hai ký tự này KHÔNG tách được bằng normalize(NFD)', () => {
    // Đây là bẫy: 'đ' là U+0111, một ký tự Latin riêng, không phải 'd' + dấu tổ hợp.
    // Thiếu bước thay tay thì 'Đồng' ra 'Đong' — vẫn còn Đ.
    expect(stripVietnameseDiacritics('Đồng')).toBe('Dong');
    expect(stripVietnameseDiacritics('đặc biệt')).toBe('dac biet');
    expect(stripVietnameseDiacritics('Đường Đi')).toBe('Duong Di');
    expect(stripVietnameseDiacritics('Đồng')).not.toContain('Đ');
  });

  it('chuỗi rỗng / null / undefined → chuỗi rỗng, không ném lỗi', () => {
    expect(stripVietnameseDiacritics('')).toBe('');
    expect(stripVietnameseDiacritics(null)).toBe('');
    expect(stripVietnameseDiacritics(undefined)).toBe('');
  });
});

describe('truncateOnWordBoundary', () => {
  it('ngắn hơn trần thì giữ nguyên', () => {
    expect(truncateOnWordBoundary('FounderAI Basic', 25)).toBe('FounderAI Basic');
  });

  it('dài hơn trần thì cắt tại khoảng trắng, KHÔNG xén giữa từ', () => {
    const out = truncateOnWordBoundary('FounderAI Goi Doanh nghiep lon', 25);
    expect(out).toBe('FounderAI Goi Doanh');
    expect(out.length).toBeLessThanOrEqual(25);
  });

  it('đúng bằng trần thì giữ nguyên, không cắt thừa', () => {
    const exact = 'a'.repeat(25);
    expect(truncateOnWordBoundary(exact, 25)).toBe(exact);
  });

  it('từ đầu tiên đã dài hơn trần → đành cắt thô, thà cụt còn hơn rỗng', () => {
    const out = truncateOnWordBoundary('Sieuduongdaikhongcokhoangtrangnao', 25);
    expect(out).toHaveLength(25);
    expect(out).toBe('Sieuduongdaikhongcokhoang');
  });
});

describe('buildPayosDescription — nội dung CK cuối cùng', () => {
  it.each([
    ['Starter', 'FounderAI Starter'],
    ['Basic', 'FounderAI Basic'],
    ['Professional', 'FounderAI Professional'],
    ['Enterprise', 'FounderAI Enterprise'],
    ['Custom', 'FounderAI Custom'],
    ['Gói Tùy chọn', 'FounderAI Goi Tuy chon'],
    ['Đặc biệt', 'FounderAI Dac biet'],
  ])('gói "%s" → "%s"', (planName, expected) => {
    expect(buildPayosDescription(planName)).toBe(expected);
  });

  it('LUÔN bắt đầu bằng FounderAI — đây là phần kế toán dùng để nhận diện', () => {
    for (const name of ['Basic', 'Gói Doanh nghiệp lớn', '', null, 'X'.repeat(80)]) {
      expect(buildPayosDescription(name).startsWith('FounderAI')).toBe(true);
    }
  });

  it('KHÔNG BAO GIỜ vượt trần 25 ký tự của PayOS', () => {
    const names = [
      'Basic', 'Gói Doanh nghiệp lớn nhất', 'Professional Plus Extended Edition',
      'Đặc biệt dành cho doanh nghiệp', 'X'.repeat(200), '',
    ];
    for (const name of names) {
      expect(buildPayosDescription(name).length).toBeLessThanOrEqual(PAYOS_DESCRIPTION_MAX_LENGTH);
    }
  });

  it('KHÔNG còn dấu tiếng Việt nào trong kết quả', () => {
    const out = buildPayosDescription('Gói Đặc biệt ưu đãi');
    expect(out).toMatch(/^[\x20-\x7E]+$/); // chỉ ASCII in được
  });

  it('tên gói rỗng → vẫn trả về tiền tố, không trả chuỗi rỗng', () => {
    expect(buildPayosDescription('')).toBe('FounderAI');
    expect(buildPayosDescription(null)).toBe('FounderAI');
  });

  it('gộp khoảng trắng thừa, không để lọt xuống ngân hàng', () => {
    expect(buildPayosDescription('  Basic   Plan  ')).toBe('FounderAI Basic Plan');
  });

  it('ĐỐI CHỨNG: cách cắt CŨ xén giữa chữ, cách mới thì không', () => {
    const cu = 'FounderAI Gói Doanh nghiệp lớn'.substring(0, 25);
    expect(cu).toBe('FounderAI Gói Doanh nghiệ'); // xén giữa "nghiệp"

    const moi = buildPayosDescription('Gói Doanh nghiệp lớn');
    expect(moi).toBe('FounderAI Goi Doanh');
    expect(moi.endsWith('nghiệ')).toBe(false);
  });
});
