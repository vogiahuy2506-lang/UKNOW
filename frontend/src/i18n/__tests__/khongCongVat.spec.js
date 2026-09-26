import { describe, expect, it } from 'vitest';
import vi from '../vi.js';
import en from '../en.js';
import pricingPolicySource from '../../pages/public/PricingPolicy.jsx?raw';

/**
 * Giá niêm yết là số tiền cuối cùng khách trả — KHÔNG có VAT 10% (chủ dự án chốt 26/09/2026; hoá đơn điện tử
 * xuất loại KCT, tiền thuế 0). Trước đó bảng giá, trang dựng gói Tùy chọn, trang mua lẻ và checkout đều ghi
 * "Đã bao gồm VAT 10%" (checkout còn ghi "Đã bao gồm VAT 10% — 0 đ", tự mâu thuẫn), câu hỏi thường gặp và trang
 * Chính sách giá cũng nói giá đã gồm 10% VAT. Quét cả từ điển + trang chính sách để câu đó không quay lại.
 */
const collectStrings = (node, path = '', out = []) => {
  if (typeof node === 'string') {
    out.push({ path, text: node });
    return out;
  }
  if (node && typeof node === 'object') {
    for (const [key, child] of Object.entries(node)) collectStrings(child, path ? `${path}.${key}` : key, out);
  }
  return out;
};

// Bắt CÂU KHẲNG ĐỊNH giá có VAT; câu HỎI trong mục câu hỏi thường gặp ("Chi phí có bao gồm thuế VAT không?") được giữ.
const VAT_RATE_CLAIM = /VAT\s*10\s*%|10\s*%\s*VAT|đã bao gồm\s+(thuế\s+)?(VAT|GTGT|giá trị gia tăng)|includes?\s+(10%\s+)?(VAT|Value Added Tax)/i;

describe('không nói giá có VAT 10%', () => {
  const DICTS = { vi, en };
  it.each(['vi', 'en'])('từ điển %s không có câu khẳng định giá đã gồm VAT', (lang) => {
    const hits = collectStrings(DICTS[lang])
      .filter(({ text }) => !text.trim().endsWith('?') && VAT_RATE_CLAIM.test(text))
      .map(({ path, text }) => `${path}: ${text.slice(0, 120)}`);
    expect(hits).toEqual([]);
  });

  it('trang Chính sách giá không nói giá đã gồm VAT', () => {
    const hit = pricingPolicySource.match(VAT_RATE_CLAIM);
    expect(hit ? pricingPolicySource.slice(Math.max(0, hit.index - 60), hit.index + 80) : null).toBeNull();
  });

  it('đã bỏ hẳn hai khoá dòng VAT dưới giá', () => {
    expect(vi.checkout?.vatIncluded).toBeUndefined();
    expect(vi.checkout?.vatExempt).toBeUndefined();
    expect(en.checkout?.vatIncluded).toBeUndefined();
    expect(en.checkout?.vatExempt).toBeUndefined();
  });
});
