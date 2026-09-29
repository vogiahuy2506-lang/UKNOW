import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vi from '../vi.js';
import en from '../en.js';

/**
 * 29/09/2026: Founder AI cung cấp dịch vụ phần mềm không chịu thuế GTGT (KCT) —
 * hoá đơn Mắt Bão ghi TSuat = -1. Không được khẳng định "đã bao gồm 10% VAT" ở bất cứ đâu
 * trên website; giá phải ghi rõ là giá cuối cùng, không chịu thuế, không cộng thêm.
 */
function collectStrings(node, path, out) {
  if (!node) return out || [];
  if (typeof node === 'string') {
    (out || (out = [])).push({ path: path, text: node });
    return out;
  }
  if (typeof node === 'object') {
    for (const key of Object.keys(node)) {
      collectStrings(node[key], path ? path + '.' + key : key, out);
    }
  }
  return out || [];
}

// Câu khẳng định giá đã bao gồm VAT 10% (câu HỎI trong FAQ được phép giữ).
const VAT_INCLUDED_CLAIM = /VAT\s*10\s*%|10\s*%\s*VAT|đã bao gồm\s+(thuế\s+)?(VAT|GTGT|giá trị gia tăng)|includes?\s+(10%\s+)?(VAT|Value Added Tax)/i;

function readPage(name) {
  return readFileSync(resolve(process.cwd(), 'src/pages/public/' + name), 'utf8');
}

function claims(dict) {
  return collectStrings(dict, '', []).filter(function (entry) {
    if (entry.text.trim().endsWith('?')) return false;
    if (entry.path && entry.path.indexOf('invoice.') === 0) return false;
    return VAT_INCLUDED_CLAIM.test(entry.text);
  });
}

describe('vatKct — giá không chịu thuế GTGT', () => {
  it('vi và en không còn câu khẳng định "đã bao gồm 10% VAT"', () => {
    expect(claims(vi).map(function (e) { return e.path; })).toEqual([]);
    expect(claims(en).map(function (e) { return e.path; })).toEqual([]);
  });

  it('checkout.finalPriceKct + pricing.taxNoteKct tồn tại ở vi/en và nói KCT', () => {
    expect(vi.checkout.finalPriceKct).toMatch(/không chịu thuế/i);
    expect(en.checkout.finalPriceKct).toMatch(/not subject to/i);
    expect(vi.pricing.taxNoteKct).toMatch(/không chịu thuế/i);
    expect(en.pricing.taxNoteKct).toMatch(/not subject to/i);
    expect(vi.checkout.finalPriceVatIncluded).toBeUndefined();
    expect(en.checkout.finalPriceVatIncluded).toBeUndefined();
  });

  it('PricingPolicy.jsx nói "không chịu thuế" và không khớp câu khẳng định gồm VAT', () => {
    const src = readPage('PricingPolicy.jsx');
    expect(src).toContain('không chịu thuế');
    expect(VAT_INCLUDED_CLAIM.test(src)).toBe(false);
  });

  it('PaymentPolicy.jsx không còn "Hóa đơn VAT" / "VAT Invoice"', () => {
    const src = readPage('PaymentPolicy.jsx');
    expect(/Hóa đơn VAT|Hoá đơn VAT/i.test(src)).toBe(false);
    expect(/VAT Invoice/i.test(src)).toBe(false);
  });
});
