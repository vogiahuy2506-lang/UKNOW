import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vi from '../vi.js';
import en from '../en.js';

/**
 * Sở Công Thương yêu cầu (25/09/2026): giá trên website phải ghi rõ "đã bao gồm 10% VAT".
 * Quét cả từ điển i18n + trang Chính sách giá để đảm bảo câu khẳng định giá đã bao gồm
 * VAT 10% được duy trì xuyên suốt, tránh quay lại phát ngôn cũ.
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

// Bắt câu khẳng định giá đã bao gồm VAT 10% (câu HỎI trong FAQ được phép giữ).
const VAT_INCLUDED_CLAIM = /VAT\s*10\s*%|10\s*%\s*VAT|đã bao gồm\s+(thuế\s+)?(VAT|GTGT|giá trị gia tăng)|includes?\s+(10%\s+)?(VAT|Value Added Tax)/i;

const PRICING_POLICY_PATH = resolve(process.cwd(), 'src/pages/public/PricingPolicy.jsx');

function loadPricingPolicy() {
  return readFileSync(PRICING_POLICY_PATH, 'utf8');
}

describe('vat10-required-after-25-09-update', () => {
  it('từ điển vi phải có câu khẳng định giá đã gồm VAT', () => {
    const hits = collectStrings(vi, '', []).filter(function (entry) {
      if (entry.text.trim().endsWith('?')) return false;
      if (!VAT_INCLUDED_CLAIM.test(entry.text)) return false;
      if (entry.path && entry.path.indexOf('invoice.') === 0) return false;
      return true;
    });
    expect(hits.length).toBeGreaterThan(0);
  });

  it('từ điển en phải có câu khẳng định giá đã gồm VAT', () => {
    const hits = collectStrings(en, '', []).filter(function (entry) {
      if (entry.text.trim().endsWith('?')) return false;
      if (!VAT_INCLUDED_CLAIM.test(entry.text)) return false;
      if (entry.path && entry.path.indexOf('invoice.') === 0) return false;
      return true;
    });
    expect(hits.length).toBeGreaterThan(0);
  });

  it('trang Chính sách giá phải nói giá đã gồm VAT 10%', function () {
    expect(VAT_INCLUDED_CLAIM.test(loadPricingPolicy())).toBe(true);
  });

  it('đã đổi tên khoá finalPriceVatIncluded (không còn finalPriceNoVat)', function () {
    expect(typeof (vi.checkout && vi.checkout.finalPriceVatIncluded)).toBe('string');
    expect(typeof (en.checkout && en.checkout.finalPriceVatIncluded)).toBe('string');
    expect(vi.checkout && vi.checkout.finalPriceNoVat).toBeUndefined();
    expect(en.checkout && en.checkout.finalPriceNoVat).toBeUndefined();
  });
});
